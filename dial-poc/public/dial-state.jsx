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
// Real auth session token (issued at login). Sent as a Bearer header on every
// call; the backend resolves it to the caller's owner_address.
let sessionToken = null;
try { sessionToken = localStorage.getItem('dial_session'); } catch {}
function setSession(t) {
  sessionToken = t || null;
  try { if (t) localStorage.setItem('dial_session', t); else localStorage.removeItem('dial_session'); } catch {}
}

async function dialApi(method, path, opts) {
  opts = opts || {};
  const headers = Object.assign({}, opts.headers || {});
  if (sessionToken) headers['authorization'] = 'Bearer ' + sessionToken;
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
// Auth — real sign-in (manual / Google / Apple / demo accounts)
// ─────────────────────────────────────────────────────────────
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
// Demo personas keep their fixed org keys so demo behaviour is unchanged; real
// users use their owner_address as the org key.
const DEMO_ADDR_ORG = { '0xalice123': 'personal', '0xacme456': 'acme', '0xbob789': 'bob' };
function accountFromUser(user) {
  const addr = String(user.owner_address).toLowerCase();
  const org = DEMO_ADDR_ORG[addr] || addr;
  CALLER_ADDRESSES[org] = addr; // register so loadOrg's owner queries work
  return { org, address: addr, name: user.name, provider: user.provider, email: user.email,
    verified: !!user.verified, postalAddress: user.address || null, wallet: user.wallet || null };
}
function applyLogin(dispatch, user, opts) {
  dispatch({ type: 'login', account: accountFromUser(user),
    keepRoute: !!(opts && opts.keepRoute), keepModal: !!(opts && opts.keepModal) });
}
async function authProviders() {
  try { return await dialApi('GET', '/v1/auth/providers'); } catch { return { google: false, apple: false }; }
}
async function authRegister(dispatch, { email, password, name }, opts) {
  const r = await dialApi('POST', '/v1/auth/register', { body: { email, password, name } });
  setSession(r.token); applyLogin(dispatch, r.user, opts); return r.user;
}
async function authLogin(dispatch, { email, password }, opts) {
  const r = await dialApi('POST', '/v1/auth/login', { body: { email, password } });
  setSession(r.token); applyLogin(dispatch, r.user, opts); return r.user;
}
async function authDemo(dispatch, persona, opts) {
  const r = await dialApi('POST', '/v1/auth/demo', { body: { persona } });
  setSession(r.token); applyLogin(dispatch, r.user, opts); return r.user;
}
// Request a password-reset link. Returns { ok, message, resetUrl? } — resetUrl
// is only present in the PoC (no mailer); in production the link is emailed.
async function authForgot(email) {
  return dialApi('POST', '/v1/auth/forgot', { body: { email } });
}
// Complete a reset with the token from the link + a new password. The backend
// signs the user straight in, so this also establishes a session.
async function authReset(dispatch, token, password, opts) {
  const r = await dialApi('POST', '/v1/auth/reset', { body: { token, password } });
  setSession(r.token); applyLogin(dispatch, r.user, opts); return r.user;
}
// Start an OAuth flow by navigating the browser to the provider.
function authStartOAuth(provider) { window.location.assign('/v1/auth/' + provider + '/start'); }
// Admin panel — its own username/password login (independent of user sign-in),
// stored as a short-lived token in sessionStorage and sent as x-admin-token.
let adminToken = null;
try { adminToken = sessionStorage.getItem('dial_admin_token'); } catch {}
function hasAdminToken() { return !!adminToken; }
function setAdminToken(t) {
  adminToken = t || null;
  try { if (t) sessionStorage.setItem('dial_admin_token', t); else sessionStorage.removeItem('dial_admin_token'); } catch {}
}
async function adminLogin(username, password) {
  const r = await dialApi('POST', '/v1/admin/login', { body: { username, password } });
  setAdminToken(r.token);
  return true;
}
function adminLogout() { setAdminToken(null); }
async function loadAdminUsers() {
  return (await dialApi('GET', '/v1/admin/users', { headers: { 'x-admin-token': adminToken } })).users;
}
async function adminSetVerified(id, verified) {
  return (await dialApi('POST', '/v1/admin/users/' + encodeURIComponent(id) + '/verify',
    { headers: { 'x-admin-token': adminToken }, body: { verified } })).user;
}
// On app load: capture an OAuth redirect token from the URL fragment, or
// restore an existing session, then hydrate the account from /v1/auth/me.
async function authBootstrap(dispatch) {
  let err = null;
  const m = window.location.hash.match(/(?:^|#|&)auth=([^&]+)/);
  const e = window.location.hash.match(/(?:^|#|&)auth_error=([^&]+)/);
  const reset = window.location.hash.match(/(?:^|#|&)reset=([^&]+)/);
  // A reset link (#reset=<token>) opens the set-new-password modal. Handle it
  // before session restore so it works whether or not someone is already signed
  // in, and clear it from the URL so a refresh doesn't re-open the modal.
  if (reset) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    dispatch({ type: 'modal', modal: { kind: 'reset', token: decodeURIComponent(reset[1]) } });
  }
  if (m) { setSession(decodeURIComponent(m[1])); history.replaceState(null, '', window.location.pathname + window.location.search); }
  else if (e) { err = decodeURIComponent(e[1]); history.replaceState(null, '', window.location.pathname + window.location.search); }
  if (err) dispatch({ type: 'toast', toast: { kind: 'info', text: 'Sign-in failed: ' + err } });
  // Shareable public-page deep link: #/<name>. Kept in the URL so a refresh
  // reopens the same page. Session restore below uses keepRoute, preserving it.
  const share = window.location.hash.match(/^#\/([^?&#]+)$/);
  if (share) {
    dispatch({ type: 'route', route: { screen: 'public', name: decodeURIComponent(share[1]).toLowerCase(), from: 'home' } });
  }
  if (!sessionToken) return;
  try { const { user } = await dialApi('GET', '/v1/auth/me'); applyLogin(dispatch, user, { keepRoute: true }); }
  catch { setSession(null); } // stale/invalid token
}
// Re-pull the account so an admin's verification (or any change) shows up for an
// already-logged-in user without a full re-login.
async function refreshMe(dispatch) {
  if (!sessionToken) return;
  try {
    const { user } = await dialApi('GET', '/v1/auth/me');
    const org = DEMO_ADDR_ORG[String(user.owner_address).toLowerCase()] || String(user.owner_address).toLowerCase();
    const patch = { verified: !!user.verified, level: user.verified ? 'Verified' : null };
    if (user.address) patch.address = user.address;
    patch.wallet = user.wallet || null; // reflect a linked/unlinked wallet
    dispatch({ type: 'set-identity', org, patch });
  } catch {}
}

// Save the signed-in user's editable postal/billing address.
async function saveAccountAddress(dispatch, org, address) {
  const { user } = await dialApi('PATCH', '/v1/auth/me', { body: { address } });
  dispatch({ type: 'set-identity', org, patch: { address: user.address || null } });
  dispatch({ type: 'toast', toast: { kind: 'ok', text: 'Address updated.' } });
  return user;
}

// ─────────────────────────────────────────────────────────────
// Ethereum wallet link — Sign-In-With-Ethereum (EIP-4361), DIAL-native
// ─────────────────────────────────────────────────────────────
// Full connect flow: request account → fetch a server-built SIWE message →
// personal_sign → POST signature. The server verifies the signature and binds
// the proven wallet to a DIAL name the account owns (no ENS, no chain reads).
// No transaction, no gas — just a signature.
async function connectWallet(dispatch, org) {
  const eth = window.ethereum;
  if (!eth) throw new Error('No Ethereum wallet found. Install MetaMask, then try again.');

  const accounts = await eth.request({ method: 'eth_requestAccounts' });
  const address = accounts && accounts[0];
  if (!address) throw new Error('No account selected in your wallet.');

  const { message } = await dialApi('POST', '/v1/wallet/nonce', { body: { address } });
  const signature = await eth.request({ method: 'personal_sign', params: [message, address] });
  const { user } = await dialApi('POST', '/v1/wallet/link', { body: { message, signature } });

  dispatch({ type: 'set-identity', org, patch: { wallet: user.wallet || null } });
  dispatch({ type: 'toast', toast: { kind: 'ok',
    text: user.wallet && user.wallet.name ? ('Wallet linked to ' + user.wallet.name) : 'Wallet linked.' } });
  return user.wallet;
}

async function unlinkWallet(dispatch, org) {
  const { user } = await dialApi('POST', '/v1/wallet/unlink', { body: {} });
  dispatch({ type: 'set-identity', org, patch: { wallet: null } });
  dispatch({ type: 'toast', toast: { kind: 'info', text: 'Wallet unlinked.' } });
  return user;
}

// Consumer-controlled on-chain address update. The consumer SIGNS the change in
// their own wallet (EIP-712); DIAL relays it on-chain (gasless) but can't forge
// it. The decentralised path — only when the wallet is linked (= on-chain controller).
async function updateEvmAddressSigned(dispatch, name, value) {
  const eth = window.ethereum;
  if (!eth) throw new Error('Install/connect MetaMask to sign the on-chain update.');
  const accounts = await eth.request({ method: 'eth_requestAccounts' });
  const from = accounts && accounts[0];
  if (!from) throw new Error('No wallet account selected.');
  const base = '/v1/chains/onchain/' + encodeURIComponent(name);

  // Retry on a stale sequence: prepare reads the on-chain version (seq); if it
  // moves between prepare and relay (BadSeq), re-prepare with the fresh seq and
  // re-sign. Each attempt is one signature.
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    // 1. DIAL prepares the EIP-712 typed data (controller = the signing account).
    const prep = await dialApi('POST', base + '/prepare-addr', { body: { value, from } });
    // 2. eth_signTypedData_v4 needs the wallet on the typed-data chain (Sepolia).
    const targetHex = '0x' + Number(prep.typedData.domain.chainId).toString(16);
    if ((await eth.request({ method: 'eth_chainId' })) !== targetHex) {
      try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetHex }] }); }
      catch (e) {
        if (e && e.code === 4902) throw new Error('Add the Sepolia test network to your wallet, then try again.');
        throw new Error('Switch your wallet to Sepolia (chainId ' + prep.typedData.domain.chainId + ') and try again.');
      }
    }
    // 3. Consumer signs it in their own wallet.
    const signature = await eth.request({ method: 'eth_signTypedData_v4', params: [from, JSON.stringify(prep.typedData)] });
    // 4. DIAL relays it. Returns the minted name NFT + explorer base.
    try {
      const res = await dialApi('POST', base + '/relay-addr',
        { body: { nameHash: prep.nameHash, addressesHash: prep.addressesHash, seq: prep.seq, deadline: prep.deadline, signature, value } });
      dispatch({ type: 'toast', toast: { kind: 'ok', text: 'Address set on-chain — signed by you, relayed by DIAL.' } });
      return res;
    } catch (e) {
      lastErr = e;
      // Stale sequence (or a transient on-chain revert) — re-prepare + re-sign.
      if (attempt < 2 && /BadSeq|execution reverted|nonce|replacement/i.test(e.message || '')) continue;
      throw e;
    }
  }
  throw lastErr;
}

// Poll the wallet for a tx receipt — the next self-custody step depends on the
// previous one being MINED (claim before setAddresses before mint).
async function waitForReceipt(eth, hash, tries = 80) {
  for (let i = 0; i < tries; i++) {
    const r = await eth.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (r) { if (r.status && r.status !== '0x1') throw new Error('A transaction reverted on-chain.'); return r; }
    await new Promise(res => setTimeout(res, 3000));
  }
  throw new Error('Timed out waiting for the transaction to confirm.');
}

// Full self-custody: the consumer's OWN wallet sends every transaction and pays
// the gas. DIAL only signs an off-chain voucher; it never sends a tx. The wallet
// confirms each step (claim control → set address → mint the name NFT) in order.
// `onProgress({ label, step, total })` (optional) lets the UI show live progress
// instead of a bare spinner — these flows can take minutes on a testnet.
async function selfCustodyOnchain(dispatch, name, value, onProgress) {
  const progress = (label, step, total) => { try { onProgress && onProgress({ label, step, total }); } catch {} };
  const eth = window.ethereum;
  if (!eth) throw new Error('Install/connect MetaMask to take this on-chain.');
  progress('Connecting your wallet…', 0, 0);
  const accounts = await eth.request({ method: 'eth_requestAccounts' });
  const from = accounts && accounts[0];
  if (!from) throw new Error('No wallet account selected.');
  const base = '/v1/chains/onchain/' + encodeURIComponent(name);

  // DIAL builds the unsigned txs + signs the claim voucher (off-chain, gasless).
  progress('Preparing transactions…', 0, 0);
  const prep = await dialApi('POST', base + '/selfcustody-txs', { body: { from, value } });
  if (!prep.steps || !prep.steps.length) {
    const msg = prep.nftHeldByOther
      ? 'This name’s NFT is held by another wallet (' + prep.nftHeldByOther.slice(0, 8) + '…). Connect that wallet to manage it.'
      : 'Already yours on-chain — nothing to do.';
    dispatch({ type: 'toast', toast: { kind: prep.nftHeldByOther ? 'info' : 'ok', text: msg } });
    return prep;
  }

  // The contracts live on Sepolia — put the wallet on it before sending.
  const cfg = await dialApi('GET', '/v1/chains/config');
  const targetHex = '0x' + Number(cfg.chainId).toString(16);
  if ((await eth.request({ method: 'eth_chainId' })) !== targetHex) {
    progress('Switching your wallet to ' + (cfg.chainName || 'the right network') + '…', 0, 0);
    try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetHex }] }); }
    catch (e) {
      if (e && e.code === 4902) throw new Error('Add the Sepolia test network to your wallet, then try again.');
      throw new Error('Switch your wallet to Sepolia (chainId ' + cfg.chainId + ') and try again.');
    }
  }

  // Send each step FROM THE USER'S WALLET (they pay gas), waiting for each to mine.
  const total = prep.steps.length;
  for (let i = 0; i < total; i++) {
    const step = prep.steps[i];
    progress('Confirm “' + step.label + '” in your wallet…', i + 1, total);
    const txHash = await eth.request({ method: 'eth_sendTransaction', params: [{ from, to: step.to, data: step.data, value: '0x0' }] });
    progress('“' + step.label + '” confirming on-chain (≈15–30s)…', i + 1, total);
    await waitForReceipt(eth, txHash);
    await dialApi('POST', base + '/selfcustody-confirm', { body: { op: step.op, txHash, value: step.value } });
  }
  const did = prep.steps.map(s => s.op);
  const parts = [];
  if (did.includes('claim')) parts.push('control');
  if (did.includes('setAddresses')) parts.push('address');
  if (did.includes('mint')) parts.push('NFT');
  dispatch({ type: 'toast', toast: { kind: 'ok', text: 'Done — ' + parts.join(' + ') + ' now yours on-chain, paid from your wallet.' } });
  return prep;
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

