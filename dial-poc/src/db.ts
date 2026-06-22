import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DIAL_DB ?? path.join(__dirname, '..', 'dial.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
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
`);
