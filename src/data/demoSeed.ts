// Sample data so the app is explorable before Supabase is connected. Never written to Supabase.
import type { Db } from './types';

const iso = (monthsAgo: number, day: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(Math.min(day, 28));
  return d.toISOString().slice(0, 10);
};
const L = (rupees: number) => rupees * 100;
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

export function demoDb(): Db {
  const A = 'p-a', B = 'p-b';
  const c = ['c-1', 'c-2', 'c-3', 'c-4', 'c-5'];
  const now = new Date().toISOString();
  return {
    settings: {
      legal_name: 'Event Horizon',
      address: 'Studio address line\nCity, State PIN',
      email: 'hello@eventhorizon.example',
      phone: '+91 00000 00000',
      gstin: '',
      pan: '',
      bank_details: 'Account name: Event Horizon\nA/C: 0000 0000 0000\nIFSC: XXXX0000000',
      quote_terms: '50% advance on confirmation, balance on delivery.\nPrices are exclusive of taxes unless stated.\nQuote valid for 15 days.',
      default_tax_pct: 18,
      currency: 'INR',
    },
    partners: [
      { id: A, name: 'Partner A', share_pct: 50, active: true, sort: 0 },
      { id: B, name: 'Partner B', share_pct: 50, active: true, sort: 1 },
    ],
    clients: [
      { id: c[0], name: 'Northwind Studios', contact_name: 'R. Mehta', email: 'accounts@northwind.example', phone: '+91 98000 11111', gstin: '27ABCDE1234F1Z5', address: 'Lower Parel', city: 'Mumbai', status: 'active', notes: '', created_at: now },
      { id: c[1], name: 'Kestrel Foods', contact_name: 'A. Iyer', email: 'ops@kestrel.example', phone: '+91 98000 22222', gstin: '', address: 'Indiranagar', city: 'Bengaluru', status: 'active', notes: 'Retainer client', created_at: now },
      { id: c[2], name: 'Atlas Mobility', contact_name: 'S. Khan', email: 'hello@atlas.example', phone: '+91 98000 33333', gstin: '', address: 'Cyber City', city: 'Gurugram', status: 'active', notes: '', created_at: now },
      { id: c[3], name: 'Lumen Retail', contact_name: 'P. Das', email: 'p.das@lumen.example', phone: '+91 98000 44444', gstin: '', address: 'Salt Lake', city: 'Kolkata', status: 'lead', notes: 'Pitch in progress', created_at: now },
      { id: c[4], name: 'Orbit Labs', contact_name: 'V. Rao', email: 'v@orbit.example', phone: '+91 98000 55555', gstin: '', address: 'HITEC City', city: 'Hyderabad', status: 'paused', notes: '', created_at: now },
    ],
    catalog: [
      { id: 'k-1', name: 'Strategy & planning', description: 'Discovery workshop, brief and roadmap', unit: 'project', rate: L(45000), active: true },
      { id: 'k-2', name: 'Design', description: 'Concepts, two revision rounds, final files', unit: 'project', rate: L(60000), active: true },
      { id: 'k-3', name: 'Production', description: 'Execution and on-ground management', unit: 'day', rate: L(25000), active: true },
      { id: 'k-4', name: 'Monthly retainer', description: 'Ongoing support, up to 40 hours', unit: 'month', rate: L(80000), active: true },
      { id: 'k-5', name: 'Consulting', description: 'Senior consultant time', unit: 'hour', rate: L(3500), active: true },
    ],
    quotes: [
      {
        id: 'q-1', number: `EH/Q/${iso(0, 1).slice(0, 4)}/0003`, client_id: c[3], client_snapshot: { name: 'Lumen Retail', contact_name: 'P. Das', city: 'Kolkata' },
        title: 'Store launch campaign', issue_date: iso(0, 4), valid_until: iso(-1, 4), status: 'sent',
        items: [{ name: 'Strategy & planning', description: 'Discovery workshop, brief and roadmap', qty: 1, unit: 'project', rate: L(45000) }, { name: 'Production', description: 'Launch day execution', qty: 3, unit: 'day', rate: L(25000) }],
        discount: L(5000), tax_pct: 18, subtotal: L(120000), tax_amount: L(20700), total: L(135700), notes: '', terms: '', created_at: now,
      },
      {
        id: 'q-2', number: `EH/Q/${iso(0, 1).slice(0, 4)}/0002`, client_id: c[2], client_snapshot: { name: 'Atlas Mobility', contact_name: 'S. Khan', city: 'Gurugram' },
        title: 'Brand refresh', issue_date: iso(1, 12), valid_until: iso(0, 12), status: 'accepted',
        items: [{ name: 'Design', description: 'Concepts, two revision rounds, final files', qty: 1, unit: 'project', rate: L(60000) }],
        discount: 0, tax_pct: 18, subtotal: L(60000), tax_amount: L(10800), total: L(70800), notes: '', terms: '', created_at: now,
      },
    ],
    payments: [
      { id: 'm-1', client_id: c[0], quote_id: null, amount: L(180000), received_by: A, split: [], method: 'bank', reference: 'NEFT 81122', received_on: iso(5, 8), note: '' },
      { id: 'm-2', client_id: c[1], quote_id: null, amount: L(80000), received_by: B, split: [], method: 'upi', reference: '', received_on: iso(4, 3), note: 'Retainer' },
      { id: 'm-3', client_id: c[1], quote_id: null, amount: L(80000), received_by: B, split: [], method: 'upi', reference: '', received_on: iso(3, 3), note: 'Retainer' },
      { id: 'm-4', client_id: c[0], quote_id: null, amount: L(240000), received_by: A, split: [], method: 'bank', reference: 'NEFT 90310', received_on: iso(2, 17), note: '' },
      { id: 'm-5', client_id: c[1], quote_id: null, amount: L(80000), received_by: B, split: [], method: 'upi', reference: '', received_on: iso(2, 3), note: 'Retainer' },
      { id: 'm-6', client_id: c[2], quote_id: 'q-2', amount: L(35400), received_by: A, split: [], method: 'bank', reference: 'Advance', received_on: iso(1, 14), note: '50% advance' },
      { id: 'm-7', client_id: c[1], quote_id: null, amount: L(80000), received_by: B, split: [], method: 'upi', reference: '', received_on: iso(1, 3), note: 'Retainer' },
      { id: 'm-8', client_id: c[0], quote_id: null, amount: L(150000), received_by: A, split: [], method: 'cheque', reference: 'CHQ 0045', received_on: iso(0, 6), note: '' },
    ],
    ledger: [
      { id: 'l-1', kind: 'investment', payer_id: A, amount: L(100000), among: [A, B], category: 'Capital', client_id: null, note: 'Initial capital', entry_date: iso(5, 1) },
      { id: 'l-2', kind: 'investment', payer_id: B, amount: L(100000), among: [A, B], category: 'Capital', client_id: null, note: 'Initial capital', entry_date: iso(5, 1) },
      { id: 'l-3', kind: 'cost', payer_id: A, amount: L(42000), among: [A, B], category: 'Equipment', client_id: null, note: 'Laptop', entry_date: iso(5, 12) },
      { id: 'l-4', kind: 'cost', payer_id: B, amount: L(18000), among: [A, B], category: 'Software', client_id: null, note: 'Annual software licences', entry_date: iso(4, 9) },
      { id: 'l-5', kind: 'cost', payer_id: A, amount: L(65000), among: [A, B], category: 'Freelancers', client_id: c[0], note: 'Freelance crew', entry_date: iso(2, 20) },
      { id: 'l-6', kind: 'cost', payer_id: B, amount: L(12000), among: [A, B], category: 'Travel', client_id: c[2], note: 'Site visit', entry_date: iso(1, 16) },
      { id: 'l-7', kind: 'cost', payer_id: A, amount: L(9000), among: [A, B], category: 'Office', client_id: null, note: 'Co-working', entry_date: iso(0, 2) },
      { id: 'l-8', kind: 'payment', payer_id: A, amount: L(60000), among: [B], category: '', client_id: null, note: 'Settle-up', entry_date: iso(3, 28) },
    ],
    dues: [
      { id: 'd-1', client_id: c[2], project_id: 'pr-1', amount: L(35400), due_date: day(8), note: 'Balance 50% on handover', status: 'due', payment_id: null, created_at: now },
      { id: 'd-2', client_id: c[1], project_id: null, amount: L(80000), due_date: day(-2), note: 'November retainer', status: 'due', payment_id: null, created_at: now },
    ],
    people: [
      { id: 'demo', email: 'you@eventhorizon.local', full_name: 'Demo owner', role: 'owner', partner_id: A },
      { id: 'u-2', email: 'ops@eventhorizon.local', full_name: 'Riya Sen', role: 'sales', partner_id: null },
    ],
    projects: [
      { id: 'pr-1', name: 'Atlas brand refresh', client_id: c[2], status: 'active', start_date: day(-24), due_date: day(20), description: 'Identity refresh, guidelines and launch kit.', lead_id: 'demo', created_at: now },
      { id: 'pr-2', name: 'Kestrel monthly retainer', client_id: c[1], status: 'active', start_date: day(-60), due_date: day(40), description: 'Ongoing content + social.', lead_id: 'u-2', created_at: now },
      { id: 'pr-3', name: 'Lumen store launch', client_id: c[3], status: 'planning', start_date: day(6), due_date: day(48), description: 'Pending quote approval.', lead_id: 'demo', created_at: now },
    ],
    milestones: [
      { id: 'ms-1', project_id: 'pr-1', kind: 'milestone', title: 'Discovery workshop', due_date: day(-20), done: true, done_on: day(-20) },
      { id: 'ms-2', project_id: 'pr-1', kind: 'deliverable', title: 'Three logo routes', due_date: day(-6), done: true, done_on: day(-7) },
      { id: 'ms-3', project_id: 'pr-1', kind: 'deliverable', title: 'Final identity + guidelines PDF', due_date: day(8), done: false, done_on: null },
      { id: 'ms-4', project_id: 'pr-1', kind: 'milestone', title: 'Launch kit handover', due_date: day(20), done: false, done_on: null },
      { id: 'ms-5', project_id: 'pr-2', kind: 'deliverable', title: 'November content calendar', due_date: day(-3), done: false, done_on: null },
      { id: 'ms-6', project_id: 'pr-2', kind: 'deliverable', title: 'December content calendar', due_date: day(25), done: false, done_on: null },
      { id: 'ms-7', project_id: 'pr-3', kind: 'milestone', title: 'Quote signed', due_date: day(5), done: false, done_on: null },
    ],
    tasks: [
      { id: 't-1', title: 'Check bank + log any client receipts', notes: '', project_id: null, assignee_id: 'demo', due_date: day(-30), priority: 'normal', repeat: 'daily', done: false, done_on: null, created_at: now },
      { id: 't-2', title: 'Team stand-up', notes: '10:30, 15 minutes', project_id: null, assignee_id: null, due_date: day(-30), priority: 'normal', repeat: 'weekdays', done: false, done_on: null, created_at: now },
      { id: 't-3', title: 'Send weekly status to Atlas', notes: '', project_id: 'pr-1', assignee_id: 'demo', due_date: day(-14), priority: 'high', repeat: 'weekly', done: false, done_on: null, created_at: now },
      { id: 't-4', title: 'Follow up Lumen on quote', notes: '', project_id: 'pr-3', assignee_id: 'u-2', due_date: day(-1), priority: 'high', repeat: 'none', done: false, done_on: null, created_at: now },
      { id: 't-5', title: 'Export guideline PDF', notes: '', project_id: 'pr-1', assignee_id: 'demo', due_date: day(3), priority: 'normal', repeat: 'none', done: false, done_on: null, created_at: now },
      { id: 't-6', title: 'Renew domain', notes: '', project_id: null, assignee_id: null, due_date: null, priority: 'low', repeat: 'none', done: false, done_on: null, created_at: now },
      { id: 't-7', title: 'Share logo routes', notes: '', project_id: 'pr-1', assignee_id: 'demo', due_date: day(-7), priority: 'normal', repeat: 'none', done: true, done_on: day(-7), created_at: now },
    ],
    bugs: [
      { id: 'b-1', title: 'Guidelines PDF: fonts missing on export', description: 'Body copy falls back to Arial in the exported PDF.', project_id: 'pr-1', severity: 'high', status: 'open', assignee_id: 'demo', created_at: now, resolved_on: null },
      { id: 'b-2', title: 'Kestrel landing page form not sending', description: 'Contact form returns 500.', project_id: 'pr-2', severity: 'critical', status: 'in_progress', assignee_id: 'u-2', created_at: now, resolved_on: null },
      { id: 'b-3', title: 'Typo on About section', description: '', project_id: 'pr-2', severity: 'low', status: 'fixed', assignee_id: null, created_at: now, resolved_on: day(-2) },
    ],
  };
}
