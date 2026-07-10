import * as registry from './registry.ts';
import * as idh from './idh.ts';
import * as billing from './billing.ts';
import * as domains from './domains.ts';

// §6.2 Registrar — issuance. register / renew / available.
// Validation per §4.1, §4.2: name validity, reserved/trademark blocks.

const PHASE0_TLDS = new Set(['dial', 'pair', 'point', 'vf']);

// A TLD is acceptable if it's a Phase 0 TLD OR a corporate domain registered
// via §4.1. The latter unlocks names like `finance.acme` once `.acme` exists.
function isAcceptedTLD(tld: string): boolean {
  if (PHASE0_TLDS.has(tld)) return true;
  return domains.get(tld) !== null;
}

// Tiny reserved set — production would be a curated list.
const RESERVED_LABELS = new Set([
  'admin', 'root', 'system', 'support', 'help',
  'vodafone', 'pairpoint', 'dial', 'register', 'registrar', 'resolver',
  'api', 'www', 'mail', 'security', 'abuse', 'postmaster',
  'apple', 'google', 'microsoft', 'amazon', 'meta', 'samsung', 'sony',
]);

// Very small profanity sample (PoC). Real impl would use a maintained list.
const PROFANITY = new Set(['shit', 'fuck', 'cunt']);

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
// Corporate-domain labels are laxer: the enterprise owns the whole namespace,
// so short 2-char department codes (hr, it, qa) are allowed too.
const CORP_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type ParsedName = { label: string; tld: string; name: string };

export function parse(input: string): ParsedName {
  const lc = input.trim().toLowerCase();
  if (!lc) throw new Error('empty name');
  let label: string, tld: string;
  if (lc.includes('.')) {
    const parts = lc.split('.');
    if (parts.length !== 2) throw new Error('only single-label.tld supported in Phase 0 PoC');
    [label, tld] = parts;
  } else {
    label = lc;
    tld = 'dial';
  }
  if (!isAcceptedTLD(tld)) throw new Error(`tld .${tld} not supported in Phase 0`);
  return { label, tld, name: `${label}.${tld}` };
}

export type ValidityReason =
  | 'label-syntax'
  | 'label-length'
  | 'reserved'
  | 'profanity';

// `corporate` = the label is being issued under a corporate domain (.acme),
// whose owner controls the entire namespace. Those names skip the public-.dial
// protections — the reserved/brand blocklist and the 3-char minimum exist to
// stop impersonation and squatting on the shared TLDs, neither of which applies
// inside a namespace one enterprise already owns. Structural syntax and the
// max length still apply so every name is a valid, resolvable label.
export function validityIssue(label: string, corporate = false): ValidityReason | null {
  if (label.length < (corporate ? 1 : 3) || label.length > 63) return 'label-length';
  if (!(corporate ? CORP_LABEL_RE : LABEL_RE).test(label)) return 'label-syntax';
  if (!corporate && RESERVED_LABELS.has(label)) return 'reserved';
  if (PROFANITY.has(label)) return 'profanity';
  return null;
}

export type AvailabilityResult = {
  name: string;
  label: string;
  tld: string;
  available: boolean;
  reason: ValidityReason | 'taken' | null;
  quote?: ReturnType<typeof billing.quote>;
  quote_verified?: ReturnType<typeof billing.quote>;
};

export function available(input: string): AvailabilityResult {
  const { label, tld, name } = parse(input);
  // A non-Phase-0 tld that parsed is an existing corporate domain.
  const v = validityIssue(label, !PHASE0_TLDS.has(tld));
  if (v) {
    return { name, label, tld, available: false, reason: v };
  }
  const free = registry.isAvailable(name);
  if (!free) {
    return { name, label, tld, available: false, reason: 'taken' };
  }
  return {
    name, label, tld, available: true, reason: null,
    quote:          billing.quote(label, tld, 1),
    quote_verified: billing.quote(label, tld, 1, { verified: true }),
  };
}