// `opts.corporate` = validating a name issued under a corporate domain (.acme),
// whose owner controls the whole namespace. Those allow short 2-char department
// codes (hr, it) and the fuller 63-char label length; the public .dial search
// keeps the stricter 3–32 range.
function dialNormalise(input, opts) {
  const corporate = !!(opts && opts.corporate);
  const minLen = corporate ? 1 : 3;
  const maxLen = corporate ? 63 : 32;
  if (!input) return { label: '', valid: false, reason: 'empty' };
  let s = input.trim().toLowerCase();
  if (s.endsWith('.dial')) s = s.slice(0, -5);
  if (s.startsWith('.')) s = s.slice(1);
  if (!/^[a-z0-9-]+$/.test(s)) return { label: s, valid: false, reason: 'Only a-z, 0-9, and dash are allowed.' };
  if (s.startsWith('-') || s.endsWith('-')) return { label: s, valid: false, reason: 'Cannot start or end with a dash.' };
  if (s.length < minLen) return { label: s, valid: false, reason: corporate ? 'Enter a name.' : 'Names must be at least 3 characters.' };
  if (s.length > maxLen) return { label: s, valid: false, reason: 'Names must be at most ' + maxLen + ' characters.' };
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

    case 'login': {
      // `account` = { org, address, name, provider, email }. Demo personas use
      // their existing org keys; real users use their owner_address as the org.
      const acct = action.account;
      const org = acct.org;
      const baseIdentity = PERSONAS[org]
        ? { verified: false, level: null, hash: null, fullHash: null, ...PERSONAS[org] }
        : { verified: false, level: null, hash: null, fullHash: null, kind: 'consumer',
            name: acct.name, email: acct.email || '', initials: initialsOf(acct.name) };
      // Real verification comes from the account (admin-controlled).
      baseIdentity.verified = !!acct.verified;
      if (acct.verified && !baseIdentity.level) baseIdentity.level = 'Verified';
      // Server-stored postal address wins over the static persona default, so a
      // user's saved edits show on every sign-in (and real accounts get one).
      if (acct.postalAddress) baseIdentity.address = acct.postalAddress;
      baseIdentity.wallet = acct.wallet || null; // linked Ethereum wallet (SIWE)
      return { ...state,
        loggedIn: true,
        org,
        route: action.keepRoute ? state.route : { screen: 'dashboard' },
        modal: action.keepModal ? state.modal : null,
        identity: { ...DIAL_INITIAL.identity, [org]: baseIdentity },
        names: { ...DIAL_INITIAL.names, [org]: state.names[org] || [] },
        domains: { ...DIAL_INITIAL.domains, [org]: state.domains[org] || [] },
        toast: { kind: 'ok', text: 'Signed in as ' + acct.name + '.' } };
    }
    case 'logout':
      setSession(null); // drop the real auth token
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
      let pagePublic = true;
      try {
        const r = await dialApi('GET', '/v1/resolver/' + encodeURIComponent(n.name));
        addresses = r.addresses || {};
        attestation = r.attestation_hash;
        pagePublic = r.page_public !== false;
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
        page_public: pagePublic,
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
      page_public: r.page_public === undefined ? (prev ? prev.page_public : true) : r.page_public,
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
      level: (PERSONAS[org] && PERSONAS[org].fallbackLevel) || 'Verified',
      hash: shortHash(att),
      fullHash: att,
    }});
  }
}

