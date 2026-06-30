import * as resolver from './resolver.ts';

// ── Social embeds (X / LinkedIn) ─────────────────────────────────────────
// Shows a name's latest posts using each platform's own free embed — no API
// keys, no paid tiers. Both are owner-curated per-post embeds:
//
//   X        : official single-tweet embeds. X starves the free embedded
//              *timeline* widget for logged-out viewers (it renders empty), but
//              individual tweet embeds still work. So the owner pastes up to 3
//              tweet URLs into `x_posts`; we render each as an official tweet.
//              (A real automatic timeline needs the paid X API.)
//   LinkedIn : official per-post embeds. LinkedIn has no free feed API, so the
//              owner curates posts by pasting each post's "Embed this post"
//              code (or URL) into `linkedin_posts`; we render the embed iframe.
//
// This service only resolves handles/URLs into safe embed targets — the actual
// post content is rendered client-side from X / LinkedIn's own servers.

export type PublicEmbeds = {
  x: { handle: string | null; tweets: string[] } | null;
  linkedin: { embeds: string[] };
};

const MAX_LINKEDIN = 3; // show only the 3 latest featured posts
const MAX_TWEETS = 3;    // show only the 3 latest featured tweets

// X handles: 1–15 chars, letters/digits/underscore.
function xHandle(name: string): string | null {
  const h = (resolver.getTexts(name).x || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{1,15}$/.test(h) ? h : null;
}

// Turn whatever the owner pasted (a tweet URL, an embed blockquote, or a raw
// status id) into a canonical, host-locked tweet URL the official embed can
// render. Returns null if no status id is recognised.
function toTweetUrl(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  let user: string | null = null;
  let id: string | null = null;
  let m: RegExpMatchArray | null;
  // Tweet ids run from 1 digit (earliest tweets) to ~19 (snowflake). The
  // /status/ context disambiguates, so URL forms accept any length; a *bare*
  // number must be long enough not to match incidental digits.
  if ((m = t.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/([0-9]{1,25})/i))) {
    user = m[1]; id = m[2];
  } else if ((m = t.match(/(?:twitter\.com|x\.com)\/i\/web\/status\/([0-9]{1,25})/i))) {
    id = m[1];
  } else if ((m = t.match(/status(?:es)?\/([0-9]{1,25})/i))) {
    id = m[1];
  } else if ((m = t.match(/^([0-9]{8,25})$/))) {
    id = m[1];
  }
  if (!id) return null;
  // 'i' is X's account-agnostic path segment; it resolves any tweet by id.
  return `https://twitter.com/${user && /^[A-Za-z0-9_]{1,15}$/.test(user) ? user : 'i'}/status/${id}`;
}

function xTweets(name: string): string[] {
  const raw = (resolver.getTexts(name).x_posts || '').trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(/[\n,\s]+/)) {
    const url = toTweetUrl(token);
    const id = url && url.match(/status\/([0-9]+)/)?.[1];
    if (url && id && !seen.has(id)) { seen.add(id); out.push(url); }
    if (out.length >= MAX_TWEETS) break;
  }
  return out;
}

// Turn whatever the owner pasted (an <iframe> embed code, a post URL, or a raw
// urn) into a canonical, host-locked LinkedIn embed URL. Returns null if no
// LinkedIn update URN can be recognised — so nothing untrusted is ever framed.
function toLinkedinEmbed(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  // urn:li:activity:123 / urn:li:share:123 / urn:li:ugcPost:123 — also matches
  // the id embedded in /embed/feed/update/... or a /posts/...-activity-<id> URL.
  const m = t.match(/urn:li:(activity|share|ugcPost):([0-9]+)/i)
    || t.match(/[?&]urn=urn%3Ali%3A(activity|share|ugcPost)%3A([0-9]+)/i)
    || t.match(/-(activity)-([0-9]+)/i); // public post URL slug: ...-activity-7203...
  if (!m) return null;
  const type = m[1].toLowerCase() === 'ugcpost' ? 'ugcPost' : m[1].toLowerCase();
  return `https://www.linkedin.com/embed/feed/update/urn:li:${type}:${m[2]}`;
}

function linkedinEmbeds(name: string): string[] {
  const raw = (resolver.getTexts(name).linkedin_posts || '').trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(/[\n,]+/)) {
    const url = toLinkedinEmbed(token);
    if (url && !seen.has(url)) { seen.add(url); out.push(url); }
    if (out.length >= MAX_LINKEDIN) break;
  }
  return out;
}

// Validate a single LinkedIn post reference for the owner editor (server-side
// echo of the same rule), so we can report which pasted lines were usable.
export function parseLinkedin(raw: string): { embeds: string[]; rejected: string[] } {
  const embeds: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const token of (raw || '').split(/[\n,]+/)) {
    const t = token.trim();
    if (!t) continue;
    const url = toLinkedinEmbed(t);
    if (url && !seen.has(url)) { seen.add(url); embeds.push(url); }
    else if (!url) rejected.push(t);
  }
  return { embeds: embeds.slice(0, MAX_LINKEDIN), rejected };
}

export function publicEmbeds(name: string): PublicEmbeds {
  const handle = xHandle(name);
  const tweets = xTweets(name);
  return {
    x: (handle || tweets.length) ? { handle, tweets } : null,
    linkedin: { embeds: linkedinEmbeds(name) },
  };
}

// True when there's at least one thing to show, so callers can decide whether
// to surface the Latest-posts block at all.
export function hasEmbeds(name: string): boolean {
  const e = publicEmbeds(name);
  return !!(e.x && e.x.tweets.length) || e.linkedin.embeds.length > 0;
}
