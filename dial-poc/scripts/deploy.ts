// Deploy DialRegistry to the configured network via viem (no Foundry needed).
//   node --env-file=.env --experimental-strip-types scripts/deploy.ts
//   (or: npm run deploy:evm)
// Reads DIAL_EVM_RPC_URL + DEPLOYER_PRIVATE_KEY from the env. The deployer EOA
// becomes the contract owner. Prints the address to paste into DIAL_REGISTRY_ADDRESS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsDir = path.join(__dirname, '..', 'contracts');

const rpc = process.env.DIAL_EVM_RPC_URL;
const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!rpc || !pk) {
  console.error('Set DIAL_EVM_RPC_URL and DEPLOYER_PRIVATE_KEY (e.g. in .env) before deploying.');
  process.exit(1);
}

const abiPath = path.join(contractsDir, 'DialRegistry.abi.json');
const bytePath = path.join(contractsDir, 'DialRegistry.bytecode.json');
if (!fs.existsSync(bytePath)) {
  console.error('Missing contracts/DialRegistry.bytecode.json — run `npm run compile:evm` first.');
  process.exit(1);
}
const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
const { bytecode } = JSON.parse(fs.readFileSync(bytePath, 'utf8'));

const account = privateKeyToAccount((pk.startsWith('0x') ? pk : '0x' + pk) as `0x${string}`);
const transport = http(rpc, { timeout: 60_000 });
const wallet = createWalletClient({ account, transport });
const pub = createPublicClient({ transport });

const chainId = await pub.getChainId();
const balance = await pub.getBalance({ address: account.address });
console.log(`Deploying DialRegistry as ${account.address} on chainId ${chainId} (balance ${balance} wei)…`);
if (balance === 0n) console.warn('⚠  Deployer balance is 0 — fund it from a faucet first, or the deploy will fail.');

const hash = await wallet.deployContract({ abi, bytecode, args: [account.address] });
console.log('  deploy tx:', hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success') { console.error('Deploy reverted.'); process.exit(1); }

console.log('\n✅ DialRegistry deployed at:', receipt.contractAddress);
console.log('   Set this in your env:  DIAL_REGISTRY_ADDRESS=' + receipt.contractAddress);
