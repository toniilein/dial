import type BetterSqlite3Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DIAL_DB ?? path.join(__dirname, '..', 'dial.db');

// Shared DB across environments (local dev + Replit): when TURSO_DATABASE_URL
// is set, `libsql` keeps a local embedded replica at DIAL_DB — reads stay
// local/synchronous (same better-sqlite3 API), writes are forwarded to the
// shared Turso primary and replicate back to every instance within
// TURSO_SYNC_SECONDS. Without the env var this is the plain local SQLite file.
const TURSO_URL = process.env.TURSO_AUTH_TOKEN ? process.env.TURSO_DATABASE_URL : undefined;
if (process.env.TURSO_DATABASE_URL && !TURSO_URL) {
  console.warn('[db] TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing — falling back to the local file.');
}

// The embedded replica lives in its own file (unless DIAL_DB overrides it):
// it is materialized from the Turso primary and must not collide with a
// pre-existing standalone dial.db.
const REPLICA_PATH = process.env.DIAL_DB ?? path.join(__dirname, '..', 'dial-replica.db');

export const db: BetterSqlite3Database.Database = TURSO_URL
  ? new ((await import('libsql')).default)(REPLICA_PATH, {
      syncUrl: TURSO_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
      syncPeriod: Number(process.env.TURSO_SYNC_SECONDS ?? '5'),
    }) as unknown as BetterSqlite3Database.Database
  : new ((await import('better-sqlite3')).default)(DB_PATH);

if (TURSO_URL) {
  (db as any).sync(); // pull the shared state before the schema/migrations run

  // Two libsql better-sqlite3-compat quirks, fixed centrally:
  //  1. NAMED parameters bind as NULL on writes forwarded to the remote
  //     primary (only positional `?` survives the Hrana round-trip), so
  //     rewrite `@name` placeholders to positional at prepare time.
  //  2. Replica reads report keyword column names UPPERCASED (`key` → `KEY`)
  //     and append a `_metadata` field, so normalize returned rows (all our
  //     schema columns are lowercase).
  const fixRow = (row: unknown) => {
    if (!row || typeof row !== 'object') return row;
    const r = row as Record<string, unknown>;
    delete r._metadata;
    for (const k of Object.keys(r)) {
      const lower = k.toLowerCase();
      if (k !== lower && !(lower in r)) { r[lower] = r[k]; delete r[k]; }
    }
    return r;
  };
  const rawPrepare = db.prepare.bind(db);
  (db as any).prepare = (sql: string) => {
    const names: string[] = [];
    const positional = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_, n: string) => { names.push(n); return '?'; });
    const stmt = rawPrepare(positional);
    const toArgs = (args: unknown[]) =>
      names.length && args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])
        ? [names.map(n => (args[0] as Record<string, unknown>)[n])]
        : args;
    const rawGet = (stmt as any).get.bind(stmt);
    const rawAll = (stmt as any).all.bind(stmt);
    const rawRun = (stmt as any).run.bind(stmt);
    (stmt as any).get = (...args: unknown[]) => fixRow(rawGet(...toArgs(args)));
    (stmt as any).all = (...args: unknown[]) => rawAll(...toArgs(args)).map(fixRow);
    (stmt as any).run = (...args: unknown[]) => rawRun(...toArgs(args));
    return stmt;
  };

  console.log(`[db] shared mode — embedded replica of ${TURSO_URL} (sync every ${process.env.TURSO_SYNC_SECONDS ?? '5'}s)`);
} else {
  db.pragma('journal_mode = WAL');
}
db.pragma('foreign_keys = ON');

