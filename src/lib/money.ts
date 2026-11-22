// Money helpers. Everything is integer paise.
const full = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const inr = (paise: number) => full.format(paise / 100);

/** ₹4.2L / ₹1.35Cr / ₹82K — Indian compact form for KPI tiles. */
export function inrShort(paise: number) {
  const r = paise / 100;
  const a = Math.abs(r);
  const sign = r < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`;
  return `${sign}₹${whole.format(a)}`;
}
const trim = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '');

/** "1,25,000.50" / "125000" / "1.2L" -> paise. NaN when unreadable. */
export function parseInr(input: string): number {
  let s = String(input ?? '').trim().toLowerCase().replace(/[₹\s,]/g, '');
  let mult = 1;
  if (s.endsWith('cr')) { mult = 1e7; s = s.slice(0, -2); }
  else if (s.endsWith('l')) { mult = 1e5; s = s.slice(0, -1); }
  else if (s.endsWith('k')) { mult = 1e3; s = s.slice(0, -1); }
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return NaN;
  return Math.round(parseFloat(s) * mult * 100);
}

/** Paise -> editable rupee string ("125000.5"). */
export const toRupeeInput = (paise: number) => (paise ? String(paise / 100) : '');

/** Split `amount` by weights with no lost paise (largest remainder). */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const base = raw.map(Math.floor);
  let rest = amount - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest <= 0) break; base[i]++; rest--; }
  return base;
}

// Amount in words, Indian system — printed on quotations.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function two(n: number) { return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`; }
function three(n: number) { const h = Math.floor(n / 100), r = n % 100; return [h ? `${ONES[h]} Hundred` : '', r ? two(r) : ''].filter(Boolean).join(' '); }
export function inWords(paise: number) {
  let n = Math.floor(Math.abs(paise) / 100);
  const p = Math.abs(paise) % 100;
  if (n === 0 && p === 0) return 'Rupees Zero Only';
  const parts: string[] = [];
  const cr = Math.floor(n / 1e7); n %= 1e7;
  const lk = Math.floor(n / 1e5); n %= 1e5;
  const th = Math.floor(n / 1e3); n %= 1e3;
  if (cr) parts.push(`${cr >= 100 ? three(cr) : two(cr)} Crore`);
  if (lk) parts.push(`${two(lk)} Lakh`);
  if (th) parts.push(`${two(th)} Thousand`);
  if (n) parts.push(three(n));
  return `Rupees ${parts.join(' ') || 'Zero'}${p ? ` and ${two(p)} Paise` : ''} Only`;
}
