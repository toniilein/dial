// ── DIAL-native resolution (the ENS replacement) ──────────────────────────
// Resolves between Ethereum addresses and DIAL names using DIAL's OWN registry
// + resolver records — no ENS, no viem, no external chain reads.
//
// Trust model (why this is safe without ENS):
//   • The proven address↔account binding lives on the user row, written ONLY by
//     the SIWE wallet-link (auth.setWallet). We trust THAT, never an arbitrary
//     owner-set `addr.eip155:*` record (whose proof-of-control is still mocked).
//   • Consent: a wallet is represented ONLY by a DIAL name its own account holds
//     (registry ownership), so all three facts agree — account⇄wallet (SIWE),
//     account⇄name (registry), therefore wallet⇄name.

import * as registry from './registry.ts';
import * as resolver from './resolver.ts';
import * as authSvc from './auth.ts';

// EVM addresses compare case-insensitively; EIP-55 checksum is display-only.
export function normEvm(a: string | null | undefined): string {
  return String(a ?? '').trim().toLowerCase();
}

// Pick the DIAL name that should represent an owner's wallet. Consent model:
// only names the owner actually holds (and that are still live) are eligible.
// Prefer a name already bound to this address, else the earliest-registered.
export function nameForOwner(ownerAddress: string, address: string): string | null {
  const live = registry.listByOwner(ownerAddress.toLowerCase())
    .filter(ns => !registry.isExpiredPastGrace(ns.name));
  if (!live.length) return null;
  const addr = normEvm(address);
  const already = live.find(ns => normEvm(resolver.addr(ns.name, 'eip155:1')) === addr);
  if (already) return already.name;
  return live.slice().sort((a, b) => a.registered_at - b.registered_at)[0].name;
}

// Called on a successful SIWE link: bind the proven address to the owner's
// representative name (a normalized, proof-backed `addr.eip155:1` write) and
// return the name + its avatar for display. Returns nulls if the owner holds
// no live name yet (wallet still links; it just shows the address alone).
export function bindWallet(ownerAddress: string, address: string): { name: string | null; avatar: string | null } {
  const name = nameForOwner(ownerAddress, address);
  if (!name) return { name: null, avatar: null };
  resolver.setAddr(ownerAddress, name, 'eip155:1', normEvm(address)); // proven write, normalized
  return { name, avatar: resolver.text(name, 'avatar') };
}

// Called on unlink: drop the bound address record, but only if it still points
// at the address we're unbinding (don't clobber a record the owner has changed).
export function unbindWallet(ownerAddress: string, name: string | null, address: string): void {
  if (!name) return;
  if (normEvm(resolver.addr(name, 'eip155:1')) === normEvm(address)) {
    try { resolver.removeAddr(ownerAddress, name, 'eip155:1'); } catch { /* name released, etc. */ }
  }
}

// Reverse: address → DIAL identity. Reads the SIWE-proven binding off the user
// row (never an unproven resolver record), and confirms the name is still owned
// by that account and live. Returns null when there's no confirmed name.
export function reverse(address: string): { name: string; avatar: string | null } | null {
  const u = authSvc.getByWallet(normEvm(address));
  if (!u || !u.wallet_name) return null;
  const ns = registry.get(u.wallet_name);
  if (!ns) return null;                                                  // name released
  if (ns.owner_address.toLowerCase() !== u.owner_address.toLowerCase()) return null; // no longer owns it
  if (registry.isExpiredPastGrace(u.wallet_name)) return null;           // lapsed
  return { name: u.wallet_name, avatar: resolver.text(u.wallet_name, 'avatar') };
}
