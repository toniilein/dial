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
- Data (names, receptionist inbox, profile modes) lives in an ephemeral SQLite
  file and resets to the seed on each cold start. For persistent state, deploy
  to a **Reserved VM** instead of Autoscale.
- Sign in on the demo with username **`david`**, `alice`, or `acme` (any
  password). David's public profile is at **`/`** → search `david` → View page.
