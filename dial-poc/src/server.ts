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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

chainSync.start();

// Seed demo data on first run so the design's dashboard isn't empty.
function seedIfEmpty() {
  if (registry.listAll().length > 0 || domainsSvc.listAll().length > 0) return;

  // Alice — consumer with a .dial name. EVM binding out of scope (PoC).
  {
    const att = idh.verify('0xalice123', 'consumer');
    registrar.register({ name: 'alice.dial', owner_address: '0xalice123', duration_years: 1, attestation_hash: att.hash });
    resolver.setAddr('0xalice123', 'alice.dial', 'canton:omnibus', canton.partyFor('alice.dial'));
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
  console.log('[seed] inserted alice.dial + .acme corporate domain (4 names) with Canton ns=' + canton.fingerprint().slice(0, 12) + '…');
}
seedIfEmpty();

const app = express();
app.use(express.json());

// Tiny request logger so the demo flow is visible in the terminal.
app.use((req, _res, next) => {
  if (req.path.startsWith('/v1/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ---------- §4.4 API authentication (stub) ----------
// §4.3 prescribes a single auth method for all API consumers. For the PoC,
// we trust an X-Owner-Address header to identify the caller. In production
// this would be OAuth2 client-credentials or API keys, and ownership ops
// would also carry a Pairpoint AA-signed user op.
function caller(req: Request): string | null {
  const h = req.header('x-owner-address');
  return h ? h.toLowerCase() : null;
}

function requireCaller(req: Request, res: Response): string | null {
  const c = caller(req);
  if (!c) {
    res.status(401).json({ error: 'X-Owner-Address header required (mock auth)' });
    return null;
  }
  return c;
}

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
    // Auto-bind the DIAL Canton party id so the user sees one as part of
    // the registration receipt — they no longer have to set it manually.
    const cantonParty = canton.partyFor(issued.parsed.name);
    resolver.setAddr(c, issued.parsed.name, 'canton:omnibus', cantonParty);
    res.json({
      namespace: issued.namespace,
      canton_party: cantonParty,
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
    example: canton.partyFor('alice.dial'),
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
    res.status(msg === 'not owner' ? 403 : 400).json({ error: msg });
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

// 3.3 — reverse resolution (privacy gate stub: require caller header).
// Declared FIRST so `/v1/resolver/reverse` isn't matched by `/v1/resolver/:name`.
app.get('/v1/resolver/reverse', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const address = String(req.query.address ?? '');
  if (!address) return res.status(400).json({ error: 'address required' });
  const name = resolver.reverse(address);
  if (!name) return res.status(404).json({ error: 'no name for address' });
  res.json({ name });
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
    attestation_hash: ns.attestation_hash, // §3.4 DIAL-signed attestation reference
  });
});

// 1.5 / 2.5 / 2.8 — edit records
app.post('/v1/resolver/:name/addr/:chain', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const value = req.body?.value;
  if (typeof value !== 'string' || !value.length) {
    return res.status(400).json({ error: 'value required' });
  }
  try {
    const rec = resolver.setAddr(c, req.params.name.toLowerCase(), req.params.chain.toLowerCase(), value);
    res.json(rec);
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : 400).json({ error: msg });
  }
});

app.post('/v1/resolver/:name/text/:key', (req, res) => {
  const c = requireCaller(req, res);
  if (!c) return;
  const value = req.body?.value;
  if (typeof value !== 'string') return res.status(400).json({ error: 'value required' });
  try {
    const rec = resolver.setText(c, req.params.name.toLowerCase(), req.params.key, value);
    res.json(rec);
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg === 'not owner' ? 403 : 400).json({ error: msg });
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
// On-chain mirrors (mocked Canton + EVM)
// =====================================================
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
// Static DIAL App
// =====================================================
app.use(express.static(path.join(__dirname, '..', 'public')));

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`DIAL PoC listening on http://localhost:${PORT}`);
  console.log(`Open the DIAL App at http://localhost:${PORT}/`);
});

// Optional: log all events to the console so the demo is visible.
bus.subscribe((evt) => console.log('[bus]', evt));
