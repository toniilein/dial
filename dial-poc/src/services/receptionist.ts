import crypto from 'node:crypto';
import { db } from '../db.ts';
import * as registry from './registry.ts';
import * as resolver from './resolver.ts';

// Receptionist (retail) — ported in spirit from adihus/dial's "DIAL
// Receptionist MVP". A constrained intake agent attached to a name. Visitors
// chat on the public page; it collects name / contact / topic / next-step,
// then summarises and drops the summary in the owner's inbox (mocked email).
//
// The source PoC drives this with sequential OpenAI (gpt-5) calls. We keep the
// PoC self-contained and deterministic with a scripted slot-filling engine —
// no API key, no latency/cost/abuse surface from paid LLM calls — while
// preserving the same data model, statuses, summary template, session-token
// binding and idempotent "finalize" the source documents as load-bearing.

export type Receptionist = {
  name: string;
  owner_address: string;
  owner_name: string;
  receptionist_name: string;
  headline: string;
  bio: string;
  greeting: string;
  forwarding_email: string;
  active: number;
  created_at: number;
  updated_at: number;
};

type Conversation = {
  id: string;
  name: string;
  session_token: string;
  visitor_name: string | null;
  visitor_contact: string | null;
  visitor_org: string | null;
  topic: string | null;
  urgency: string | null;
  next_step: string | null;
  status: string;
  summary: string | null;
  asking: string | null;
  delivered_at: number | null;
  created_at: number;
  updated_at: number;
};

type Message = { id: number; conversation_id: string; role: string; content: string; created_at: number };

// ──────────── Config CRUD ────────────

export function getConfig(name: string): Receptionist | null {
  return (db.prepare(`SELECT * FROM receptionists WHERE name = ?`).get(name) as Receptionist | undefined) ?? null;
}

export function listByOwner(owner: string): Receptionist[] {
  return db.prepare(`SELECT * FROM receptionists WHERE owner_address = ?`).all(owner.toLowerCase()) as Receptionist[];
}

