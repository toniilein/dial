# DIAL PoC — §1–6.1

Proof-of-concept for the Phase 0 DIAL platform described in
`dial-requirements-architecture.html` chapters 1–6.1.

**Scope (core registration + lookup):**

- §4.1 Domain Issuance — `register`, `renew`, `available` (with validity +
  reserved-name + grace-period checks)
- §4.2 Namespace Directory — flat names under Phase 0 TLDs (`.dial`, `.pair`,
  `.point`, `.vf`). Subnames are out of scope for this PoC.
- §4.3 Namespace Lookup — public resolver (addresses, text, attestation
  reference, reverse resolution behind a caller gate)
- §4.6 Identity Verification — mocked Vodafone Pairpoint IDH (always passes,
  returns an attestation hash; DIAL stores hash only — no PII)
- §4.7 Billing — USDC pricing tiers (3-char premium / 4–6 premium / 7+
  standard), mocked checkout
- §6.1 Architecture — Clients → DIAL Platform (Registry / Resolver / Registrar
  / Billing / Chain Sync) ↔ Vodafone IDH → On-chain Registries (mocked
  Canton + EVM tables, signed by a DIAL HMAC key stand-in)

**Out of scope** (matches the §3.10 architecture caveat): transfers,
sub-namespaces, real chain integration, real IDH, Wallet SDK, real auth.

## Run it locally

```bash
npm install
npm start
# open http://localhost:3000
```

Set `PORT` to use a different port; `DIAL_DB` to relocate the SQLite file;
`DIAL_SIGNING_SECRET` to change the HMAC key Chain Sync uses for mock
"on-chain" signatures.

## Run it on a server

It's a single Node web service — it serves both the JSON API and the static
UI on one port, stores state in SQLite, and **re-seeds demo data
(`david.dial`, the `.acme` corporate domain, etc.) on every boot**. The
SQLite files are git-ignored and ephemeral, so a fresh deploy always starts
from the seed — no database to provision. The server reads `PORT` from the
environment and binds all interfaces, so it drops straight into any host.

### Option A — any VPS (bare Node)

```bash
git clone https://github.com/toniilein/dial.git
cd dial/dial-poc
npm ci --omit=dev      # tsx + better-sqlite3 are runtime deps
PORT=3000 npm start
```

Then put a reverse proxy (Caddy/nginx) in front for TLS, e.g. Caddy:

```
your-domain.com {
    reverse_proxy localhost:3000
}
```

Run it under a process manager so it survives reboots — `pm2 start npm --name dial -- start`
(from `dial-poc/`) or a small systemd unit.

### Option B — Docker (VPS or any container PaaS)

```bash
cd dial/dial-poc
docker build -t dial-poc .
docker run -p 3000:3000 dial-poc
```

### Option C — managed PaaS from the GitHub repo (Render / Railway / Fly)

The app lives in the `dial-poc/` subfolder, so point the platform at it:

| Setting        | Value                       |
|----------------|-----------------------------|
| Root directory | `dial-poc`                  |
| Build command  | `npm ci --omit=dev`         |
| Start command  | `npm start`                 |
| Health check   | `/` (HTTP 200)              |

`PORT` is provided by the platform automatically — don't hard-code it. On
Render/Railway/Fly you can alternatively select the **Dockerfile** and skip
the build/start fields entirely.

> Demo note: state resets on every restart/redeploy (SQLite is ephemeral and
> re-seeded). For persistence, attach a disk and point `DIAL_DB` at it.

## What the DIAL App does

1. **Find a name** — `david.dial` → checks validity / reserved-list /
   availability and returns a pricing quote (sub-300ms target per §NFR).
2. **Register** — Verify identity (mock IDH) → Pay (mock USDC) → Registry row
   written.
3. **Manage records** — Bind Canton + EVM addresses (owner-only via mock
   `X-Owner-Address` header).
4. **Resolve (public)** — Public lookup returning addresses + the DIAL-issued
   attestation hash (§3.4).
5. **On-chain mirrors** — Inspect what Chain Sync wrote to the mocked Canton
   and EVM `DialRegistry` mirrors after every Registry / Resolver change.

## API surface (Phase 0)