// Source of truth — DIAL Postgres in the architecture doc, SQLite here.
// Schema mirrors §6.3 conceptually: a Registry table (ownership) and a
// Resolver records table, plus mocked Billing + on-chain mirrors.
db.exec(`
  CREATE TABLE IF NOT EXISTS namespaces (
    name              TEXT PRIMARY KEY,
    owner_address     TEXT NOT NULL,
    resolver_id       TEXT NOT NULL DEFAULT 'default',
    expires_at        INTEGER NOT NULL,
    registered_at     INTEGER NOT NULL,
    attestation_hash  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resolver_records (
    name      TEXT NOT NULL,
    key       TEXT NOT NULL,
    value     TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (name, key),
    FOREIGN KEY (name) REFERENCES namespaces(name) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payments (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,         -- 'register' | 'renew'
    amount_usdc TEXT NOT NULL,
    status      TEXT NOT NULL,         -- 'paid' (mock always succeeds)
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attestations (
    hash          TEXT PRIMARY KEY,
    subject       TEXT NOT NULL,       -- the owner address / id verified
    kind          TEXT NOT NULL,       -- 'enterprise' | 'consumer'
    level         TEXT NOT NULL,       -- 'verified'
    issued_at     INTEGER NOT NULL
  );

  -- Mocked on-chain DialRegistry mirrors. The DIAL backend signs each write;
  -- a real implementation would push these to Canton + an EVM chain.
  CREATE TABLE IF NOT EXISTS chain_writes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    chain        TEXT NOT NULL,        -- 'canton' | 'evm'
    name         TEXT NOT NULL,
    op           TEXT NOT NULL,        -- 'register' | 'update' | 'renew'
    payload      TEXT NOT NULL,        -- JSON
    dial_sig     TEXT NOT NULL,
    written_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chain_writes_by_name ON chain_writes(chain, name);

  -- §4.1 Domain Issuance — corporate domains (e.g. ".acme"). Enterprises
  -- register these once they pass the Tier-2 Pairpoint check, then issue
  -- names under them. Consumers don't get one.
  CREATE TABLE IF NOT EXISTS domains (
    label             TEXT PRIMARY KEY,         -- stored without leading dot
    owner_address     TEXT NOT NULL,
    expires_at        INTEGER NOT NULL,
    registered_at     INTEGER NOT NULL,
    attestation_hash  TEXT NOT NULL DEFAULT ''
  );

  -- Apex records on the corporate domain itself. Names issued under the
  -- domain may override these with their own resolver_records entries.
  CREATE TABLE IF NOT EXISTS domain_records (
    label      TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (label, key),
    FOREIGN KEY (label) REFERENCES domains(label) ON DELETE CASCADE
  );

  -- ── Receptionist (retail) — ported from adihus/dial ──────────────────
  -- An AI-style intake agent + lightweight public profile, 1:1 with a name.
  -- The public "address page" at /<name> renders this profile, the name's
  -- chain addresses, and (when active) a visitor chat with the receptionist.
  CREATE TABLE IF NOT EXISTS receptionists (
    name              TEXT PRIMARY KEY,
    owner_address     TEXT NOT NULL,
    owner_name        TEXT NOT NULL,
    receptionist_name TEXT NOT NULL,
    headline          TEXT NOT NULL DEFAULT '',
    bio               TEXT NOT NULL DEFAULT '',
    greeting          TEXT NOT NULL DEFAULT '',
    forwarding_email  TEXT NOT NULL DEFAULT '',
    active            INTEGER NOT NULL DEFAULT 1,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    FOREIGN KEY (name) REFERENCES namespaces(name) ON DELETE CASCADE
  );

  -- One visitor session with a receptionist. Status mirrors the source PoC:
  -- open → collecting_info → ready_for_summary → summarized → delivered.
  CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,         -- the dial name being visited
    session_token   TEXT NOT NULL,         -- server-issued; binds continuation
    visitor_name    TEXT,
    visitor_contact TEXT,
    visitor_org     TEXT,
    topic           TEXT,
    urgency         TEXT,
    next_step       TEXT,
    status          TEXT NOT NULL DEFAULT 'open',
    summary         TEXT,
    asking          TEXT,                  -- which field we last asked for
    delivered_at    INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS conversations_by_name ON conversations(name);

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role            TEXT NOT NULL,         -- 'visitor' | 'receptionist'
    content         TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS messages_by_conv ON messages(conversation_id);

  -- Owner inbox — the mocked "email forwarding". Each summarized conversation
  -- drops a row here for the name's owner to read.
  CREATE TABLE IF NOT EXISTS inbox (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    owner_address   TEXT NOT NULL,
    conversation_id TEXT NOT NULL UNIQUE,   -- one inbox row per conversation
    subject         TEXT NOT NULL,
    body            TEXT NOT NULL,
    is_read         INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS inbox_by_owner ON inbox(owner_address);

  -- Modular profile modes — the owner flips on "modes" (conference / hiring /
  -- partnership / closed …) that the public profile renders. One JSON doc per
  -- name: { active: {key:bool}, primary: key, overrides: {key:{...}} }.
  CREATE TABLE IF NOT EXISTS profile_modes (
    name       TEXT PRIMARY KEY,
    doc        TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (name) REFERENCES namespaces(name) ON DELETE CASCADE
  );

  -- Real user accounts (replaces the mocked x-owner-address login). Each user
  -- maps to one owner_address — the identity all ownership checks already use —
  -- so the rest of the app is unchanged. Auth via manual email/password,
  -- Google, or Apple; demo personas are seeded as provider='demo' accounts.
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE,
    provider      TEXT NOT NULL,          -- 'manual' | 'google' | 'apple' | 'demo'
    provider_sub  TEXT,                   -- OAuth subject id (google/apple)
    password_hash TEXT,                   -- manual accounts only (scrypt)
    display_name  TEXT NOT NULL DEFAULT '',
    owner_address TEXT NOT NULL UNIQUE,   -- the ownership identity used everywhere
    verified      INTEGER NOT NULL DEFAULT 0,  -- admin-set identity verification
    verified_at   INTEGER,
    addr_line1    TEXT,                   -- user-editable postal/billing address
    addr_city     TEXT,
    addr_country  TEXT,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS users_by_provider ON users(provider, provider_sub);
`);

