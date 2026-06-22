// DIAL — state + backend bindings.
// Reducer is pure; async actions call the Phase 0 REST API and dispatch
// the resulting state updates. Corporate domains (FR §4.1) and names
// (FR §4.2) are tracked in parallel.

const CALLER_ADDRESSES = {
  personal: '0xalice123',
  acme:     '0xacme456',
  bob:      '0xbob789',
};

const PERSONAS = {
  personal: {
    name: 'David Palmer', kind: 'consumer', initials: 'DP',
    email: 'david.palmer@proton.me',
    phone: '+49 152 ••••• 9088',
    address: { line1: '12 Karlstrasse', city: '80333 Munich', country: 'Germany' },
    fallbackLevel: 'Consumer · Verified',
  },
  acme: {
    name: 'Acme Industries GmbH', kind: 'enterprise', initials: 'A',
    regId: 'HRB 218447', country: 'DE',
    email: 'treasury@acme.example',
    phone: '+49 89 ••••• 2100',
    address: { line1: 'Hofgartenstrasse 4', city: '80539 Munich', country: 'Germany' },
    fallbackLevel: 'Enterprise · Tier-2',
  },
  bob: {
    name: 'Alice Schäfer', kind: 'consumer', initials: 'AS',
    email: 'alice.schaefer@vodafone.example',
    phone: '+49 170 ••••• 4231',
    address: { line1: 'Friedrichshain 47', city: '10243 Berlin', country: 'Germany' },
    fallbackLevel: 'Consumer · Verified',
  },
};

const DIAL_INITIAL = {
  // Sign-in state replaces the previous top-bar persona toggle. When logged
  // out, the user can still search; signing in picks one of three accounts.
  loggedIn: false,
  org: 'personal',
  route: { screen: 'home' },
  query: '',
  modal: null,
  toast: null,

  identity: {
    personal: { verified: false, level: null, hash: null, fullHash: null, ...PERSONAS.personal },
    acme:     { verified: false, level: null, hash: null, fullHash: null, ...PERSONAS.acme },
    bob:      { verified: false, level: null, hash: null, fullHash: null, ...PERSONAS.bob },
  },

  // FR §4.2 — names under a TLD. Each entry: {name, registered, expires, …}
  names: { personal: [], acme: [], bob: [] },

  // FR §4.1 — corporate domains (the .acme TLD). Only enterprises register.
  // Each entry: {domain, registered, expires, base, names, attestation}
  domains: { personal: [], acme: [], bob: [] },

  // GoDaddy-style cart for .dial name registrations. Items live across
  // login/logout/persona switches so the user can fill the basket without
  // having to be signed in.
  cart: [], // [{ name, duration_years }]

  reserved: [],
};

// ─────────────────────────────────────────────────────────────
// Backend API helper
// ─────────────────────────────────────────────────────────────
async function dialApi(method, path, opts) {
  opts = opts || {};
  const headers = Object.assign({}, opts.headers || {});
  if (opts.caller) headers['x-owner-address'] = opts.caller;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) {
    const msg = (data && typeof data === 'object' && data.error) ? data.error : ('HTTP ' + r.status);
    const err = new Error(msg);
    err.response = data;
    throw err;
  }
  return data;
}

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────
// Verified-consumer discount on .dial name registrations.
const VERIFIED_DISCOUNT_PCT = 25;

function dialPrice(label, opts) {
  if (!label) return null;
  // Flat pricing for all .dial names — 240 USDC/year (180 USDC verified).
  const base = { tier: 'Annual registration', usdc: 240, perYear: true };
  if (opts && opts.verified) {
    const list = base.usdc;
    const usdc = Math.round(list * (100 - VERIFIED_DISCOUNT_PCT)) / 100;
    return { ...base, usdc, listUsdc: list, discountPct: VERIFIED_DISCOUNT_PCT, discountUsdc: list - usdc };
  }
  return { ...base, listUsdc: base.usdc, discountPct: 0, discountUsdc: 0 };
}

// Corporate-domain SKU — distinct (and higher) than name registration.
function dialDomainPrice(label) {
  if (!label) return null;
  const n = label.length;
  if (n <= 3) return { tier: 'Corporate Domain · Premium',  usdc: 12000, perYear: true };
  if (n <= 6) return { tier: 'Corporate Domain · Standard', usdc: 4800,  perYear: true };
  return       { tier: 'Corporate Domain · Standard',       usdc: 2400,  perYear: true };
}

