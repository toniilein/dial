# Run DIAL on Replit

This package is ready to run and deploy on [Replit](https://replit.com). It's a
single Node service (Express + SQLite) — no database to provision, because the
demo data is **re-seeded on every boot**.

## Option A — Upload the zip (give this package to Replit)

1. Go to **replit.com → Create Repl → Import code → Upload folder / zip**
   (or drag the `dial-poc-replit.zip` onto a new **Node.js** Repl).
2. Make sure these are at the **root** of the Repl: `package.json`, `.replit`,
   `src/`, `public/`. (If they ended up inside a `dial-poc/` subfolder, move
   them up one level.)
3. Press **Run**. It installs dependencies and starts the server; the webview
   opens the DIAL app.

## Option B — Import from GitHub

1. **Create Repl → Import from GitHub →** `toniilein/dial`.
2. Set the Repl's root/working directory to **`dial-poc`** (the app lives in
   that subfolder).
3. Press **Run**.

## Publish it to a public URL

1. Click **Deploy** (top right) → choose **Autoscale** (cheapest; fine here
   since state is ephemeral and seeded).
2. Build command: `npm install` · Run command: `npm run start` (already set in
   `.replit`).
3. Deploy. Replit gives you a public `*.replit.app` URL.

## Notes

- The server listens on `0.0.0.0:$PORT` (Replit sets `PORT`).
- `better-sqlite3` is a native module; on Replit it downloads a prebuilt binary
  during `npm install` — no compilation needed.
- Data (names, receptionist inbox, profile modes, **user accounts**) lives in
  an ephemeral SQLite file and resets to the seed on each cold start. For
  persistent accounts, deploy to a **Reserved VM** instead of Autoscale.
- Sign in with a real **email/password** account, **Google**, **Apple**, or the
  one-click **demo accounts** (David / Acme / Alice). David's public profile is
  at **`/`** → search `david` → View page.

## Authentication — environment variables

Real sign-in works out of the box (email/password + demo accounts). Set these
as Replit **Secrets** to enable the rest:

| Secret | Needed for | Notes |
|--------|-----------|-------|
| `SESSION_SECRET` | all sign-in | A long random string. Sessions are signed with it; set it in production. |
| `OAUTH_BASE_URL` | Google/Apple | Your public URL, e.g. `https://your-app.replit.app`. Used to build the OAuth redirect URIs (Replit's internal host can differ). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google | Create an OAuth 2.0 Client (Web) in Google Cloud Console. Authorized redirect URI: `<OAUTH_BASE_URL>/v1/auth/google/callback`. |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Apple | From your Apple Developer account (a Services ID + a Sign-in-with-Apple key). Return URL: `<OAUTH_BASE_URL>/v1/auth/apple/callback`. `APPLE_PRIVATE_KEY` is the `.p8` contents. |

Until Google/Apple secrets are set, those buttons show **"setup needed"** and
are disabled; email/password and demo accounts still work.

**Applied hardening:** sessions fail-closed without `SESSION_SECRET` in
production; Bearer-only auth (no spoofable header); HMAC session tokens with
domain separation; constant-time login; per-IP login/register throttling;
random (non-predictable) account addresses; OAuth issuer + verified-email
checks; demo login auto-disabled in production.

**Deferred before a real production launch:** verify OAuth `id_token`
signatures against provider JWKS (currently issuer+audience+expiry only, over
the TLS code-exchange); add PKCE + cookie-bound OAuth state; move sessions to
`HttpOnly` cookies with server-side revocation; argon2id password hashing.
