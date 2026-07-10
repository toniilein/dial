import crypto from 'node:crypto';

// Canton party IDs are `<hint>::<namespace>` where `namespace` is a multihash
// of the controlling party's public key — the "namespace controller" in
// Canton vocabulary. All DIAL-issued parties share one namespace controller:
// DIAL's signing key (held in Vault/HSM per §NFR Security). That means every
// canton:omnibus value the DIAL registry binds has the same fingerprint
// suffix, and the hint segment encodes the DIAL name itself.
//
// Reference: Canton docs · UniqueIdentifier / PartyId. The `1220` prefix is
// the multihash code for SHA-256 (0x12) with a 32-byte (0x20) digest.

const DIAL_KEY = process.env.DIAL_SIGNING_SECRET ?? 'dial-poc-dev-signing-key';

const FINGERPRINT_HEX = crypto.createHash('sha256').update(DIAL_KEY).digest('hex'); // 64 chars
const NAMESPACE = '1220' + FINGERPRINT_HEX; // multihash-prefixed (SHA-256, 32B digest)

export function namespace(): string {
  return NAMESPACE;
}

export function fingerprint(): string {
  return FINGERPRINT_HEX;
}

// Build a canonical Canton party id for a DIAL name. The hint is the DIAL
// name itself (lower-cased); the namespace is DIAL's authoritative key.
// NOTE: this is the *custodial* shape (shared DIAL namespace). It's kept for the
// seeded demo names and placeholder examples. New parties are non-custodial —
// see verifyAndDeriveParty below.
export function partyFor(name: string): string {
  return `${name.toLowerCase()}::${NAMESPACE}`;
}

// ── Non-custodial parties ────────────────────────────────────────────────
// The keypair is generated in the user's browser; only the PUBLIC key ever
// reaches us. The namespace fingerprint is the multihash (SHA-256) of that
// public key — so each user is their own namespace controller. The user proves
// they hold the matching private key by signing `DIAL-canton-bind:<name>`; we
// verify with the public key before minting the party. DIAL never sees the
// private key, so it can never act as the party.
const BIND_PREFIX = 'DIAL-canton-bind:';

export function fingerprintOf(publicKeyDerHex: string): string {
  const der = Buffer.from(publicKeyDerHex, 'hex');
  return '1220' + crypto.createHash('sha256').update(der).digest('hex');
}

export function verifyAndDeriveParty(name: string, publicKeyDerHex: string, signatureHex: string): { party: string; fingerprint: string } {
  let pub: crypto.KeyObject;
  try {
    pub = crypto.createPublicKey({ key: Buffer.from(publicKeyDerHex, 'hex'), format: 'der', type: 'spki' });
  } catch { throw new Error('invalid public key'); }
  if (pub.asymmetricKeyType !== 'ec') throw new Error('public key must be an EC (P-256) key');
  // WebCrypto ECDSA emits raw r‖s (IEEE P1363), so verify with that encoding.
  const ok = crypto.verify('sha256', Buffer.from(BIND_PREFIX + name.toLowerCase()),
    { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(signatureHex, 'hex'));
  if (!ok) throw new Error('signature does not match public key — proof of key control failed');
  const fingerprint = fingerprintOf(publicKeyDerHex);
  return { party: `${name.toLowerCase()}::${fingerprint}`, fingerprint };
}
