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
  created_at: number;
};

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

function insert(u: Omit<User, 'created_at'>): User {
  const created_at = Date.now();
  db.prepare(`
    INSERT INTO users (id, email, provider, provider_sub, password_hash, display_name, owner_address, created_at)
    VALUES (@id, @email, @provider, @provider_sub, @password_hash, @display_name, @owner_address, @created_at)
  `).run({ ...u, created_at });
  return { ...u, created_at };
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
  return { id: u.id, email: u.email, provider: u.provider, name: u.display_name, owner_address: u.owner_address };
}
