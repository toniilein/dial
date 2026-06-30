# DIAL PoC

Proof-of-concept for the Phase 0 DIAL platform described in
`../dial-requirements-architecture.html`. One Node service (Express +
SQLite) that serves both the JSON API and the DIAL App on the same port.

## Scope

**Namespace core (§4.1–§4.7):**

- **§4.1 Domain Issuance** — corporate domains (`.acme`): availability,
  register, renew, release, length-tiered pricing.
- **§4.2 Namespace Directory** — names under DIAL's `.dial` and under any
  registered corporate domain. Owner-only issuance under corporate domains.
  Subnames are UI-only in this PoC.
- **§4.3 Namespace Lookup** — public resolver: chain addresses (CAIP-2/10),
  text records, attestation reference, reverse resolution behind an
  authenticated-caller gate.
- **§4.4 Clients** — real sign-in: manual email/password (scrypt) · Google
  OAuth · Apple OAuth · one-click demo personas. Bearer session tokens with
  per-IP throttling on credential endpoints.
- **§4.5 Admin** — separate username/password admin panel that lists
  accounts and manually flips the verified flag where IDH is unavailable.
- **§4.6 Identity Verification** — Vodafone Pairpoint IDH mocked (always
  passes, returns an attestation hash; DIAL stores hash only — no PII).
- **§4.7 Billing** — names flat 240 USDC/yr with a 25% verified-consumer
  discount on `.dial`; corporate domains length-tiered (≤3: 12,000 /
  4–6: 4,800 / 7+: 2,400 USDC/yr); mocked checkout.

**Personal identity hub (§4.8–§4.9):**

- **§4.8 Public Profile** — every name has a public page at `/<name>` that
  composes profile + chain addresses + social text records + receptionist
  greeting + active profile modes (Conferences · Partnership · Hiring ·
  Latest signals · Closed). Modes are toggled directly or via a scripted
  natural-language mode agent.
- **§4.9 Visitor Intake & Inbox** — a per-name receptionist takes messages
  from visitors on the public page. Scripted slot-filling collects name →
  contact → topic → next-step, summarises, and delivers to the owner's
  inbox. Session-token-bound conversations · per-IP and per-name rate
  limits · 2,000-char cap · idempotent finalisation.

**Architecture (§6.1):** Clients → DIAL Platform (Registry · Resolver ·
Registrar · Auth · Admin · Billing · Receptionist · Profile Modes · Chain
Sync) ↔ Vodafone IDH → mocked Canton + EVM `DialRegistry` mirrors, every
mirror write HMAC-signed with the DIAL signing-key stand-in. Canton party
ids follow the real `<name>::1220<sha256(DIAL key)>` shape; DIAL is the
namespace controller for every issued party.

## Out of scope for this PoC

Transfers · subnames (UI-only) · real chain integration · real Pairpoint
IDH · real Wallet SDK · real LLM for the receptionist (scripted instead)
· real email forwarding · full OAuth `id_token` JWKS signature checking
(see deferred-hardening list in `REPLIT.md`).

## Run it locally

```bash
npm install
npm start
# open http://localhost:3000
```

Environment knobs:

- `PORT` — listen on a different port (default 3000).
- `DIAL_DB` — relocate the SQLite file.
- `DIAL_SIGNING_SECRET` — change the HMAC key Chain Sync uses for mock
  "on-chain" signatures (also drives the Canton namespace fingerprint).
- `ENABLE_DEMO_LOGIN=false` — disable the David / Acme / Alice one-click
  demo accounts.
- OAuth + admin + session secrets — see `REPLIT.md`.

## Run it on a server

It's a single Node web service that serves both the JSON API and the
static UI on one port, stores state in SQLite, and **re-seeds demo data
(`david.dial`, the `.acme` corporate domain, etc.) on every boot**. The
SQLite files are git-ignored and ephemeral, so a fresh deploy always
starts from the seed — no database to provision. The server reads `PORT`
from the environment and binds all interfaces, so it drops straight into
any host.

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

Run it under a process manager so it survives reboots — `pm2 start npm
--name dial -- start` (from `dial-poc/`) or a small systemd unit.

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

`PORT` is provided by the platform automatically — don't hard-code it.
On Render/Railway/Fly you can alternatively select the **Dockerfile** and
skip the build/start fields entirely.

> Demo note: state resets on every restart/redeploy (SQLite is ephemeral
> and re-seeded). For persistence, attach a disk and point `DIAL_DB` at
> it. Replit specifics live in `REPLIT.md`.

## What the DIAL App does

1. **Search a name** — `alice.dial` (consumer mode) or `.acme` (enterprise
   domain mode) → live validity / reserved / availability check with a
   USDC quote (sub-300ms target).
