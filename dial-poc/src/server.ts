import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './db.ts'; // initialise schema
import { bus } from './eventbus.ts';
import * as idh from './services/idh.ts';
import * as billing from './services/billing.ts';
import * as registry from './services/registry.ts';
import * as resolver from './services/resolver.ts';
import * as registrar from './services/registrar.ts';
import * as chainSync from './services/chain-sync.ts';
import * as domainsSvc from './services/domains.ts';
import * as canton from './services/canton.ts';
import * as receptionist from './services/receptionist.ts';
import * as modes from './services/modes.ts';
import * as authSvc from './services/auth.ts';
import * as oauth from './services/oauth.ts';
import * as feeds from './services/feeds.ts';
import * as siwe from './services/siwe.ts';
import * as wallet from './services/wallet.ts';
import * as dialresolver from './services/dialresolver.ts';
import * as evm from './services/evm.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

chainSync.start();

// Seed demo data on first run so the design's dashboard isn't empty.
function seedIfEmpty() {
  if (registry.listAll().length > 0 || domainsSvc.listAll().length > 0) return;

  // Demo accounts — one-click sign-in maps each to its persona's owner_address.
  const davidUser = authSvc.ensureDemoUser('david', 'David Palmer', '0xalice123',
    { line1: '12 Karlstrasse', city: '80333 Munich', country: 'Germany' });
  authSvc.ensureDemoUser('acme', 'Acme Industries GmbH', '0xacme456',
    { line1: 'Hofgartenstrasse 4', city: '80539 Munich', country: 'Germany' });
  authSvc.ensureDemoUser('alice', 'Alice Schäfer', '0xbob789',
    { line1: 'Friedrichshain 47', city: '10243 Berlin', country: 'Germany' });
  authSvc.setVerified(davidUser.id, true); // David is identity-verified for the demo

  // David — consumer with a .dial name, a receptionist, his real self-custodied
  // EVM address, and several messages already waiting in his inbox. (Account
  // address kept as the opaque internal id 0xalice123.)
  {
    const att = idh.verify('0xalice123', 'consumer');
    registrar.register({ name: 'david.dial', owner_address: '0xalice123', duration_years: 1, attestation_hash: att.hash });
    // Names default to a private page; the flagship demo page is published so
    // the public "address page" showcase works out of the box.
    registry.setPagePublic('0xalice123', 'david.dial', true);
    resolver.setAddr('0xalice123', 'david.dial', 'canton:omnibus', canton.partyFor('david.dial'));
    // Real self-custodied EVM address — the wallet that claimed david.dial on
    // Sepolia (controllerOf + name-NFT holder). Kept lowercase so the off-chain
    // addr map hashes to the on-chain addressesHash (0x4d6e…): the On-chain page
    // verifies clean against the deployed DialRegistry instead of showing a mock.
    resolver.setAddr('0xalice123', 'david.dial', 'eip155:1', '0xff2474a02f5d5d009ee00406463aeb6f2ca8b33d');

    receptionist.upsertConfig('0xalice123', 'david.dial', {
      owner_name: 'David Palmer',
      receptionist_name: "David's Receptionist",
      headline: 'Designer · non-custodial identity',
      bio: 'David builds non-custodial identity tools on DIAL. Leave a message and his receptionist will pass along a clean summary.',
      greeting: "Hi, I'm David's receptionist. I can take a message and forward a summary to David.",
      forwarding_email: 'david.palmer@proton.me',
      active: 1,
    });

    // Profile composition — active modules: partnership (primary/featured) and
    // hiring availability plus conferences/appearances and latest signals.
    modes.setActiveSet('0xalice123', 'david.dial', ['conference', 'partnership', 'hiring', 'signals'], 'partnership');

    // Drive several full conversations through the engine so the inbox is full.
    const runConvo = (messages: string[]) => {
      let cv: { conversation_id: string; session_token: string } | null = null;
      for (const msg of messages) {
        const out = receptionist.startOrContinue({
          name: 'david.dial',
          conversation_id: cv?.conversation_id ?? null,
          session_token: cv?.session_token ?? null,
          message: msg,
        });
        cv = { conversation_id: out.conversation_id, session_token: out.session_token };
      }
    };
    runConvo([
      "Hi, I'd like to reach David about a possible collaboration.",
      "I'm James Okoro from ADB.",
      'james.okoro@adb.example',
      'A tokenized insurance pilot we want to explore with him.',
      'A short intro call next week would be ideal.',
    ]);
    runConvo([
      "Hello — I need to reach David and it's fairly urgent.",
      'My name is Maria Chen, I work at Lattice Labs.',
      'maria@latticelabs.example',
      "We'd love him to review our wallet design system before launch.",
      'Could he share feedback or hop on a quick call this week?',
    ]);
    runConvo([
      'Hi there, quick one for David.',
      'This is Tomas Berg.',
      'you can reach me at tomas.berg@devconnect.example',
      "I'm organising DevConnect and would love David to give a talk.",
      'Just need to know if he is open to it — a reply by email is fine.',
    ]);
    runConvo([
      'Hey, is David around for a short chat?',
      "I'm Priya Nair from Helix.",
      'priya@helix.example',
      'Exploring a partnership on self-custody identity tooling.',
      'A 20-minute call would be great.',
    ]);
  }

  // Acme — enterprise with a corporate .acme domain plus 4 issued names.
  // The apex domain itself doesn't bind a Canton party; only the names
  // issued under it do.
  {
    const att = idh.verify('0xacme456', 'enterprise');
    registrar.registerDomain({ label: 'acme', owner_address: '0xacme456', duration_years: 1, attestation_hash: att.hash });

    const issued = ['finance.acme', 'treasury.acme', 'eng.acme', 'payroll.acme'];
    for (const name of issued) {
      registrar.register({ name, owner_address: '0xacme456', duration_years: 1, attestation_hash: att.hash });
      resolver.setAddr('0xacme456', name, 'canton:omnibus', canton.partyFor(name));
    }
  }
  console.log('[seed] inserted david.dial + .acme corporate domain (4 names) with Canton ns=' + canton.fingerprint().slice(0, 12) + '…');
}
seedIfEmpty();

