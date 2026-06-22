import { db } from '../db.ts';
import * as registry from './registry.ts';

// ── Modular profile modes ────────────────────────────────────────────────
// A profile is composed of "modes" the owner can switch on/off. Each mode is a
// self-contained block the public page renders (title, status, copy, a few
// detail cards, and a CTA that routes to the receptionist). The owner toggles
// them directly or by talking to the mode agent (see agent() below).

export type ModeItem = { mon: string; day: string; title: string; sub: string; tag: string };
export type ModeSignal = { source: string; text: string; meta: string };
export type Mode = {
  key: string;
  kind: 'mode' | 'module'; // 'mode' = switchable availability tab; 'module' = standalone stacked block
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
  primary?: boolean;
};

// Default catalog. Content is template copy the owner enables — editing the
// text is a future extension; for now activating a mode is the unit of control.
const CATALOG: Mode[] = [
  {
    key: 'conference', kind: 'module', label: 'Conferences', title: 'Upcoming appearances', status: 'Jul–Aug 2026', closed: false,
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
    key: 'partnership', kind: 'mode', label: 'Partnership', title: 'Open for Partnerships', status: 'Active', closed: false,
    copy: 'Open to partnership conversations across Web3, IoT, AI, connected devices, identity, and enterprise infrastructure.',
    cta: 'Propose a partnership',
    minis: [['Good fit', 'Enterprise Web3, telecom, identity, IoT'], ['Best ask', 'A concrete proposal with clear overlap'], ['Next step', 'A short intro call or a one-pager']],
  },
  {
    key: 'hiring', kind: 'mode', label: 'Hiring', title: 'Hiring: BD Lead, Web3', status: 'Role open', closed: false,
    copy: 'Hiring a business-development lead focused on Web3, enterprise partnerships, and ecosystem development.',
    cta: 'Apply or recommend',
    minis: [['Role', 'BD Lead · Web3'], ['Best fit', 'Enterprise BD with Web3 fluency'], ['Bring', 'A profile or a referral with context']],
  },
  {
    key: 'signals', kind: 'module', label: 'Latest signals', title: 'Latest public signals', status: 'Auto-updated', closed: false,
    copy: 'Recent public posts and updates — pulled in automatically once accounts are connected, or curated.',
    cta: '',
    minis: [],
    signals: [
      { source: 'LinkedIn · latest', text: 'Pairpoint just crossed a milestone on device-bound identity for enterprise IoT. Proud of the team — more to share at WebX in Tokyo.', meta: 'live module · professional updates' },
      { source: 'X · latest', text: 'Web3 × telecom is finally getting real. If you’re building device identity or tokenized infrastructure, let’s talk in Tokyo next month.', meta: 'live module · @davidpalmer' },
      { source: 'Featured update', text: 'Pairpoint partnership and conference highlights are pinned here instead of raw latest posts.', meta: 'curated · pinned' },
    ],
  },
  {
    key: 'closed', kind: 'mode', label: 'Closed', title: 'Closed for now', status: 'Urgent only', closed: true,
    copy: 'Not accepting general inbound right now. Urgent, referred, or high-relevance requests can still be submitted for review.',
    cta: 'Request access',
    minis: [['Allowed', 'Urgent, referred, existing relationships'], ['Filtered', 'Generic sales and vague networking'], ['Reception', 'Needs strong context or an access code']],
  },
];
const CATALOG_BY_KEY: Record<string, Mode> = Object.fromEntries(CATALOG.map(m => [m.key, m]));
const ORDER = CATALOG.map(m => m.key);

type Doc = { active: Record<string, boolean>; primary: string | null };