// Kept as the public name so the rest of the code keeps working.
const fetchOrgNames = loadOrg;

// Identity verification is admin-only — users can no longer self-verify. The
// `verified` flag comes from the backend account (set by an admin) via /me.

// Register a name. A Canton party is NOT bound here anymore — the owner requests
// one later from the name's On-chain tab (see requestCantonParty).
async function registerName(state, dispatch, label, durationYears, opts) {
  const org = state.org;
  const caller = CALLER_ADDRESSES[org];
  const attHash = (state.identity[org] && state.identity[org].fullHash) || '';
  const r = await dialApi('POST', '/v1/registrar/register', {
    caller,
    body: { name: label + '.dial', duration_years: durationYears, attestation_hash: attHash },
  });
  await loadOrg(state, dispatch, org);
  return r;
}

// ── Non-custodial Canton key (held in the browser, never sent to DIAL) ──────
// One ECDSA P-256 keypair per account = one Canton namespace. The private key
// lives only in this browser's localStorage; DIAL only ever receives the public
// key + a signature. The user proves control by signing `DIAL-canton-bind:<name>`.
const CANTON_BIND_PREFIX = 'DIAL-canton-bind:';
function cantonKeyStorageKey(owner) { return 'dial_canton_key_' + String(owner || '').toLowerCase(); }
function hexOf(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }

async function getOrCreateCantonKey(owner) {
  const skey = cantonKeyStorageKey(owner);
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(skey) || 'null'); } catch {}
  if (stored && stored.priv && stored.pubSpkiHex) {
    const priv = await crypto.subtle.importKey('jwk', stored.priv, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    return { priv, pubSpkiHex: stored.pubSpkiHex, created: false };
  }
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pubSpkiHex = hexOf(await crypto.subtle.exportKey('spki', kp.publicKey));
  try { localStorage.setItem(skey, JSON.stringify({ priv: privJwk, pubSpkiHex, created_at: Date.now() })); } catch {}
  return { priv: kp.privateKey, pubSpkiHex, created: true };
}
function hasCantonKey(org) {
  try { return !!localStorage.getItem(cantonKeyStorageKey(CALLER_ADDRESSES[org])); } catch { return false; }
}
// Download the browser-held keypair so the user can back it up (it's the only copy).
function cantonKeyBackup(org) {
  try {
    const raw = localStorage.getItem(cantonKeyStorageKey(CALLER_ADDRESSES[org]));
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'dial-canton-key.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {}
}

// Request a NON-CUSTODIAL Canton party: generate/reuse the browser keypair, sign
// the binding statement, and send only the public key + signature to DIAL.
async function requestCantonParty(state, dispatch, name) {
  const owner = CALLER_ADDRESSES[state.org];
  const key = await getOrCreateCantonKey(owner);
  const data = new TextEncoder().encode(CANTON_BIND_PREFIX + name.toLowerCase());
  const signature = hexOf(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, data));
  const r = await dialApi('POST', '/v1/resolver/' + encodeURIComponent(name) + '/canton/request',
    { body: { public_key: key.pubSpkiHex, signature } });
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'toast', toast: { kind: 'ok', text: 'Canton address created — only you hold the key.' } });
  return r.party;
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
  const attHash = (state.identity[org] && state.identity[org].fullHash) || '';

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

