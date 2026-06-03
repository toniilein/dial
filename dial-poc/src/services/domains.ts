import { db } from '../db.ts';
import { bus } from '../eventbus.ts';

// §4.1 Domain Issuance — corporate domains (the ".acme" TLD).
// Distinct SKU from §4.2 Namespace Directory: domains are TLDs an
// enterprise owns, under which they then issue many names.

export type Domain = {
  label: string;
  owner_address: string;
  expires_at: number;
  registered_at: number;
  attestation_hash: string;
};

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export function get(label: string): Domain | null {
  const row = db.prepare(`SELECT * FROM domains WHERE label = ?`).get(label) as Domain | undefined;
  return row ?? null;
}

export function listAll(): Domain[] {
  return db.prepare(`SELECT * FROM domains ORDER BY registered_at DESC LIMIT 100`).all() as Domain[];
}

export function listByOwner(owner_address: string): Domain[] {
  return db.prepare(`SELECT * FROM domains WHERE owner_address = ? ORDER BY registered_at DESC`).all(owner_address) as Domain[];
}

export function isAvailable(label: string, now = Date.now()): boolean {
  const row = get(label);
  if (!row) return true;
  return now > row.expires_at + GRACE_PERIOD_MS;
}

export function register(args: {
  label: string;
  owner_address: string;
  duration_years: number;
  attestation_hash: string;
}): Domain {
  const now = Date.now();
  const d: Domain = {
    label: args.label,
    owner_address: args.owner_address,
    expires_at: now + args.duration_years * ONE_YEAR_MS,
    registered_at: now,
    attestation_hash: args.attestation_hash,
  };
  db.prepare(`
    INSERT INTO domains (label, owner_address, expires_at, registered_at, attestation_hash)
    VALUES (@label, @owner_address, @expires_at, @registered_at, @attestation_hash)
  `).run(d);
  bus.publish({ type: 'registry.changed', name: '.' + args.label, op: 'register' });
  return d;
}

export function renew(label: string, duration_years: number): Domain {
  const existing = get(label);
  if (!existing) throw new Error(`domain not found: .${label}`);
  const now = Date.now();
  const base = Math.max(now, existing.expires_at);
  const new_expiry = base + duration_years * ONE_YEAR_MS;
  db.prepare(`UPDATE domains SET expires_at = ? WHERE label = ?`).run(new_expiry, label);
  bus.publish({ type: 'registry.changed', name: '.' + label, op: 'renew' });
  return { ...existing, expires_at: new_expiry };
}

export function release(label: string): Domain {
  const existing = get(label);
  if (!existing) throw new Error(`domain not found: .${label}`);
  db.prepare(`DELETE FROM domains WHERE label = ?`).run(label);
  bus.publish({ type: 'registry.changed', name: '.' + label, op: 'release' });
  return existing;
}

// ──────────── Apex records ────────────

export type DomainRecord = { label: string; key: string; value: string; updated_at: number };

export function getRecords(label: string): DomainRecord[] {
  return db.prepare(`SELECT * FROM domain_records WHERE label = ?`).all(label) as DomainRecord[];
}

export function getAddresses(label: string): Record<string, string> {
  const rows = db.prepare(`SELECT key, value FROM domain_records WHERE label = ? AND key LIKE 'addr.%'`).all(label) as { key: string; value: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key.slice('addr.'.length)] = r.value;
  return out;
}

export function setAddr(caller: string, label: string, chainId: string, value: string): DomainRecord {
  const d = get(label);
  if (!d) throw new Error('domain not found');
  if (d.owner_address.toLowerCase() !== caller.toLowerCase()) throw new Error('not owner');
  const updated_at = Date.now();
  const key = `addr.${chainId}`;
  db.prepare(`
    INSERT INTO domain_records (label, key, value, updated_at)
    VALUES (@label, @key, @value, @updated_at)
    ON CONFLICT(label, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run({ label, key, value, updated_at });
  bus.publish({ type: 'resolver.changed', name: '.' + label, key, value });
  return { label, key, value, updated_at };
}