function dialNormalise(input) {
  if (!input) return { label: '', valid: false, reason: 'empty' };
  let s = input.trim().toLowerCase();
  if (s.endsWith('.dial')) s = s.slice(0, -5);
  if (s.startsWith('.')) s = s.slice(1);
  if (!/^[a-z0-9-]+$/.test(s)) return { label: s, valid: false, reason: 'Only a-z, 0-9, and dash are allowed.' };
  if (s.startsWith('-') || s.endsWith('-')) return { label: s, valid: false, reason: 'Cannot start or end with a dash.' };
  if (s.length < 3) return { label: s, valid: false, reason: 'Names must be at least 3 characters.' };
  if (s.length > 32) return { label: s, valid: false, reason: 'Names must be at most 32 characters.' };
  return { label: s, valid: true };
}

async function dialCheck(label) {
  const r = await dialApi('GET', '/v1/registrar/available?name=' + encodeURIComponent(label + '.dial'));
  if (r.available) return { available: true, quote: r.quote };
  const reason = r.reason === 'reserved' ? 'reserved' : 'taken';
  return { available: false, reason };
}

async function dialDomainCheck(label) {
  const r = await dialApi('GET', '/v1/registrar/domain/available?label=' + encodeURIComponent(label));
  if (r.available) return { available: true, quote: r.quote };
  const reason = (r.reason === 'reserved' || r.reason === 'reserved-tld') ? 'reserved' : 'taken';
  return { available: false, reason };
}

function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toISOString().slice(0, 10);
}

function shortHash(h) {
  if (!h) return '';
  if (h.length <= 12) return h;
  return h.slice(0, 6) + '…' + h.slice(-4);
}

// Canton namespace — fetched once on startup so the UI can show the right
// `<dial-name>::1220<fingerprint>` shape for canton:omnibus values.
window.CANTON_NS = { namespace: '', fingerprint: '', example: '' };
async function loadCantonNamespace() {
  try {
    const r = await dialApi('GET', '/v1/canton/namespace');
    window.CANTON_NS = r;
  } catch {}
}
loadCantonNamespace();

// Build a canonical DIAL Canton party id for a name. Returns '' if we
// haven't loaded the namespace yet — the UI handles that as "no suggestion".
function dialCantonParty(name) {
  const ns = window.CANTON_NS && window.CANTON_NS.namespace;
  if (!ns || !name) return '';
  return `${String(name).toLowerCase()}::${ns}`;
}