export function upsertConfig(caller: string, name: string, fields: Partial<Receptionist>): Receptionist {
  const owner = registry.ownerOf(name);
  if (!owner) throw new Error('namespace not found');
  if (owner.toLowerCase() !== caller.toLowerCase()) throw new Error('not owner');
  const now = Date.now();
  const existing = getConfig(name);
  const ownerName = (fields.owner_name ?? existing?.owner_name ?? '').trim();
  const recName = (fields.receptionist_name ?? existing?.receptionist_name ?? '').trim();
  if (!ownerName) throw new Error('owner_name required');
  if (!recName) throw new Error('receptionist_name required');
  const row: Receptionist = {
    name,
    owner_address: owner.toLowerCase(),
    owner_name: ownerName,
    receptionist_name: recName,
    headline: (fields.headline ?? existing?.headline ?? '').trim(),
    bio: (fields.bio ?? existing?.bio ?? '').trim(),
    greeting: (fields.greeting ?? existing?.greeting ?? '').trim(),
    forwarding_email: (fields.forwarding_email ?? existing?.forwarding_email ?? '').trim(),
    active: fields.active === undefined ? (existing?.active ?? 1) : (fields.active ? 1 : 0),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  db.prepare(`
    INSERT INTO receptionists (name, owner_address, owner_name, receptionist_name, headline, bio, greeting, forwarding_email, active, created_at, updated_at)
    VALUES (@name, @owner_address, @owner_name, @receptionist_name, @headline, @bio, @greeting, @forwarding_email, @active, @created_at, @updated_at)
    ON CONFLICT(name) DO UPDATE SET
      owner_name = excluded.owner_name,
      receptionist_name = excluded.receptionist_name,
      headline = excluded.headline,
      bio = excluded.bio,
      greeting = excluded.greeting,
      forwarding_email = excluded.forwarding_email,
      active = excluded.active,
      updated_at = excluded.updated_at
  `).run(row);
  return row;
}

export function defaultGreeting(r: Pick<Receptionist, 'receptionist_name' | 'owner_name'>): string {
  return `Hi, I'm ${r.receptionist_name}. I can take a message and forward a summary to ${r.owner_name}.`;
}

// ──────────── Public page composition ────────────

export function publicPage(name: string) {
  const ns = registry.get(name);
  if (!ns) return null;
  const r = getConfig(name);
  const addresses = resolver.getAddresses(name);
  const texts = resolver.getTexts(name);
  return {
    display_address: name,
    registered_at: ns.registered_at,
    expires_at: ns.expires_at,
    addresses,
    texts,                                  // social links (phone, whatsapp, …)
    profile: r
      ? { owner_name: r.owner_name, headline: r.headline, bio: r.bio }
      : null,
    receptionist: r && r.active
      ? {
          receptionist_name: r.receptionist_name,
          owner_name: r.owner_name,
          greeting: r.greeting || defaultGreeting(r),
        }
      : null,
  };
}

// ──────────── Chat engine (scripted slot-filling) ────────────

// Required intake fields, asked in this order (source PoC's intakeConfig).
const REQUIRED: Array<keyof Conversation> = ['visitor_name', 'visitor_contact', 'topic', 'next_step'];

const QUESTION: Record<string, string> = {
  visitor_name: "Happy to help — who am I speaking with? What's your name?",
  visitor_contact: 'Thanks! What is the best way to reach you (email or phone)?',
  topic: 'Got it. What would you like to discuss, in a sentence or two?',
  next_step: 'Understood. And what would you like to happen next — a reply, a call, or something else?',
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/;

// Trim leading/trailing whitespace and trailing sentence punctuation.
function trimPunct(s: string): string {
  return s.trim().replace(/[\s.,;:!?]+$/, '').trim();
}

function getConversation(id: string): Conversation | null {
  return (db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as Conversation | undefined) ?? null;
}

function getMessages(conversationId: string): Message[] {
  return db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC`).all(conversationId) as Message[];
}

function addMessage(conversationId: string, role: 'visitor' | 'receptionist', content: string) {
  db.prepare(`INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)`)
    .run(conversationId, role, content, Date.now());
}

function updateConversation(id: string, patch: Partial<Conversation>) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE conversations SET ${sets}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...patch, id, updated_at: Date.now() });
}

// Opportunistically pull fields out of a free-text message, then slot-fill the
// field we explicitly asked for last turn.
function applyMessage(conv: Conversation, text: string): Partial<Conversation> {
  const patch: Partial<Conversation> = {};
  const t = text.trim();

  // Email / phone → contact (anywhere in the message).
  if (!conv.visitor_contact) {
    const email = t.match(EMAIL_RE);
    const phone = t.match(PHONE_RE);
    if (email) patch.visitor_contact = email[0];
    else if (phone && /contact|reach|phone|call|number|email|@/i.test(t)) patch.visitor_contact = phone[0].trim();
  }
  // Name patterns. Trigger phrase is case-flexible; the captured name itself
  // must be capitalised (so "I'm going to…" doesn't capture "going to").
  if (!conv.visitor_name) {
    const m = t.match(/(?:[Ii]['’]?[mM]|[Ii] [Aa]m|[Mm]y name is|[Tt]his is|[Ii]t['’]?s)\s+([A-Z][\p{L}'.-]*(?:\s+[A-Z][\p{L}'.-]*){0,2})/u);
    if (m) patch.visitor_name = trimPunct(m[1]);
  }
  // Organisation.
  if (!conv.visitor_org) {
    const m = t.match(/\b(?:from|at|with|representing)\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,3})/);
    if (m) patch.visitor_org = trimPunct(m[1]);
  }
  // Urgency. Once a topic is on the table, default to medium unless the
  // visitor signalled otherwise (so summaries don't read "Unknown").
  if (!conv.urgency || conv.urgency === 'unknown') {
    if (/\b(urgent|asap|immediately|today|right away|emergency)\b/i.test(t)) patch.urgency = 'high';
    else if (/\b(whenever|no rush|not urgent|sometime)\b/i.test(t)) patch.urgency = 'low';
    else if (conv.topic || patch.topic) patch.urgency = 'medium';
  }

  // Slot-fill the field we asked for, if still empty after opportunistic scan.
  const asked = conv.asking as keyof Conversation | null;
  if (asked && !(conv as any)[asked] && !(patch as any)[asked]) {
    let val = t;
    // Light cleaning of the asked answer — strip a leading filler phrase even
    // when it's the whole message (e.g. a bare "My name is").
    val = val.replace(/^(?:my name is|i['’]?m|i am|this is|it['’]?s)\b[:,]?\s*/i, '').trim();
    if (asked === 'visitor_contact') {
      const email = t.match(EMAIL_RE);
      const phone = t.match(PHONE_RE);
      val = ((email && email[0]) || (phone && phone[0].trim()) || val).trim();
    }
    // Don't store an empty / filler-only answer as a real field — leave it
    // unset so the receptionist re-asks rather than recording junk.
    const isFiller = asked === 'visitor_name' && (!val || /^(?:i am|i['’]?m|my name is|this is|it['’]?s)$/i.test(val));
    if (val && !isFiller) (patch as any)[asked] = val;
  }
  return patch;
}

function merged(conv: Conversation, patch: Partial<Conversation>): Conversation {
  return { ...conv, ...patch };
}

function nextMissing(conv: Conversation): keyof Conversation | null {
  for (const f of REQUIRED) if (!(conv as any)[f]) return f;
  return null;
}

function titleCaseUrgency(u: string | null): string {
  if (!u) return 'Unknown';
  return u.charAt(0).toUpperCase() + u.slice(1);
}

function transcript(conversationId: string, recName: string, ownerName: string): string {
  const msgs = getMessages(conversationId);
  return msgs
    .map(m => (m.role === 'visitor' ? 'Visitor: ' : `${recName}: `) + m.content)
    .join('\n');
}

function buildSummary(name: string, conv: Conversation, recName: string, ownerName: string): { subject: string; body: string; summaryLine: string } {
  const who = conv.visitor_name || 'A visitor';
  const topic = trimPunct(conv.topic || '') || 'an unspecified topic';
  const nextRaw = trimPunct(conv.next_step || '') || 'a reply';
  const next = nextRaw.charAt(0).toLowerCase() + nextRaw.slice(1);
  const summaryLine = `${who} reached out about ${topic} and would like ${next}.`;
  const subject = `New message via ${name}`;
  const body =
`New message via ${name}

From:
${conv.visitor_name || 'Anonymous visitor'}

Organization:
${conv.visitor_org || '—'}

Contact:
${conv.visitor_contact || '—'}

Topic:
${conv.topic || '—'}

Urgency:
${titleCaseUrgency(conv.urgency)}

Summary:
${summaryLine}

Suggested next step:
${conv.next_step || 'Reply personally.'}

Original conversation:
${transcript(conv.id, recName, ownerName)}`;
  return { subject, body, summaryLine };
}

// Idempotent + self-healing: summarise the conversation and drop it in the
// owner's inbox. Returns true once delivered. Safe to call repeatedly.
export function finalize(conversationId: string): boolean {
  const conv = getConversation(conversationId);
  if (!conv) return false;
  if (conv.status === 'delivered') return true;       // already done
  const r = getConfig(conv.name);
  if (!r) return false;

  const { subject, body, summaryLine } = buildSummary(conv.name, conv, r.receptionist_name, r.owner_name);
  updateConversation(conv.id, { summary: summaryLine, status: 'summarized' });

  // Deliver to inbox (mocked email forwarding). One row per conversation —
  // enforced structurally by UNIQUE(conversation_id) + INSERT OR IGNORE.
  db.prepare(`
    INSERT OR IGNORE INTO inbox (id, name, owner_address, conversation_id, subject, body, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run('inb_' + crypto.randomBytes(8).toString('hex'), conv.name, r.owner_address, conv.id, subject, body, Date.now());
  updateConversation(conv.id, { status: 'delivered', delivered_at: Date.now() });
  return true;
}

export type ChatResult = {
  conversation_id: string;
  session_token: string;
  reply: string;
  completed: boolean;
  status: string;
};

export function startOrContinue(args: {
  name: string;
  conversation_id?: string | null;
  session_token?: string | null;
  message: string;
}): ChatResult {
  const r = getConfig(args.name);
  if (!r || !r.active) throw new Error('receptionist not found');

  let conv: Conversation | null = null;
  if (args.conversation_id) {
    conv = getConversation(args.conversation_id);
    if (!conv || conv.name !== args.name) throw new Error('conversation not found');
    // Session binding — prevents injecting into a leaked conversation id.
    if (conv.session_token !== args.session_token) {
      const e = new Error('Invalid session.');
      (e as any).code = 403;
      throw e;
    }
  }

  // Terminal / idempotent branch — already delivered.
  if (conv && conv.status === 'delivered') {
    addMessage(conv.id, 'visitor', args.message);
    const reply = `I've already passed your message along to ${r.owner_name}. They'll be in touch — thanks again!`;
    addMessage(conv.id, 'receptionist', reply);
    return { conversation_id: conv.id, session_token: conv.session_token, reply, completed: true, status: 'delivered' };
  }

  // Self-heal — captured enough before but failed to finalise.
  if (conv && (conv.status === 'ready_for_summary' || conv.status === 'summarized')) {
    if (finalize(conv.id)) {
      const reply = `Thanks — I've summarised everything and forwarded it to ${r.owner_name}.`;
      addMessage(conv.id, 'visitor', args.message);
      addMessage(conv.id, 'receptionist', reply);
      return { conversation_id: conv.id, session_token: conv.session_token, reply, completed: true, status: 'delivered' };
    }
  }

  // First message → create the conversation + mint a session token.
  let isFirst = false;
  if (!conv) {
    isFirst = true;
    const id = 'conv_' + crypto.randomBytes(8).toString('hex');
    const token = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    db.prepare(`
      INSERT INTO conversations (id, name, session_token, status, asking, created_at, updated_at)
      VALUES (?, ?, ?, 'open', NULL, ?, ?)
    `).run(id, args.name, token, now, now);
    conv = getConversation(id)!;
  }

  // Persist the visitor message, then run the scripted intake.
  addMessage(conv.id, 'visitor', args.message);
  const patch = applyMessage(conv, args.message);
  if (Object.keys(patch).length) updateConversation(conv.id, patch);
  conv = merged(conv, patch);

  const missing = nextMissing(conv);
  let reply: string;
  let completed = false;

  if (!missing) {
    // Have everything → ready, finalise, close.
    updateConversation(conv.id, { status: 'ready_for_summary', asking: null });
    finalize(conv.id);
    conv = getConversation(conv.id)!;
    reply = `Thank you${conv.visitor_name ? ', ' + conv.visitor_name : ''}! I have everything I need. I've forwarded a summary to ${r.owner_name}, who will follow up with you directly. Have a great day!`;
    completed = true;
  } else {
    updateConversation(conv.id, { status: 'collecting_info', asking: missing });
    const intro = isFirst
      ? `${r.greeting || defaultGreeting(r)} `
      : '';
    reply = intro + QUESTION[missing];
  }

  addMessage(conv.id, 'receptionist', reply);
  const finalConv = getConversation(conv.id)!;
  return {
    conversation_id: conv.id,
    session_token: conv.session_token,
    reply,
    completed,
    status: finalConv.status,
  };
}

// ──────────── Conversation history (for the visitor chat boot + owner view) ────────────

export function conversationDetail(id: string) {
  const conv = getConversation(id);
  if (!conv) return null;
  const msgs = getMessages(id).map(m => ({ role: m.role, content: m.content, created_at: m.created_at }));
  return { conversation: conv, messages: msgs };
}

// ──────────── Owner inbox ────────────

export type InboxRow = {
  id: string;
  name: string;
  owner_address: string;
  conversation_id: string;
  subject: string;
  body: string;
  is_read: number;
  created_at: number;
};

export function listInbox(owner: string): Array<InboxRow & { visitor_name: string | null; topic: string | null; status: string }> {
  const rows = db.prepare(`SELECT * FROM inbox WHERE owner_address = ? ORDER BY created_at DESC`).all(owner.toLowerCase()) as InboxRow[];
  return rows.map(row => {
    const c = getConversation(row.conversation_id);
    return { ...row, visitor_name: c?.visitor_name ?? null, topic: c?.topic ?? null, status: c?.status ?? 'delivered' };
  });
}

export function getInboxItem(owner: string, id: string) {
  const row = db.prepare(`SELECT * FROM inbox WHERE id = ?`).get(id) as InboxRow | undefined;
  if (!row) return null;
  if (row.owner_address.toLowerCase() !== owner.toLowerCase()) throw new Error('not owner');
  db.prepare(`UPDATE inbox SET is_read = 1 WHERE id = ?`).run(id);
  const detail = conversationDetail(row.conversation_id);
  return { item: { ...row, is_read: 1 }, ...detail };
}

export function unreadCount(owner: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM inbox WHERE owner_address = ? AND is_read = 0`).get(owner.toLowerCase()) as { n: number };
  return row.n;
}
