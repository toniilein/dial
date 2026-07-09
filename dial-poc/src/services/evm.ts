// ── EVM mirror — real on-chain writes to the DialRegistry contract ─────────
// Replaces the mocked `chain_writes` INSERT for the 'evm' axis with a real
// transaction. Env-gated and lazy-loaded so the app runs unchanged when the
// mirror is off (the mock path stays).
//
//   DIAL_EVM_ENABLED=true                 — turn the real mirror on
//   DIAL_EVM_RPC_URL=http://… | https://… — Sepolia (or local anvil) RPC
//   DEPLOYER_PRIVATE_KEY=0x…              — the relayer/owner EOA (gas + authority)
//   DIAL_REGISTRY_ADDRESS=0x…             — the deployed contract
//   DIAL_EVM_NETWORK=sepolia|anvil|…      — label only (explorer + display)
//
// Trust model (v1): the contract trusts msg.sender == owner. Records are an
// ordered, tamper-evident COMMITMENT ("DIAL said so"), not yet independently
// verifiable — that's the dormant Layer-2 (setRecordSigned) upgrade.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as registry from './registry.ts';
import * as resolver from './resolver.ts';

export const EVM_ENABLED = process.env.DIAL_EVM_ENABLED === 'true';
// Full self-custody: DIAL sends NO EVM transaction — the consumer's own wallet
// writes the chain (claim → setAddresses → mint) and pays the gas. On by default;
// set DIAL_EVM_SELF_CUSTODY=false to restore the old owner-relayer mirror (DIAL pays).
export const SELF_CUSTODY = process.env.DIAL_EVM_SELF_CUSTODY !== 'false';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ABI = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'contracts', 'DialRegistry.abi.json'), 'utf8'));
const NFT_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'contracts', 'DialName.abi.json'), 'utf8'));

// DIAL names as ERC-721 NFTs (optional, env-gated). Minted to a consumer's
// wallet when they take control — so the name persists in their wallet.
const NFT_ADDRESS = process.env.DIAL_NAME_NFT_ADDRESS || '';
export const NFT_ENABLED = !!NFT_ADDRESS;

const NETWORK = (process.env.DIAL_EVM_NETWORK || 'sepolia').toLowerCase();
const EXPLORERS: Record<string, string | null> = {
  mainnet: 'https://etherscan.io',
  sepolia: 'https://sepolia.etherscan.io',
  anvil: null, local: null, // local dev chains have no public explorer
};

type Hex = `0x${string}`;
const ZERO32 = ('0x' + '00'.repeat(32)) as Hex;

// Lazy viem handle — built once, only when the mirror is actually used. Missing
// required config is a hard failure (never fall back to a default private key).
let _ctx: Promise<any> | null = null;
function ctx() {
  if (!_ctx) {
    _ctx = (async () => {
      const rpc = process.env.DIAL_EVM_RPC_URL;
      const pk = process.env.DEPLOYER_PRIVATE_KEY;
      const address = process.env.DIAL_REGISTRY_ADDRESS;
      if (!rpc || !pk || !address) {
        throw new Error('EVM mirror enabled but DIAL_EVM_RPC_URL / DEPLOYER_PRIVATE_KEY / DIAL_REGISTRY_ADDRESS are not all set.');
      }
      const viem = await import('viem');
      const { privateKeyToAccount } = await import('viem/accounts');
      const account = privateKeyToAccount((pk.startsWith('0x') ? pk : '0x' + pk) as Hex);
      const transport = viem.http(rpc, { timeout: 20_000 });
      const pub = viem.createPublicClient({ transport });
      const wallet = viem.createWalletClient({ account, transport });
      const chainId = await pub.getChainId();
      return { viem, account, pub, wallet, address: viem.getAddress(address) as Hex, chainId };
    })();
  }
  return _ctx;
}

// Network/contract info for the UI (cached chainId; null contract until configured).
let _cfg: any = null;
export async function config() {
  const base: any = { enabled: EVM_ENABLED, network: NETWORK, explorerBase: EXPLORERS[NETWORK] ?? null, contractAddress: null, chainId: null };
  if (!EVM_ENABLED) return base;
  if (_cfg) return _cfg;
  try {
    const c = await ctx();
    _cfg = { ...base, contractAddress: c.address, chainId: c.chainId };
  } catch (e) {
    _cfg = { ...base, error: (e as Error).message };
  }
  return _cfg;
}

// ── canonical encoding (must match DialRegistry.sol — proven by the parity test) ──
function normName(name: string): string { return name.trim().toLowerCase(); }

