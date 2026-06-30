import crypto from 'node:crypto';
import * as siwe from './siwe.ts';
import * as dialresolver from './dialresolver.ts';
import * as authSvc from './auth.ts';

// ── Wallet linking — Sign-In-With-Ethereum (EIP-4361) orchestration ────────
// Two-step handshake bound to the signed-in account:
//   1. prepare(): mint a single-use nonce and a server-built SIWE message.
//   2. link():    verify the signature, then bind the proven address to the
//                 account's DIAL name (DIAL-native — no ENS).
// The nonce is short-lived server state (single-use, TTL-evicted) — the
// standard SIWE replay defence. Sessions stay stateless (see auth.ts); only
// these in-flight challenges are remembered, for at most a few minutes.

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes to connect + sign
const STATEMENT = 'Link this Ethereum wallet to your DIAL account.';

const nonces = new Map<string, { uid: string; exp: number }>();
// Evict expired challenges so the map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of nonces) if (v.exp < now) nonces.delete(k);
}, NONCE_TTL_MS).unref?.();

// Build the SIWE message a given account/address must sign. The nonce is a
// random hex string (alphanumeric, per the EIP-4361 grammar) we remember and
// later consume exactly once.
export async function prepare(uid: string, address: string, domain: string, uri: string): Promise<{ message: string }> {
  const nonce = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const message = await siwe.buildMessage({
    address, domain, uri, nonce, statement: STATEMENT,
    issuedAt: new Date(now),
    expirationTime: new Date(now + NONCE_TTL_MS),
  });
  nonces.set(nonce, { uid, exp: now + NONCE_TTL_MS });
  return { message };
}

// Verify a signed message and bind the proven wallet to the account's DIAL
// identity. `ownerAddress` is the account's owner_address (used to find/bind a
// name it owns). Throws (with a user-facing message) on any failure → 400.
export async function link(uid: string, ownerAddress: string, message: string, signature: string, domain: string): Promise<{ address: string; name: string | null; avatar: string | null }> {
  const parsed = await siwe.parseMessage(message);
  const nonce = parsed.nonce;
  const address = parsed.address;
  if (!nonce || !address) throw new Error('malformed sign-in message');

  // The nonce must be one we issued, unexpired, and bound to THIS account — and
  // it's consumed here so a captured signature can't be replayed.
  const rec = nonces.get(nonce);
  if (!rec || rec.exp < Date.now() || rec.uid !== uid) {
    throw new Error('this sign-in request expired — please connect again');
  }
  nonces.delete(nonce);

  const ok = await siwe.verify({ message, signature, domain, nonce });
  if (!ok) throw new Error('signature verification failed — the message was not signed by that wallet');

  // One wallet ↔ one account — checked only AFTER proof of control (so an
  // unverified caller can't probe which addresses are linked).
  const existing = authSvc.getByWallet(address);
  if (existing && existing.id !== uid) {
    const e = new Error('that wallet is already linked to another DIAL account') as Error & { code?: number };
    e.code = 409;
    throw e;
  }

  // DIAL-native: bind the SIWE-proven address to a DIAL name the account owns.
  const bound = dialresolver.bindWallet(ownerAddress, address);
  return { address, name: bound.name, avatar: bound.avatar };
}