function readDoc(name: string): Doc {
  const row = db.prepare(`SELECT doc FROM profile_modes WHERE name = ?`).get(name) as { doc: string } | undefined;
  if (!row) return { active: {}, primary: null };
  try {
    const d = JSON.parse(row.doc);
    return { active: d.active || {}, primary: d.primary ?? null };
  } catch { return { active: {}, primary: null }; }
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

const isMode = (key: string) => CATALOG_BY_KEY[key]?.kind === 'mode';

// Pick a valid primary: only a 'mode' (not a 'module') can be primary, and it
// must be active. Falls back to the first active mode in catalog order.
function pickPrimary(doc: Doc): string | null {
  if (doc.primary && doc.active[doc.primary] && isMode(doc.primary)) return doc.primary;
  return ORDER.find(k => doc.active[k] && isMode(k)) ?? null;
}

// Merge the catalog with a name's on/off + primary state. Modes are ordered
// with the primary first; modules are never primary.
function merged(name: string): Mode[] {
  const doc = readDoc(name);
  const primary = pickPrimary(doc);
  const list = ORDER.map(key => ({
    ...CATALOG_BY_KEY[key],
    active: !!doc.active[key],
    primary: primary === key,
  }));
  return list.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}

// Public: only the active modes, primary first.
export function publicModes(name: string): Mode[] {
  return merged(name).filter(m => m.active);
}

// Owner: every mode with its active/primary flags.
export function ownerModes(caller: string, name: string): Mode[] {
  requireOwner(caller, name);
  return merged(name);
}

// Toggle a single mode (and optionally make it primary).
export function setMode(caller: string, name: string, key: string, patch: { active?: boolean; primary?: boolean }): Mode[] {
  requireOwner(caller, name);
  if (!CATALOG_BY_KEY[key]) throw new Error('unknown mode');
  const doc = readDoc(name);
  if (typeof patch.active === 'boolean') {
    doc.active[key] = patch.active;
  }
  if (patch.primary && isMode(key)) { doc.active[key] = true; doc.primary = key; }
  doc.primary = pickPrimary(doc);
  writeDoc(name, doc);
  return merged(name);
}

// Replace active modes wholesale (used by the seed).
export function setActiveSet(caller: string, name: string, activeKeys: string[], primary: string | null): Mode[] {
  requireOwner(caller, name);
  const active: Record<string, boolean> = {};
  for (const k of activeKeys) if (CATALOG_BY_KEY[k]) active[k] = true;
  const doc: Doc = { active, primary: primary && isMode(primary) ? primary : null };
  doc.primary = pickPrimary(doc);
  writeDoc(name, doc);
  return merged(name);
}

// ── Mode agent — scripted natural-language control ───────────────────────
// The owner types things like "turn on conference mode", "close the profile",
// "turn off hiring", "make partnership primary". We parse intent, apply it,
// and reply with the new state. No LLM — deterministic, like the receptionist.
const MODE_PATTERNS: [string, RegExp][] = [
  ['conference', /\b(conference|conferences|conf|event|events|appearance|appearances|speaking|circuit)\b/],
  ['partnership', /\b(partnership|partnerships|partner|partnering|collab)\b/],
  ['hiring', /\b(hiring|hire|recruit|recruiting|job|role|bd lead|candidate)\b/],
  ['signals', /\b(signals?|latest posts?|public signals|social feed|feed|my posts)\b/],
  ['closed', /\b(closed?|pause|paused|stop inbound|not accepting|away|offline)\b/],
];

export function agent(caller: string, name: string, message: string): { reply: string; modes: Mode[] } {
  requireOwner(caller, name);
  const t = (message || '').toLowerCase().trim();

  const mentioned = MODE_PATTERNS.filter(([, re]) => re.test(t)).map(([k]) => k);
  const wantsOff = /\b(off|disable|deactivate|turn off|switch off|remove|hide|drop|stop|end)\b/.test(t);
  const wantsPrimary = /\b(primary|main|feature|featured|headline|lead with|front)\b/.test(t);
  const closeAll = /\b(close (the )?profile|go offline|closed mode|pause everything|not accepting)\b/.test(t);

  const doc = readDoc(name);
  const actions: string[] = [];

  if (closeAll && !mentioned.includes('closed')) mentioned.push('closed');

  if (mentioned.length === 0) {
    return {
      reply: 'I can switch profile modes on or off. Try: "turn on conference mode", "open for partnerships", "start hiring", "show latest signals", "close the profile", "turn off hiring", or "make partnership primary". Modes: Conference, Partnership, Hiring, Latest signals, Closed.',
      modes: merged(name),
    };
  }

  for (const key of mentioned) {
    // Per-mode intent. A close-intent ("close the profile") always turns Closed
    // ON, even when the message also turns another mode off. Only a 'mode'
    // (not a 'module' like signals) can be made primary.
    const turnOn = (key === 'closed' && closeAll) ? true : !wantsOff;
    if (wantsPrimary && turnOn && isMode(key)) {
      doc.active[key] = true; doc.primary = key;
      actions.push(`made ${CATALOG_BY_KEY[key].label} the primary mode`);
    } else if (!turnOn) {
      doc.active[key] = false;
      actions.push(`turned off ${CATALOG_BY_KEY[key].label}`);
    } else {
      doc.active[key] = true;
      actions.push(`turned on ${CATALOG_BY_KEY[key].label}`);
    }
  }

  doc.primary = pickPrimary(doc);
  writeDoc(name, doc);

  const all = merged(name);
  const activeList = all.filter(m => m.active);
  const summary = activeList.length
    ? activeList.map(m => m.primary ? `${m.label} (primary)` : m.label).join(', ')
    : 'none — your profile shows nothing';
  return {
    reply: `Done — ${actions.join('; ')}. Active: ${summary}. Published to ${name}.`,
    modes: all,
  };
}