// DIAL owner ids may be real addresses (production) or opaque demo ids
// (0xalice123). Real 20-byte addresses pass through (checksummed); anything else
// maps deterministically to a stable pseudo-address so the mirror never breaks.
function toEvmAddress(viem: any, ownerId: string): Hex {
  const s = (ownerId || '').trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return viem.getAddress(s) as Hex;
  return viem.getAddress('0x' + viem.keccak256(viem.toBytes(s.toLowerCase())).slice(-40)) as Hex;
}
function toBytes32(viem: any, v: string | null | undefined): Hex {
  const s = (v || '').trim();
  if (!s) return ZERO32;
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase() as Hex;
  return viem.keccak256(viem.toBytes(s)) as Hex;
}
// Commit to the name's chain addresses (addr.* map) — entries sorted for a
// deterministic hash. Full values stay off-chain (DB / mirror payload).
function addressesHash(viem: any, addrs: Record<string, string>): Hex {
  const keys = Object.keys(addrs).sort();
  const vals = keys.map(k => addrs[k]);
  return viem.keccak256(viem.encodeAbiParameters(
    [{ type: 'string[]' }, { type: 'string[]' }], [keys, vals]
  )) as Hex;
}

// ── serialized write queue: one tx in flight at a time (clean nonce + ordering) ──
let queue: Promise<any> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.then(() => {}, () => {}); // keep the chain alive past failures
  return run;
}

async function sendWrite(name: string, op: 'setRecord' | 'release'): Promise<{ hash: string; status: string; seq: number }> {
  const c = await ctx();
  const { viem, pub, wallet, address } = c;
  const lname = normName(name);
  const nameHash = viem.keccak256(viem.toBytes(lname)) as Hex;

  // seq derived from chain inside the critical section (no split-brain).
  const current = await pub.readContract({ address, abi: ABI, functionName: 'seqOf', args: [nameHash] }) as bigint;
  const seq = current + 1n;

  let hash: Hex;
  if (op === 'release') {
    const { request } = await pub.simulateContract({ account: c.account, address, abi: ABI, functionName: 'release', args: [lname, seq] });
    hash = await wallet.writeContract(request);
  } else {
    const ns = registry.get(lname);
    if (!ns) throw new Error('name not in registry: ' + lname);
    const owner = toEvmAddress(viem, ns.owner_address);
    const expiresAt = BigInt(ns.expires_at);
    const attHash = toBytes32(viem, ns.attestation_hash);
    const addrHash = addressesHash(viem, resolver.getAddresses(lname));
    const { request } = await pub.simulateContract({
      account: c.account, address, abi: ABI, functionName: 'setRecord',
      args: [lname, owner, expiresAt, attHash, addrHash, seq],
    });
    hash = await wallet.writeContract(request);
  }
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status === 'success' ? 'confirmed' : 'reverted', seq: Number(seq) };
}

export function enqueueSetRecord(name: string) { return enqueue(() => sendWrite(name, 'setRecord')); }
export function enqueueRelease(name: string)   { return enqueue(() => sendWrite(name, 'release')); }

// ── consumer-controlled addresses (decentralisation) ──
// All on-chain writes share the one serialized queue, so DIAL-issuance and
// consumer-relayed updates never collide on nonce.

function nameHashOf(viem: any, name: string): Hex { return viem.keccak256(viem.toBytes(normName(name))); }

export async function readController(name: string): Promise<string> {
  const c = await ctx();
  return c.pub.readContract({ address: c.address, abi: ABI, functionName: 'controllerOf', args: [nameHashOf(c.viem, name)] }) as Promise<string>;
}

// Names known to be consumer-controlled (in-memory). chain-sync uses this to
// skip the redundant setRecord for their address changes — those go through the
// signed path. Lost on restart (harmless: setRecord just no-ops for them).
const controlled = new Set<string>();
export function isConsumerControlled(name: string): boolean { return controlled.has(normName(name)); }

// Ensure a name's on-chain controller IS the given wallet — set it if missing or
// different (e.g. after a contract redeploy) — AND mint the name NFT to that
// wallet (so the name lives in their wallet). Returns once confirmed on-chain.
export async function ensureController(name: string, wallet: string): Promise<{ controller: string; changed: boolean }> {
  const c = await ctx();
  const target = c.viem.getAddress(wallet);
  const current = await readController(name);
  controlled.add(normName(name));
  const changed = !(current && current.toLowerCase() === target.toLowerCase());
  if (changed) await enqueueSetController(name, target);
  if (NFT_ENABLED) {
    const nft = await readNftOwner(name);
    if (!nft || nft.owner.toLowerCase() !== target.toLowerCase()) {
      try { await enqueueMintName(name, target); } catch { /* already held by another wallet — can't seize */ }
    }
  }
  return { controller: target, changed };
}

// ── DIAL names as NFTs ──
function nftAddr(viem: any): Hex { return viem.getAddress(NFT_ADDRESS); }
function tokenIdFor(viem: any, name: string): bigint { return BigInt(viem.keccak256(viem.toBytes(normName(name)))); }

