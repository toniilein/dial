import crypto from 'node:crypto';

// ── Google / Apple OAuth (env-gated) ─────────────────────────────────────
// Real "Sign in with Google / Apple". Inert until the matching env vars are
// set, so the app runs without credentials. Auth-code flow; the user's
// {sub, email, name} is returned to the caller, which upserts a real account.
//
// Google:  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Apple:   APPLE_CLIENT_ID (Services ID), APPLE_TEAM_ID, APPLE_KEY_ID,
//          APPLE_PRIVATE_KEY (.p8 PEM contents, newlines or \n-escaped)

const SECRET = process.env.SESSION_SECRET || 'dev-session-secret-change-me';

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(s: string): any {
  return JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
}

// Signed, stateless OAuth `state` (CSRF + return path), good for 10 minutes.
export function signState(data: Record<string, unknown>): string {
  const body = b64url(JSON.stringify({ ...data, exp: Date.now() + 10 * 60 * 1000 }));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update('oauth-state:' + body).digest());
  return `${body}.${sig}`;
}
export function verifyState(state: string | undefined): Record<string, any> | null {
  if (!state || state.indexOf('.') < 0) return null;
  const [body, sig] = state.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update('oauth-state:' + body).digest());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { const p = b64urlJson(body); return p.exp && Date.now() <= p.exp ? p : null; } catch { return null; }
}

export type OAuthProfile = { sub: string; email: string | null; name: string; emailVerified: boolean };

// ── Google ──
export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
export function googleAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}
export async function googleExchange(redirectUri: string, code: string): Promise<OAuthProfile> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code, grant_type: 'authorization_code', redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error('google token exchange failed: ' + res.status);
  const tok = await res.json() as { id_token?: string };
  if (!tok.id_token) throw new Error('google: no id_token');
  // Token came straight from Google's TLS token endpoint, so we trust the
  // claims; we still check audience and expiry.
  const claims = b64urlJson(tok.id_token.split('.')[1]);
  if (!/^(https:\/\/)?accounts\.google\.com$/.test(String(claims.iss))) throw new Error('google: issuer mismatch');
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('google: audience mismatch');
  if (claims.exp && Date.now() / 1000 > claims.exp) throw new Error('google: id_token expired');
  return { sub: String(claims.sub), email: claims.email ?? null, name: claims.name || claims.given_name || '',
    emailVerified: claims.email_verified === true || claims.email_verified === 'true' };
}

// ── Apple ──
export function appleConfigured(): boolean {
  return !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}
// Robustly resolve the Apple .p8 key from the env var, which survives many
// mangled forms: real-PEM, \n-escaped PEM, PEM whose newlines got turned into
// spaces, or a base64-encoded .p8 (recommended — a single safe line).
function applePrivateKey(): crypto.KeyObject {
  let k = (process.env.APPLE_PRIVATE_KEY || '').trim();
  // Base64-encoded .p8 (no PEM header) → decode.
  if (!/-----BEGIN/.test(k)) {
    try {
      const decoded = Buffer.from(k.replace(/\s+/g, ''), 'base64').toString('utf8');
      if (/-----BEGIN/.test(decoded)) k = decoded;
    } catch { /* fall through */ }
  }
  k = k.replace(/\\n/g, '\n').replace(/\r/g, '');
  // Repair PEM whose body newlines were collapsed to spaces.
  const m = k.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (m) {
    const body = m[2].replace(/\s+/g, '').replace(/(.{64})/g, '$1\n').trim();
    k = `-----BEGIN ${m[1]}-----\n${body}\n-----END ${m[1]}-----\n`;
  }
  return crypto.createPrivateKey(k);
}

function appleClientSecret(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: process.env.APPLE_KEY_ID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 3600,
    aud: 'https://appleid.apple.com', sub: process.env.APPLE_CLIENT_ID,
  }));
  const signingInput = `${header}.${payload}`;
  const sig = crypto.createSign('SHA256').update(signingInput).end().sign({ key: applePrivateKey(), dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64url(sig)}`;
}
export function appleAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
  });
  return 'https://appleid.apple.com/auth/authorize?' + p.toString();
}
export async function appleExchange(redirectUri: string, code: string): Promise<OAuthProfile> {
  const res = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID!,
      client_secret: appleClientSecret(),
      code, grant_type: 'authorization_code', redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error('apple token exchange failed: ' + res.status);
  const tok = await res.json() as { id_token?: string };
  if (!tok.id_token) throw new Error('apple: no id_token');
  const claims = b64urlJson(tok.id_token.split('.')[1]);
  if (claims.iss !== 'https://appleid.apple.com') throw new Error('apple: issuer mismatch');
  if (claims.aud !== process.env.APPLE_CLIENT_ID) throw new Error('apple: audience mismatch');
  if (claims.exp && Date.now() / 1000 > claims.exp) throw new Error('apple: id_token expired');
  // Apple verifies user emails; `email_verified` may be a string.
  return { sub: String(claims.sub), email: claims.email ?? null, name: '',
    emailVerified: claims.email_verified === true || claims.email_verified === 'true' };
}
