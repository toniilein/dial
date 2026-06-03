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
export function partyFor(name: string): string {
  return `${name.toLowerCase()}::${NAMESPACE}`;
}