async function issueNameUnderDomain(state, dispatch, parentDomain, label, owner, opts) {
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
  // The caller can keep the modal open to offer an on-chain association step
  // (Canton id / Ethereum wallet) right after the name is created.
  if (!(opts && opts.keepOpen)) dispatch({ type: 'modal', modal: null });
  dispatch({ type: 'toast', toast: { kind: 'ok', text: fullName + ' issued.' } });
  return r;
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

// ──────────── Profile modules ────────────
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
async function setModeContent(org, name, key, fields) {
  return dialApi('PUT', '/v1/profile/' + encodeURIComponent(name) + '/modes/' + encodeURIComponent(key) + '/content',
    { caller: CALLER_ADDRESSES[org], body: fields });
}
async function resetModeContent(org, name, key) {
  return dialApi('DELETE', '/v1/profile/' + encodeURIComponent(name) + '/modes/' + encodeURIComponent(key) + '/content',
    { caller: CALLER_ADDRESSES[org] });
}
// Appearance items (e.g. conference module): add / edit / delete.
async function addModeItem(org, name, key, item) {
  return dialApi('POST', '/v1/profile/' + encodeURIComponent(name) + '/modes/' + encodeURIComponent(key) + '/items',
    { caller: CALLER_ADDRESSES[org], body: item });
}
async function updateModeItem(org, name, key, id, item) {
  return dialApi('PUT', '/v1/profile/' + encodeURIComponent(name) + '/modes/' + encodeURIComponent(key) + '/items/' + encodeURIComponent(id),
    { caller: CALLER_ADDRESSES[org], body: item });
}
async function deleteModeItem(org, name, key, id) {
  return dialApi('DELETE', '/v1/profile/' + encodeURIComponent(name) + '/modes/' + encodeURIComponent(key) + '/items/' + encodeURIComponent(id),
    { caller: CALLER_ADDRESSES[org] });
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
// `x_posts` / `linkedin_posts` (multi-line lists of featured post URLs) are
// saved alongside, as free-form text records rather than single-handle platforms.
async function saveLinks(state, dispatch, name, values, toastText) {
  const caller = CALLER_ADDRESSES[state.org];
  const existing = (state.names[state.org].find(n => n.name === name) || {}).text || {};
  const put = (key, value) =>
    dialApi('POST', '/v1/resolver/' + encodeURIComponent(name) + '/text/' + encodeURIComponent(key),
      { caller, body: { value } });

  // Only touch keys present in `values`, so a partial save (e.g. just the
  // latest-posts editor) never clears records it didn't render.
  for (const p of LINK_PLATFORMS) {
    if (!(p.key in values)) continue;
    const next = (values[p.key] || '').trim() ? p.clean(values[p.key]) : '';
    const prev = (existing[p.key] || '').trim();
    if (next === prev) continue;
    await put(p.key, next);
  }
  for (const key of ['x_posts', 'linkedin_posts']) {
    if (!(key in values)) continue;
    const next = (values[key] || '').trim();
    if (next !== (existing[key] || '').trim()) await put(key, next);
  }
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'toast', toast: { kind: 'ok', text: toastText || 'Links updated.' } });
}