// ─────────────────────────────────────────────────────────────
// Pure reducer
// ─────────────────────────────────────────────────────────────
function dialReducer(state, action) {
  switch (action.type) {
    case 'route':   return { ...state, route: action.route };
    case 'org':     return { ...state, org: action.org, route: { screen: 'dashboard' }, query: '' };
    case 'query':   return { ...state, query: action.query };
    case 'modal':   return { ...state, modal: action.modal };
    case 'toast':   return { ...state, toast: action.toast };

    case 'login':
      // Reset identity/names/domains so the new login starts unverified and
      // empty. loadOrg() will then hydrate from the backend.
      // `keepRoute` / `keepModal` let callers (e.g. checkout) stay in place.
      return { ...state,
        loggedIn: true,
        org: action.org,
        route: action.keepRoute ? state.route : { screen: 'dashboard' },
        modal: action.keepModal ? state.modal : null,
        identity: DIAL_INITIAL.identity,
        names: DIAL_INITIAL.names,
        domains: DIAL_INITIAL.domains,
        toast: { kind: 'ok', text: 'Signed in as ' + PERSONAS[action.org].name + '.' } };
    case 'logout':
      return { ...state,
        loggedIn: false,
        org: 'personal',
        route: { screen: 'home' },
        modal: null,
        query: '',
        identity: DIAL_INITIAL.identity,
        names: DIAL_INITIAL.names,
        domains: DIAL_INITIAL.domains };

    case 'set-identity':
      return { ...state, identity: { ...state.identity,
        [action.org]: { ...state.identity[action.org], ...action.patch } } };

    case 'set-names':
      return { ...state, names: { ...state.names, [action.org]: action.names } };

    case 'set-domains':
      return { ...state, domains: { ...state.domains, [action.org]: action.domains } };

    case 'cart-add': {
      // No duplicates by name.
      if (state.cart.some(c => c.name === action.item.name)) {
        return { ...state, toast: { kind: 'info', text: action.item.name + ' is already in your cart.' } };
      }
      return { ...state, cart: [...state.cart, action.item],
        toast: { kind: 'ok', text: action.item.name + ' added to cart.' } };
    }
    case 'cart-remove':
      return { ...state, cart: state.cart.filter((_, i) => i !== action.index) };
    case 'cart-set-duration':
      return { ...state, cart: state.cart.map((c, i) => i === action.index ? { ...c, duration_years: action.years } : c) };
    case 'cart-clear':
      return { ...state, cart: [] };

    case 'add-subname-local': {
      const list = state.names[state.org].map(n => {
        if (n.name !== action.parent) return n;
        const exists = (n.subnames || []).some(s => s.name === action.name);
        if (exists) return n;
        return { ...n, subnames: [...(n.subnames || []), {
          name: action.name, owner: action.owner, records: action.records, created: action.created,
        }]};
      });
      return { ...state, names: { ...state.names, [state.org]: list },
        modal: null,
        toast: { kind: 'ok', text: action.name + ' created (local demo).' } };
    }
    case 'delete-subname': {
      const list = state.names[state.org].map(n =>
        n.name !== action.parent ? n :
        { ...n, subnames: (n.subnames || []).filter(s => s.name !== action.name) }
      );
      return { ...state, names: { ...state.names, [state.org]: list },
        toast: { kind: 'ok', text: 'Subname released.' } };
    }
    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────
// Async actions
// ─────────────────────────────────────────────────────────────

// Single fetch that hydrates both names and corporate domains for an org.
async function loadOrg(state, dispatch, org) {
  const caller = CALLER_ADDRESSES[org];
  const [allNames, allDomains] = await Promise.all([
    dialApi('GET', '/v1/registry?owner=' + encodeURIComponent(caller)),
    dialApi('GET', '/v1/domains?owner=' + encodeURIComponent(caller)),
  ]);

  const corporateLabels = new Set(allDomains.map(d => d.label));

  // Hydrate each domain with apex records + its issued names.
  const hydratedDomains = await Promise.all(allDomains.map(async (d) => {
    let base = {};
    try {
      const detail = await dialApi('GET', '/v1/domains/' + encodeURIComponent(d.label));
      base = detail.addresses || {};
    } catch {}
    const issuedRaw = allNames.filter(n => n.name.endsWith('.' + d.label));
    const issued = await Promise.all(issuedRaw.map(async (n) => {
      let addresses = {};
      let attestation = n.attestation_hash;
      try {
        const r = await dialApi('GET', '/v1/resolver/' + encodeURIComponent(n.name));
        addresses = r.addresses || {};
        attestation = r.attestation_hash;
      } catch {}
      return {
        // Match the regular-name shape so ScreenNameDetail can render this
        // entry too — the Edit action navigates there.
        name: n.name,
        owner: 'unassigned',
        records: addresses,
        created: fmtDate(n.registered_at),
        registered: fmtDate(n.registered_at),
        expires: fmtDate(n.expires_at),
        expires_at: n.expires_at,
        attestation,
        text: {},
        subnames: [],
        parentDomain: '.' + d.label,
      };
    }));
    return {
      domain: '.' + d.label,
      registered: fmtDate(d.registered_at),
      expires: fmtDate(d.expires_at),
      expires_at: d.expires_at,
      verified: !!d.attestation_hash,
      base,
      attestation: d.attestation_hash,
      names: issued,
    };
  }));

  // Regular names — those whose TLD isn't an owned corporate domain.
  const regularNames = allNames.filter(n => {
    const tld = n.name.split('.').slice(-1)[0];
    return !corporateLabels.has(tld);
  });
  const existing = state.names[org] || [];
  const hydratedNames = await Promise.all(regularNames.map(async (n) => {
    let r = { addresses: {}, attestation_hash: n.attestation_hash };
    try { r = await dialApi('GET', '/v1/resolver/' + encodeURIComponent(n.name)); } catch {}
    const prev = existing.find(p => p.name === n.name);
    return {
      name: n.name,
      registered: fmtDate(n.registered_at),
      expires:    fmtDate(n.expires_at),
      expires_at: n.expires_at,
      records:    r.addresses || {},
      text:       r.texts || (prev && prev.text) || {},
      attestation: r.attestation_hash,
      subnames:   (prev && prev.subnames) || [],
    };
  }));

  dispatch({ type: 'set-names',   org, names: hydratedNames });
  dispatch({ type: 'set-domains', org, domains: hydratedDomains });

  // Infer identity from any attestation we found.
  const firstVerifiedDomain = hydratedDomains.find(d => d.attestation);
  const firstVerifiedName   = hydratedNames.find(n => n.attestation);
  const att = (firstVerifiedDomain && firstVerifiedDomain.attestation) || (firstVerifiedName && firstVerifiedName.attestation);
  if (att) {
    dispatch({ type: 'set-identity', org, patch: {
      verified: true,
      level: PERSONAS[org].fallbackLevel,
      hash: shortHash(att),
      fullHash: att,
    }});
  }
}

// Kept as the public name so the rest of the code keeps working.
const fetchOrgNames = loadOrg;

async function verifyIdentity(state, dispatch, org) {
  const subject = CALLER_ADDRESSES[org];
  const kind = PERSONAS[org].kind;
  const r = await dialApi('POST', '/v1/idh/verify', { caller: subject, body: { subject, kind } });
  dispatch({ type: 'set-identity', org, patch: {
    verified: true,
    level: PERSONAS[org].fallbackLevel,
    hash: shortHash(r.hash),
    fullHash: r.hash,
  }});
  return r.hash;
}

// Register a name. The backend auto-binds the DIAL Canton party id and
// returns it so the Done step can show it as the registration receipt.
// `opts.skipVerify=true` → demo-mode self-attested registration.
async function registerName(state, dispatch, label, durationYears, opts) {
  opts = opts || {};
  const org = state.org;
  const caller = CALLER_ADDRESSES[org];
  let attHash = '';
  if (!opts.skipVerify) {
    attHash = state.identity[org].fullHash;
    if (!attHash) attHash = await verifyIdentity(state, dispatch, org);
  }
  const r = await dialApi('POST', '/v1/registrar/register', {
    caller,
    body: { name: label + '.dial', duration_years: durationYears, attestation_hash: attHash },
  });
  await loadOrg(state, dispatch, org);
  return r.canton_party || dialCantonParty(label + '.dial');
}

async function updateRecords(state, dispatch, name, records) {
  const caller = CALLER_ADDRESSES[state.org];
  const existing = (state.names[state.org].find(n => n.name === name) || {}).records || {};
  for (const [chain, value] of Object.entries(records || {})) {
    if (existing[chain] === value) continue;
    if (!value) continue;
    await dialApi('POST',
      '/v1/resolver/' + encodeURIComponent(name) + '/addr/' + encodeURIComponent(chain),
      { caller, body: { value } });
  }
  await loadOrg(state, dispatch, state.org);
}

async function renewName(state, dispatch, name, years) {
  years = years || 1;
  const caller = CALLER_ADDRESSES[state.org];
  await dialApi('POST', '/v1/registrar/renew', { caller, body: { name, duration_years: years } });
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'toast', toast: { kind: 'ok', text: name + ' renewed.' } });
}