// ── Additive migrations ──────────────────────────────────────────────────
// `CREATE TABLE IF NOT EXISTS` never alters an existing table, so columns added
// after a table first shipped must be backfilled for databases that predate
// them (e.g. a deployed DB created before `users.verified` existed).
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('users', 'verified', 'verified INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'verified_at', 'verified_at INTEGER');
ensureColumn('users', 'addr_line1', 'addr_line1 TEXT');
ensureColumn('users', 'addr_city', 'addr_city TEXT');
ensureColumn('users', 'addr_country', 'addr_country TEXT');
// Linked Ethereum wallet (Sign-In-With-Ethereum), bound to a DIAL name the
// account owns (DIAL-native resolution — no ENS). The wallet is a verifiable
// credential distinct from the internal owner_address. No UNIQUE constraint
// (ALTER can't add one) — the app enforces one-wallet-per-account via
// getByWallet() before linking. wallet_name holds the bound DIAL name.
ensureColumn('users', 'wallet_address', 'wallet_address TEXT');
ensureColumn('users', 'wallet_name', 'wallet_name TEXT');
ensureColumn('users', 'wallet_avatar', 'wallet_avatar TEXT');
ensureColumn('users', 'wallet_linked_at', 'wallet_linked_at INTEGER');

// EVM mirror — real on-chain writes record their transaction hash + status
// (pending → confirmed | reverted | failed). Null for mock/Canton rows.
ensureColumn('chain_writes', 'tx_hash', 'tx_hash TEXT');
ensureColumn('chain_writes', 'tx_status', 'tx_status TEXT');

// Public-page visibility. 1 = anyone with the link can view the name's public
// page; 0 = private (only the owner can load it). Defaults to public so every
// existing name keeps its shareable page.
ensureColumn('namespaces', 'page_public', 'page_public INTEGER NOT NULL DEFAULT 1');