// True when a stored avatar value is something we can actually render in an
// <img> — a hosted path, a remote URL, or an inline raster data-URL. Mirrors
// the server's isValidAvatar() so client and API agree on what counts.
function isAvatarValue(v) {
  if (!v) return false;
  const s = String(v).trim();
  return /^\/[^\s]+$/.test(s) || /^https?:\/\/\S+$/i.test(s) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s);
}

// Read a user-picked image File, downscale it to <= `max` px on the long edge,
// and return a compact data-URL. Photos go out as JPEG (small); PNGs keep their
// alpha. Keeps the payload well under the API's 1 MB body limit without needing
// any file-storage backend in this PoC.
function fileToAvatarDataUrl(file, max = 512) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Please choose an image file (PNG, JPEG, GIF, or WebP).'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const keepPng = /png/i.test(file.type);
      let out = canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.85);
      // A large PNG can still be heavy — fall back to JPEG to stay small.
      if (out.length > 1_300_000) out = canvas.toDataURL('image/jpeg', 0.82);
      if (out.length > 1_300_000) return reject(new Error('That image is too large even after resizing — try a smaller one.'));
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

// Set or clear the profile picture (avatar text record). Empty value removes it,
// which falls the public page back to the default initials avatar.
async function saveAvatar(state, dispatch, name, value) {
  const caller = CALLER_ADDRESSES[state.org];
  await dialApi('POST', '/v1/resolver/' + encodeURIComponent(name) + '/text/avatar',
    { caller, body: { value: value || '' } });
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'toast', toast: { kind: 'ok', text: value ? 'Profile picture updated.' : 'Profile picture removed.' } });
}