async function releaseName(state, dispatch, name) {
  const caller = CALLER_ADDRESSES[state.org];
  await dialApi('POST', '/v1/registrar/release', { caller, body: { name } });
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'modal', modal: null });
  dispatch({ type: 'route', route: { screen: 'dashboard' } });
  dispatch({ type: 'toast', toast: { kind: 'ok', text: name + ' released.' } });
}

// ──────────── Corporate domain actions ────────────

async function registerDomain(state, dispatch, label, durationYears, records) {
  const org = state.org;
  const caller = CALLER_ADDRESSES[org];
  let attHash = state.identity[org].fullHash;
  if (!attHash) attHash = await verifyIdentity(state, dispatch, org);

  await dialApi('POST', '/v1/registrar/domain/register', {
    caller,
    body: { label, duration_years: durationYears, attestation_hash: attHash },
  });
  for (const [chain, value] of Object.entries(records || {})) {
    if (!value) continue;
    await dialApi('POST',
      '/v1/domains/' + encodeURIComponent(label) + '/addr/' + encodeURIComponent(chain),
      { caller, body: { value } });
  }
  await loadOrg(state, dispatch, org);
  dispatch({ type: 'route', route: { screen: 'domain', domain: '.' + label } });
}

async function issueNameUnderDomain(state, dispatch, parentDomain, label, owner) {
  // parentDomain comes in as e.g. ".acme"
  const tld = parentDomain.replace(/^\./, '');
  const org = state.org;
  const caller = CALLER_ADDRESSES[org];
  const attHash = state.identity[org].fullHash || '';
  const fullName = label + '.' + tld;

  const r = await dialApi('POST', '/v1/registrar/register', {
    caller,
    body: { name: fullName, duration_years: 1, attestation_hash: attHash },
  });
  await loadOrg(state, dispatch, org);
  dispatch({ type: 'modal', modal: null });
  dispatch({ type: 'toast', toast: { kind: 'ok', text: fullName + ' issued · party ' + (r.canton_party || '').slice(0, 24) + '…' } });
  return r.canton_party || dialCantonParty(fullName);
}

