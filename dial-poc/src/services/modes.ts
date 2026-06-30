import crypto from 'node:crypto';
import { db } from '../db.ts';
import * as registry from './registry.ts';

// ── Profile modules ──────────────────────────────────────────────────────
// A profile is composed of "modules" the owner can switch on/off. Each module
// is a self-contained block the public page renders (title, status, copy, a few
// detail cards, and a CTA that routes to the receptionist). Active modules are
// stacked on the public page in catalog order.

export type ModeItem = { id?: string; mon: string; day: string; title: string; sub: string; tag: string };
export type ModeSignal = { source: string; text: string; meta: string };
export type Mode = {
  key: string;
  label: string;
  title: string;
  status: string;
  closed: boolean;
  copy: string;
  cta: string;
  minis: [string, string][];
  items?: ModeItem[];     // e.g. conference appearances
  signals?: ModeSignal[]; // e.g. latest LinkedIn / X posts
  active?: boolean;
  primary?: boolean;      // the featured module — shown first on the public page
};

// Default catalog. Content is template copy the owner enables — editing the
// text is a future extension; for now activating a module is the unit of control.
const CATALOG: Mode[] = [
  {
    key: 'conference', label: 'Conferences', title: 'Upcoming appearances', status: 'Jul–Aug 2026', closed: false,
    copy: 'Where David will be over the coming weeks — open to focused meetings with Web3 infrastructure, telecom, and enterprise teams at each.',
    cta: 'Request a meeting',
    minis: [],
    items: [
      { mon: 'JUL', day: '01', title: 'IVS2026 · Crypto Zone', sub: 'Kyoto · Japanese enterprise & IoT ecosystem', tag: 'Attending' },
      { mon: 'JUL', day: '13', title: 'WebX 2026', sub: 'Tokyo · Asia Web3, device identity, telecom infra', tag: 'Meetings' },
      { mon: 'JUL', day: '21', title: 'Blockchain Futurist · ETHToronto', sub: 'Toronto · Institutional infrastructure & digital assets', tag: 'Attending' },
      { mon: 'AUG', day: '17', title: 'Wyoming Blockchain Symposium', sub: 'Jackson Hole · Institutional adoption & regulation', tag: 'Speaking' },
      { mon: 'AUG', day: '20', title: 'Coinfest Asia 2026', sub: 'Bali · Tokenization, stablecoins, enterprise adoption', tag: 'Attending' },
    ],
  },
  {
    key: 'partnership', label: 'Partnership', title: 'Open for Partnerships', status: 'Active', closed: false,
    copy: 'Open to partnership conversations across Web3, IoT, AI, connected devices, identity, and enterprise infrastructure.',
    cta: 'Propose a partnership',
    minis: [['Good fit', 'Enterprise Web3, telecom, identity, IoT'], ['Best ask', 'A concrete proposal with clear overlap'], ['Next step', 'A short intro call or a one-pager']],
  },
  {
    key: 'hiring', label: 'Hiring', title: 'Hiring: BD Lead, Web3', status: 'Role open', closed: false,
    copy: 'Hiring a business-development lead focused on Web3, enterprise partnerships, and ecosystem development.',
    cta: 'Apply or recommend',
    minis: [['Role', 'BD Lead · Web3'], ['Best fit', 'Enterprise BD with Web3 fluency'], ['Bring', 'A profile or a referral with context']],
  },
  {
    key: 'signals', label: 'Latest posts', title: 'Latest posts', status: 'Live', closed: false,
    copy: 'Latest posts from X and LinkedIn. Add post links under the name’s Links → Latest posts.',
    cta: '',
    minis: [],
    // Content comes from the owner's curated X / LinkedIn post embeds (see
    // services/feeds.ts), injected per-name on the public page. No static posts.
  },
  {
    key: 'closed', label: 'Closed', title: 'Closed for now', status: 'Urgent only', closed: true,
    copy: 'Not accepting general inbound right now. Urgent, referred, or high-relevance requests can still be submitted for review.',
    cta: 'Request access',
    minis: [['Allowed', 'Urgent, referred, existing relationships'], ['Filtered', 'Generic sales and vague networking'], ['Reception', 'Needs strong context or an access code']],
  },
];
const CATALOG_BY_KEY: Record<string, Mode> = Object.fromEntries(CATALOG.map(m => [m.key, m]));
const ORDER = CATALOG.map(m => m.key);