2. **Register** — Cart → sign in → verify identity (mocked IDH) → pay
   (mocked USDC) → ownership row written, Canton party auto-bound.
3. **Manage records** — bind Canton + EVM addresses, edit text records
   (social: `x`, `telegram`, `linkedin`, `url`, `avatar`).
4. **Resolve** — public lookup returns chain-keyed addresses + DIAL-signed
   attestation reference.
5. **Public address page** — `/<name>` (anonymous) renders the composed
   profile + addresses + social links + receptionist + active modes.
6. **Receptionist** — visitors chat on the public page; the scripted
   intake collects name + contact + topic + next-step, summarises, and
   delivers to the owner's inbox.
7. **Inbox** — owner reads summarised conversations (subject, body,
   structured fields, full transcript) with read/unread state.
8. **Profile modes** — owner toggles Conferences / Partnership / Hiring /
   Latest signals / Closed, or talks to a scripted mode agent ("turn on
   hiring", "close the profile", "make partnership primary").
9. **Admin** — separate password-gated panel lists accounts and sets the
   `verified` flag manually.
10. **On-chain mirrors** — every Registry / Resolver change is
    HMAC-signed and written to the mocked Canton + EVM tables.

Seeded demo accounts: **David Palmer** (consumer · designer · pre-built
profile + receptionist + 4 inbox conversations), **Acme Industries GmbH**
(enterprise · owns `.acme` with 4 issued names), **Alice Schäfer**
(consumer · empty).

## Receptionist (retail)

Ported in spirit from a colleague's **DIAL Receptionist** PoC
(`adihus/dial`), adapted to this stack and kept self-contained (no
external AI / email):

- The **receptionist** is a per-name intake agent. The owner configures
  it (name, bio, greeting, forwarding email) under the name's
  **Receptionist** tab.
- The **engine** is a deterministic slot-filling script — no OpenAI key —
  that preserves the source PoC's statuses, summary template,
  idempotent/self-healing `finalize`, session-token binding, and
  per-IP/per-name rate limits.
- The **address page** at `/<name>` shows the profile, chain addresses,
  Linktree-style social links (text records like `x`, `telegram`,
  `linkedin`, `url`, `avatar`), and the receptionist chat. Rendered
  hrefs are scheme-gated (https/tel/mailto only).
- **EVM address** binds via the **Chain records** tab, validated as
  `0x` + 40 hex on both client and server (proof-of-control mocked).

## API surface

| Method | Path | Spec |
|--------|------|------|
| **Auth** (§4.4) | | |
| GET    | `/v1/auth/providers` | which OAuth providers are configured |
| POST   | `/v1/auth/register` | manual email/password sign-up |
| POST   | `/v1/auth/login` | manual email/password sign-in |
| POST   | `/v1/auth/demo` | one-click demo persona sign-in |
| GET    | `/v1/auth/me` | current session |
| POST   | `/v1/auth/logout` | client drops token (stateless) |
| GET/POST | `/v1/auth/{google,apple}/{start,callback}` | OAuth flows |
| **Admin** (§4.5) | | |
| POST   | `/v1/admin/login` | admin username/password → admin token |
| GET    | `/v1/admin/users` | list accounts |
| POST   | `/v1/admin/users/:id/verify` | set verified flag |
| **Registrar — names** (§4.1, §4.2) | | |
| GET    | `/v1/registrar/available?name=…` | 1.1, 2.1 |
| POST   | `/v1/registrar/register` | 1.2, 2.2 |
| POST   | `/v1/registrar/renew` | 1.3, 2.3 |
| POST   | `/v1/registrar/release` | 1.6, 2.6 |
| **Registrar — corporate domains** (§4.1) | | |
| GET    | `/v1/registrar/domain/available?label=…` | 1.1 |
| POST   | `/v1/registrar/domain/register` | 1.2 |
| POST   | `/v1/registrar/domain/renew` | 1.3 |
| POST   | `/v1/registrar/domain/release` | 1.6 |
| GET    | `/v1/domains`, `/v1/domains/:label` | owner / detail |
| POST   | `/v1/domains/:label/addr/:chain` | 1.5 |
| **Registry** (§6.2) | | |
| GET    | `/v1/registry/:name`, `/v1/registry?owner=…` | ownership ledger |
| **Resolver** (§4.3) | | |
| GET    | `/v1/resolver/:name` | 3.1 |
| GET    | `/v1/resolver/:name/addr/:chain` | 3.2 |
| POST   | `/v1/resolver/:name/addr/:chain` | 1.5, 2.5 |
| POST   | `/v1/resolver/:name/text/:key` | 2.5 |
| GET    | `/v1/resolver/reverse?address=…` | 3.3 |
| **Identity Verification** (§4.6) | | |
| POST   | `/v1/idh/verify` | mocked Pairpoint IDH |
| **Billing** (§4.7) | | |
| GET    | `/v1/billing/quote?name=…&duration_years=…` | 7.2 |
| **Public profile** (§4.8) | | |
| GET    | `/v1/public/:name` | composed profile JSON (no auth) |
| GET    | `/v1/profile/:name/modes` | full mode catalog (owner) |
| PUT    | `/v1/profile/:name/modes/:key` | toggle / set primary |
| POST   | `/v1/profile/:name/modes/agent` | natural-language mode control |
| **Receptionist & inbox** (§4.9) | | |
| GET/PUT | `/v1/receptionist/:name` | owner: read / upsert config |
| POST   | `/v1/public/message` | visitor chat (no auth · rate-limited) |
| GET    | `/v1/inbox`, `/v1/inbox/:id` | owner inbox |
| **Canton + on-chain mirrors** (§4.5, §6.3) | | |
| GET    | `/v1/canton/namespace` | DIAL Canton namespace fingerprint |
| GET    | `/v1/chains/canton`, `/v1/chains/evm` | recent signed writes |
| GET    | `/v1/chains/:chain/:name` | latest signed state per name |

Authenticated routes take `Authorization: Bearer <token>` from sign-in.
Admin routes take `x-admin-token: <token>` from `/v1/admin/login`. The
visitor chat at `/v1/public/message` is unauthenticated — bound by a
server-issued `session_token` returned on the first turn.

## Curl walkthrough

```bash
# 1. Sign in as the Alice demo account → Bearer session token
TOKEN=$(curl -s -X POST localhost:3000/v1/auth/demo \
  -H 'content-type: application/json' \
  -d '{"persona":"alice"}' | jq -r .token)

# 2. Verify identity for Alice's owner address (mocked IDH)
HASH=$(curl -s -X POST localhost:3000/v1/idh/verify \
  -H 'content-type: application/json' \
  -d '{"subject":"0xbob789","kind":"consumer"}' | jq -r .hash)

# 3. Availability + USDC quote (sub-300ms target)
curl -s "localhost:3000/v1/registrar/available?name=demo.dial" | jq .

# 4. Register the name (Canton party is auto-bound)
curl -s -X POST localhost:3000/v1/registrar/register \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"demo.dial\",\"duration_years\":1,\"attestation_hash\":\"$HASH\"}" | jq .

# 5. Bind an EVM address (shape validated)
curl -s -X POST localhost:3000/v1/resolver/demo.dial/addr/eip155:1 \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"value":"0x9aB1C00D5A0F12345678901234567890DEAD0000"}' | jq .

# 6. Public lookup (no auth)
curl -s localhost:3000/v1/resolver/demo.dial | jq .

# 7. Composed public page (no auth) — what /<name> renders
curl -s localhost:3000/v1/public/demo.dial | jq .

# 8. Visitor sends a message to David's receptionist (no auth)
curl -s -X POST localhost:3000/v1/public/message \
  -H 'content-type: application/json' \
  -d '{"name":"david.dial","message":"Hi David, exploring a partnership."}' | jq .

# 9. See what Chain Sync HMAC-signed and wrote to the Canton mirror
curl -s localhost:3000/v1/chains/canton/demo.dial | jq .
```

## Layout

```
src/
  server.ts          # Express wiring + routes
  db.ts              # SQLite schema (Postgres-shaped)
  eventbus.ts        # in-process pub/sub
  services/
    auth.ts          # sign-in (manual/OAuth/demo) + admin + sessions
    oauth.ts         # Google + Apple OAuth handshakes
    registrar.ts     # validity + reserved + register/renew/release
    registry.ts      # ownership ledger
    resolver.ts      # address + text records, reverse lookup
    domains.ts       # corporate domains (.acme) + apex records
    billing.ts       # USDC pricing tiers + verified discount + mock checkout
    idh.ts           # mocked Vodafone Pairpoint IDH
    canton.ts        # DIAL Canton namespace + party-id construction
    chain-sync.ts    # bus consumer → HMAC-signed mirror writes
    receptionist.ts  # scripted intake + summarisation + inbox delivery
    modes.ts         # profile modes catalog + toggling + scripted mode agent
public/
  index.html         # SPA shell
  dial-app.jsx       # entry: routing, auth bootstrap, persona hydration
  dial-shell.jsx     # styles + top bar + primitives
  dial-state.jsx     # reducer + backend bindings
  dial-screens.jsx   # Home · Dashboard · NameDetail · DomainDetail · Cart · Inbox · Public · Admin
  dial-modals.jsx    # registration · KYC/KYB · checkout · sign-in · release
  dial-domain-modals.jsx  # corporate-domain registration + issue-name modals
  dial-icons.jsx     # icon set
  theme.jsx          # theme tokens
```