| Method | Path                                              | Spec     |
|--------|---------------------------------------------------|----------|
| GET    | `/v1/registrar/available?name=…`                  | 1.1, 2.1 |
| POST   | `/v1/registrar/register`                          | 1.2, 2.2 |
| POST   | `/v1/registrar/renew`                             | 1.3, 2.3 |
| GET    | `/v1/registry/:name`                              | 6.2      |
| GET    | `/v1/registry?owner=…`                            |          |
| GET    | `/v1/resolver/:name`                              | 3.1      |
| GET    | `/v1/resolver/:name/addr/:chain`                  | 3.2      |
| POST   | `/v1/resolver/:name/addr/:chain`                  | 1.5, 2.5 |
| POST   | `/v1/resolver/:name/text/:key`                    | 1.5, 2.5 |
| GET    | `/v1/resolver/reverse?address=…`                  | 3.3      |
| POST   | `/v1/idh/verify`                                  | 6.1, 6.2 |
| GET    | `/v1/billing/quote?name=…&duration_years=…`       | 7.2      |
| GET    | `/v1/chains/canton`, `/v1/chains/evm`             | 5.3, 5.5 |
| GET    | `/v1/chains/:chain/:name`                         | 5.3      |
| GET    | `/v1/public/:name`                                | retail   |
| POST   | `/v1/public/message`                              | retail   |
| GET/PUT| `/v1/receptionist/:name`                          | retail   |
| GET    | `/v1/inbox`, `/v1/inbox/:id`                      | retail   |

Mutating routes (`POST`/`PUT`) require an `X-Owner-Address` header — the PoC
stand-in for §4.3 API auth + the Pairpoint AA-signed user op a real client
would attach. The two `/v1/public/*` routes are unauthenticated (visitor-facing)
and instead rely on per-IP/per-name rate limiting + session-token binding.

## Receptionist, address page & EVM (retail)

Ported in spirit from a colleague's **DIAL Receptionist** PoC (`adihus/dial`),
adapted to this stack and kept self-contained (no external AI / email):

- **Receptionist** — a constrained intake agent attached to a consumer's name
  (David / Alice). The owner configures it (name, bio, greeting, forwarding
  email) under the name's **Receptionist** tab. Visitors chat with it on the
  public page; it collects name → contact → topic → next-step, then summarises
  and delivers to the owner's **Inbox**. The engine is a deterministic
  slot-filling script (no OpenAI key) with the source PoC's statuses, summary
  template, idempotent/self-healing finalize, session-token binding, and
  per-IP/per-name rate limits.
- **Your address page** — a public page at `/v1/public/:name` (in the app:
  the name's **View page** button) showing the profile, **Linktree-style
  social links** (phone, WhatsApp, Telegram, X, LinkedIn, Instagram, GitHub,
  website, email), the name's chain addresses (Canton + EVM, with copy), and
  the receptionist chat. Links are managed under the name's **Links** tab and
  stored as resolver text records; rendered hrefs are scheme-gated
  (https/tel/mailto only).
- **Add EVM address** — bind an `eip155:1` address to a name from the **Chain
  records** tab, validated as `0x` + 40 hex on both client and server
  (proof-of-control mocked). It then appears on the public address page.

## Layout

```
src/
  server.ts          # Express wiring + routes
  db.ts              # SQLite schema (Postgres-shaped)
  eventbus.ts        # in-process pub/sub
  services/
    registrar.ts     # validity + reserved-name + register/renew/available
    registry.ts      # ownership ledger
    resolver.ts      # address + text records, reverse lookup
    billing.ts       # USDC pricing tiers, mock checkout
    idh.ts           # mocked Vodafone Pairpoint IDH
    chain-sync.ts    # subscribes to bus, writes signed mirrors
public/
  index.html         # DIAL App (vanilla HTML/JS)
```

## Curl walkthrough

```bash
# 1. verify identity (mock)
ATT=$(curl -s -X POST localhost:3000/v1/idh/verify \
  -H 'content-type: application/json' \
  -d '{"subject":"0xabc123","kind":"consumer"}')
HASH=$(echo "$ATT" | jq -r .hash)

# 2. register
curl -s -X POST localhost:3000/v1/registrar/register \
  -H 'content-type: application/json' \
  -H 'x-owner-address: 0xabc123' \
  -d "{\"name\":\"myname.dial\",\"duration_years\":1,\"attestation_hash\":\"$HASH\"}"

# 3. bind an EVM address
curl -s -X POST localhost:3000/v1/resolver/myname.dial/addr/evm \
  -H 'content-type: application/json' \
  -H 'x-owner-address: 0xabc123' \
  -d '{"value":"0x9aB1C00D5A0F12345678901234567890DEAD"}'

# 4. public lookup
curl -s localhost:3000/v1/resolver/myname.dial

# 5. see what Chain Sync wrote
curl -s localhost:3000/v1/chains/canton/myname.dial
```