// `items` overrides the catalog's default appearance list per module key. A key
// present here (even as []) means the owner has taken control of that module's
// items; absent means "show the catalog defaults".
//
// `content` holds the owner's per-module text overrides (title, status, copy,
// cta and the detail cards / minis). A key present here means the owner has
// edited that module's copy; absent means "show the catalog defaults".
type ModeContent = Partial<Pick<Mode, 'title' | 'status' | 'copy' | 'cta' | 'minis'>>;
type Doc = {
  active: Record<string, boolean>;
  primary?: string | null;   // key of the featured module, if the owner picked one
  items?: Record<string, ModeItem[]>;
  content?: Record<string, ModeContent>;
};

function readDoc(name: string): Doc {
  const row = db.prepare(`SELECT doc FROM profile_modes WHERE name = ?`).get(name) as { doc: string } | undefined;
  if (!row) return { active: {}, primary: null };
  try {
    const d = JSON.parse(row.doc);
    return { active: d.active || {}, primary: d.primary ?? null, items: d.items || undefined, content: d.content || undefined };
  } catch { return { active: {}, primary: null }; }
}

// Pick a valid primary: the owner's choice when it's active, otherwise the
// first active module in catalog order. Any module can be primary.
function pickPrimary(doc: Doc): string | null {
  if (doc.primary && doc.active[doc.primary]) return doc.primary;
  return ORDER.find(k => doc.active[k]) ?? null;
}

function writeDoc(name: string, doc: Doc): void {
  db.prepare(`
    INSERT INTO profile_modes (name, doc, updated_at) VALUES (@name, @doc, @ts)
    ON CONFLICT(name) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at
  `).run({ name, doc: JSON.stringify(doc), ts: Date.now() });
}

function requireOwner(caller: string, name: string): void {
  const owner = registry.ownerOf(name);
  if (!owner) throw new Error('namespace not found');
  if (owner.toLowerCase() !== caller.toLowerCase()) throw new Error('not owner');
}

// Resolve the appearance items shown for a module: the owner's custom list when
// present, otherwise the catalog defaults (with ids backfilled for the UI).
function itemsFor(doc: Doc, key: string): ModeItem[] | undefined {
  const base = CATALOG_BY_KEY[key];
  if (!base?.items) return base?.items;
  const custom = doc.items?.[key];
  if (custom) return custom;
  return base.items.map((it, i) => ({ ...it, id: `seed_${i}` }));
}

// Merge the catalog with a name's on/off state + content overrides. The owner's
// edited title/status/copy/cta/minis win over the defaults; the primary module
// is flagged and sorted first, the rest follow in catalog order.
function merged(name: string): Mode[] {
  const doc = readDoc(name);
  const primary = pickPrimary(doc);
  const list = ORDER.map(key => ({
    ...CATALOG_BY_KEY[key],
    ...(doc.content?.[key] ?? {}),
    items: itemsFor(doc, key),
    active: !!doc.active[key],
    primary: primary === key,
  }));
  return list.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}

// Public: only the active modules, in catalog order.
export function publicModes(name: string): Mode[] {
  return merged(name).filter(m => m.active);
}

// Owner: every module with its active flag.
export function ownerModes(caller: string, name: string): Mode[] {
  requireOwner(caller, name);
  return merged(name);
}

// Toggle a single module on/off, and optionally make it the primary (featured)
// module. A module made primary is turned on at the same time.
export function setMode(caller: string, name: string, key: string, patch: { active?: boolean; primary?: boolean }): Mode[] {
  requireOwner(caller, name);
  if (!CATALOG_BY_KEY[key]) throw new Error('unknown module');
  const doc = readDoc(name);
  if (typeof patch.active === 'boolean') doc.active[key] = patch.active;
  if (patch.primary) { doc.active[key] = true; doc.primary = key; }
  doc.primary = pickPrimary(doc);
  writeDoc(name, doc);
  return merged(name);
}

// Replace active modules wholesale (used by the seed).
export function setActiveSet(caller: string, name: string, activeKeys: string[], primary: string | null = null): Mode[] {
  requireOwner(caller, name);
  const active: Record<string, boolean> = {};
  for (const k of activeKeys) if (CATALOG_BY_KEY[k]) active[k] = true;
  const doc: Doc = { active, primary };
  doc.primary = pickPrimary(doc);
  writeDoc(name, doc);
  return merged(name);
}

// ── Module content — edit the copy of any module ─────────────────────────
// Every module's text (title, status, body copy, CTA label, and detail cards)
// can be overridden by the owner. Overrides fork into the name's doc; absent
// fields fall back to the catalog default.

