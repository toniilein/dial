import crypto from 'node:crypto';
import { db } from '../db.ts';
import { bus } from '../eventbus.ts';
import * as registry from './registry.ts';
import * as resolver from './resolver.ts';

// §6.2 Chain Sync — subscribes to Registry/Resolver events and writes
// DIAL-signed copies to the on-chain DialRegistry on each supported chain.
// Mocked here: instead of submitting transactions to Canton + an EVM RPC,
// we insert into `chain_writes` keyed by chain. The signature is a stand-in
// for the DIAL HSM-backed signing key (§NFR Security).

const DIAL_KEY = process.env.DIAL_SIGNING_SECRET ?? 'dial-poc-dev-signing-key';

function sign(payload: object): string {
  return crypto.createHmac('sha256', DIAL_KEY)
    .update(JSON.stringify(payload))
    .digest('hex');
}

type ChainWriteRow = {
  id: number;
  chain: string;
  name: string;
  op: string;
  payload: string;
  dial_sig: string;
  written_at: number;
};

function writeMirror(chain: 'canton' | 'evm', name: string, op: string) {
  const ns = registry.get(name);
  if (!ns) return;
  const addresses = resolver.getAddresses(name);
  const payload = {
    name,
    owner: ns.owner_address,
    expires_at: ns.expires_at,
    attestation_hash: ns.attestation_hash,
    addresses,
  };
  const dial_sig = sign(payload);
  db.prepare(`
    INSERT INTO chain_writes (chain, name, op, payload, dial_sig, written_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(chain, name, op, JSON.stringify(payload), dial_sig, Date.now());
}

// Tombstone — the row is already gone from Postgres by the time release fires.
function writeReleaseMirror(chain: 'canton' | 'evm', name: string) {
  const payload = { name, released_at: Date.now() };
  const dial_sig = sign(payload);
  db.prepare(`
    INSERT INTO chain_writes (chain, name, op, payload, dial_sig, written_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(chain, name, 'release', JSON.stringify(payload), dial_sig, Date.now());
}

export function start() {
  bus.subscribe((evt) => {
    if (evt.type === 'registry.changed') {
      if (evt.op === 'release') {
        writeReleaseMirror('canton', evt.name);
        writeReleaseMirror('evm', evt.name);
      } else {
        writeMirror('canton', evt.name, evt.op);
        writeMirror('evm', evt.name, evt.op);
      }
    } else if (evt.type === 'resolver.changed') {
      writeMirror('canton', evt.name, 'update');
      writeMirror('evm', evt.name, 'update');
    }
  });
}

export function listChain(chain: 'canton' | 'evm', limit = 50) {
  const rows = db.prepare(`
    SELECT * FROM chain_writes WHERE chain = ? ORDER BY id DESC LIMIT ?
  `).all(chain, limit) as ChainWriteRow[];
  return rows.map((r) => ({
    id: r.id,
    chain: r.chain,
    name: r.name,
    op: r.op,
    payload: JSON.parse(r.payload),
    dial_sig: r.dial_sig,
    written_at: r.written_at,
  }));
}

// Latest signed state per name on a given chain — what a wallet/dapp would
// fetch and locally verify against the DIAL public key.
export function latest(chain: 'canton' | 'evm', name: string) {
  const row = db.prepare(`
    SELECT * FROM chain_writes WHERE chain = ? AND name = ? ORDER BY id DESC LIMIT 1
  `).get(chain, name) as ChainWriteRow | undefined;
  if (!row) return null;
  return {
    chain: row.chain,
    name: row.name,
    op: row.op,
    payload: JSON.parse(row.payload),
    dial_sig: row.dial_sig,
    written_at: row.written_at,
  };
}
