import { db } from '../db.ts';
import { bus } from '../eventbus.ts';

// §6.2 Registry — the ledger of ownership.
// For every namespace: who owns it, which Resolver answers, when it expires.

export type Namespace = {
  name: string;
  owner_address: string;
  resolver_id: string;
  expires_at: number;
  registered_at: number;
  attestation_hash: string;
};

export function ownerOf(name: string): string | null {
  const row = db.prepare(`SELECT owner_address FROM namespaces WHERE name = ?`).get(name) as { owner_address: string } | undefined;
  return row?.owner_address ?? null;
}

export function resolverOf(name: string): string | null {
  const row = db.prepare(`SELECT resolver_id FROM namespaces WHERE name = ?`).get(name) as { resolver_id: string } | undefined;
  return row?.resolver_id ?? null;
}

export function expiresAt(name: string): number | null {
  const row = db.prepare(`SELECT expires_at FROM namespaces WHERE name = ?`).get(name) as { expires_at: number } | undefined;
  return row?.expires_at ?? null;
}

export function get(name: string): Namespace | null {
  const row = db.prepare(`SELECT * FROM namespaces WHERE name = ?`).get(name) as Namespace | undefined;
  return row ?? null;
}

export function listByOwner(owner_address: string): Namespace[] {
  return db.prepare(`SELECT * FROM namespaces WHERE owner_address = ? ORDER BY registered_at DESC`).all(owner_address) as Namespace[];
}

export function listAll(): Namespace[] {
  return db.prepare(`SELECT * FROM namespaces ORDER BY registered_at DESC LIMIT 100`).all() as Namespace[];
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // §4.1 30-day grace

export function isExpiredPastGrace(name: string, now = Date.now()): boolean {
  const exp = expiresAt(name);
  if (exp === null) return false;
  return now > exp + GRACE_PERIOD_MS;
}

export function isAvailable(name: string, now = Date.now()): boolean {
  const exp = expiresAt(name);
  if (exp === null) return true;
  // available again only after expiry + 30-day grace
  return now > exp + GRACE_PERIOD_MS;
}

export function register(args: {
  name: string;
  owner_address: string;
  duration_years: number;
  attestation_hash: string;
}): Namespace {
  const now = Date.now();
  const ns: Namespace = {
    name: args.name,
    owner_address: args.owner_address,
    resolver_id: 'default',
    expires_at: now + args.duration_years * ONE_YEAR_MS,
    registered_at: now,
    attestation_hash: args.attestation_hash,
  };
  db.prepare(`
    INSERT INTO namespaces (name, owner_address, resolver_id, expires_at, registered_at, attestation_hash)
    VALUES (@name, @owner_address, @resolver_id, @expires_at, @registered_at, @attestation_hash)
  `).run(ns);
  bus.publish({ type: 'registry.changed', name: ns.name, op: 'register' });
  return ns;
}

export function renew(name: string, duration_years: number): Namespace {
  const existing = get(name);
  if (!existing) throw new Error(`namespace not found: ${name}`);
  const now = Date.now();
  // Extend from whichever is later: now or current expiry (within grace).
  const base = Math.max(now, existing.expires_at);
  const new_expiry = base + duration_years * ONE_YEAR_MS;
  db.prepare(`UPDATE namespaces SET expires_at = ? WHERE name = ?`).run(new_expiry, name);
  bus.publish({ type: 'registry.changed', name, op: 'renew' });
  return { ...existing, expires_at: new_expiry };
}

// §1.6 / §2.6 — Owner releases the name. The spec defers actual reclamation
// until the grace period elapses; for the PoC we delete the row outright
// (FK ON DELETE CASCADE clears resolver_records). The pre-deletion snapshot is
// returned so callers + chain-sync can record the release.
export function release(name: string): Namespace {
  const existing = get(name);
  if (!existing) throw new Error(`namespace not found: ${name}`);
  db.prepare(`DELETE FROM namespaces WHERE name = ?`).run(name);
  bus.publish({ type: 'registry.changed', name, op: 'release' });
  return existing;
}
