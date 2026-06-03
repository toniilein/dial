import crypto from 'node:crypto';
import { db } from '../db.ts';
import { bus } from '../eventbus.ts';

// Mocked Billing service. §4.7 mandates USDC settlement with tiered pricing.
// 3-char premium auction is deferred — here all 3-char names are priced flat.
// The mock checkout always succeeds.

export type Quote = {
  label: string;
  tld: string;
  duration_years: number;
  unit_price_usdc: string;
  total_usdc: string;
  tier: 'premium-3' | 'premium-4-6' | 'standard';
  // Discount applied for verified consumers on .dial. 0 if not applicable.
  verified_discount_pct: number;
  verified_discount_usdc: string;
  list_total_usdc: string;
};

// Consumers who complete Pairpoint identity verification get a discount on
// .dial name registrations. Enterprise (corporate-domain) pricing is unchanged.
export const VERIFIED_DISCOUNT_PCT = 25;

export function quote(label: string, tld: string, duration_years: number, opts?: { verified?: boolean }): Quote {
  // Flat pricing for all .dial names — 240 USDC/year list price.
  const unit = 240;
  const tier: Quote['tier'] = 'standard';
  const listTotal = unit * duration_years;
  const discountApplies = !!opts?.verified && tld === 'dial';
  const discountPct = discountApplies ? VERIFIED_DISCOUNT_PCT : 0;
  const discountUsdc = discountApplies ? (listTotal * discountPct) / 100 : 0;
  const total = listTotal - discountUsdc;
  return {
    label, tld, duration_years,
    unit_price_usdc: unit.toFixed(2),
    total_usdc: total.toFixed(2),
    tier,
    verified_discount_pct: discountPct,
    verified_discount_usdc: discountUsdc.toFixed(2),
    list_total_usdc: listTotal.toFixed(2),
  };
}

// Corporate-domain pricing tier (§4.1). Higher SKU than name registration
// because each domain entitles the owner to issue unlimited names under it.
export type DomainQuote = {
  label: string;
  duration_years: number;
  unit_price_usdc: string;
  total_usdc: string;
  tier: 'domain-premium-3' | 'domain-standard-4-6' | 'domain-standard';
};

export function quoteDomain(label: string, duration_years: number): DomainQuote {
  let unit: number;
  let tier: DomainQuote['tier'];
  if (label.length === 3) { unit = 12000; tier = 'domain-premium-3'; }
  else if (label.length <= 6) { unit = 4800;  tier = 'domain-standard-4-6'; }
  else { unit = 2400;  tier = 'domain-standard'; }
  const total = unit * duration_years;
  return {
    label, duration_years,
    unit_price_usdc: unit.toFixed(2),
    total_usdc: total.toFixed(2),
    tier,
  };
}

export type Payment = {
  id: string;
  name: string;
  kind: 'register' | 'renew';
  amount_usdc: string;
  status: 'paid';
  created_at: number;
};

export function checkout(name: string, kind: 'register' | 'renew', amount_usdc: string): Payment {
  const payment: Payment = {
    id: 'pay_' + crypto.randomBytes(8).toString('hex'),
    name,
    kind,
    amount_usdc,
    status: 'paid',
    created_at: Date.now(),
  };
  db.prepare(`
    INSERT INTO payments (id, name, kind, amount_usdc, status, created_at)
    VALUES (@id, @name, @kind, @amount_usdc, @status, @created_at)
  `).run(payment);
  bus.publish({ type: 'billing.paid', name, payment_id: payment.id });
  return payment;
}

export function getPayment(id: string): Payment | null {
  const row = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(id) as Payment | undefined;
  return row ?? null;
}
