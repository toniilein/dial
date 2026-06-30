import crypto from 'node:crypto';
import { db } from '../db.ts';
import { bus } from '../eventbus.ts';
import * as registry from './registry.ts';
import * as resolver from './resolver.ts';
import * as evm from './evm.ts';

// §6.2 Chain Sync — subscribes to Registry/Resolver events and mirrors DIAL
// records to each supported chain.
//   • Canton: mocked — a DIAL-signed copy written to `chain_writes` (HMAC sig
//     stands in for the DIAL HSM key). Logs everything, incl. text records.
//   • EVM: real when DIAL_EVM_ENABLED=true — a transaction to the DialRegistry
//     contract (see evm.ts). Falls back to the same mock INSERT when disabled.
//     Text records are NEVER mirrored on the EVM (gas/privacy; not
//     resolution-critical) — only owner/expiry/attestation/addresses are.

const DIAL_KEY = process.env.DIAL_SIGNING_SECRET ?? 'dial-poc-dev-signing-key';

function sign(payload: object): string {
  return crypto.createHmac('sha256', DIAL_KEY).update(JSON.stringify(payload)).digest('hex');
}

type ChainWriteRow = {
  id: number; chain: string; name: string; op: string; payload: string;
  dial_sig: string; written_at: number; tx_hash: string | null; tx_status: string | null;
};

function insertRow(chain: 'canton' | 'evm', name: string, op: string, payload: object, dial_sig: string, tx_status: string | null): number {
  const info = db.prepare(`
    INSERT INTO chain_writes (chain, name, op, payload, dial_sig, written_at, tx_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(chain, name, op, JSON.stringify(payload), dial_sig, Date.now(), tx_status);
  return Number(info.lastInsertRowid);
}

function recordPayload(name: string) {
  const ns = registry.get(name);
  if (!ns) return null;
  return { name, owner: ns.owner_address, expires_at: ns.expires_at, attestation_hash: ns.attestation_hash, addresses: resolver.getAddresses(name) };
}

// Resolve the pending row once the tx settles (or fails).
function settle(id: number, p: Promise<{ hash: string; status: string }>) {
  p.then(r => db.prepare(`UPDATE chain_writes SET tx_hash = ?, tx_status = ? WHERE id = ?`).run(r.hash, r.status, id))
   .catch(e => {
     console.error('[evm] mirror write failed:', (e as Error).message);
     db.prepare(`UPDATE chain_writes SET tx_status = ? WHERE id = ?`).run('failed', id);
   });
}

function cantonMirror(name: string, op: string) {
  const payload = recordPayload(name);
  if (!payload) return;
  insertRow('canton', name, op, payload, sign(payload), null);
}
function cantonRelease(name: string) {
  const payload = { name, released_at: Date.now() };
  insertRow('canton', name, 'release', payload, sign(payload), null);
}

function evmMirror(name: string, op: string) {
  const payload = recordPayload(name);
  if (!payload) return;
  const dial_sig = sign(payload);
  if (!evm.EVM_ENABLED) { insertRow('evm', name, op, payload, dial_sig, null); return; }
  const id = insertRow('evm', name, op, payload, dial_sig, 'pending');
  settle(id, evm.enqueueSetRecord(name));
}
function evmRelease(name: string) {
  const payload = { name, released_at: Date.now() };
  const dial_sig = sign(payload);
  if (!evm.EVM_ENABLED) { insertRow('evm', name, 'release', payload, dial_sig, null); return; }
  const id = insertRow('evm', name, 'release', payload, dial_sig, 'pending');
  settle(id, evm.enqueueRelease(name));
}

export function start() {
  bus.subscribe((evt) => {
    if (evt.type === 'registry.changed') {
      if (evt.op === 'release') { cantonRelease(evt.name); evmRelease(evt.name); }
      else { cantonMirror(evt.name, evt.op); evmMirror(evt.name, evt.op); }
    } else if (evt.type === 'resolver.changed') {
      cantonMirror(evt.name, 'update');
      // Text records are off-chain by design. And for consumer-controlled names,
      // address changes go through the signed path (setAddressesSigned) — DIAL's
      // setRecord would just no-op, so skip it here.
      const key = String((evt as any).key || '');
      if (!key.startsWith('text.') && !evm.isConsumerControlled(evt.name)) evmMirror(evt.name, 'update');
    }
  });
  if (evm.EVM_ENABLED) console.log('[chain-sync] EVM mirror ENABLED — writing real transactions.');
}

// Log an already-broadcast EVM write (e.g. a consumer-signed setAddressesSigned)
// to the audit table so it appears on the On-chain page with its tx hash.
export function logEvmWrite(name: string, op: string, txHash: string, status: string) {
  const payload = recordPayload(name) ?? { name };
  const id = insertRow('evm', name, op, payload, sign(payload), status);
  db.prepare(`UPDATE chain_writes SET tx_hash = ? WHERE id = ?`).run(txHash, id);
}

function toView(r: ChainWriteRow) {
  return {
    id: r.id, chain: r.chain, name: r.name, op: r.op,
    payload: JSON.parse(r.payload), dial_sig: r.dial_sig, written_at: r.written_at,
    tx_hash: r.tx_hash ?? null, tx_status: r.tx_status ?? null,
  };
}

export function listChain(chain: 'canton' | 'evm', limit = 50) {
  const rows = db.prepare(`SELECT * FROM chain_writes WHERE chain = ? ORDER BY id DESC LIMIT ?`).all(chain, limit) as ChainWriteRow[];
  return rows.map(toView);
}

// Latest state per name on a given chain — what a wallet/dapp would fetch.
export function latest(chain: 'canton' | 'evm', name: string) {
  const row = db.prepare(`SELECT * FROM chain_writes WHERE chain = ? AND name = ? ORDER BY id DESC LIMIT 1`).get(chain, name) as ChainWriteRow | undefined;
  return row ? toView(row) : null;
}