// Who holds the name NFT (null if not minted). Reads ownerOf live from chain.
export async function readNftOwner(name: string): Promise<{ owner: string; tokenId: string; contract: string } | null> {
  if (!NFT_ENABLED) return null;
  const c = await ctx();
  try {
    const owner = await c.pub.readContract({ address: nftAddr(c.viem), abi: NFT_ABI, functionName: 'ownerOf', args: [tokenIdFor(c.viem, name)] }) as string;
    return { owner, tokenId: tokenIdFor(c.viem, name).toString(), contract: nftAddr(c.viem) };
  } catch { return null; } // ownerOf reverts when not minted
}

// Mint the name NFT to a wallet (DIAL is the minter). No-op if already theirs;
// reverts if already held by a different wallet (can't seize a held name).
export function enqueueMintName(name: string, to: string) {
  return enqueue(async () => {
    const c = await ctx();
    const { request } = await c.pub.simulateContract({ account: c.account, address: nftAddr(c.viem), abi: NFT_ABI, functionName: 'mint', args: [normName(name), c.viem.getAddress(to)] });
    const hash = await c.wallet.writeContract(request);
    await c.pub.waitForTransactionReceipt({ hash });
    return { hash };
  });
}

// DIAL hands address-control of a name to a consumer wallet (bootstrapped from
// the SIWE wallet-link). owner-only tx; goes through the shared queue.
export function enqueueSetController(name: string, controller: string) {
  return enqueue(async () => {
    const c = await ctx();
    const { request } = await c.pub.simulateContract({ account: c.account, address: c.address, abi: ABI, functionName: 'setController', args: [normName(name), c.viem.getAddress(controller)] });
    const hash = await c.wallet.writeContract(request);
    await c.pub.waitForTransactionReceipt({ hash });
    return { hash, controller };
  });
}

