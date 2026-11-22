// The distribution maths. Same model as the original split app, extended to client income.
//
//   net[p] > 0  -> the firm owes partner p (they paid out, or haven't received their share)
//   net[p] < 0  -> partner p is holding money that belongs to the others
//
//   cost / investment: payer +amount, each person in `among` −equal part
//   settle-up payment: payer +amount, receiver −amount
//   client income   : receiver −amount, each partner in split +their % share
//
// Profit = client income − costs. Investments are capital, tracked separately.
import type { ClientPayment, Db, LedgerEntry, Partner, SplitPart } from '../data/types';
import { allocate } from './money';

export interface Transfer { from: string; to: string; amount: number }
export interface PartnerFigures {
  id: string;
  name: string;
  net: number;
  incomeShare: number;
  costShare: number;
  invested: number;
  profitShare: number;
  holding: number; // money that landed with this partner from clients
}

export function defaultSplit(partners: Partner[]): SplitPart[] {
  const act = partners.filter((p) => p.active);
  const sum = act.reduce((a, p) => a + Number(p.share_pct), 0);
  if (!act.length) return [];
  if (!sum) return act.map((p) => ({ partner_id: p.id, pct: 100 / act.length }));
  return act.map((p) => ({ partner_id: p.id, pct: (Number(p.share_pct) * 100) / sum }));
}

export function paymentShares(pay: ClientPayment, partners: Partner[]) {
  const split = pay.split?.length ? pay.split : defaultSplit(partners);
  const valid = split.filter((s) => partners.some((p) => p.id === s.partner_id));
  const parts = allocate(pay.amount, valid.map((s) => s.pct));
  return valid.map((s, i) => ({ partner_id: s.partner_id, amount: parts[i] }));
}

export function ledgerShares(e: LedgerEntry, partners: Partner[]) {
  const among = partners.filter((p) => e.among.includes(p.id)).map((p) => p.id); // partner order keeps leftover paise stable
  const parts = allocate(e.amount, among.map(() => 1));
  return among.map((id, i) => ({ partner_id: id, amount: parts[i] }));
}

export function computeDistribution(db: Pick<Db, 'partners' | 'payments' | 'ledger'>, range?: { from?: string; to?: string }) {
  const inRange = (d: string) => (!range?.from || d >= range.from) && (!range?.to || d <= range.to);
  const partners = [...db.partners].sort((a, b) => a.sort - b.sort);
  const f: Record<string, PartnerFigures> = {};
  for (const p of partners) f[p.id] = { id: p.id, name: p.name, net: 0, incomeShare: 0, costShare: 0, invested: 0, profitShare: 0, holding: 0 };

  let income = 0, costs = 0, invested = 0;

  for (const pay of db.payments) {
    if (!inRange(pay.received_on) || !f[pay.received_by]) continue;
    income += pay.amount;
    f[pay.received_by].net -= pay.amount;
    f[pay.received_by].holding += pay.amount;
    for (const s of paymentShares(pay, partners)) { f[s.partner_id].net += s.amount; f[s.partner_id].incomeShare += s.amount; }
  }

  for (const e of db.ledger) {
    if (!inRange(e.entry_date) || !f[e.payer_id]) continue;
    const shares = ledgerShares(e, partners);
    if (!shares.length) continue;
    f[e.payer_id].net += e.amount;
    if (e.kind === 'cost') costs += e.amount;
    if (e.kind === 'investment') { invested += e.amount; f[e.payer_id].invested += e.amount; }
    for (const s of shares) {
      f[s.partner_id].net -= s.amount;
      if (e.kind === 'cost') f[s.partner_id].costShare += s.amount;
    }
  }

  for (const p of Object.values(f)) p.profitShare = p.incomeShare - p.costShare;

  return { partners: Object.values(f), transfers: settle(f), income, costs, invested, profit: income - costs };
}

/** Greedy: biggest debtor pays biggest creditor -> fewest transfers. */
function settle(f: Record<string, PartnerFigures>): Transfer[] {
  const cred = Object.values(f).filter((p) => p.net > 0).map((p) => ({ id: p.id, v: p.net })).sort((a, b) => b.v - a.v);
  const debt = Object.values(f).filter((p) => p.net < 0).map((p) => ({ id: p.id, v: -p.net })).sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const x = Math.min(debt[i].v, cred[j].v);
    if (x > 0) out.push({ from: debt[i].id, to: cred[j].id, amount: x });
    debt[i].v -= x; cred[j].v -= x;
    if (debt[i].v === 0) i++;
    if (cred[j].v === 0) j++;
  }
  return out;
}

/** Month buckets (YYYY-MM) for the last n months, oldest first. */
export function monthlySeries(db: Pick<Db, 'payments' | 'ledger'>, n = 6, now = new Date()) {
  const months: { key: string; label: string; income: number; costs: number }[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-IN', { month: 'short' }),
      income: 0,
      costs: 0,
    });
  }
  const idx = new Map(months.map((m, i) => [m.key, i]));
  for (const p of db.payments) { const i = idx.get(p.received_on.slice(0, 7)); if (i !== undefined) months[i].income += p.amount; }
  for (const e of db.ledger) { if (e.kind !== 'cost') continue; const i = idx.get(e.entry_date.slice(0, 7)); if (i !== undefined) months[i].costs += e.amount; }
  return months;
}

export function quoteTotals(items: { qty: number; rate: number }[], discount: number, taxPct: number) {
  const subtotal = items.reduce((a, it) => a + Math.round((Number(it.qty) || 0) * (Number(it.rate) || 0)), 0);
  const taxable = Math.max(0, subtotal - (discount || 0));
  const tax_amount = Math.round((taxable * (Number(taxPct) || 0)) / 100);
  return { subtotal, taxable, tax_amount, total: taxable + tax_amount };
}