async function releaseDomainName(state, dispatch, parentDomain, fullName) {
  const caller = CALLER_ADDRESSES[state.org];
  await dialApi('POST', '/v1/registrar/release', { caller, body: { name: fullName } });
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'toast', toast: { kind: 'ok', text: fullName + ' released.' } });
}

async function updateDomainRecords(state, dispatch, parentDomain, records) {
  const tld = parentDomain.replace(/^\./, '');
  const caller = CALLER_ADDRESSES[state.org];
  for (const [chain, value] of Object.entries(records || {})) {
    if (!value) continue;
    await dialApi('POST',
      '/v1/domains/' + encodeURIComponent(tld) + '/addr/' + encodeURIComponent(chain),
      { caller, body: { value } });
  }
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'toast', toast: { kind: 'ok', text: 'Apex records updated.' } });
}

async function renewDomain(state, dispatch, domainStr, years) {
  years = years || 1;
  const caller = CALLER_ADDRESSES[state.org];
  const label = domainStr.replace(/^\./, '');
  await dialApi('POST', '/v1/registrar/domain/renew', { caller, body: { label, duration_years: years } });
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'toast', toast: { kind: 'ok', text: domainStr + ' renewed.' } });
}

// Fresh sign-up — releases any existing backend names/domains the persona
// owns from a previous session so the registration lands in a clean slate.
async function freshSignup(state, dispatch, org) {
  const caller = CALLER_ADDRESSES[org];
  try {
    const [names, domains] = await Promise.all([
      dialApi('GET', '/v1/registry?owner=' + encodeURIComponent(caller)),
      dialApi('GET', '/v1/domains?owner=' + encodeURIComponent(caller)),
    ]);
    await Promise.all([
      ...names.map(n   => dialApi('POST', '/v1/registrar/release',        { caller, body: { name:  n.name  } }).catch(() => {})),
      ...domains.map(d => dialApi('POST', '/v1/registrar/domain/release', { caller, body: { label: d.label } }).catch(() => {})),
    ]);
  } catch {}
  dispatch({ type: 'login', org, keepRoute: false, keepModal: false });
}

async function releaseDomain(state, dispatch, domainStr) {
  const caller = CALLER_ADDRESSES[state.org];
  const label = domainStr.replace(/^\./, '');
  await dialApi('POST', '/v1/registrar/domain/release', { caller, body: { label } });
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'modal', modal: null });
  dispatch({ type: 'route', route: { screen: 'dashboard' } });
  dispatch({ type: 'toast', toast: { kind: 'ok', text: domainStr + ' released.' } });
}

// ──────────── Receptionist + address page + EVM (retail) ────────────

// EVM address shape — 0x + 40 hex (proof-of-control mocked in the PoC).
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
function isEvmAddress(v) { return EVM_RE.test((v || '').trim()); }

// Public address page (no auth) — profile + chain addresses + receptionist.
async function loadPublic(name) {
  return dialApi('GET', '/v1/public/' + encodeURIComponent(name));
}

// Visitor chat turn (no auth).
async function sendVisitorMessage(name, conversationId, sessionToken, message) {
  return dialApi('POST', '/v1/public/message', {
    body: { name, conversation_id: conversationId || null, session_token: sessionToken || null, message },
  });
}

