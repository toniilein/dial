// Merge a local dial.db into the shared Turso DB (additive, one-shot).
//
//   node scripts/merge-into-shared.mjs [--source dial.db] [--label replit]
//
// Copies every row from the source SQLite file into the shared database
// WITHOUT overwriting anything already there:
//   • natural-key tables (namespaces, users, …) use INSERT OR IGNORE — on a
//     conflict the shared DB wins (it is the copy matched to on-chain state);
//   • append-only tables with AUTOINCREMENT ids (chain_writes, messages) are
//     re-inserted with fresh ids so both histories are kept.
// A marker row in _merged_sources makes the merge one-shot per label — a
// re-run exits without touching anything (that keeps the append-only tables
// duplicate-free).
//
// Needs TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in the environment (Replit
// Secrets provide them; locally run with node --env-file=.env). For a dry
// test against a plain file instead of Turso, pass --target-file <path>.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Sqlite from 'better-sqlite3';
import Libsql from 'libsql';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const SOURCE = arg('--source', path.join(__dirname, '..', 'dial.db'));
const LABEL = arg('--label', 'replit');
const TARGET_FILE = arg('--target-file', null);

if (!TARGET_FILE && !(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN)) {
  console.error('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set (and no --target-file given).');
  process.exit(1);
}

const src = new Sqlite(SOURCE, { readonly: true });
const dst = TARGET_FILE
  ? new Libsql(TARGET_FILE)
  : new Libsql(path.join(__dirname, '..', 'merge-replica.db'), {
      syncUrl: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
if (!TARGET_FILE) dst.sync();

// One-shot guard. NOTE: remote writes only bind positional `?` params.
dst.exec(`CREATE TABLE IF NOT EXISTS _merged_sources (source TEXT PRIMARY KEY, merged_at INTEGER NOT NULL)`);
const done = dst.prepare(`SELECT merged_at FROM _merged_sources WHERE source = ?`).get(LABEL);
if (done) {
  console.log(`'${LABEL}' was already merged at ${new Date(done.merged_at).toISOString()} — nothing to do.`);
  process.exit(0);
}

// FK-safe order: parents before children.
const NATURAL = [
  'namespaces', 'users', 'domains', 'attestations', 'payments',
  'resolver_records', 'domain_records', 'receptionists', 'profile_modes',
  'conversations', 'inbox',
];
const APPEND = ['chain_writes', 'messages']; // AUTOINCREMENT id → re-insert without it

const has = (t) => src.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t);

for (const t of NATURAL) {
  if (!has(t)) { console.log(`${t}: not in source, skipped`); continue; }
  const rows = src.prepare(`SELECT * FROM ${t}`).all();
  let added = 0;
  for (const r of rows) {
    const cols = Object.keys(r);
    const info = dst.prepare(
      `INSERT OR IGNORE INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    ).run(cols.map((c) => r[c]));
    added += info.changes;
  }
  console.log(`${t}: ${added} added, ${rows.length - added} already present`);
}

for (const t of APPEND) {
  if (!has(t)) { console.log(`${t}: not in source, skipped`); continue; }
  const rows = src.prepare(`SELECT * FROM ${t}`).all();
  let appended = 0;
  for (const r of rows) {
    const cols = Object.keys(r).filter((c) => c !== 'id');
    // Both DBs descend from the same snapshot — skip rows the target already
    // has verbatim (null-safe compare), so shared history isn't duplicated.
    const exists = dst.prepare(
      `SELECT 1 FROM ${t} WHERE ${cols.map((c) => `${c} IS ?`).join(' AND ')} LIMIT 1`
    ).get(cols.map((c) => r[c]));
    if (exists) continue;
    dst.prepare(
      `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    ).run(cols.map((c) => r[c]));
    appended++;
  }
  console.log(`${t}: ${appended} appended (fresh ids), ${rows.length - appended} already present`);
}

dst.prepare(`INSERT INTO _merged_sources (source, merged_at) VALUES (?, ?)`).run(LABEL, Date.now());
if (!TARGET_FILE) dst.sync();
console.log(`Merge '${LABEL}' complete.`);
