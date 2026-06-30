// Compile contracts/DialRegistry.sol + DialName.sol with solc-js (no Foundry
// needed) and write the committed ABIs + the (gitignored) bytecode the deploy
// script consumes.
//   npm run compile:evm
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsDir = path.join(__dirname, '..', 'contracts');

const input = {
  language: 'Solidity',
  sources: {
    'DialRegistry.sol': { content: fs.readFileSync(path.join(contractsDir, 'DialRegistry.sol'), 'utf8') },
    'DialName.sol': { content: fs.readFileSync(path.join(contractsDir, 'DialName.sol'), 'utf8') },
  },
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

for (const [file, name] of [['DialRegistry.sol', 'DialRegistry'], ['DialName.sol', 'DialName']]) {
  const c = out.contracts[file][name];
  fs.writeFileSync(path.join(contractsDir, name + '.abi.json'), JSON.stringify(c.abi, null, 2));
  fs.writeFileSync(path.join(contractsDir, name + '.bytecode.json'),
    JSON.stringify({ bytecode: '0x' + c.evm.bytecode.object }, null, 2));
  console.log('Compiled ' + name + ' —',
    c.abi.filter((e: any) => e.type === 'function').length, 'functions,',
    (c.evm.bytecode.object.length / 2), 'bytes bytecode.');
}
console.log('Wrote contracts/{DialRegistry,DialName}.{abi,bytecode}.json');
