import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutate, useStore } from '../data/store';
import type { Client, DocKind, Quote, QuoteItem, QuoteStatus } from '../data/types';
import { quoteTotals } from '../lib/finance';
import { inr, inrShort, parseInr, toRupeeInput } from '../lib/money';
import { Icon } from '../components/Icon';
import { Empty, Field, MoneyInput, Seg, Sheet, fmtDate, today } from '../components/Sheet';
import { ClientSheet, PaymentSheet } from '../components/Forms';
import { PageHead } from '../components/AppShell';
import { buildQuotePdf, download, shareOrDownload, signersOf } from '../pdf/quotePdf';

const STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

export function Quotes() {
  const { db, can, toast } = useStore();
  const [status, setStatus] = useState<QuoteStatus | 'all'>('all');
  const [kind, setKind] = useState<DocKind | 'all'>('all');
  const [dl, setDl] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (db?.quotes ?? [])
      .filter((x) => status === 'all' || x.status === status)
      .filter((x) => kind === 'all' || (x.kind ?? 'quote') === kind)
      .filter((x) => !s || [x.number ?? '', x.title, x.client_snapshot?.name ?? ''].some((v) => v.toLowerCase().includes(s)))
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date) || (b.number ?? '').localeCompare(a.number ?? ''));
  }, [db, status, q, kind]);

  if (!db) return <div className="sk" style={{ height: 400 }} />;
  const sum = (st: QuoteStatus) => db.quotes.filter((x) => x.status === st).reduce((a, x) => a + x.total, 0);

  return (
    <>
      <PageHead eyebrow="Quotations & invoices" title={<>Quotes <em>& bills</em></>}>
        {can('quotes.edit') && <Link className="btn ghost" to="/quotes/new?kind=invoice"><Icon name="plus" />Invoice</Link>}
        {can('quotes.edit') && <Link className="btn" to="/quotes/new"><Icon name="plus" />Quote</Link>}
      </PageHead>
      <div className="grid grid-3" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="eyebrow">Awaiting reply</div><div className="v">{inrShort(sum('sent'))}</div></div>
        <div className="card stat"><div className="eyebrow">Won</div><div className="v">{inrShort(sum('accepted'))}</div></div>
        <div className="card stat"><div className="eyebrow">Unpaid invoices</div><div className="v">{inrShort(db.quotes.filter((x) => x.kind === 'invoice').reduce((a, x) => a + Math.max(0, x.total - (x.paid ?? 0)), 0))}</div></div>
      </div>
      <div className="search"><Icon name="search" /><input className="input" placeholder="Search number, client, project…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mt"><Seg value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'quote', label: 'Quotations' }, { value: 'invoice', label: 'Invoices' }]} /></div>
      <div className="chips mt">
        {(['all', ...STATUSES, 'paid'] as const).map((s) => <button key={s} className={`chip${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}
      </div>
      <section className="card mt">
        {rows.length === 0 ? <Empty icon="quote">No quotations yet.</Empty> : (
          <div className="list">
            {rows.map((x) => (
              <div className="li q-row" key={x.id}>
                <Link className="q-main" to={`/quotes/${x.id}`}>
                  <span className={`avatar${x.status === 'accepted' || x.status === 'paid' ? ' solid' : ''}`}><Icon name={x.kind === 'invoice' ? 'money' : 'quote'} /></span>
                  <div><div className="t">{x.client_snapshot?.name || 'No client'}{x.title ? ` — ${x.title}` : ''}</div><div className="s num">{x.kind === 'invoice' ? 'INVOICE' : 'QUOTE'} · {x.number} · {fmtDate(x.issue_date)}</div></div>
                  <div className="amt">{inr(x.total)}<small><span className={`tag${x.status === 'accepted' || x.status === 'paid' ? ' solid' : x.status === 'draft' ? ' dash' : ''}`} style={{ height: 18 }}>{x.status}</span></small></div>
                </Link>
                <button className="icon-btn" aria-label="Download PDF" disabled={dl === x.id}
                  onClick={async () => { setDl(x.id); try { await downloadPdf(x, db.settings, signersOf(db.partners)); } catch { toast('Could not build the PDF'); } setDl(null); }}>
                  <Icon name="download" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------- editor
interface Line { key: string; name: string; description: string; qty: string; unit: string; rate: string; more?: boolean }
const toLine = (it: QuoteItem): Line => ({ key: crypto.randomUUID(), name: it.name, description: it.description, qty: String(it.qty), unit: it.unit, rate: toRupeeInput(it.rate), more: Number(it.qty) !== 1 || !!it.description });
const blankLine = (): Line => ({ key: crypto.randomUUID(), name: '', description: '', qty: '1', unit: 'unit', rate: '' });
const sigOf = (r: Pick<Quote, 'client_id' | 'title' | 'issue_date' | 'valid_until' | 'status' | 'items' | 'discount' | 'tax_pct' | 'notes' | 'terms' | 'kind' | 'paid' | 'show_names'>) =>
  JSON.stringify([r.client_id, r.title, r.issue_date, r.valid_until, r.status, r.items, r.discount, Number(r.tax_pct), r.notes, r.terms, r.kind ?? 'quote', Number(r.paid ?? 0), r.show_names !== false]);
const docName = (k: DocKind | undefined) => (k === 'invoice' ? 'invoice' : 'quote');

/** Build + download a saved quote/invoice (used by the list and by "download" on unsaved edits). */
async function downloadPdf(q: Quote, settings: Parameters<typeof buildQuotePdf>[1], signers: string[]) {
  const { blob, filename } = await buildQuotePdf(q, settings, signers);
  download(blob, filename);
}
const plusDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export function QuoteEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { db, repo, can, toast, refresh } = useStore();
  const mutate = useMutate();
  const nav = useNavigate();
  const existing = id ? db?.quotes.find((x) => x.id === id) : undefined;
  const readOnly = !can('quotes.edit');

  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [issue, setIssue] = useState(today());
  const [valid, setValid] = useState(plusDays(today(), 15));
  const [status, setStatus] = useState<QuoteStatus>('draft');
  const [kind, setKind] = useState<DocKind>('quote');
  const [paid, setPaid] = useState('');
  const [recording, setRecording] = useState(false);
  // the item amount is following "amount received" (invoice for money already in hand)
  const [linked, setLinked] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState('');
  const [showDisc, setShowDisc] = useState(false);
  const [tax, setTax] = useState('18');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [showNames, setShowNames] = useState(true);
  const [picker, setPicker] = useState(false);
  const [newClient, setNewClient] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // The PDF is built ahead of time, so tapping Share opens the phone's share sheet straight away.
  // (Phones refuse to open it if the tap was a few seconds ago, e.g. after saving + building.)
  const [ready, setReady] = useState<{ sig: string; blob: Blob; filename: string } | null>(null);
  const building = useRef<string | null>(null);

  // hydrate once per quote (don't clobber edits on realtime refresh)
  useEffect(() => {
    if (!db) return;
    const key = id ?? 'new';
    if (loadedFor === key) return;
    if (id && !existing) return;
    if (existing) {
      setClientId(existing.client_id ?? ''); setTitle(existing.title); setIssue(existing.issue_date); setValid(existing.valid_until ?? '');
      setStatus(existing.status); setLines(existing.items.map(toLine)); setDiscount(toRupeeInput(existing.discount));
      setKind(existing.kind ?? 'quote'); setShowNames(existing.show_names !== false); setPaid(existing.paid ? toRupeeInput(existing.paid) : '');
      setTax(String(existing.tax_pct)); setNotes(existing.notes); setTerms(existing.terms || (existing.kind === 'invoice' ? '' : db?.settings.quote_terms ?? ''));
    } else {
      const dup = params.get('from') ? db.quotes.find((x) => x.id === params.get('from')) : undefined;
      // "Make an invoice for this" from a receipt in Money: pre-fill and mark it paid
      const pay = params.get('payment') ? db.payments.find((x) => x.id === params.get('payment')) : undefined;
      const k: DocKind = params.get('kind') === 'invoice' ? 'invoice' : 'quote';
      setKind(k);
      setStatus(pay ? 'paid' : 'draft');
      setValid(k === 'invoice' ? today() : plusDays(today(), 15));
      setClientId(params.get('client') ?? pay?.client_id ?? dup?.client_id ?? '');
      setTitle(dup?.title ?? '');
      setLines(dup ? dup.items.map(toLine) : pay ? [{ ...blankLine(), name: pay.note || 'Payment received', rate: toRupeeInput(pay.amount) }] : [blankLine()]);
      setDiscount(dup ? toRupeeInput(dup.discount) : '');
      // the amount received already includes any tax, so an invoice made from a receipt starts at "No GST"
      setTax(pay ? '0' : String(dup?.tax_pct ?? db.settings.default_tax_pct));
      setPaid(pay ? toRupeeInput(pay.amount) : '');
      if (pay) setIssue(pay.received_on);
      setNotes(dup?.notes ?? '');
      setTerms(k === 'invoice' ? '' : db.settings.quote_terms);
    }
    setLoadedFor(key);
  }, [db, id, existing, params, loadedFor]);

  const items: QuoteItem[] = lines.map((l) => ({ name: l.name.trim() || title.trim() || 'Services', description: l.description.trim(), qty: Number(l.qty) || 0, unit: l.unit.trim() || 'unit', rate: Number.isFinite(parseInr(l.rate)) ? parseInr(l.rate) : 0 }));
  const disc = Number.isFinite(parseInr(discount)) ? parseInr(discount) : 0;
  const totals = quoteTotals(items, disc, Number(tax) || 0);
  const client = db?.clients.find((c) => c.id === clientId);
  const valid_ = lines.length > 0 && totals.subtotal > 0;
  const isInv = kind === 'invoice';
  const paidRaw = isInv && Number.isFinite(parseInr(paid)) ? parseInr(paid) : 0;
  const paidNum = Math.min(paidRaw, totals.total);
  const balance = Math.max(0, totals.total - paidNum);
  const recorded = existing ? (db?.payments ?? []).filter((p) => p.quote_id === existing.id).reduce((a, p) => a + p.amount, 0) : 0;


  const snapshot = (c?: Client): Quote['client_snapshot'] => c ? { name: c.name, contact_name: c.contact_name, email: c.email, phone: c.phone, gstin: c.gstin, address: c.address, city: c.city } : existing?.client_snapshot ?? {};

  const record = (): Omit<Quote, 'id' | 'created_at' | 'number'> => ({
    client_id: clientId || null, client_snapshot: snapshot(client), title: title.trim(), issue_date: issue, valid_until: valid || null, status,
    items, discount: disc, tax_pct: Number(tax) || 0, subtotal: totals.subtotal, tax_amount: totals.tax_amount, total: totals.total, notes: notes.trim(), terms: terms.trim(),
    kind, paid: paidNum, show_names: showNames,
  });

  const rec_ = record();
  const savedSig = existing ? sigOf({ ...existing, terms: (existing.terms || (existing.kind === 'invoice' ? '' : db?.settings.quote_terms ?? '')).trim(), notes: existing.notes.trim() }) : null;
  const dirty = !existing || sigOf(rec_) !== savedSig;
  const pdfSig = existing ? `${existing.id}|${existing.number}|${savedSig}|${JSON.stringify(existing.client_snapshot)}|${JSON.stringify(db?.settings)}` : '';
  const pdfReady = !!ready && ready.sig === pdfSig;
  const why = lines.length === 0 ? 'Add at least one item' : totals.subtotal === 0 ? 'Enter the amount for the item' : '';
  /** Buttons never silently do nothing: say what's missing and point at it. */
  const guard = (fn: () => unknown) => () => {
    if (why) { toast(why); document.querySelector<HTMLInputElement>('.qline .money-input input')?.focus(); return; }
    fn();
  };

  const save = async (): Promise<Quote | undefined> => {
    if (!repo || !valid_) return;
    setBusy('save');
    const rec = record();
    const label = isInv ? 'Invoice' : 'Quote';
    const out = await mutate(async () => {
      try {
        if (existing) { await repo.update('quotes', existing.id, rec); return { ...existing, ...rec } as Quote; }
        const created = await repo.insert<Quote>('quotes', rec);
        const pid = params.get('payment');
        if (pid) await repo.update('client_payments', pid, { quote_id: created.id });
        return created;
      } catch (e0) {
        let e = e0;
        // database without the 005 update: save anyway, names just stay on
        if (/show_names/.test((e as { message?: string })?.message ?? '')) {
          if (rec.show_names === false) throw new Error('Hiding names needs one database step: run supabase/updates/005_signature_names.sql in Supabase.');
          const { show_names: _s, ...rest } = rec;
          try {
            if (existing) { await repo.update('quotes', existing.id, rest); return { ...existing, ...rest } as Quote; }
            return await repo.insert<Quote>('quotes', rest);
          } catch (e1) { e = e1; }
        }
        const m = (e as { message?: string })?.message ?? '';
        const notMigrated = /\b(kind|paid)\b/.test(m) || /quotes_status_check/.test(m);
        if (!notMigrated) throw e;
        if (isInv) throw new Error('Invoices need one more database step: run supabase/updates/004_invoices.sql in Supabase.');
        // plain quotes still save on a database that hasn't had the invoice update yet
        const { kind: _k, paid: _p, show_names: _n, ...old } = rec;
        if (existing) { await repo.update('quotes', existing.id, old); return { ...existing, ...old } as Quote; }
        return repo.insert<Quote>('quotes', old);
      }
    }, existing ? `${label} saved` : `${label} created`);
    setBusy(null);
    if (out && !existing) { setLoadedFor(out.id); nav(`/quotes/${out.id}`, { replace: true }); }
    return out;
  };

  const pdf = async (mode: 'share' | 'download' | 'preview') => {
    if (!existing || !ready || ready.sig !== pdfSig) { toast('Preparing the PDF — tap again in a second'); return; }
    const { blob, filename } = ready;
    if (mode === 'preview') { window.open(URL.createObjectURL(blob), '_blank'); return; }
    if (mode === 'download') { download(blob, filename); toast('PDF downloaded'); return; }
    const r = await shareOrDownload(blob, filename, `${isInv ? 'Invoice' : 'Quotation'} ${existing.number ?? ''}`);
    if (r === 'downloaded') toast('PDF downloaded');
    if (!readOnly && existing.status === 'draft' && repo) { await repo.update('quotes', existing.id, { status: 'sent' }); setStatus('sent'); refresh(); }
  };

  useEffect(() => {
    if (!existing || dirty || !db || building.current === pdfSig || (ready && ready.sig === pdfSig)) return;
    building.current = pdfSig;
    const sig = pdfSig;
    const t = setTimeout(() => {
      buildQuotePdf(existing, db.settings, signersOf(db.partners))
        .then(({ blob, filename }) => { if (building.current === sig) setReady({ sig, blob, filename }); })
        .catch((e) => { console.error(e); toast(`PDF failed: ${(e as Error)?.message ?? e}`); building.current = null; });
    }, 150);
    return () => { clearTimeout(t); if (building.current === sig) building.current = null; };
  }, [existing, dirty, pdfSig, db, ready, toast]);

  /** Download always works: unsaved changes are saved first. */
  const downloadNow = async () => {
    if (!dirty && pdfReady && ready) { download(ready.blob, ready.filename); toast('PDF downloaded'); return; }
    if (readOnly && existing && db) { setBusy('download'); await downloadPdf(existing, db.settings, signersOf(db.partners)).catch(() => toast('Could not build the PDF')); setBusy(null); return; }
    const q = await save();
    if (!q || !db) return;
    setBusy('download');
    try { await downloadPdf(q, db.settings, signersOf(db.partners)); toast('Saved · PDF downloaded'); } catch { toast('Could not build the PDF'); }
    setBusy(null);
  };

  if (!db) return <div className="sk" style={{ height: 400 }} />;
  if (id && !existing) return <Empty icon="quote">Quote not found. <Link to="/quotes" className="muted">Back</Link></Empty>;

  const setLine = (k: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const remove = async () => {
    if (!repo || !existing || !confirm(`Delete this ${docName(kind)}?`)) return;
    await mutate(() => repo.remove('quotes', existing.id), isInv ? 'Invoice deleted' : 'Quote deleted');
    nav('/quotes');
  };

  return (
    <>
      <Link to="/quotes" className="btn quiet sm" style={{ marginLeft: -10 }}><Icon name="back" />Quotes</Link>
      <PageHead eyebrow={existing?.number ?? (isInv ? 'New invoice' : 'New quotation')} title={<>{existing ? 'Edit' : 'New'} <em>{isInv ? 'invoice' : 'quote'}</em></>}>
        {existing && <button className="btn ghost sm" onClick={() => pdf('preview')} disabled={!pdfReady || dirty}><Icon name="eye" />Preview</button>}
        {existing && !isInv && can('quotes.edit') && <Link className="btn ghost sm" to={`/quotes/new?from=${existing.id}&kind=invoice`}><Icon name="quote" />Make invoice</Link>}
        {existing && can('quotes.edit') && <Link className="btn ghost sm" to={`/quotes/new?from=${existing.id}&kind=${kind}`}><Icon name="copy" />Duplicate</Link>}
      </PageHead>
      {!existing && !readOnly && (
        <div style={{ marginBottom: 14 }}>
          <Seg value={kind} onChange={(k) => { setKind(k); setStatus('draft'); setTerms(k === 'invoice' ? '' : db.settings.quote_terms); setValid(k === 'invoice' ? today() : plusDays(today(), 15)); }}
            options={[{ value: 'quote', label: 'Quotation · price offer' }, { value: 'invoice', label: 'Invoice · bill' }]} />
        </div>
      )}

      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="grid grid-dash">
          <div className="stack">
            <section className="card form">
              <div className="between"><span className="eyebrow">Client</span>
                <button type="button" className="btn quiet sm" onClick={() => setNewClient(true)}><Icon name="plus" />New</button></div>
              <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— Select client —</option>
                {db.clients.filter((c) => c.status !== 'archived').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {client && <div className="hint">{[client.contact_name, client.city, client.gstin && `GSTIN ${client.gstin}`].filter(Boolean).join(' · ')}</div>}
              <Field label="Project / title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Annual offsite 2026" /></Field>
              <div className="form-2">
                <Field label="Issue date"><input className="input" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
                <Field label={isInv ? 'Payment due' : 'Valid until'}><input className="input" type="date" value={valid} onChange={(e) => setValid(e.target.value)} /></Field>
              </div>
            </section>

            <section className="card">
              <div className="card-head"><h2>What you’re charging for</h2><span className="eyebrow">{lines.length} item{lines.length === 1 ? '' : 's'}</span></div>
              <div className="stack">
                {lines.map((l, i) => {
                  const qty = Number(l.qty) || 0;
                  const lineTotal = Math.round(qty * (Number.isFinite(parseInr(l.rate)) ? parseInr(l.rate) : 0));
                  return (
                    <div className="qline" key={l.key}>
                      <div className="qline-main">
                        <Field label={lines.length > 1 ? `Item ${i + 1}` : 'Item'}>
                          <input className="input" value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} placeholder={title.trim() || "e.g. Website design"} />
                        </Field>
                        <Field label={qty === 1 ? 'Amount' : `Rate per ${l.unit || 'unit'}`}>
                          <MoneyInput value={l.rate} onChange={(v) => { setLinked(false); setLine(l.key, { rate: v }); }} />
                        </Field>
                      </div>
                      {l.more && (
                        <div className="stack" style={{ gap: 10 }}>
                          <input className="input" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Details printed under the item (optional)" />
                          <div className="form-2">
                            <Field label="Quantity"><input className="input num" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/[^d.]/g, '') })} /></Field>
                            <Field label="Unit"><input className="input" value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} placeholder="day / hour / page" /></Field>
                          </div>
                        </div>
                      )}
                      <div className="between">
                        <button type="button" className="btn quiet sm" style={{ marginLeft: -10 }} onClick={() => setLine(l.key, { more: !l.more })}>{l.more ? 'Hide details' : '+ Details or quantity'}</button>
                        <span className="row">
                          {qty !== 1 && <b className="num">{inr(lineTotal)}</b>}
                          {lines.length > 1 && <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Remove item"><Icon name="trash" size={15} /></button>}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="form-2">
                  <button type="button" className="btn ghost" onClick={() => setLines([...lines, blankLine()])}><Icon name="plus" />Add item</button>
                  <button type="button" className="btn ghost" onClick={() => setPicker(true)}><Icon name="layers" />From catalogue</button>
                </div>
              </div>
            </section>
          </div>

          <div className="stack">
            <section className="card form">
              <span className="eyebrow">Tax & total</span>
              <Field label="GST">
                <Seg value={tax} onChange={setTax} options={['0', '5', '12', '18', '28'].map((t) => ({ value: t, label: t === '0' ? 'No GST' : `${t}%` }))} />
              </Field>
              {showDisc || disc > 0 ? (
                <Field label="Discount (₹ off the total, before GST)" hint={disc > totals.subtotal ? 'The discount is bigger than the items — check the amount.' : undefined}>
                  <MoneyInput value={discount} onChange={setDiscount} />
                </Field>
              ) : (
                <button type="button" className="btn quiet sm" style={{ justifySelf: 'start', marginLeft: -10 }} onClick={() => setShowDisc(true)}>+ Give a discount</button>
              )}
              <div className="stack num" style={{ gap: 6, fontSize: 13.5 }}>
                <div className="between"><span className="muted">Items</span><span>{inr(totals.subtotal)}</span></div>
                {disc > 0 && <div className="between"><span className="muted">Discount</span><span>−{inr(disc)}</span></div>}
                {Number(tax) > 0 && <div className="between"><span className="muted">GST {tax}%</span><span>{inr(totals.tax_amount)}</span></div>}
                <div className="between" style={{ borderTop: '1px solid var(--line)', paddingTop: 8, fontSize: 16 }}><b>Total</b><b>{inr(totals.total)}</b></div>
                {isInv && <div className="between"><span className="muted">Received</span><span>−{inr(paidNum)}</span></div>}
                {isInv && <div className="between" style={{ fontSize: 15 }}><b>Balance due</b><b>{balance === 0 && totals.total > 0 ? 'PAID' : inr(balance)}</b></div>}
              </div>
              {isInv && (
                <Field label="Amount received from client"
                  hint={paidRaw > totals.total && totals.total > 0 ? `That’s more than the invoice total (${inr(totals.total)}) — check the amounts.` : 'Printed on the invoice. Fully received prints a PAID mark.'}>
                  <div className="row">
                    <div style={{ flex: 1, minWidth: 0 }}><MoneyInput value={paid} onChange={(v) => {
                      setPaid(v);
                      const n = parseInr(v);
                      if (!Number.isFinite(n) || n <= 0) return;
                      // invoice for money already received: nothing entered above yet, so this IS the amount (tax included)
                      if (linked || (totals.subtotal === 0 && lines.length === 1)) { setLines([{ ...lines[0], rate: v }]); setTax('0'); setStatus('paid'); setLinked(true); return; }
                      if (n >= totals.total && totals.total > 0) setStatus('paid');
                    }} /></div>
                    <button type="button" className="btn ghost sm" onClick={() => { if (!totals.total) { toast('Enter the item amount first'); return; } setPaid(toRupeeInput(totals.total)); setStatus('paid'); }}>Fully paid</button>
                  </div>
                </Field>
              )}
              {isInv && existing && !dirty && paidNum > recorded && can('money.edit') && (
                <div className="setup-box">
                  <p>{inr(paidNum - recorded)} received on this invoice isn’t in <b>Money</b> yet, so it isn’t counted or split.</p>
                  <button type="button" className="btn sm" onClick={() => setRecording(true)}><Icon name="in" />Record it in Money</button>
                </div>
              )}
            </section>
            <section className="card form">
              <Field label="Status"><Seg value={status} onChange={setStatus} options={(isInv ? (['draft', 'sent', 'paid'] as QuoteStatus[]) : STATUSES.slice(0, 4)).map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} /></Field>
              <Field label="Notes (printed)"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope, inclusions, timelines…" /></Field>
              <Field label="Terms"><textarea className="textarea" value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
              <button type="button" className="toggle-row" onClick={() => setShowNames(!showNames)} aria-pressed={showNames}>
                <span className={`check${showNames ? ' on' : ''}`}><Icon name="check" /></span>
                <span><b>Names under signatures</b><small>{showNames ? 'Partner names are printed under the signatures.' : 'Only the signatures are printed, no names.'}</small></span>
              </button>
              {existing && can('money.delete') && <button type="button" className="btn danger sm" onClick={remove}><Icon name="trash" />Delete quote</button>}
            </section>
          </div>
        </div>
      </fieldset>

      <div className="qtotal-bar">
        <div><div className="eyebrow" style={{ color: 'inherit', opacity: why ? 1 : 0.55, fontWeight: why ? 700 : undefined }}>{why || (dirty && !readOnly ? 'Unsaved changes' : isInv && balance === 0 && totals.total > 0 ? 'Paid in full' : isInv ? `Balance due ${inr(balance)}` : Number(tax) > 0 ? 'Total incl. GST' : 'Total')}</div><div className="serif">{inr(totals.total)}</div></div>
        <div className="row">
          {!readOnly && dirty ? (
            <button className="btn sm" disabled={!!busy} onClick={guard(save)}><Icon name="check" />{busy === 'save' ? 'Saving…' : existing ? 'Save' : `Save ${docName(kind)}`}</button>
          ) : (
            <button className="btn sm" disabled={!pdfReady} onClick={() => pdf('share')}><Icon name="share" />{pdfReady ? 'Share' : 'Preparing…'}</button>
          )}
          <button className="btn sm" disabled={!!busy} onClick={guard(downloadNow)} aria-label="Download PDF"><Icon name="download" />{busy === 'download' ? '…' : 'PDF'}</button>
        </div>
      </div>

      <Sheet open={picker} title="Catalogue" onClose={() => setPicker(false)}>
        <div className="catalog-pick">
          {db.catalog.filter((c) => c.active).length === 0 && <Empty icon="layers">Catalogue is empty. Add items in Settings.</Empty>}
          {db.catalog.filter((c) => c.active).map((c) => (
            <button key={c.id} className="li" onClick={() => { setLines([...lines, toLine({ name: c.name, description: c.description, qty: 1, unit: c.unit, rate: c.rate })]); setPicker(false); }}>
              <span className="avatar"><Icon name="plus" /></span>
              <div><div className="t">{c.name}</div><div className="s">{c.description}</div></div>
              <div className="amt">{inr(c.rate)}<small>per {c.unit}</small></div>
            </button>
          ))}
        </div>
      </Sheet>
      <ClientSheet open={newClient} onClose={() => setNewClient(false)} onSaved={(c) => setClientId(c.id)} />
      {existing && <PaymentSheet open={recording} onClose={() => setRecording(false)} presetClient={existing.client_id ?? undefined} presetAmount={paidNum - recorded} presetQuote={existing.id} presetNote={existing.number ?? ''} />}
    </>
  );
}
