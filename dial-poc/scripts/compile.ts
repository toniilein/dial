// Compile contracts/DialRegistry.sol with solc-js (no Foundry needed) and write
// the committed ABI + the (gitignored) bytecode the deploy script consumes.
//   npm run compile:evm
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsDir = path.join(__dirname, '..', 'contracts');
const source = fs.readFileSync(path.join(contractsDir, 'DialRegistry.sol'), 'utf8');

const input = {
  language: 'Solidity',
  sources: { 'DialRegistry.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e: any) => e.severity === 'error');
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}

const c = out.contracts['DialRegistry.sol']['DialRegistry'];
fs.writeFileSync(path.join(contractsDir, 'DialRegistry.abi.json'), JSON.stringify(c.abi, null, 2));
fs.writeFileSync(path.join(contractsDir, 'DialRegistry.bytecode.json'),
  JSON.stringify({ bytecode: '0x' + c.evm.bytecode.object }, null, 2));

console.log('Compiled DialRegistry —',
  c.abi.filter((e: any) => e.type === 'function').length, 'functions,',
  (c.evm.bytecode.object.length / 2), 'bytes bytecode.');
console.log('Wrote contracts/DialRegistry.abi.json + DialRegistry.bytecode.json');