const FIELD_MAX = { title: 120, status: 40, copy: 600, cta: 60 } as const;
const str = (v: any, max: number) => String(v ?? '').trim().slice(0, max);

// Validate + clamp an incoming content patch. Only known fields are kept, so
// the override can never inject arbitrary keys onto a module.
function cleanContent(input: any): ModeContent {
  const out: ModeContent = {};
  if (input?.title !== undefined) {
    const title = str(input.title, FIELD_MAX.title);
    if (!title) throw new Error('title required');
    out.title = title;
  }
  if (input?.status !== undefined) out.status = str(input.status, FIELD_MAX.status);
  if (input?.copy !== undefined) out.copy = str(input.copy, FIELD_MAX.copy);
  if (input?.cta !== undefined) out.cta = str(input.cta, FIELD_MAX.cta);
  if (input?.minis !== undefined) {
    if (!Array.isArray(input.minis)) throw new Error('minis must be a list');
    out.minis = input.minis
      .slice(0, 6)
      .map((pair: any): [string, string] => [str(pair?.[0], 40), str(pair?.[1], 160)])
      .filter((p: [string, string]) => p[0] || p[1]);
  }
  return out;
}

// Save a module's content overrides (full replace of the editable fields).
export function setContent(caller: string, name: string, key: string, input: any): Mode[] {
  requireOwner(caller, name);
  if (!CATALOG_BY_KEY[key]) throw new Error('unknown module');
  const doc = readDoc(name);
  if (!doc.content) doc.content = {};
  doc.content[key] = cleanContent(input);
  writeDoc(name, doc);
  return merged(name);
}

// Drop a module's content overrides — revert it to the catalog defaults.
export function resetContent(caller: string, name: string, key: string): Mode[] {
  requireOwner(caller, name);
  if (!CATALOG_BY_KEY[key]) throw new Error('unknown module');
  const doc = readDoc(name);
  if (doc.content) { delete doc.content[key]; writeDoc(name, doc); }
  return merged(name);
}

// ── Appearance items (e.g. conference module) — add / edit / delete ──────
// Items live in the catalog by default; the first edit forks the list into the
// name's doc so the owner fully owns it from then on.

// Only modules that ship an `items` array support item editing.
function requireItemMode(key: string): void {
  const base = CATALOG_BY_KEY[key];
  if (!base) throw new Error('unknown module');
  if (!base.items) throw new Error('module has no appearances');
}

function cleanItem(input: any): Omit<ModeItem, 'id'> {
  const str = (v: any, max: number) => String(v ?? '').trim().slice(0, max);
  const mon = str(input?.mon, 4).toUpperCase();
  const day = str(input?.day, 3);
  const title = str(input?.title, 120);
  const sub = str(input?.sub, 200);
  const tag = str(input?.tag, 40);
  if (!title) throw new Error('title required');
  if (!mon) throw new Error('month required');
  if (!day) throw new Error('day required');
  return { mon, day, title, sub, tag: tag || 'Attending' };
}

// The owner's working copy of a mode's items — seeded from the catalog on the
// first edit so existing appearances stay editable.
function ownItems(doc: Doc, key: string): ModeItem[] {
  if (!doc.items) doc.items = {};
  if (!doc.items[key]) doc.items[key] = itemsFor(doc, key) ?? [];
  return doc.items[key];
}

export function addItem(caller: string, name: string, key: string, input: any): Mode[] {
  requireOwner(caller, name);
  requireItemMode(key);
  const doc = readDoc(name);
  const list = ownItems(doc, key);
  list.push({ id: 'it_' + crypto.randomBytes(6).toString('hex'), ...cleanItem(input) });
  writeDoc(name, doc);
  return merged(name);
}

export function updateItem(caller: string, name: string, key: string, id: string, input: any): Mode[] {
  requireOwner(caller, name);
  requireItemMode(key);
  const doc = readDoc(name);
  const list = ownItems(doc, key);
  const item = list.find(it => it.id === id);
  if (!item) throw new Error('appearance not found');
  Object.assign(item, cleanItem(input));
  writeDoc(name, doc);
  return merged(name);
}

export function deleteItem(caller: string, name: string, key: string, id: string): Mode[] {
  requireOwner(caller, name);
  requireItemMode(key);
  const doc = readDoc(name);
  const list = ownItems(doc, key);
  const next = list.filter(it => it.id !== id);
  if (next.length === list.length) throw new Error('appearance not found');
  doc.items![key] = next;
  writeDoc(name, doc);
  return merged(name);
}
