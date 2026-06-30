# DIAL — Developer Setup

DIAL is a **DIAL-native name service** (an ENS alternative that doesn't depend on ENS): individuals and enterprises register human-readable names (`alice.dial`) that bind to chain addresses + a verified identity. It has its own Registry / Registrar / Resolver, a **real EVM mirror** that anchors records on Ethereum (Sepolia), **consumer-controlled addresses** (a consumer's wallet signs its own on-chain address — DIAL can't forge it), and **names as ERC-721 NFTs** held in the owner's wallet.

> The app lives in **`dial-poc/`**. All commands below run from there unless noted.

---

## 1. Prerequisites

| Need | For | Notes |
|---|---|---|
| **Node ≥ 20** | running the app (`npm start` uses `tsx`) | |
| **Node ≥ 22.6** | the contract `compile:evm` / `deploy:evm` scripts | they use `node --experimental-strip-types`. Node 22 LTS covers everything. |
| **Foundry** (optional) | `forge test` + the quickest contract deploy | install: `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| **A wallet + Sepolia ETH** (optional) | the on-chain mirror / NFTs | only if you set `DIAL_EVM_ENABLED=true`. Faucet: [Google Cloud](https://cloud.google.com/application/web3/faucet/ethereum/sepolia), [pk910 PoW](https://sepolia-faucet.pk910.de) |

**The app runs fully without any chain setup** — with the EVM mirror disabled it's mocked, and everything else (search, registration, identity, profiles, SIWE wallet-link) works locally against SQLite.

---

## 2. Quick start

```bash
git clone https://github.com/toniilein/dial.git
cd dial/dial-poc
npm install
npm start            # → http://localhost:3000
```

First boot seeds demo data (David / Acme / Alice) into a local `dial.db` (SQLite, gitignored, regenerated if deleted). `npm run dev` is the same with file-watch reload.

To run with the **real EVM mirror**, see §5.

---

## 3. Project layout

```
dial-poc/
  src/
    server.ts              # Express app — all /v1/* routes
    db.ts                  # SQLite schema + additive migrations
    services/
      registry.ts          # ownership ledger (ENS Registry analogue)
      registrar.ts         # issuance rules / TLDs
      resolver.ts          # records: addr.*, text.*, contenthash
      dialresolver.ts      # DIAL-native reverse resolution (replaces ENS)
      siwe.ts              # Sign-In-With-Ethereum verification (viem; no ENS)
      wallet.ts            # SIWE wallet-link handshake
      evm.ts               # EVM mirror: viem clients, signing, tx queue, NFT mint
      chain-sync.ts        # mirrors records to Canton (mock) + EVM (real)
      canton.ts            # DIAL Canton namespace (mock)
      auth.ts / oauth.ts   # accounts, sessions, Google/Apple, admin
      receptionist.ts modes.ts feeds.ts idh.ts billing.ts
  public/                  # React 18 via CDN + Babel-in-browser (no build step)
  contracts/
    DialRegistry.sol       # on-chain mirror + consumer-controlled addresses
    DialName.sol           # ERC-721 — names as NFTs
    *.abi.json             # committed ABIs (the app reads these)
  scripts/compile.ts deploy.ts   # solc-js compile + viem deploy (DialRegistry)
  test/*.t.sol             # Foundry tests (16 total)
  foundry.toml             # forge config (testing only)
```

Frontend is **React via CDN** transpiled by Babel in the browser — **no build step**. Edit `public/*.jsx` and reload.

---

## 4. The smart contracts

Two self-contained contracts (no OpenZeppelin), Solidity `^0.8.24`:

- **`DialRegistry`** — the on-chain mirror. `setRecord`/`release` (owner-relayer = "DIAL said so"), per-name `seq` (replay/order), per-name `controllerOf` + `setAddressesSigned` (a consumer's wallet signs EIP-712 to set its own address; DIAL relays but can't forge), and an EIP-712 domain so the same digest is computed on- and off-chain.
- **`DialName`** — ERC-721. `mint(name, to)` (DIAL is minter); `tokenId = uint256(keccak256(name))`. Minted to a consumer's wallet when they take control; DIAL cannot seize a held token.

### Test (needs Foundry)
```bash
export PATH="$HOME/.foundry/bin:$PATH"
forge test -vv          # 16 tests: DialRegistry (10) + DialName (6)
```

### Compile + deploy
```bash
# DialRegistry — pure npm path (solc-js + viem, no Foundry):
npm run compile:evm                 # → contracts/DialRegistry.abi.json + .bytecode.json
npm run deploy:evm                  # reads .env, deploys, prints the address

# DialName — deploy with Foundry's forge create:
forge create contracts/DialName.sol:DialName \
  --rpc-url "$DIAL_EVM_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast --constructor-args <DEPLOYER_ADDRESS>
```

> A live testnet deployment already exists if you just want to interact:
> `DialRegistry` `0x0a325377fb1ae438b35da4b1ca139f6e815af5c5`, `DialName` `0x2bea05A6d6F34fcD75F84058c879C8f320502873` (Sepolia). For development, deploy your own.

---

## 5. Configuration (`.env`)

Copy `.env.example` → `.env` (it's gitignored — **never commit a private key**). All of it is optional; with `DIAL_EVM_ENABLED=false` the mirror is mocked.

| Var | Purpose |
|---|---|
| `DIAL_EVM_ENABLED` | `true` = write real txs; `false`/unset = mock the EVM mirror |
| `DIAL_EVM_NETWORK` | `sepolia` \| `mainnet` \| `anvil` (display + explorer links) |
| `DIAL_EVM_RPC_URL` | JSON-RPC endpoint (public Sepolia works; Alchemy/Infura for reliability) |
| `DEPLOYER_PRIVATE_KEY` | the DIAL relayer EOA — deploys, relays mirror txs, mints NFTs, is the contract owner |
| `DIAL_REGISTRY_ADDRESS` | deployed `DialRegistry` |
| `DIAL_NAME_NFT_ADDRESS` | deployed `DialName` (enables name-NFT minting) |
| `SESSION_SECRET` | **required in production** — HMAC secret for session tokens |

The server loads `.env` automatically via `--env-file` (already wired into `package.json` / `.claude/launch.json`).

### Go live on Sepolia (end-to-end)
1. Create a throwaway EOA, fund it from a faucet (~0.1 test ETH).
2. Put its key in `.env` (`DEPLOYER_PRIVATE_KEY`), set `DIAL_EVM_NETWORK=sepolia` + an RPC.
3. `npm run compile:evm && npm run deploy:evm` → paste the address into `DIAL_REGISTRY_ADDRESS`.
4. Deploy `DialName` (forge create above) → paste into `DIAL_NAME_NFT_ADDRESS`.
5. Set `DIAL_EVM_ENABLED=true`, restart. The **On-chain** tab now shows real Sepolia txs with Etherscan links.

---

## 6. Key flows

- **DIAL-native resolution** — names resolve via DIAL's own registry/resolver; no ENS. Reverse (address→name) is proof-backed (`dialresolver.ts`).
- **SIWE wallet-link** — a user proves a wallet via Sign-In-With-Ethereum (`/v1/wallet/*`); it binds to a DIAL name they own.
- **Consumer-controlled addresses** — `/v1/chains/onchain/:name/prepare-addr` returns EIP-712 typed data; the consumer signs in their wallet; `/relay-addr` recovers the signer, makes it the on-chain controller, and relays `setAddressesSigned`. DIAL keeps issuance but can't change the address.
- **Names as NFTs** — taking control mints the name to the wallet (`DialName`), so it persists in-wallet independent of DIAL's DB.
- **On-chain page** (`/` → "On-chain") — EVM/Canton write log with tx links, a wallet connect/switch bar, and a trustless `getRecord` lookup.

---

## 7. Troubleshooting (gotchas we actually hit)

| Symptom | Cause / fix |
|---|---|
| `Provided chainId "11155111" must match the active chainId "1"` | Wallet on mainnet. Use the **Switch to sepolia** button (top bar / On-chain page) before signing. |
| `setAddressesSigned reverted: NoController()` | The name has no on-chain controller (e.g. after a redeploy). The prepare step now sets it automatically; just retry. |
| `setAddressesSigned reverted: BadSignature()` | Signed with a different account, or `EIP712Domain` missing. Both fixed — the server recovers the signer and makes it the controller; reload and retry. |
| NFT not visible in MetaMask | Testnets don't auto-detect NFTs. **Import NFT** (contract + tokenId), enable *Show test networks*, or check Sepolia Etherscan / testnets.opensea.io. |
| Linked wallet / address gone after re-login | The local `dial.db` was reset (it's ephemeral on Replit, and reseeds when empty). On-chain data persists; the name-NFT persists in your wallet. |

---

## 8. Caveats (it's a PoC)

- **Trust model:** the EVM mirror is **owner-relayer** ("trust DIAL") in v1 — records are an ordered, tamper-evident commitment, not yet independently verifiable. A dormant Layer-2 signed-records path exists; consumer *addresses* are already self-sovereign (signature-gated).
- **Signing is symmetric HMAC** for the Canton mirror — not externally verifiable until an asymmetric key is added.
- **Contracts are unverified** on Etherscan (deployed via raw bytecode / forge create) — explorers show minimal metadata. Verify them (needs an Etherscan API key) for nicer rendering.
- **State:** SQLite, reseeded on an empty DB. Not for production data.
