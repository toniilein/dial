// ── Sign-In-With-Ethereum boundary (EIP-4361) ─────────────────────────────
// The only module that touches `viem`. It proves a caller controls a wallet by
// verifying a signed EIP-4361 message — this is chain-AGNOSTIC and has nothing
// to do with ENS. (DIAL name/avatar resolution is now DIAL-native; see
// dialresolver.ts.) viem is retained here ONLY for:
//   • EIP-1271 smart-contract-wallet verification (needs an RPC on the wallet's
//     chain; EOAs verify offline via ecrecover and never hit the network), and
//   • EIP-55 checksum/validation of addresses (getAddress).
//
// viem is loaded lazily so the rest of DIAL boots even before `npm install`.
// Network only sets the SIWE `chainId` (and the EIP-1271 client's chain):
//   WALLET_NETWORK=sepolia (default) | mainnet ;  ETH_RPC_URL=https://… (optional)

export const NETWORK: 'mainnet' | 'sepolia' =
  (process.env.WALLET_NETWORK ?? 'sepolia').toLowerCase() === 'mainnet' ? 'mainnet' : 'sepolia';
export const CHAIN_ID = NETWORK === 'mainnet' ? 1 : 11155111;

type Hex = `0x${string}`;

// RPC is needed only for the EIP-1271 path; EOAs never use it.
const DEFAULT_RPC = {
  mainnet: 'https://ethereum-rpc.publicnode.com',
  sepolia: 'https://ethereum-sepolia-rpc.publicnode.com',
} as const;

let _viem: Promise<any> | null = null;
function load() {
  if (!_viem) {
    _viem = (async () => {
      const [core, chains, siwe] = await Promise.all([
        import('viem'),
        import('viem/chains'),
        import('viem/siwe'),
      ]);
      const chain = NETWORK === 'mainnet' ? chains.mainnet : chains.sepolia;
      const client = core.createPublicClient({
        chain,
        transport: core.http(process.env.ETH_RPC_URL || DEFAULT_RPC[NETWORK], { timeout: 15_000 }),
      });
      return { core, siwe, client };
    })();
  }
  return _viem;
}

// Build a server-controlled SIWE message. We own domain/uri/nonce/chainId so the
// client can't tamper with them — it only signs the string verbatim.
export async function buildMessage(params: {
  address: string; domain: string; uri: string; nonce: string; statement: string;
  issuedAt: Date; expirationTime: Date;
}): Promise<string> {
  const { core, siwe } = await load();
  return siwe.createSiweMessage({
    address: core.getAddress(params.address), // throws on malformed; yields EIP-55 checksum
    chainId: CHAIN_ID,
    domain: params.domain,
    uri: params.uri,
    nonce: params.nonce,
    version: '1',
    statement: params.statement,
    issuedAt: params.issuedAt,
    expirationTime: params.expirationTime,
  });
}

export async function parseMessage(message: string): Promise<{ address?: string; nonce?: string; domain?: string }> {
  const { siwe } = await load();
  return siwe.parseSiweMessage(message);
}

// Verify the signature AND the message envelope (domain + nonce + time window).
// Handles EOAs (offline ecrecover) and smart-contract wallets (EIP-1271, via RPC).
export async function verify(params: {
  message: string; signature: string; domain: string; nonce: string;
}): Promise<boolean> {
  const { siwe, client } = await load();
  try {
    return await siwe.verifySiweMessage(client, {
      message: params.message,
      signature: params.signature as Hex,
      domain: params.domain,
      nonce: params.nonce,
    });
  } catch {
    return false;
  }
}