// Owner receptionist config.
async function loadReceptionist(org, name) {
  return dialApi('GET', '/v1/receptionist/' + encodeURIComponent(name), { caller: CALLER_ADDRESSES[org] });
}

async function saveReceptionist(state, dispatch, name, fields) {
  const caller = CALLER_ADDRESSES[state.org];
  const cfg = await dialApi('PUT', '/v1/receptionist/' + encodeURIComponent(name), { caller, body: fields });
  dispatch({ type: 'toast', toast: { kind: 'ok', text: 'Receptionist saved.' } });
  return cfg;
}

// ──────────── Modular profile modes ────────────
async function loadOwnerModes(org, name) {
  return dialApi('GET', '/v1/profile/' + encodeURIComponent(name) + '/modes', { caller: CALLER_ADDRESSES[org] });
}
async function setModeActive(org, name, key, active) {
  return dialApi('PUT', '/v1/profile/' + encodeURIComponent(name) + '/modes/' + encodeURIComponent(key),
    { caller: CALLER_ADDRESSES[org], body: { active } });
}
async function setModePrimary(org, name, key) {
  return dialApi('PUT', '/v1/profile/' + encodeURIComponent(name) + '/modes/' + encodeURIComponent(key),
    { caller: CALLER_ADDRESSES[org], body: { primary: true } });
}
async function sendModeAgent(org, name, message) {
  return dialApi('POST', '/v1/profile/' + encodeURIComponent(name) + '/modes/agent',
    { caller: CALLER_ADDRESSES[org], body: { message } });
}

// Owner inbox.
async function loadInbox(org) {
  return dialApi('GET', '/v1/inbox', { caller: CALLER_ADDRESSES[org] });
}
async function loadInboxItem(org, id) {
  return dialApi('GET', '/v1/inbox/' + encodeURIComponent(id), { caller: CALLER_ADDRESSES[org] });
}

// ──────────── Social links (Linktree-style, stored as text records) ────────────

// Known platforms shown on the public address page. Each value is stored as a
// resolver text record (key = the platform key). `href` turns the stored
// handle/number/URL into a link; `clean` lightly normalises on save.
const LINK_PLATFORMS = [
  { key: 'phone',     label: 'Phone',     mark: '☎',  color: '#16a34a', placeholder: '+49 170 1234567',
    href: v => 'tel:' + v.replace(/[^\d+]/g, ''), clean: v => v.trim() },
  { key: 'whatsapp',  label: 'WhatsApp',  mark: 'WA', color: '#25D366', placeholder: '+49 170 1234567',
    href: v => 'https://wa.me/' + v.replace(/[^\d]/g, ''), clean: v => v.trim() },
  { key: 'telegram',  label: 'Telegram',  mark: 'TG', color: '#229ED9', placeholder: '@handle',
    href: v => 'https://t.me/' + v.replace(/^@/, ''), clean: v => v.trim().replace(/^@/, '') },
  { key: 'x',         label: 'X',         mark: '𝕏', color: '#111111', placeholder: '@handle',
    href: v => 'https://x.com/' + v.replace(/^@/, ''), clean: v => v.trim().replace(/^@/, '') },
  { key: 'linkedin',  label: 'LinkedIn',  mark: 'in', color: '#0A66C2', placeholder: 'in/username or full URL',
    href: v => /^https?:\/\//i.test(v) ? v : 'https://linkedin.com/' + v.replace(/^\/+/, ''), clean: v => v.trim() },
  { key: 'instagram', label: 'Instagram', mark: 'IG', color: '#E4405F', placeholder: '@handle',
    href: v => 'https://instagram.com/' + v.replace(/^@/, ''), clean: v => v.trim().replace(/^@/, '') },
  { key: 'github',    label: 'GitHub',    mark: 'GH', color: '#181717', placeholder: 'username',
    href: v => 'https://github.com/' + v.replace(/^@/, ''), clean: v => v.trim().replace(/^@/, '') },
  { key: 'email',     label: 'Email',     mark: '✉',  color: '#6b7280', placeholder: 'you@example.com',
    href: v => 'mailto:' + v.trim(), clean: v => v.trim() },
  { key: 'url',       label: 'Website',   mark: '🌐', color: '#0ea5e9', placeholder: 'example.com',
    href: v => /^https?:\/\//i.test(v) ? v : 'https://' + v.replace(/^\/+/, ''), clean: v => v.trim() },
];
const LINK_KEYS = new Set(LINK_PLATFORMS.map(p => p.key));

// Only ever render hrefs with a safe scheme (no javascript:/data:). The link
// builders already produce https/tel/mailto; this is belt-and-braces on render.
function isSafeHref(href) {
  return /^(https?:|tel:|mailto:)/i.test(href || '');
}

// Build the set of link rows present in a name's text records.
function nameLinks(textRecords) {
  const t = textRecords || {};
  return LINK_PLATFORMS.filter(p => (t[p.key] || '').trim()).map(p => {
    const value = t[p.key];
    const href = p.href(value);
    return { ...p, value, href: isSafeHref(href) ? href : null };
  });
}

// Save the social links — one text record per platform; empty clears it.
async function saveLinks(state, dispatch, name, values) {
  const caller = CALLER_ADDRESSES[state.org];
  const existing = (state.names[state.org].find(n => n.name === name) || {}).text || {};
  for (const p of LINK_PLATFORMS) {
    const next = (values[p.key] || '').trim() ? p.clean(values[p.key]) : '';
    const prev = (existing[p.key] || '').trim();
    if (next === prev) continue;
    await dialApi('POST', '/v1/resolver/' + encodeURIComponent(name) + '/text/' + encodeURIComponent(p.key),
      { caller, body: { value: next } });
  }
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'toast', toast: { kind: 'ok', text: 'Links updated.' } });
}