// Build the EIP-712 typed data the consumer signs to set their addresses. Merges
// `overrides` (e.g. { 'eip155:1': '0x…' }) onto the name's current address map.
export async function prepareAddressUpdate(name: string, overrides: Record<string, string>) {
  const c = await ctx();
  const lname = normName(name);
  const nameHash = nameHashOf(c.viem, lname);
  const merged = { ...resolver.getAddresses(lname), ...overrides };
  const addrHash = addressesHash(c.viem, merged);
  const current = await c.pub.readContract({ address: c.address, abi: ABI, functionName: 'seqOf', args: [nameHash] }) as bigint;
  const seq = current + 1n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const typedData = {
    // EIP712Domain MUST be present for MetaMask's eth_signTypedData_v4 (viem adds
    // it implicitly; MetaMask requires it spelled out).
    domain: { name: 'DIAL', version: '1', chainId: c.chainId, verifyingContract: c.address },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
      ],
      SetAddresses: [
        { name: 'nameHash', type: 'bytes32' }, { name: 'addressesHash', type: 'bytes32' },
        { name: 'seq', type: 'uint64' }, { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'SetAddresses',
    message: { nameHash, addressesHash: addrHash, seq: seq.toString(), deadline: deadline.toString() },
  };
  return { typedData, nameHash, addressesHash: addrHash, seq: seq.toString(), deadline: deadline.toString(), addresses: merged };
}

// Recover the address that signed a SetAddresses message — the source of truth
// for who the controller must be (matches the contract's recovery exactly).
export async function recoverAddrSigner(nameHash: string, addressesHash: string, seq: string, deadline: string, signature: string): Promise<string> {
  const c = await ctx();
  return c.viem.recoverTypedDataAddress({
    domain: { name: 'DIAL', version: '1', chainId: c.chainId, verifyingContract: c.address },
    types: { SetAddresses: [
      { name: 'nameHash', type: 'bytes32' }, { name: 'addressesHash', type: 'bytes32' },
      { name: 'seq', type: 'uint64' }, { name: 'deadline', type: 'uint256' },
    ] },
    primaryType: 'SetAddresses',
    message: { nameHash: nameHash as Hex, addressesHash: addressesHash as Hex, seq: BigInt(seq), deadline: BigInt(deadline) },
    signature: signature as Hex,
  });
}

// Relay a consumer's signed address update on-chain (DIAL pays gas, can't forge).
export function enqueueSetAddressesSigned(nameHash: string, addressesHash: string, seq: string, deadline: string, signature: string) {
  return enqueue(async () => {
    const c = await ctx();
    const { request } = await c.pub.simulateContract({
      account: c.account, address: c.address, abi: ABI, functionName: 'setAddressesSigned',
      args: [nameHash as Hex, addressesHash as Hex, BigInt(seq), BigInt(deadline), signature as Hex],
    });
    const hash = await c.wallet.writeContract(request);
    const receipt = await c.pub.waitForTransactionReceipt({ hash });
    return { hash, status: receipt.status === 'success' ? 'confirmed' : 'reverted' };
  });
}

// ── Full self-custody — DIAL signs an off-chain voucher; the consumer submits
// every transaction itself and pays the gas. DIAL sends no on-chain tx. ──

// Mark a name as consumer-controlled so chain-sync skips the DIAL-paid setRecord
// mirror for it (self-custody: the chain is driven by the user, not DIAL).
export function markControlled(name: string) { controlled.add(normName(name)); }

// DIAL signs a Claim voucher (EIP-712) authorising `claimant` to take on-chain
// control of `name` until `deadline`. Off-chain + gasless — DIAL's only role on
// the chain path. The voucher is bound to `claimant`, so only that wallet can use it.
export async function signClaimVoucher(name: string, claimant: string, deadlineSec?: number) {
  const c = await ctx();
  const nameHash = nameHashOf(c.viem, name);
  const claimantAddr = c.viem.getAddress(claimant);
  const deadline = BigInt(deadlineSec ?? Math.floor(Date.now() / 1000) + 3600);
  const signature = await c.account.signTypedData({
    domain: { name: 'DIAL', version: '1', chainId: c.chainId, verifyingContract: c.address },
    types: { Claim: [
      { name: 'nameHash', type: 'bytes32' }, { name: 'claimant', type: 'address' }, { name: 'deadline', type: 'uint256' },
    ] },
    primaryType: 'Claim',
    message: { nameHash, claimant: claimantAddr, deadline },
  });
  return { nameHash, deadline: deadline.toString(), signature };
}

// Build the UNSIGNED claim() tx for the consumer's wallet to send (they pay gas).
export async function buildClaimTx(name: string, claimant: string) {
  const c = await ctx();
  const { nameHash, deadline, signature } = await signClaimVoucher(name, claimant);
  const data = c.viem.encodeFunctionData({ abi: ABI, functionName: 'claim', args: [nameHash, BigInt(deadline), signature] });
  return { to: c.address, data, value: '0x0', nameHash, deadline };
}

// Build the UNSIGNED setAddresses() tx — controller-direct, no signature needed
// (msg.sender is the proof). Reads seq from chain. Consumer sends it + pays gas.
export async function buildSetAddressesTx(name: string, overrides: Record<string, string>) {
  const c = await ctx();
  const lname = normName(name);
  const nameHash = nameHashOf(c.viem, lname);
  const merged = { ...resolver.getAddresses(lname), ...overrides };
  const addrHash = addressesHash(c.viem, merged);
  const current = await c.pub.readContract({ address: c.address, abi: ABI, functionName: 'seqOf', args: [nameHash] }) as bigint;
  const seq = current + 1n;
  const data = c.viem.encodeFunctionData({ abi: ABI, functionName: 'setAddresses', args: [nameHash, addrHash, seq] });
  return { to: c.address, data, value: '0x0', nameHash, addressesHash: addrHash, seq: seq.toString(), addresses: merged };
}

// Build the UNSIGNED DialName.claim() tx — the controller self-mints its name NFT
// and pays the gas. Returns null when the NFT contract isn't configured.
export async function buildMintTx(name: string) {
  if (!NFT_ENABLED) return null;
  const c = await ctx();
  const data = c.viem.encodeFunctionData({ abi: NFT_ABI, functionName: 'claim', args: [normName(name)] });
  return { to: nftAddr(c.viem), data, value: '0x0', tokenId: tokenIdFor(c.viem, name).toString(), contract: nftAddr(c.viem) };
}

// Trustless lookup: read a name's record straight from the contract on-chain
// (NOT from DIAL's DB). This is what an external dApp/wallet does.
export async function readRecord(name: string) {
  const c = await ctx();
  const { viem, pub, address, chainId } = c;
  const lname = normName(name);
  const nameHash = viem.keccak256(viem.toBytes(lname)) as Hex;
  const rec: any = await pub.readContract({ address, abi: ABI, functionName: 'getRecord', args: [nameHash] });
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
  const found = Number(rec.seq) > 0 || (rec.owner && rec.owner.toLowerCase() !== ZERO_ADDR);
  const nft = await readNftOwner(lname); // who holds the name NFT (null if unminted)
  return {
    name: lname, nameHash, chainId, contract: address,
    explorerBase: EXPLORERS[NETWORK] ?? null,
    found,
    owner: rec.owner,
    expiresAt: rec.expiresAt?.toString() ?? '0',
    attestationHash: rec.attestationHash,
    addressesHash: rec.addressesHash,
    seq: Number(rec.seq),
    released: rec.released,
    updatedAt: Number(rec.updatedAt),
    nft,
  };
}
