import { db } from '../db.ts';
import { bus } from '../eventbus.ts';
import * as registry from './registry.ts';

// §6.2 Resolver — where the actual data lives.
// Records keyed by namespace + key. Convention for chain addresses:
//   key = `addr.${chainId}`  e.g. addr.canton, addr.eip155:1
//   key = `text.${k}`        e.g. text.email, text.url
//   key = `contenthash`

export type ResolverRecord = { name: string; key: string; value: string; updated_at: number };

export function getAll(name: string): ResolverRecord[] {
  return db.prepare(`SELECT * FROM resolver_records WHERE name = ?`).all(name) as ResolverRecord[];
}

export function getAddresses(name: string): Record<string, string> {
  // Alias `key` → `k` so the returned property name is stable regardless of how
  // the driver reports the column case (the libsql replica uppercases `key`).
  const rows = db.prepare(`SELECT key AS k, value FROM resolver_records WHERE name = ? AND key LIKE 'addr.%'`).all(name) as { k: string; value: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.k.slice('addr.'.length)] = r.value;
  return out;
}

export function addr(name: string, chainId: string): string | null {
  const row = db.prepare(`SELECT value FROM resolver_records WHERE name = ? AND key = ?`).get(name, `addr.${chainId}`) as { value: string } | undefined;
  return row?.value ?? null;
}

export function text(name: string, key: string): string | null {
  const row = db.prepare(`SELECT value FROM resolver_records WHERE name = ? AND key = ?`).get(name, `text.${key}`) as { value: string } | undefined;
  return row?.value ?? null;
}

// All text records as a key→value map (the `text.` prefix stripped). Used for
// social links (phone / whatsapp / telegram / x / linkedin / …) and the
// public address page.
export function getTexts(name: string): Record<string, string> {
  const rows = db.prepare(`SELECT key AS k, value FROM resolver_records WHERE name = ? AND key LIKE 'text.%'`).all(name) as { k: string; value: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.k.slice('text.'.length)] = r.value;
  return out;
}

function upsert(name: string, key: string, value: string): ResolverRecord {
  const updated_at = Date.now();
  db.prepare(`
    INSERT INTO resolver_records (name, key, value, updated_at)
    VALUES (@name, @key, @value, @updated_at)
    ON CONFLICT(name, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run({ name, key, value, updated_at });
  bus.publish({ type: 'resolver.changed', name, key, value });
  return { name, key, value, updated_at };
}

// Caller-side ownership check; routes will pass the authenticated caller in.
export function setAddr(caller: string, name: string, chainId: string, value: string): ResolverRecord {
  const owner = registry.ownerOf(name);
  if (!owner) throw new Error('namespace not found');
  if (owner.toLowerCase() !== caller.toLowerCase()) throw new Error('not owner');
  return upsert(name, `addr.${chainId}`, value);
}

export function setText(caller: string, name: string, key: string, value: string): ResolverRecord {
  const owner = registry.ownerOf(name);
  if (!owner) throw new Error('namespace not found');
  if (owner.toLowerCase() !== caller.toLowerCase()) throw new Error('not owner');
  return upsert(name, `text.${key}`, value);
}

export function removeText(caller: string, name: string, key: string): void {
  const owner = registry.ownerOf(name);
  if (!owner) throw new Error('namespace not found');
  if (owner.toLowerCase() !== caller.toLowerCase()) throw new Error('not owner');
  db.prepare(`DELETE FROM resolver_records WHERE name = ? AND key = ?`).run(name, `text.${key}`);
  bus.publish({ type: 'resolver.changed', name, key: `text.${key}`, value: '' });
}

export function removeAddr(caller: string, name: string, chainId: string): void {
  const owner = registry.ownerOf(name);
  if (!owner) throw new Error('namespace not found');
  if (owner.toLowerCase() !== caller.toLowerCase()) throw new Error('not owner');
  db.prepare(`DELETE FROM resolver_records WHERE name = ? AND key = ?`).run(name, `addr.${chainId}`);
  bus.publish({ type: 'resolver.changed', name, key: `addr.${chainId}`, value: '' });
}

// §3.3 Reverse resolution (address→name) is intentionally NOT here: a raw record
// match would trust owner-set `addr.*` records whose proof-of-control is mocked.
// Use dialresolver.reverse(), which keys off the SIWE-proven binding instead.