const app = express();
app.set('trust proxy', true); // hosted behind a proxy (Replit) — for correct protocol/host
app.use(express.json({ limit: '1mb' })); // 1mb headroom for inline (data-URL) profile pictures
app.use(express.urlencoded({ extended: true })); // Apple OAuth posts form_post

// Tiny request logger so the demo flow is visible in the terminal.
app.use((req, _res, next) => {
  if (req.path.startsWith('/v1/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ---------- §4.4 API authentication ----------
// A signed session token (Authorization: Bearer), issued at login, identifies
// the caller and resolves to their owner_address — no longer a spoofable
// header. Ownership checks downstream compare against this resolved address.
function caller(req: Request): string | null {
  const auth = req.header('authorization');
  if (auth && /^Bearer\s+/i.test(auth)) {
    const session = authSvc.verifySession(auth.replace(/^Bearer\s+/i, '').trim());
    if (session) return session.addr;
  }
  return null;
}

function requireCaller(req: Request, res: Response): string | null {
  const c = caller(req);
  if (!c) {
    res.status(401).json({ error: 'authentication required' });
    return null;
  }
  return c;
}

// Admin panel auth — a username/password login (independent of user accounts),
// verified via a short-lived admin token sent as x-admin-token.
function requireAdminToken(req: Request, res: Response): boolean {
  if (!authSvc.verifyAdminToken(req.header('x-admin-token'))) {
    res.status(401).json({ error: 'admin authentication required' });
    return false;
  }
  return true;
}

// =====================================================
// Auth — real sign-in (manual email/password, Google, Apple, demo accounts)
// =====================================================
function baseUrl(req: Request): string {
  if (process.env.OAUTH_BASE_URL) return process.env.OAUTH_BASE_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}
function finishLogin(res: Response, user: authSvc.User) {
  res.json({ token: authSvc.issueSession(user), user: authSvc.publicUser(user) });
}
// After OAuth, hand the session token back to the SPA via the URL fragment
// (not sent to the server/logs) and let the frontend store it.
function oauthRedirect(req: Request, res: Response, token: string) {
  res.redirect(`${baseUrl(req)}/#auth=${encodeURIComponent(token)}`);
}
function oauthError(req: Request, res: Response, msg: string) {
  res.redirect(`${baseUrl(req)}/#auth_error=${encodeURIComponent(msg)}`);
}

// Per-IP throttle for credential endpoints (brute-force / stuffing / spam).
const authHits = new Map<string, { n: number; t: number }>();
function authThrottled(req: Request, res: Response): boolean {
  if (rateLimited(authHits, req.ip || 'unknown', 15)) {
    res.status(429).json({ error: 'Too many attempts — try again in a minute.' });
    return true;
  }
  return false;
}

// Which social providers are configured (so the UI can enable/disable buttons).
app.get('/v1/auth/providers', (_req, res) => {
  res.json({ google: oauth.googleConfigured(), apple: oauth.appleConfigured() });
});

app.post('/v1/auth/register', (req, res) => {
  if (authThrottled(req, res)) return;
  const { email, password, name } = req.body ?? {};
  try { finishLogin(res, authSvc.registerManual(String(email ?? ''), String(password ?? ''), String(name ?? ''))); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

app.post('/v1/auth/login', (req, res) => {
  if (authThrottled(req, res)) return;
  const { email, password } = req.body ?? {};
  try { finishLogin(res, authSvc.loginManual(String(email ?? ''), String(password ?? ''))); }
  catch (e) { res.status(401).json({ error: (e as Error).message }); }
});

// Forgot password — mint a reset link for a manual account. Always responds
// 200 with a generic message (so we don't reveal which emails are registered);
// the PoC has no mailer, so when an account exists the link is returned in
// `resetUrl` for the UI to surface. In production this branch would email the
// link instead and never return it. Toggle that off with EMAIL_RESET_LINK=true.
const RETURN_RESET_LINK = process.env.EMAIL_RESET_LINK !== 'true';
app.post('/v1/auth/forgot', (req, res) => {
  if (authThrottled(req, res)) return;
  const reset = authSvc.requestPasswordReset(String(req.body?.email ?? ''));
  const body: { ok: true; message: string; resetUrl?: string } = {
    ok: true,
    message: 'If an account with that email exists, a password reset link is on its way.',
  };
  if (reset && RETURN_RESET_LINK) body.resetUrl = `${baseUrl(req)}/#reset=${encodeURIComponent(reset.token)}`;
  res.json(body);
});

// Complete a reset: verify the token, set the new password, and sign the user
// in (returns a fresh session token, same shape as login).
app.post('/v1/auth/reset', (req, res) => {
  if (authThrottled(req, res)) return;
  const { token, password } = req.body ?? {};
  try { finishLogin(res, authSvc.resetPassword(String(token ?? ''), String(password ?? ''))); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// One-click demo accounts (David / Acme / Alice) — part of the PoC, so enabled
// by default (including on hosted deploys). Set ENABLE_DEMO_LOGIN=false to
// turn them off for a real production launch.
const DEMO_LOGIN = process.env.ENABLE_DEMO_LOGIN !== 'false';
app.post('/v1/auth/demo', (req, res) => {
  if (!DEMO_LOGIN) return res.status(403).json({ error: 'demo login disabled' });
  const persona = String(req.body?.persona ?? '');
  const u = authSvc.getDemoUser(persona);
  if (!u) return res.status(404).json({ error: 'unknown demo account' });
  finishLogin(res, u);
});

app.get('/v1/auth/me', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const u = authSvc.getByAddress(c);
  if (!u) return res.status(404).json({ error: 'account not found' });
  res.json({ user: authSvc.publicUser(u) });
});

// Update the signed-in user's editable profile (postal/billing address).
app.patch('/v1/auth/me', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const u = authSvc.getByAddress(c);
  if (!u) return res.status(404).json({ error: 'account not found' });
  const a = req.body?.address ?? {};
  const updated = authSvc.updateProfile(u.id, { line1: a.line1, city: a.city, country: a.country });
  res.json({ user: authSvc.publicUser(updated!) });
});

app.post('/v1/auth/logout', (_req, res) => res.json({ ok: true })); // stateless: client drops the token

// =====================================================
// Ethereum wallet link — Sign-In-With-Ethereum (EIP-4361), DIAL-native binding
// =====================================================
// Proves control of a wallet via SIWE (chain-agnostic) and binds it to a DIAL
// name the account owns (DIAL-native reverse resolution — no ENS). See siwe.ts
// (signature verification) and dialresolver.ts (name binding/resolution).

// The SIWE `domain` (anti-phishing binding) is the request host, e.g. the value
// the wallet shows the user. We build the message with it and re-check it here.
function siweDomain(req: Request): string {
  return req.get('host') || new URL(baseUrl(req)).host;
}
// viem is an optional dependency (only SIWE verification needs it). If a deploy
// hasn't run `npm install` yet, fail soft with a clear 503 instead of a 500.
function walletUnavailable(res: Response, e: Error): boolean {
  if (/Cannot find (package|module) ['"]viem|ERR_MODULE_NOT_FOUND/.test(e.message)) {
    res.status(503).json({ error: 'Wallet linking is not enabled on this server yet (run `npm install`).' });
    return true;
  }
  return false;
}

// Step 1 — mint a nonce + server-built SIWE message for the caller to sign.
app.post('/v1/wallet/nonce', async (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  if (authThrottled(req, res)) return;
  const u = authSvc.getByAddress(c);
  if (!u) return res.status(404).json({ error: 'account not found' });
  const address = String(req.body?.address ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'a valid 0x wallet address is required' });
  }
  try {
    const { message } = await wallet.prepare(u.id, address, siweDomain(req), baseUrl(req) + '/');
    res.json({ message });
  } catch (e) {
    if (!walletUnavailable(res, e as Error)) res.status(400).json({ error: (e as Error).message });
  }
});

// Step 2 — verify the SIWE signature and bind the proven wallet to a DIAL name
// the account owns (DIAL-native — no ENS).
app.post('/v1/wallet/link', async (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const u = authSvc.getByAddress(c);
  if (!u) return res.status(404).json({ error: 'account not found' });
  const { message, signature } = req.body ?? {};
  if (typeof message !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'message and signature required' });
  }
  try {
    const proven = await wallet.link(u.id, u.owner_address, message, signature, siweDomain(req));
    const updated = authSvc.setWallet(u.id, proven);
    // Full self-custody: DIAL does NOT touch the chain on link — the consumer takes
    // on-chain control themselves (the gas-paid `claim`) via the name's on-chain
    // buttons. Only the legacy owner-relayer mode (SELF_CUSTODY=false) bootstraps here.
    if (evm.EVM_ENABLED && !evm.SELF_CUSTODY && proven.name) {
      evm.enqueueSetController(proven.name, proven.address)
        .catch(e => console.error('[evm] setController failed:', (e as Error).message));
    }
    res.json({ user: authSvc.publicUser(updated!) });
  } catch (e) {
    if (walletUnavailable(res, e as Error)) return;
    // wallet.link tags the "already linked elsewhere" case for a 409.
    const code = (e as any).code === 409 ? 409 : 400;
    res.status(code).json({ error: (e as Error).message });
  }
});

// Remove the linked wallet (and the DIAL-native address record it bound).
app.post('/v1/wallet/unlink', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const u = authSvc.getByAddress(c);
  if (!u) return res.status(404).json({ error: 'account not found' });
  if (u.wallet_address) dialresolver.unbindWallet(u.owner_address, u.wallet_name, u.wallet_address);
  const updated = authSvc.clearWallet(u.id);
  res.json({ user: authSvc.publicUser(updated!) });
});

// ── Admin — username/password login, then list + verify users ──
app.post('/v1/admin/login', (req, res) => {
  if (authThrottled(req, res)) return;
  const token = authSvc.adminLogin(String(req.body?.username ?? ''), String(req.body?.password ?? ''));
  if (!token) return res.status(401).json({ error: 'invalid admin credentials' });
  res.json({ token });
});
app.get('/v1/admin/users', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  res.json({ users: authSvc.listUsers().map(authSvc.adminUser) });
});
app.post('/v1/admin/users/:id/verify', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  const u = authSvc.setVerified(req.params.id, req.body?.verified !== false);
  if (!u) return res.status(404).json({ error: 'user not found' });
  res.json({ user: authSvc.adminUser(u) });
});

// ── Google ──
app.get('/v1/auth/google/start', (req, res) => {
  if (!oauth.googleConfigured()) return oauthError(req, res, 'Google sign-in is not configured');
  const redirectUri = `${baseUrl(req)}/v1/auth/google/callback`;
  res.redirect(oauth.googleAuthUrl(redirectUri, oauth.signState({ p: 'google' })));
});
app.get('/v1/auth/google/callback', async (req, res) => {
  try {
    if (!oauth.verifyState(String(req.query.state ?? ''))) return oauthError(req, res, 'invalid state');
    if (req.query.error) return oauthError(req, res, String(req.query.error));
    const redirectUri = `${baseUrl(req)}/v1/auth/google/callback`;
    const prof = await oauth.googleExchange(redirectUri, String(req.query.code ?? ''));
    const user = authSvc.upsertOAuth('google', prof.sub, prof.email, prof.name, prof.emailVerified);
    oauthRedirect(req, res, authSvc.issueSession(user));
  } catch (e) { oauthError(req, res, (e as Error).message); }
});

// ── Apple (response_mode=form_post → callback is POST) ──
app.get('/v1/auth/apple/start', (req, res) => {
  if (!oauth.appleConfigured()) return oauthError(req, res, 'Apple sign-in is not configured');
  const redirectUri = `${baseUrl(req)}/v1/auth/apple/callback`;
  res.redirect(oauth.appleAuthUrl(redirectUri, oauth.signState({ p: 'apple' })));
});
app.post('/v1/auth/apple/callback', async (req, res) => {
  try {
    if (!oauth.verifyState(String(req.body?.state ?? ''))) return oauthError(req, res, 'invalid state');
    if (req.body?.error) return oauthError(req, res, String(req.body.error));
    const redirectUri = `${baseUrl(req)}/v1/auth/apple/callback`;
    const prof = await oauth.appleExchange(redirectUri, String(req.body?.code ?? ''));
    // Apple only sends the name on first consent (in `user` JSON).
    let name = prof.name;
    try { name = JSON.parse(req.body?.user || '{}')?.name?.firstName || name; } catch {}
    const user = authSvc.upsertOAuth('apple', prof.sub, prof.email, name, prof.emailVerified);
    oauthRedirect(req, res, authSvc.issueSession(user));
  } catch (e) { oauthError(req, res, (e as Error).message); }
});

// Apple domain verification — serves the association file Apple checks when you
// register the Services ID domain. Set APPLE_DOMAIN_ASSOCIATION to the content
// Apple gives you (kept in env, not the repo). 404s until configured.
app.get('/.well-known/apple-developer-domain-association.txt', (_req, res) => {
  if (!process.env.APPLE_DOMAIN_ASSOCIATION) return res.status(404).end();
  res.type('text/plain').send(process.env.APPLE_DOMAIN_ASSOCIATION);
});

// =====================================================
// §4.1 Domain Issuance + §4.2 Namespace Directory + Registrar
// =====================================================

// 1.1 / 2.1 — availability check
app.get('/v1/registrar/available', (req, res) => {
  const name = String(req.query.name ?? '');
  try {
    res.json(registrar.available(name));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// 1.2 / 2.2 — register
app.post('/v1/registrar/register', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const { name, duration_years = 1, attestation_hash = '' } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ error: 'name required' });
  }
  // attestation_hash may be empty for demo-mode self-attested registrations
  // (see §4.6 in registrar.ts — production would reject this).

  // Mock the billing handshake: quote → charge → on payment, issue.
  let issued;
  try {
    const a = registrar.available(name);
    if (!a.available) return res.status(409).json({ error: 'unavailable', detail: a });
    // Verified consumers (with a valid Pairpoint attestation) get the discount.
    const verified = !!attestation_hash && !!idh.get(attestation_hash);
    const q = billing.quote(a.label, a.tld, duration_years, { verified });
    const payment = billing.checkout(a.name, 'register', q.total_usdc);
    issued = registrar.register({
      name,
      owner_address: c,
      duration_years,
      attestation_hash,
    });
    // A Canton party is no longer bound at registration. The owner requests one
    // on demand from the name's On-chain tab (POST /v1/resolver/:name/canton/request),
    // the same way an EVM address is added — a name isn't tied to any chain until asked.
    res.json({
      namespace: issued.namespace,
      payment,
      pricing: q,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// 1.6 / 2.6 — release (owner returns the name to the available pool)
app.post('/v1/registrar/release', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const parsed = registrar.parse(name);
    const existing = registry.get(parsed.name);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.owner_address.toLowerCase() !== c) {
      return res.status(403).json({ error: 'not owner' });
    }
    const released = registrar.release(parsed.name);
    res.json({ released });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// 1.3 / 2.3 — renew
app.post('/v1/registrar/renew', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const { name, duration_years = 1 } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const existing = registry.get(registrar.parse(name).name);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.owner_address.toLowerCase() !== c) {
      return res.status(403).json({ error: 'not owner' });
    }
    const q = billing.quote(registrar.parse(name).label, registrar.parse(name).tld, duration_years);
    const payment = billing.checkout(existing.name, 'renew', q.total_usdc);
    const renewed = registrar.renew(name, duration_years);
    res.json({ namespace: renewed, payment, pricing: q });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// =====================================================
// Canton — DIAL namespace fingerprint
// =====================================================
// All DIAL-bound Canton parties share this namespace controller (the DIAL
// signing key). UI uses this to pre-fill the canton:omnibus field with the
// canonical `<dial-name>::1220<fingerprint>` shape.
app.get('/v1/canton/namespace', (_req, res) => {
  res.json({
    namespace: canton.namespace(),
    fingerprint: canton.fingerprint(),
    multihash_prefix: '1220',
    digest_algorithm: 'sha-256',
    example: canton.partyFor('david.dial'),
    note: 'Canton party id = <hint>::<namespace>. DIAL names use the DIAL-namespace fingerprint as the namespace; the hint is the DIAL name.',
  });
});

// =====================================================
// §4.1 Domain Issuance — corporate domains (.acme)
// =====================================================

// Availability + quote
app.get('/v1/registrar/domain/available', (req, res) => {
  const label = String(req.query.label ?? '');
  try {
    res.json(registrar.domainAvailable(label));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Register a corporate domain
app.post('/v1/registrar/domain/register', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const { label, duration_years = 1, attestation_hash = '' } = req.body ?? {};
  if (!label) return res.status(400).json({ error: 'label required' });
  try {
    const av = registrar.domainAvailable(label);
    if (!av.available) return res.status(409).json({ error: 'unavailable', detail: av });
    const q = billing.quoteDomain(av.label, duration_years);
    const payment = billing.checkout('.' + av.label, 'register', q.total_usdc);
    const domain = registrar.registerDomain({
      label, owner_address: c, duration_years, attestation_hash,
    });
    res.json({ domain, payment, pricing: q });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/v1/registrar/domain/renew', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const { label, duration_years = 1 } = req.body ?? {};
  if (!label) return res.status(400).json({ error: 'label required' });
  try {
    const lc = String(label).toLowerCase().replace(/^\./, '');
    const existing = domainsSvc.get(lc);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.owner_address.toLowerCase() !== c) {
      return res.status(403).json({ error: 'not owner' });
    }
    const q = billing.quoteDomain(lc, duration_years);
    const payment = billing.checkout('.' + lc, 'renew', q.total_usdc);
    const domain = registrar.renewDomain(lc, duration_years);
    res.json({ domain, payment, pricing: q });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/v1/registrar/domain/release', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const { label } = req.body ?? {};
  if (!label) return res.status(400).json({ error: 'label required' });
  try {
    const lc = String(label).toLowerCase().replace(/^\./, '');
    const existing = domainsSvc.get(lc);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.owner_address.toLowerCase() !== c) {
      return res.status(403).json({ error: 'not owner' });
    }
    const released = registrar.releaseDomain(lc);
    res.json({ released });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get('/v1/domains', (req, res) => {
  const owner = req.query.owner ? String(req.query.owner).toLowerCase() : null;
  res.json(owner ? domainsSvc.listByOwner(owner) : domainsSvc.listAll());
});

app.get('/v1/domains/:label', (req, res) => {
  const lc = req.params.label.toLowerCase().replace(/^\./, '');
  const d = domainsSvc.get(lc);
  if (!d) return res.status(404).json({ error: 'not found' });
  res.json({ ...d, addresses: domainsSvc.getAddresses(lc) });
});

app.post('/v1/domains/:label/addr/:chain', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const value = req.body?.value;
  if (typeof value !== 'string' || !value.length) {
    return res.status(400).json({ error: 'value required' });
  }
  try {
    const rec = domainsSvc.setAddr(c, req.params.label.toLowerCase().replace(/^\./, ''),
      req.params.chain.toLowerCase(), value);
    res.json(rec);
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'domain not found' ? 404 : 400)).json({ error: msg });
  }
});

// =====================================================
// §6.2 Registry — ownership
// =====================================================
app.get('/v1/registry/:name', (req, res) => {
  const ns = registry.get(req.params.name.toLowerCase());
  if (!ns) return res.status(404).json({ error: 'not found' });
  res.json(ns);
});

app.get('/v1/registry', (req, res) => {
  const owner = req.query.owner ? String(req.query.owner).toLowerCase() : null;
  res.json(owner ? registry.listByOwner(owner) : registry.listAll());
});

// =====================================================
// §4.3 Namespace Lookup — Resolver
// =====================================================

// 3.3 — reverse resolution (address → DIAL name), require caller header.
// Declared FIRST so `/v1/resolver/reverse` isn't matched by `/v1/resolver/:name`.
// Uses the DIAL-native, proof-backed resolver: only returns a name when the
// address proved control via SIWE and still owns that name (no unproven claims).
app.get('/v1/resolver/reverse', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const address = String(req.query.address ?? '');
  if (!address) return res.status(400).json({ error: 'address required' });
  const found = dialresolver.reverse(address);
  if (!found) return res.status(404).json({ error: 'no confirmed name for address' });
  res.json({ name: found.name, avatar: found.avatar, confirmed: true });
});

// 3.2 — chain-specific address lookup
app.get('/v1/resolver/:name/addr/:chain', (req, res) => {
  const a = resolver.addr(req.params.name.toLowerCase(), req.params.chain.toLowerCase());
  if (!a) return res.status(404).json({ error: 'no address for chain' });
  res.json({ address: a });
});

// 3.1 — public lookup, returns address records keyed by chain
app.get('/v1/resolver/:name', (req, res) => {
  const name = req.params.name.toLowerCase();
  const ns = registry.get(name);
  if (!ns) return res.status(404).json({ error: 'not found' });
  res.json({
    name,
    owner: ns.owner_address,
    expires_at: ns.expires_at,
    addresses: resolver.getAddresses(name),
    texts: resolver.getTexts(name),        // social links + other text records
    attestation_hash: ns.attestation_hash, // §3.4 DIAL-signed attestation reference
    page_public: registry.isPagePublic(name), // public-page visibility
  });
});

// Toggle a name's public-page visibility (owner-only).
app.post('/v1/names/:name/visibility', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const isPublic = req.body?.public;
  if (typeof isPublic !== 'boolean') return res.status(400).json({ error: 'public (boolean) required' });
  try {
    const name = req.params.name.toLowerCase();
    registry.setPagePublic(c, name, isPublic);
    res.json({ name, page_public: isPublic });
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' ? 404 : 400)).json({ error: msg });
  }
});

// Request a NON-CUSTODIAL Canton party for a name (owner-only). The keypair is
// generated in the user's browser — DIAL only ever receives the PUBLIC key plus
// a signature over `DIAL-canton-bind:<name>`. We verify that signature (proving
// the caller holds the private key), derive the party id from the public key's
// fingerprint, and bind it. The private key never leaves the user's device, so
// the party is genuinely self-custodied.
app.post('/v1/resolver/:name/canton/request', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const name = req.params.name.toLowerCase();
  const publicKeyHex = String(req.body?.public_key ?? '');
  const signatureHex = String(req.body?.signature ?? '');
  if (!/^[0-9a-fA-F]+$/.test(publicKeyHex)) return res.status(400).json({ error: 'public_key (hex) required' });
  if (!/^[0-9a-fA-F]+$/.test(signatureHex)) return res.status(400).json({ error: 'signature (hex) required' });
  try {
    // Ownership first (setAddr enforces it too, but fail fast before crypto).
    const owner = registry.ownerOf(name);
    if (!owner) return res.status(404).json({ error: 'namespace not found' });
    if (owner.toLowerCase() !== c) return res.status(403).json({ error: 'not owner' });
    const { party, fingerprint } = canton.verifyAndDeriveParty(name, publicKeyHex, signatureHex);
    const rec = resolver.setAddr(c, name, 'canton:omnibus', party);
    res.json({ party, fingerprint, custody: 'self', record: rec });
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' ? 404 : 400)).json({ error: msg });
  }
});

// 1.5 / 2.5 / 2.8 — edit records
app.post('/v1/resolver/:name/addr/:chain', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const value = req.body?.value;
  if (typeof value !== 'string' || !value.length) {
    return res.status(400).json({ error: 'value required' });
  }
  const chain = req.params.chain.toLowerCase();
  // §5.4 proof-of-control is mocked; we still validate the address shape so a
  // bound EVM address is well-formed (0x + 40 hex). EIP-55 checksum optional.
  if (chain.startsWith('eip155') && !/^0x[0-9a-fA-F]{40}$/.test(value.trim())) {
    return res.status(400).json({ error: 'invalid EVM address — expected 0x followed by 40 hex characters' });
  }
  // Store EVM addresses lowercased so reverse lookups + equality compare cleanly
  // (SIWE emits EIP-55 checksummed addresses; records must normalize to match).
  const normalized = chain.startsWith('eip155') ? value.trim().toLowerCase() : value.trim();
  try {
    const rec = resolver.setAddr(c, req.params.name.toLowerCase(), chain, normalized);
    res.json(rec);
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' ? 404 : 400)).json({ error: msg });
  }
});

// A profile-picture value is acceptable as a hosted path, a remote http(s) URL,
// or a small inline base64 image (data-URL). data:image/svg is rejected — even
// inside <img> we keep to raster types to avoid script-bearing SVG payloads.
function isValidAvatar(v: string): boolean {
  if (/^\/[^\s]+$/.test(v)) return true;
  if (/^https?:\/\/\S+$/i.test(v)) return true;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(v)) return v.length <= 1_400_000;
  return false;
}

// Set or clear a text record (empty value deletes it — used by social links).
app.post('/v1/resolver/:name/text/:key', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const value = req.body?.value;
  if (typeof value !== 'string') return res.status(400).json({ error: 'value required' });
  // The profile picture is stored as a text record (a hosted path, a remote URL,
  // or a small inline data-URL). Validate so we never persist a non-image blob.
  if (req.params.key === 'avatar' && value.trim() !== '' && !isValidAvatar(value.trim())) {
    return res.status(400).json({ error: 'invalid profile picture — upload a PNG, JPEG, GIF, or WebP image under 1 MB' });
  }
  try {
    const name = req.params.name.toLowerCase();
    const key = req.params.key;
    const rec = value.trim() === ''
      ? (resolver.removeText(c, name, key), { name, key, value: '', updated_at: Date.now() })
      : resolver.setText(c, name, key, value.trim());
    res.json(rec);
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' ? 404 : 400)).json({ error: msg });
  }
});

// =====================================================
// §4.6 Identity Verification — Vodafone Pairpoint IDH (mocked)
// =====================================================
app.post('/v1/idh/verify', (req, res) => {
  const { subject, kind } = req.body ?? {};
  if (!subject || (kind !== 'enterprise' && kind !== 'consumer')) {
    return res.status(400).json({ error: 'subject and kind (enterprise|consumer) required' });
  }
  res.json(idh.verify(subject, kind));
});

// =====================================================
// §4.7 Billing — USDC pricing tiers (mocked checkout)
// =====================================================
app.get('/v1/billing/quote', (req, res) => {
  const name = String(req.query.name ?? '');
  const years = Number(req.query.duration_years ?? 1);
  try {
    const { label, tld } = registrar.parse(name);
    res.json(billing.quote(label, tld, years));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// =====================================================
// On-chain mirrors (Canton mocked; EVM real when DIAL_EVM_ENABLED=true)
// =====================================================
// EVM network/contract info for the UI (network, chainId, contract, explorer).
// Declared before `/v1/chains/:chain` so 'config' isn't matched as a chain.
app.get('/v1/chains/config', async (_req, res) => {
  try { res.json(await evm.config()); }
  catch (e) { res.json({ enabled: evm.EVM_ENABLED, error: (e as Error).message }); }
});

// Trustless on-chain lookup — reads a name's record live from the DialRegistry
// contract (not DIAL's DB). Declared before `/v1/chains/:chain` to avoid capture.
app.get('/v1/chains/onchain/:name', async (req, res) => {
  if (!evm.EVM_ENABLED) return res.status(503).json({ error: 'on-chain mirror is not enabled' });
  try { res.json(await evm.readRecord(req.params.name.toLowerCase())); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// Consumer-controlled address update (decentralised). Two steps:
//   1. prepare → DIAL returns the EIP-712 typed data the consumer signs.
//   2. relay   → consumer's signature; DIAL relays setAddressesSigned + updates DB.
// Owner-gated; only works for names whose on-chain controller is the caller's wallet.
app.post('/v1/chains/onchain/:name/prepare-addr', async (req, res) => {
  const c = requireCaller(req, res); if (!c) return;
  if (!evm.EVM_ENABLED) return res.status(503).json({ error: 'on-chain mirror is not enabled' });
  const name = req.params.name.toLowerCase();
  if ((registry.ownerOf(name) || '').toLowerCase() !== c) return res.status(403).json({ error: 'not owner' });
  const value = String(req.body?.value ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return res.status(400).json({ error: 'a valid EVM address is required' });
  // Just build the typed data to sign. The controller is set at relay time from
  // the recovered signer, so the wallet account can never mismatch.
  try {
    res.json(await evm.prepareAddressUpdate(name, { 'eip155:1': value.toLowerCase() }));
  } catch (e) {
    if (walletUnavailable(res, e as Error)) return;
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/v1/chains/onchain/:name/relay-addr', async (req, res) => {
  const c = requireCaller(req, res); if (!c) return;
  if (!evm.EVM_ENABLED) return res.status(503).json({ error: 'on-chain mirror is not enabled' });
  const name = req.params.name.toLowerCase();
  if ((registry.ownerOf(name) || '').toLowerCase() !== c) return res.status(403).json({ error: 'not owner' });
  const { nameHash, addressesHash, seq, deadline, signature, value } = req.body ?? {};
  if (![nameHash, addressesHash, seq, deadline, signature, value].every(x => typeof x === 'string')) {
    return res.status(400).json({ error: 'nameHash, addressesHash, seq, deadline, signature, value required' });
  }
  try {
    // Recover whoever actually signed and make THAT the on-chain controller — so
    // the contract's own recovery is guaranteed to match (no BadSignature).
    const signer = await evm.recoverAddrSigner(nameHash, addressesHash, seq, deadline, signature);
    await evm.ensureController(name, signer);
    const out = await evm.enqueueSetAddressesSigned(nameHash, addressesHash, seq, deadline, signature);
    // Surface the consumer-signed tx on the On-chain page (with its Etherscan link).
    chainSync.logEvmWrite(name, 'addr · signed', out.hash, out.status);
    // Reflect the consumer-set address in DIAL's DB (the public page / resolver).
    resolver.setAddr(c, name, 'eip155:1', String(value).toLowerCase());
    // Include the freshly-minted name NFT + explorer base so the UI can link to it.
    const nft = await evm.readNftOwner(name).catch(() => null);
    const cfg = await evm.config().catch(() => null);
    res.json({ ...out, name, controller: signer, nft, explorerBase: cfg ? (cfg as any).explorerBase : null });
  } catch (e) {
    if (walletUnavailable(res, e as Error)) return;
    res.status(400).json({ error: (e as Error).message });
  }
});

// ── Full self-custody — the consumer does EVERYTHING on-chain and pays the gas ──
// DIAL signs an off-chain claim voucher; the consumer's own wallet submits the
// transactions (claim control → set address → self-mint the NFT). DIAL never
// sends a transaction. `selfcustody-txs` returns the UNSIGNED txs to send;
// `selfcustody-confirm` is bookkeeping after the wallet sends them.
app.post('/v1/chains/onchain/:name/selfcustody-txs', async (req, res) => {
  const c = requireCaller(req, res); if (!c) return;
  if (!evm.EVM_ENABLED) return res.status(503).json({ error: 'on-chain mirror is not enabled' });
  const name = req.params.name.toLowerCase();
  if ((registry.ownerOf(name) || '').toLowerCase() !== c) return res.status(403).json({ error: 'not owner' });
  const from = String(req.body?.from ?? '').trim();
  const value = String(req.body?.value ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(from)) return res.status(400).json({ error: 'a connected wallet (from) is required' });
  if (value && !/^0x[0-9a-fA-F]{40}$/.test(value)) return res.status(400).json({ error: 'value must be a valid EVM address' });
  try {
    const steps: any[] = [];
    // 1. Claim control — skip if this wallet already controls the name on-chain.
    const ctrl = await evm.readController(name).catch(() => '');
    if (!ctrl || ctrl.toLowerCase() !== from.toLowerCase()) {
      steps.push({ op: 'claim', label: 'Claim control', ...(await evm.buildClaimTx(name, from)) });
    }
    // 2. Set the address (only when one was provided).
    if (value) {
      steps.push({ op: 'setAddresses', label: 'Set address', value: value.toLowerCase(), ...(await evm.buildSetAddressesTx(name, { 'eip155:1': value.toLowerCase() })) });
    }
    // 3. Self-mint the name NFT — ONLY when it's genuinely unminted. If another
    //    wallet already holds it, the contract can't seize it (AlreadyOwned), so
    //    don't queue a tx that would just revert; flag it for the UI instead.
    const nftOwner = await evm.readNftOwner(name).catch(() => null);
    let nftHeldByOther: string | null = null;
    if (evm.NFT_ENABLED) {
      if (!nftOwner) {
        const m = await evm.buildMintTx(name);
        if (m) steps.push({ op: 'mint', label: 'Mint name NFT', ...m });
      } else if (nftOwner.owner.toLowerCase() !== from.toLowerCase()) {
        nftHeldByOther = nftOwner.owner; // held by a different wallet — can't re-mint
      }
    }
    const cfg = await evm.config().catch(() => null);
    res.json({ name, from, steps, nftHeldByOther, explorerBase: cfg ? (cfg as any).explorerBase : null });
  } catch (e) {
    if (walletUnavailable(res, e as Error)) return;
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/v1/chains/onchain/:name/selfcustody-confirm', async (req, res) => {
  const c = requireCaller(req, res); if (!c) return;
  if (!evm.EVM_ENABLED) return res.status(503).json({ error: 'on-chain mirror is not enabled' });
  const name = req.params.name.toLowerCase();
  if ((registry.ownerOf(name) || '').toLowerCase() !== c) return res.status(403).json({ error: 'not owner' });
  const { op, txHash, value } = req.body ?? {};
  if (typeof op !== 'string' || typeof txHash !== 'string') return res.status(400).json({ error: 'op + txHash required' });
  try {
    evm.markControlled(name); // self-custody: DIAL stops mirroring this name's writes
    const labels: Record<string, string> = { claim: 'claim · self', setAddresses: 'addr · self', mint: 'nft · self' };
    chainSync.logEvmWrite(name, labels[op] || op, txHash, 'confirmed');
    if (op === 'setAddresses' && typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)) {
      resolver.setAddr(c, name, 'eip155:1', value.toLowerCase()); // reflect in DIAL's DB (chain-sync skips: controlled)
    }
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

app.get('/v1/chains/:chain', (req, res) => {
  const chain = req.params.chain.toLowerCase();
  if (chain !== 'canton' && chain !== 'evm') return res.status(400).json({ error: 'unknown chain' });
  res.json(chainSync.listChain(chain));
});

app.get('/v1/chains/:chain/:name', (req, res) => {
  const chain = req.params.chain.toLowerCase();
  if (chain !== 'canton' && chain !== 'evm') return res.status(400).json({ error: 'unknown chain' });
  const row = chainSync.latest(chain, req.params.name.toLowerCase());
  if (!row) return res.status(404).json({ error: 'not on chain yet' });
  res.json(row);
});

// =====================================================
// Receptionist (retail) — public page, visitor chat, owner inbox
// Ported from adihus/dial. Scripted intake (no external LLM); summaries
// land in the owner inbox (mocked email forwarding).
// =====================================================

// Public address page — no auth. Profile + chain addresses + receptionist +
// active profile modules.
app.get('/v1/public/:name', (req, res) => {
  const name = req.params.name.toLowerCase();
  const page = receptionist.publicPage(name);
  if (!page) return res.status(404).json({ error: 'not found' });
  const owner = registry.ownerOf(name);

  // Visibility gate — a private page is only returned to its owner (so they can
  // still preview it); everyone else gets a 403 the UI renders as "private".
  const isPublic = registry.isPagePublic(name);
  if (!isPublic) {
    const c = caller(req);
    if (!c || !owner || c.toLowerCase() !== owner.toLowerCase()) {
      return res.status(403).json({ error: 'This page is private.', private: true });
    }
  }

  const ownerUser = owner ? authSvc.getByAddress(owner) : null;

  // Latest-posts module: attach the name's curated X / LinkedIn post embeds.
  // The module has no static content, so when nothing is configured we drop it
  // entirely rather than render an empty block.
  const embeds = feeds.publicEmbeds(name);
  const showEmbeds = feeds.hasEmbeds(name);
  const withEmbeds = modes.publicModes(name)
    .filter(m => m.key !== 'signals' || showEmbeds)
    .map(m => m.key === 'signals' ? { ...m, embeds } : m);

  res.json({ ...page, modes: withEmbeds, owner_verified: !!(ownerUser && ownerUser.verified), page_public: isPublic });
});

// Public: a name's social post embeds (X handle + LinkedIn embed URLs). Same
// data the Latest-posts module renders; exposed standalone for clients/widgets.
app.get('/v1/public/:name/embeds', (req, res) => {
  const name = req.params.name.toLowerCase();
  if (!registry.get(name)) return res.status(404).json({ error: 'not found' });
  res.json({ name, embeds: feeds.publicEmbeds(name) });
});

// Owner: full module catalog with on/off state.
app.get('/v1/profile/:name/modes', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  try {
    res.json({ modes: modes.ownerModes(c, req.params.name.toLowerCase()) });
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' ? 404 : 400)).json({ error: msg });
  }
});

// Owner: toggle one module on/off, or make it the primary (featured) module.
app.put('/v1/profile/:name/modes/:key', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  try {
    const updated = modes.setMode(c, req.params.name.toLowerCase(), req.params.key, {
      active: typeof req.body?.active === 'boolean' ? req.body.active : undefined,
      primary: req.body?.primary === true,
    });
    res.json({ modes: updated });
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' ? 404 : 400)).json({ error: msg });
  }
});

// Owner: edit a module's copy (title / status / body / CTA / detail cards).
app.put('/v1/profile/:name/modes/:key/content', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  try {
    res.json({ modes: modes.setContent(c, req.params.name.toLowerCase(), req.params.key, req.body) });
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' || msg === 'unknown module' ? 404 : 400)).json({ error: msg });
  }
});

// Owner: revert a module's copy to the catalog default.
app.delete('/v1/profile/:name/modes/:key/content', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  try {
    res.json({ modes: modes.resetContent(c, req.params.name.toLowerCase(), req.params.key) });
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' || msg === 'unknown module' ? 404 : 400)).json({ error: msg });
  }
});

// Owner: add an appearance item to a module (e.g. conference appearances).
app.post('/v1/profile/:name/modes/:key/items', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  try {
    res.json({ modes: modes.addItem(c, req.params.name.toLowerCase(), req.params.key, req.body) });
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' ? 404 : 400)).json({ error: msg });
  }
});

// Owner: edit an appearance item.
app.put('/v1/profile/:name/modes/:key/items/:id', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  try {
    res.json({ modes: modes.updateItem(c, req.params.name.toLowerCase(), req.params.key, req.params.id, req.body) });
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' || msg === 'appearance not found' ? 404 : 400)).json({ error: msg });
  }
});

// Owner: delete an appearance item.
app.delete('/v1/profile/:name/modes/:key/items/:id', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  try {
    res.json({ modes: modes.deleteItem(c, req.params.name.toLowerCase(), req.params.key, req.params.id) });
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' || msg === 'appearance not found' ? 404 : 400)).json({ error: msg });
  }
});

// Public visitor chat — no auth. Light per-IP / per-name rate limiting +
// 2000-char cap + session-token binding (deploy-blocking in the source PoC).
const MAX_MSG = 2000;
const ipHits = new Map<string, { n: number; t: number }>();
const nameHits = new Map<string, { n: number; t: number }>();
function rateLimited(map: Map<string, { n: number; t: number }>, key: string, limit: number): boolean {
  const now = Date.now();
  const w = map.get(key);
  if (!w || now - w.t > 60_000) { map.set(key, { n: 1, t: now }); return false; }
  w.n += 1;
  return w.n > limit;
}
// Evict stale windows so the limiter maps can't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const m of [ipHits, nameHits]) for (const [k, v] of m) if (v.t < cutoff) m.delete(k);
}, 120_000).unref?.();

app.post('/v1/public/message', (req, res) => {
  const { name, conversation_id, session_token, message } = req.body ?? {};
  if (!name || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'name and message required' });
  }
  if (message.length > MAX_MSG) {
    return res.status(400).json({ error: `message too long (max ${MAX_MSG} chars)` });
  }
  // Key on the socket IP only — never the client-supplied X-Forwarded-For
  // header (spoofable). Behind a real proxy you'd set `trust proxy` and use
  // req.ip; this PoC runs without one. Per-name is a high soft backstop so a
  // single noisy visitor can't lock everyone else out of a receptionist.
  const ip = req.ip || 'unknown';
  if (rateLimited(ipHits, ip, 20))                            return res.status(429).json({ error: 'Too many messages — slow down a moment.' });
  if (rateLimited(nameHits, String(name).toLowerCase(), 1000)) return res.status(429).json({ error: 'This receptionist is busy — try again shortly.' });
  try {
    const out = receptionist.startOrContinue({
      name: String(name).toLowerCase(),
      conversation_id: conversation_id ?? null,
      session_token: session_token ?? null,
      message: message.trim(),
    });
    res.json(out);
  } catch (e) {
    const code = (e as any).code === 403 ? 403 : ((e as Error).message === 'receptionist not found' ? 404 : 400);
    res.status(code).json({ error: (e as Error).message });
  }
});

// Owner — receptionist config (get / upsert), owner-checked.
app.get('/v1/receptionist/:name', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const name = req.params.name.toLowerCase();
  const owner = registry.ownerOf(name);
  if (!owner) return res.status(404).json({ error: 'not found' });
  if (owner.toLowerCase() !== c) return res.status(403).json({ error: 'not owner' });
  res.json(receptionist.getConfig(name));
});

app.put('/v1/receptionist/:name', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  try {
    const cfg = receptionist.upsertConfig(c, req.params.name.toLowerCase(), req.body ?? {});
    res.json(cfg);
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : (msg === 'namespace not found' ? 404 : 400)).json({ error: msg });
  }
});

// Owner — inbox list + item detail.
app.get('/v1/inbox', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  res.json({ items: receptionist.listInbox(c), unread: receptionist.unreadCount(c) });
});

app.get('/v1/inbox/:id', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  try {
    const detail = receptionist.getInboxItem(c, req.params.id);
    if (!detail) return res.status(404).json({ error: 'not found' });
    res.json(detail);
  } catch (e) {
    res.status((e as Error).message === 'not owner' ? 403 : 400).json({ error: (e as Error).message });
  }
});

// =====================================================
// Static DIAL App
// =====================================================
app.use(express.static(path.join(__dirname, '..', 'public')));

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Bind 0.0.0.0 so hosted platforms (Replit, Render, Fly, …) can route to it.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`DIAL PoC listening on http://localhost:${PORT}`);
  console.log(`Open the DIAL App at http://localhost:${PORT}/`);
});

// Optional: log all events to the console so the demo is visible.
bus.subscribe((evt) => console.log('[bus]', evt));