// Make a name's public page public (shareable) or private (owner-only).
async function setPageVisibility(state, dispatch, name, isPublic) {
  const caller = CALLER_ADDRESSES[state.org];
  await dialApi('POST', '/v1/names/' + encodeURIComponent(name) + '/visibility',
    { caller, body: { public: !!isPublic } });
  await loadOrg(state, dispatch, state.org);
  dispatch({ type: 'toast', toast: { kind: 'ok', text: isPublic ? 'Your page is public.' : 'Your page is now private.' } });
}

// The shareable public-page URL for a name (deep-links straight to the page).
function publicPageUrl(name) {
  return window.location.origin + '/#/' + encodeURIComponent(name);
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
window.fmtDate              = fmtDate;
window.shortHash            = shortHash;
window.dialCantonParty      = dialCantonParty;
window.isEvmAddress         = isEvmAddress;
window.LINK_PLATFORMS       = LINK_PLATFORMS;
window.LINK_KEYS            = LINK_KEYS;
window.isSafeHref           = isSafeHref;
window.nameLinks            = nameLinks;
window.saveLinks            = saveLinks;
window.isAvatarValue        = isAvatarValue;
window.fileToAvatarDataUrl  = fileToAvatarDataUrl;
window.saveAvatar           = saveAvatar;
window.setPageVisibility    = setPageVisibility;
window.publicPageUrl        = publicPageUrl;
window.loadPublic           = loadPublic;
window.sendVisitorMessage   = sendVisitorMessage;
window.loadReceptionist     = loadReceptionist;
window.saveReceptionist     = saveReceptionist;
window.loadOwnerModes       = loadOwnerModes;
window.setModeActive        = setModeActive;
window.setModePrimary       = setModePrimary;
window.setModeContent       = setModeContent;
window.resetModeContent     = resetModeContent;
window.addModeItem          = addModeItem;
window.updateModeItem       = updateModeItem;
window.deleteModeItem       = deleteModeItem;
window.loadInbox            = loadInbox;
window.loadInboxItem        = loadInboxItem;
window.addEvmAddress        = addEvmAddress;
window.authProviders        = authProviders;
window.authRegister         = authRegister;
window.authLogin            = authLogin;
window.authDemo             = authDemo;
window.authForgot           = authForgot;
window.authReset            = authReset;
window.saveAccountAddress   = saveAccountAddress;
window.connectWallet        = connectWallet;
window.unlinkWallet         = unlinkWallet;
window.updateEvmAddressSigned = updateEvmAddressSigned;
window.selfCustodyOnchain   = selfCustodyOnchain;
window.authStartOAuth       = authStartOAuth;
window.authBootstrap        = authBootstrap;
window.refreshMe            = refreshMe;
window.initialsOf           = initialsOf;
window.loadAdminUsers       = loadAdminUsers;
window.adminSetVerified     = adminSetVerified;
window.adminLogin           = adminLogin;
window.adminLogout          = adminLogout;
window.hasAdminToken        = hasAdminToken;