// Bind an EVM address to a name.
async function addEvmAddress(state, dispatch, name, addr) {
  if (!isEvmAddress(addr)) throw new Error('Enter a valid EVM address (0x + 40 hex characters).');
  const caller = CALLER_ADDRESSES[state.org];
  await dialApi('POST', '/v1/resolver/' + encodeURIComponent(name) + '/addr/eip155:1',
    { caller, body: { value: addr.trim() } });
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'toast', toast: { kind: 'ok', text: 'EVM address added to ' + name + '.' } });
}

window.CALLER_ADDRESSES = CALLER_ADDRESSES;
window.PERSONAS         = PERSONAS;
window.DIAL_INITIAL     = DIAL_INITIAL;
window.dialApi          = dialApi;
window.dialPrice        = dialPrice;
window.VERIFIED_DISCOUNT_PCT = VERIFIED_DISCOUNT_PCT;
window.dialDomainPrice  = dialDomainPrice;
window.dialNormalise    = dialNormalise;
window.dialCheck        = dialCheck;
window.dialDomainCheck  = dialDomainCheck;
window.dialReducer      = dialReducer;
window.fetchOrgNames    = fetchOrgNames;
window.loadOrg          = loadOrg;
window.verifyIdentity   = verifyIdentity;
window.registerName     = registerName;
window.updateRecords    = updateRecords;
window.renewName        = renewName;
window.releaseName      = releaseName;
window.registerDomain   = registerDomain;
window.issueNameUnderDomain = issueNameUnderDomain;
window.releaseDomainName    = releaseDomainName;
window.updateDomainRecords  = updateDomainRecords;
window.renewDomain          = renewDomain;
window.releaseDomain        = releaseDomain;
window.freshSignup          = freshSignup;
window.fmtDate              = fmtDate;
window.shortHash            = shortHash;
window.dialCantonParty      = dialCantonParty;
window.isEvmAddress         = isEvmAddress;
window.LINK_PLATFORMS       = LINK_PLATFORMS;
window.LINK_KEYS            = LINK_KEYS;
window.isSafeHref           = isSafeHref;
window.nameLinks            = nameLinks;
window.saveLinks            = saveLinks;
window.loadPublic           = loadPublic;
window.sendVisitorMessage   = sendVisitorMessage;
window.loadReceptionist     = loadReceptionist;
window.saveReceptionist     = saveReceptionist;
window.loadOwnerModes       = loadOwnerModes;
window.setModeActive        = setModeActive;
window.setModePrimary       = setModePrimary;
window.sendModeAgent        = sendModeAgent;
window.loadInbox            = loadInbox;
window.loadInboxItem        = loadInboxItem;
window.addEvmAddress        = addEvmAddress;
