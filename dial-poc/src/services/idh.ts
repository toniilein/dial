import crypto from 'node:crypto';
import { db } from '../db.ts';

// Mocked Vodafone Pairpoint Identity Hub.
// In production this is an external service; DIAL never stores PII (§NFR Privacy)
// and only persists the attestation hash returned by Pairpoint (§4.6).
// The mock always passes verification and returns a deterministic hash.

export type Attestation = {
  hash: string;
  subject: string;
  kind: 'enterprise' | 'consumer';
  level: 'verified';
  issued_at: number;
};

export function verify(subject: string, kind: 'enterprise' | 'consumer'): Attestation {
  const issued_at = Date.now();
  const hash = 'idh_' + crypto
    .createHash('sha256')
    .update(`${kind}:${subject}:${issued_at}`)
    .digest('hex')
    .slice(0, 32);

  const att: Attestation = { hash, subject, kind, level: 'verified', issued_at };
  db.prepare(`
    INSERT INTO attestations (hash, subject, kind, level, issued_at)
    VALUES (@hash, @subject, @kind, @level, @issued_at)
  `).run(att);
  return att;
}

export function get(hash: string): Attestation | null {
  const row = db.prepare(`SELECT * FROM attestations WHERE hash = ?`).get(hash) as Attestation | undefined;
  return row ?? null;
}
