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
`);