export type RegisterArgs = {
  name: string;
  owner_address: string;
  duration_years: number;
  // §4.6 expects a Pairpoint attestation hash; an empty string is treated as
  // a self-attested (demo-mode) registration that diverges from the spec.
  attestation_hash: string;
};

export function register(args: RegisterArgs) {
  const { label, tld, name } = parse(args.name);
  const v = validityIssue(label, !PHASE0_TLDS.has(tld));
  if (v) throw new Error(`invalid label: ${v}`);
  if (!registry.isAvailable(name)) throw new Error('name not available');

  // Names under a corporate domain are owner-only: the .acme TLD belongs to
  // one enterprise and only they can issue names under it.
  if (!PHASE0_TLDS.has(tld)) {
    const d = domains.get(tld);
    if (!d) throw new Error(`domain .${tld} does not exist`);
    if (d.owner_address.toLowerCase() !== args.owner_address.toLowerCase()) {
      throw new Error(`only the owner of .${tld} can issue names under it`);
    }
  }

  if (args.attestation_hash) {
    const att = idh.get(args.attestation_hash);
    if (!att) throw new Error('attestation not found — verify identity first');
    if (att.subject.toLowerCase() !== args.owner_address.toLowerCase()) {
      throw new Error('attestation subject does not match owner');
    }
  }
  // else: self-attested. Allowed only because this is a demo PoC — production
  // would reject (§4.6 MUST).

  const ns = registry.register({
    name,
    owner_address: args.owner_address,
    duration_years: args.duration_years,
    attestation_hash: args.attestation_hash || '',
  });

  return { namespace: ns, parsed: { label, tld, name } };
}

// ──────────── Corporate domain (§4.1) ────────────

export type DomainAvailability = {
  label: string;
  available: boolean;
  reason: ValidityReason | 'taken' | 'reserved-tld' | null;
  quote?: ReturnType<typeof billing.quoteDomain>;
};

export function domainAvailable(input: string): DomainAvailability {
  const lc = input.trim().toLowerCase().replace(/^\./, '');
  const v = validityIssue(lc);
  if (v) return { label: lc, available: false, reason: v };
  if (PHASE0_TLDS.has(lc)) return { label: lc, available: false, reason: 'reserved-tld' };
  if (!domains.isAvailable(lc)) return { label: lc, available: false, reason: 'taken' };
  return { label: lc, available: true, reason: null, quote: billing.quoteDomain(lc, 1) };
}

export function registerDomain(args: {
  label: string;
  owner_address: string;
  duration_years: number;
  attestation_hash: string;
}) {
  const lc = args.label.trim().toLowerCase().replace(/^\./, '');
  const v = validityIssue(lc);
  if (v) throw new Error(`invalid label: ${v}`);
  if (PHASE0_TLDS.has(lc)) throw new Error(`'.${lc}' is a reserved Phase 0 TLD`);
  if (!domains.isAvailable(lc)) throw new Error('domain not available');

  if (args.attestation_hash) {
    const att = idh.get(args.attestation_hash);
    if (!att) throw new Error('attestation not found — verify identity first');
    if (att.subject.toLowerCase() !== args.owner_address.toLowerCase()) {
      throw new Error('attestation subject does not match owner');
    }
  }
  return domains.register({
    label: lc,
    owner_address: args.owner_address,
    duration_years: args.duration_years,
    attestation_hash: args.attestation_hash || '',
  });
}

export function renewDomain(label: string, duration_years: number) {
  const lc = label.trim().toLowerCase().replace(/^\./, '');
  return domains.renew(lc, duration_years);
}

export function releaseDomain(label: string) {
  const lc = label.trim().toLowerCase().replace(/^\./, '');
  return domains.release(lc);
}

export function renew(input: string, duration_years: number) {
  const { name } = parse(input);
  return registry.renew(name, duration_years);
}

export function release(input: string) {
  const { name } = parse(input);
  return registry.release(name);
}
