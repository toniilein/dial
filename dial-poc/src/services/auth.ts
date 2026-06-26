import crypto from 'node:crypto';
import { db } from '../db.ts';

// ── Real authentication ──────────────────────────────────────────────────
// Replaces the mocked x-owner-address login. A user signs in with email/
// password, Google, or Apple; we issue a signed session token that maps to the
// user's owner_address — the identity every ownership check already uses. No
// new native deps: password hashing is Node scrypt, sessions are HMAC-signed.

export type User = {
  id: string;
  email: string | null;
  provider: 'manual' | 'google' | 'apple' | 'demo';
  provider_sub: string | null;
  password_hash: string | null;
  display_name: string;
  owner_address: string;
  verified: number;
  verified_at: number | null;
  created_at: number;
};

// Admin panel — gated by a username + password (its own login, independent of
// user accounts and reachable when logged out). Override the defaults with
// ADMIN_USERNAME / ADMIN_PASSWORD env vars in production (the repo defaults are
// public). A successful login mints a short-lived signed admin token.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'lionscraft';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Lionscraft84!';
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
export function adminLogin(username: string, password: string): string | null {
  if (!safeEqual(username || '', ADMIN_USERNAME) || !safeEqual(password || '', ADMIN_PASSWORD)) return null;
  const body = Buffer.from(JSON.stringify({ admin: true, exp: Date.now() + ADMIN_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update('admin:' + body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token || token.indexOf('.') < 0) return false;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update('admin:' + body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return !!p.admin && p.exp > Date.now(); }
  catch { return false; }
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-change-me';
if (!process.env.SESSION_SECRET) {
  // Fail closed in production: a known default secret = forgeable sessions.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production (refusing to start with the insecure dev default).');
  }
  console.warn('[auth] SESSION_SECRET not set — using an insecure dev default. Set SESSION_SECRET in production.');
}
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function randomAddress(): string {
  return '0x' + crypto.randomBytes(20).toString('hex');
}

// ── password hashing (scrypt) ──
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 32);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

// ── deterministic owner_address for a new account ──
// Demo personas keep their fixed addresses; real users get a stable address
// derived from their identity so the existing address-keyed model just works.
export function deriveAddress(seed: string): string {
  return '0x' + crypto.createHash('sha256').update('dial-acct:' + seed).digest('hex').slice(0, 40);
}

// ── session tokens (HMAC-signed, stateless) ──
function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
// Domain-separation prefix so a session token can never be confused with an
// OAuth `state` token (which signs a different prefix), even if a secret leaks.
function sessionSig(body: string): string {
  return b64url(crypto.createHmac('sha256', SESSION_SECRET).update('session:' + body).digest());
}
export function issueSession(user: User): string {
  const payload = { uid: user.id, addr: user.owner_address, name: user.display_name, exp: Date.now() + SESSION_TTL_MS };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sessionSig(body)}`;
}
export function verifySession(token: string | undefined | null): { uid: string; addr: string; name: string } | null {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expected = sessionSig(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(b64urlDecode(body).toString());
    if (!p.exp || Date.now() > p.exp) return null;
    return { uid: p.uid, addr: String(p.addr).toLowerCase(), name: p.name };
  } catch { return null; }
}

// ── user store ──
export function getById(id: string): User | null {
  return (db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as User) ?? null;
}
export function getByEmail(email: string): User | null {
  return (db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase()) as User) ?? null;
}
export function getByProvider(provider: string, sub: string): User | null {
  return (db.prepare(`SELECT * FROM users WHERE provider = ? AND provider_sub = ?`).get(provider, sub) as User) ?? null;
}
export function getByAddress(address: string): User | null {
  return (db.prepare(`SELECT * FROM users WHERE owner_address = ?`).get(address.toLowerCase()) as User) ?? null;
}

function insert(u: Omit<User, 'created_at' | 'verified' | 'verified_at'>): User {
  const row: User = { ...u, verified: 0, verified_at: null, created_at: Date.now() };
  db.prepare(`
    INSERT INTO users (id, email, provider, provider_sub, password_hash, display_name, owner_address, created_at)
    VALUES (@id, @email, @provider, @provider_sub, @password_hash, @display_name, @owner_address, @created_at)
  `).run(row);
  return row;
}

// ── admin ──
export function listUsers(): User[] {
  return db.prepare(`SELECT * FROM users ORDER BY created_at ASC`).all() as User[];
}
export function setVerified(id: string, verified: boolean): User | null {
  const u = getById(id);
  if (!u) return null;
  db.prepare(`UPDATE users SET verified = ?, verified_at = ? WHERE id = ?`)
    .run(verified ? 1 : 0, verified ? Date.now() : null, id);
  return getById(id);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerManual(email: string, password: string, displayName: string): User {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new Error('invalid email');
  if (!password || password.length < 8) throw new Error('password must be at least 8 characters');
  if (getByEmail(e)) throw new Error('an account with that email already exists');
  return insert({
    id: 'usr_' + crypto.randomBytes(8).toString('hex'),
    email: e, provider: 'manual', provider_sub: null,
    password_hash: hashPassword(password),
    display_name: (displayName || e.split('@')[0]).trim(),
    owner_address: randomAddress(),
  });
}

// Constant-ish-time login: run a dummy hash when the user is missing/non-manual
// so timing doesn't reveal whether an account exists.
const DUMMY_HASH = hashPassword('dummy-password-for-constant-time-login');
export function loginManual(email: string, password: string): User {
  const u = getByEmail(email.trim().toLowerCase());
  if (!u || u.provider !== 'manual') { verifyPassword(password, DUMMY_HASH); throw new Error('invalid email or password'); }
  if (!verifyPassword(password, u.password_hash)) throw new Error('invalid email or password');
  return u;
}

// Upsert a Google/Apple user by provider subject. Only links to an existing
// account by email when the provider asserts the email is verified — otherwise
// an attacker-controlled email claim could take over an account.
export function upsertOAuth(provider: 'google' | 'apple', sub: string, email: string | null, displayName: string, emailVerified: boolean): User {
  const existing = getByProvider(provider, sub);
  if (existing) return existing;
  const e = email ? email.trim().toLowerCase() : null;
  if (e && emailVerified) {
    const byEmail = getByEmail(e);
    if (byEmail) return byEmail; // link existing account by *verified* email
  }
  return insert({
    id: 'usr_' + crypto.randomBytes(8).toString('hex'),
    email: e, provider, provider_sub: sub,
    password_hash: null,
    display_name: (displayName || (e ? e.split('@')[0] : provider + ' user')).trim(),
    owner_address: randomAddress(),
  });
}

// Seed a fixed demo-persona account (keeps the one-click demo login working).
export function ensureDemoUser(persona: string, displayName: string, ownerAddress: string): User {
  const existing = getByProvider('demo', persona);
  if (existing) return existing;
  return insert({
    id: 'usr_demo_' + persona,
    email: `${persona}@demo.dial`,
    provider: 'demo', provider_sub: persona, password_hash: null,
    display_name: displayName, owner_address: ownerAddress.toLowerCase(),
  });
}
export function getDemoUser(persona: string): User | null {
  return getByProvider('demo', persona);
}

export function publicUser(u: User) {
  return {
    id: u.id, email: u.email, provider: u.provider, name: u.display_name,
    owner_address: u.owner_address, verified: !!u.verified,
  };
}
// Admin view of a user (a little more detail for the table).
export function adminUser(u: User) {
  return { ...publicUser(u), verified_at: u.verified_at, created_at: u.created_at };
}
