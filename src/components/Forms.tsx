import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Client, ClientDue, ClientPayment, LedgerEntry, LedgerKind, PayMethod, SplitPart } from '../data/types';
import { useMutate, useStore } from '../data/store';
import { defaultSplit } from '../lib/finance';
import { allocate, inr, parseInr, toRupeeInput } from '../lib/money';
import { Field, MoneyInput, Seg, Sheet, today } from './Sheet';
import { Icon } from './Icon';

// ---------------------------------------------------------------- Money in
export function PaymentSheet({ open, onClose, edit, presetClient, presetAmount, presetNote, presetQuote, onSaved, onDelete }: {
  open: boolean; onClose: () => void; edit?: ClientPayment | null; presetClient?: string; presetAmount?: number; presetNote?: string; presetQuote?: string;
  onSaved?: (p: ClientPayment) => void | Promise<void>; onDelete?: () => void;
}) {
  const { db, repo, profile, can } = useStore();
  const nav = useNavigate();
  const mutate = useMutate();
  const partners = useMemo(() => (db?.partners ?? []).filter((p) => p.active), [db]);
  const [amount, setAmount] = useState('');
  const [clientId, setClientId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [method, setMethod] = useState<PayMethod>('bank');
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [split, setSplit] = useState<SplitPart[]>([]);
  const [custom, setCustom] = useState(false);
  const [settled, setSettled] = useState(false);
  const [busy, setBusy] = useState(false);

  // Initialise only when the sheet opens — not on every background refresh, which would wipe what's typed.
  const live = useRef({ db, partners, profile }); live.current = { db, partners, profile };
  useEffect(() => {
    const { db, partners, profile } = live.current;
    if (!open || !db) return;
    setAmount(edit ? toRupeeInput(edit.amount) : presetAmount ? toRupeeInput(presetAmount) : '');
    setSettled(false);
    setClientId(edit?.client_id ?? presetClient ?? '');
    setQuoteId(edit?.quote_id ?? presetQuote ?? '');
    setReceivedBy(edit?.received_by ?? profile?.partner_id ?? partners[0]?.id ?? '');
    setMethod(edit?.method ?? 'bank');
    setDate(edit?.received_on ?? today());
    setReference(edit?.reference ?? '');
    setNote(edit?.note ?? presetNote ?? '');
    const s = edit?.split?.length ? edit.split : defaultSplit(db.partners);
    setSplit(s);
    setCustom(!!edit?.split?.length);
  }, [open, edit, presetClient, presetAmount, presetNote, presetQuote]);
  // partners created from inside the sheet (first run): fill in the defaults
  useEffect(() => {
    if (!open || !db || !partners.length) return;
    if (!split.length) setSplit(defaultSplit(db.partners));
    if (!receivedBy || !partners.some((p) => p.id === receivedBy)) setReceivedBy(profile?.partner_id ?? partners[0].id);
  }, [open, db, partners, split.length, receivedBy, profile?.partner_id]);

  const paise = parseInr(amount);
  const pctSum = split.reduce((a, s) => a + (Number(s.pct) || 0), 0);
  const parts = allocate(Number.isFinite(paise) ? paise : 0, split.map((s) => s.pct));
  const clientQuotes = (db?.quotes ?? []).filter((q) => q.client_id === clientId && q.status !== 'rejected');
  const ok = Number.isFinite(paise) && paise > 0 && receivedBy && Math.abs(pctSum - 100) < 0.01;

  const save = async () => {
    if (!repo || !ok) return;
    setBusy(true);
    const row = {
      amount: paise, client_id: clientId || null, quote_id: quoteId || null, received_by: receivedBy, method,
      received_on: date, reference: reference.trim(), note: note.trim(), split: custom ? split : [],
    };
    const clientName = db?.clients.find((c) => c.id === clientId)?.name ?? 'client';
    const r = await mutate<ClientPayment | undefined>(async () => {
      if (edit) { await repo.update('client_payments', edit.id, row); return { ...edit, ...row }; }
      const pay = await repo.insert<ClientPayment>('client_payments', row);
      // "Already split": the receiver has handed each partner their share, so log those
      // hand-overs as settle-ups. The receipt still counts as income; nobody owes anything for it.
      if (settled) {
        for (let i = 0; i < split.length; i++) {
          const to = split[i].partner_id, share = parts[i] ?? 0;
          if (to === receivedBy || share <= 0) continue;
          await repo.insert('ledger_entries', { kind: 'payment', payer_id: receivedBy, amount: share, among: [to], category: '', client_id: clientId || null, note: `Split of ${clientName} receipt`, entry_date: date });
        }
      }
      return pay;
    }, edit ? 'Receipt updated' : settled ? 'Receipt recorded · already split' : 'Receipt recorded');
    if (r) await onSaved?.(r);
    setBusy(false);
    if (r !== undefined) onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit receipt' : 'Money in'}>
      {partners.length === 0 ? <PartnerSetup /> : (
      <div className="form">
        <MoneyInput big value={amount} onChange={setAmount} autoFocus={!edit} />
        <Field label="Client">
          <select className="select" value={clientId} onChange={(e) => { setClientId(e.target.value); setQuoteId(''); }}>
            <option value="">— No client —</option>
            {(db?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {clientQuotes.length > 0 && (
          <Field label="Against quote (optional)">
            <select className="select" value={quoteId} onChange={(e) => setQuoteId(e.target.value)}>
              <option value="">—</option>
              {clientQuotes.map((q) => <option key={q.id} value={q.id}>{q.number} · {q.title || (q.kind === 'invoice' ? 'Invoice' : 'Quote')} · {inr(q.total)}</option>)}
            </select>
          </Field>
        )}
        <Field label="Landed with" hint="Whose account received it. They’ll owe the others their share.">
          <Seg value={receivedBy} onChange={setReceivedBy} options={partners.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <div className="form-2">
          <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Method">
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
              {(['bank', 'upi', 'cash', 'cheque', 'card', 'other'] as PayMethod[]).map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Reference"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." /></Field>

        <div className="card" style={{ padding: 14 }}>
          <div className="between">
            <span className="eyebrow">Distribution</span>
            <button type="button" className="btn quiet sm" onClick={() => { if (custom && db) setSplit(defaultSplit(db.partners)); setCustom(!custom); }}>
              {custom ? 'Use default' : 'Custom split'}
            </button>
          </div>
          <div className="stack" style={{ marginTop: 10, gap: 8 }}>
            {split.map((s, i) => {
              const p = db?.partners.find((x) => x.id === s.partner_id);
              return (
                <div key={s.partner_id} className="between">
                  <span>{p?.name ?? '—'}</span>
                  <span className="row">
                    {custom ? (
                      <input className="input num" style={{ width: 80, minHeight: 38, padding: '6px 10px' }} inputMode="decimal" value={String(s.pct)}
                        onChange={(e) => setSplit(split.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 } : x)))} />
                    ) : <span className="num muted">{Math.round(s.pct * 100) / 100}%</span>}
                    <b className="num" style={{ minWidth: 96, textAlign: 'right' }}>{inr(parts[i] ?? 0)}</b>
                  </span>
                </div>
              );
            })}
            {Math.abs(pctSum - 100) >= 0.01 && <small className="hint">Shares add up to {pctSum}% — must be 100%.</small>}
          </div>
        </div>
        {!edit && partners.length > 1 && (
          <button type="button" className="toggle-row" onClick={() => setSettled(!settled)} aria-pressed={settled}>
            <span className={`check${settled ? ' on' : ''}`}><Icon name="check" /></span>
            <span><b>Already split between us</b><small>{settled
              ? `${partners.find((p) => p.id === receivedBy)?.name ?? 'They'} already handed over the shares, so nobody owes anything for this receipt.`
              : 'Tick this if the money has already been shared out.'}</small></span>
          </button>
        )}
        <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Advance, final, retainer…" /></Field>
        <button className="btn block" disabled={!ok || busy} onClick={save}>{busy ? 'Saving…' : edit ? 'Save changes' : 'Record receipt'}</button>
        {edit && !edit.quote_id && can('quotes.edit') && <button type="button" className="btn ghost block" onClick={() => { onClose(); nav(`/quotes/new?kind=invoice&payment=${edit.id}`); }}><Icon name="quote" />Make an invoice for this</button>}
        {edit && onDelete && <button className="btn danger block" onClick={onDelete}>Delete receipt</button>}
        {!ok && !busy && paise > 0 && <small className="hint" style={{ textAlign: 'center' }}>{!receivedBy ? 'Pick whose account it landed in.' : 'Fix the split so it adds up to 100%.'}</small>}
      </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Costs / investments / settle-ups
export function LedgerSheet({ open, onClose, edit, presetKind = 'cost', presetSettle, onDelete }: {
  open: boolean; onClose: () => void; edit?: LedgerEntry | null; presetKind?: LedgerKind; presetSettle?: { from: string; to: string; amount: number } | null; onDelete?: () => void;
}) {
  const { db, repo, profile } = useStore();
  const mutate = useMutate();
  const partners = useMemo(() => (db?.partners ?? []).filter((p) => p.active), [db]);
  const [kind, setKind] = useState<LedgerKind>('cost');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState('');
  const [among, setAmong] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [clientId, setClientId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);

  const live = useRef({ partners, profile }); live.current = { partners, profile };
  useEffect(() => {
    const { partners, profile } = live.current;
    if (!open) return;
    setKind(edit?.kind ?? (presetSettle ? 'payment' : presetKind));
    setAmount(edit ? toRupeeInput(edit.amount) : presetSettle ? toRupeeInput(presetSettle.amount) : '');
    setPayer(edit?.payer_id ?? presetSettle?.from ?? profile?.partner_id ?? partners[0]?.id ?? '');
    setAmong(edit?.among ?? (presetSettle ? [presetSettle.to] : partners.map((p) => p.id)));
    setCategory(edit?.category ?? '');
    setClientId(edit?.client_id ?? '');
    setNote(edit?.note ?? (presetSettle ? 'Settle-up' : ''));
    setDate(edit?.entry_date ?? today());
  }, [open, edit, presetKind, presetSettle]);
  useEffect(() => {
    if (!open || !partners.length) return;
    if (!payer) setPayer(profile?.partner_id ?? partners[0].id);
    if (!among.length && kind !== 'payment') setAmong(partners.map((p) => p.id));
  }, [open, partners, payer, among.length, kind, profile?.partner_id]);

  const paise = parseInr(amount);
  const ok = Number.isFinite(paise) && paise > 0 && payer && among.length > 0;
  const categories = useMemo(() => Array.from(new Set(['Freelancers', 'Software', 'Travel', 'Equipment', 'Office', 'Marketing', 'Food', ...(db?.ledger ?? []).map((l) => l.category).filter(Boolean)])), [db]);

  const save = async () => {
    if (!repo || !ok) return;
    setBusy(true);
    const row = { kind, amount: paise, payer_id: payer, among, category: kind === 'payment' ? '' : category, client_id: clientId || null, note: note.trim(), entry_date: date };
    const r = await mutate<unknown>(() => (edit ? repo.update('ledger_entries', edit.id, row) : repo.insert('ledger_entries', row)), kind === 'payment' ? 'Settle-up logged' : 'Saved');
    setBusy(false);
    if (r !== undefined) onClose();
  };

  const toggle = (id: string) => setAmong(kind === 'payment' ? [id] : among.includes(id) ? among.filter((x) => x !== id) : [...among, id]);

  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit entry' : kind === 'payment' ? 'Settle up' : kind === 'investment' ? 'Investment' : 'Expense'}>
      {partners.length === 0 ? <PartnerSetup /> : (
      <div className="form">
        <Seg value={kind} onChange={(k) => { setKind(k); if (k === 'payment') setAmong(partners.filter((p) => p.id !== payer).slice(0, 1).map((p) => p.id)); else setAmong(partners.map((p) => p.id)); }}
          options={[{ value: 'cost', label: 'Expense' }, { value: 'investment', label: 'Investment' }, { value: 'payment', label: 'Settle-up' }]} />
        <MoneyInput big value={amount} onChange={setAmount} autoFocus={!edit && !presetSettle} />
        <Field label={kind === 'payment' ? 'Paid by' : 'Paid from pocket of'}>
          <Seg value={payer} onChange={setPayer} options={partners.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Field label={kind === 'payment' ? 'Paid to' : 'Split equally between'}>
          <div className="chips">
            {partners.map((p) => (
              <button type="button" key={p.id} className={`chip${among.includes(p.id) ? ' on' : ''}`} onClick={() => toggle(p.id)}
                disabled={kind === 'payment' && p.id === payer}>{p.name}</button>
            ))}
          </div>
        </Field>
        {kind !== 'payment' && (
          <div className="form-2">
            <Field label="Category">
              <input className="input" list="eh-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Software" />
              <datalist id="eh-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Client (optional)">
              <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">—</option>
                {(db?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        )}
        <div className="form-2">
          <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it?" /></Field>
        </div>
        <button className="btn block" disabled={!ok || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        {edit && onDelete && <button className="btn danger block" onClick={onDelete}>Delete entry</button>}
      </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- First-run: no partners yet
/** Money is always split between partners, so nothing can be recorded until they exist. */
export function PartnerSetup() {
  const { repo, can } = useStore();
  const mutate = useMutate();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  if (!can('partners.edit')) {
    return <div className="setup-box"><p>No partners are set up yet, so money can’t be split. Ask the owner to add the partners in Settings → Partners.</p></div>;
  }
  const create = async () => {
    if (!repo) return;
    setBusy(true);
    await mutate(async () => {
      await repo.insert('partners', { name: a.trim(), share_pct: 50, active: true, sort: 0 });
      await repo.insert('partners', { name: b.trim(), share_pct: 50, active: true, sort: 1 });
    }, 'Partners created — 50/50');
    setBusy(false);
  };
  return (
    <div className="setup-box">
      <span className="eyebrow">One-time setup</span>
      <p>Client money is split between the partners, and none are set up yet. Name both partners and they’ll share 50/50. You can change shares later in Settings.</p>
      <div className="form-2">
        <Field label="Partner 1"><input className="input" value={a} onChange={(e) => setA(e.target.value)} placeholder="e.g. Shubham" autoFocus /></Field>
        <Field label="Partner 2"><input className="input" value={b} onChange={(e) => setB(e.target.value)} placeholder="Name" /></Field>
      </div>
      <button className="btn block" disabled={!a.trim() || !b.trim() || busy} onClick={create}>{busy ? 'Creating…' : 'Create partners · 50/50'}</button>
    </div>
  );
}

// ---------------------------------------------------------------- Client
export function ClientSheet({ open, onClose, edit, onSaved }: { open: boolean; onClose: () => void; edit?: Client | null; onSaved?: (c: Client) => void }) {
  const { repo } = useStore();
  const mutate = useMutate();
  const blank = { name: '', contact_name: '', email: '', phone: '', gstin: '', address: '', city: '', status: 'active' as Client['status'], notes: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(edit ? { ...blank, ...edit } : blank); }, [open, edit]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!repo || !f.name.trim()) return;
    setBusy(true);
    const row = { name: f.name.trim(), contact_name: f.contact_name, email: f.email, phone: f.phone, gstin: f.gstin.toUpperCase(), address: f.address, city: f.city, status: f.status, notes: f.notes };
    const r = await mutate(async () => (edit ? (await repo.update('clients', edit.id, row), { ...edit, ...row }) : repo.insert<Client>('clients', row)), edit ? 'Client updated' : 'Client added');
    setBusy(false);
    if (r) { onSaved?.(r as Client); onClose(); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit client' : 'New client'}>
      <div className="form">
        <Field label="Company / client name"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <div className="form-2">
          <Field label="Contact person"><input className="input" value={f.contact_name} onChange={set('contact_name')} /></Field>
          <Field label="Status">
            <select className="select" value={f.status} onChange={set('status')}>
              <option value="lead">Lead</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option>
            </select>
          </Field>
        </div>
        <div className="form-2">
          <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        </div>
        <div className="form-2">
          <Field label="GSTIN"><input className="input num" value={f.gstin} onChange={set('gstin')} maxLength={15} /></Field>
          <Field label="City"><input className="input" value={f.city} onChange={set('city')} /></Field>
        </div>
        <Field label="Billing address"><textarea className="textarea" value={f.address} onChange={set('address')} /></Field>
        <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={set('notes')} /></Field>
        <button className="btn block" disabled={!f.name.trim() || busy} onClick={save}>{busy ? 'Saving…' : 'Save client'}</button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Money a client still owes
export function DueSheet({ open, onClose, edit, presetClient }: { open: boolean; onClose: () => void; edit?: ClientDue | null; presetClient?: string }) {
  const { db, repo, can } = useStore();
  const mutate = useMutate();
  const [amount, setAmount] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setAmount(edit ? toRupeeInput(edit.amount) : '');
    setClientId(edit?.client_id ?? presetClient ?? '');
    setProjectId(edit?.project_id ?? '');
    setDue(edit?.due_date ?? '');
    setNote(edit?.note ?? '');
  }, [open, edit, presetClient]);
  const paise = parseInr(amount);
  const ok = Number.isFinite(paise) && paise > 0 && !!clientId;
  const save = async () => {
    if (!repo || !ok) return;
    const row = { amount: paise, client_id: clientId, project_id: projectId || null, due_date: due || null, note: note.trim() };
    const r = await mutate<unknown>(() => (edit ? repo.update('client_dues', edit.id, row) : repo.insert('client_dues', { ...row, status: 'due', payment_id: null })), edit ? 'Updated' : 'Added to “to collect”');
    if (r !== undefined) onClose();
  };
  const projects = (db?.projects ?? []).filter((p) => !clientId || p.client_id === clientId);
  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Pending payment' : 'Client owes us'}>
      <div className="form">
        <MoneyInput big value={amount} onChange={setAmount} autoFocus={!edit} />
        <Field label="Client">
          <select className="select" value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(''); }}>
            <option value="">— Pick a client —</option>
            {(db?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="form-2">
          <Field label="Expected by"><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Project (optional)">
            <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">—</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="For what"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Website balance, final 50%…" /></Field>
        <p className="hint" style={{ margin: 0 }}>Not counted as earnings or split until it actually comes in. When it does, tap “Received” on it.</p>
        <button className="btn block" disabled={!ok} onClick={save}>{edit ? 'Save' : 'Add pending payment'}</button>
        {edit && can('money.delete') && <button className="btn danger block" onClick={async () => { if (repo && confirm('Remove this pending payment?')) { await mutate(() => repo.remove('client_dues', edit.id), 'Removed'); onClose(); } }}>Remove</button>}
      </div>
    </Sheet>
  );
}
