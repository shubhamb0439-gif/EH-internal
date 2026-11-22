import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutate, useStore } from '../data/store';
import type { ClientStatus } from '../data/types';
import { inr, inrShort } from '../lib/money';
import { Icon } from '../components/Icon';
import { Empty, fmtDate, fmtDay, initials } from '../components/Sheet';
import { ClientSheet, PaymentSheet } from '../components/Forms';
import { PageHead, useQuick } from '../components/AppShell';

export function Clients() {
  const { db, can } = useStore();
  const quick = useQuick();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'all'>('all');

  const rows = useMemo(() => {
    if (!db) return [];
    const s = q.trim().toLowerCase();
    return db.clients
      .filter((c) => (status === 'all' ? c.status !== 'archived' : c.status === status))
      .filter((c) => !s || [c.name, c.contact_name, c.city, c.email, c.phone].some((x) => x.toLowerCase().includes(s)))
      .map((c) => ({
        c,
        billed: db.payments.filter((p) => p.client_id === c.id).reduce((a, p) => a + p.amount, 0),
        open: db.quotes.filter((x) => x.client_id === c.id && x.status === 'sent').length,
      }))
      .sort((a, b) => b.billed - a.billed || a.c.name.localeCompare(b.c.name));
  }, [db, q, status]);

  if (!db) return <div className="sk" style={{ height: 400 }} />;

  return (
    <>
      <PageHead eyebrow={`${db.clients.length} on the book`} title={<>Clients</>}>
        {can('clients.edit') && <button className="btn" onClick={() => quick('client')}><Icon name="plus" />New client</button>}
      </PageHead>
      <div className="search"><Icon name="search" /><input className="input" placeholder="Search name, city, contact…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="chips mt">
        {(['all', 'active', 'lead', 'paused', 'archived'] as const).map((s) => (
          <button key={s} className={`chip${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>{s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>
      <section className="card mt">
        {rows.length === 0 ? <Empty icon="clients">No clients match.</Empty> : (
          <div className="list">
            {rows.map(({ c, billed, open }) => (
              <Link className="li" key={c.id} to={`/clients/${c.id}`}>
                <span className={`avatar${c.status === 'active' ? ' solid' : ''}`}>{initials(c.name)}</span>
                <div>
                  <div className="t">{c.name}</div>
                  <div className="s">{[c.contact_name, c.city].filter(Boolean).join(' · ') || '—'}{open ? ` · ${open} open quote${open > 1 ? 's' : ''}` : ''}</div>
                </div>
                <div className="amt">{billed ? inrShort(billed) : <span className="tag">{c.status}</span>}<small>{billed ? 'received' : ''}</small></div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function ClientDetail() {
  const { id } = useParams();
  const { db, can, repo } = useStore();
  const mutate = useMutate();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const c = db?.clients.find((x) => x.id === id);

  const data = useMemo(() => {
    if (!db || !c) return null;
    const payments = db.payments.filter((p) => p.client_id === c.id).sort((a, b) => b.received_on.localeCompare(a.received_on));
    const quotes = db.quotes.filter((q) => q.client_id === c.id);
    const costs = db.ledger.filter((l) => l.client_id === c.id && l.kind === 'cost').reduce((a, l) => a + l.amount, 0);
    const received = payments.reduce((a, p) => a + p.amount, 0);
    const accepted = quotes.filter((q) => q.status === 'accepted').reduce((a, q) => a + q.total, 0);
    const linked = payments.filter((p) => p.quote_id && quotes.some((q) => q.id === p.quote_id && q.status === 'accepted')).reduce((a, p) => a + p.amount, 0);
    return { payments, quotes, costs, received, due: Math.max(0, accepted - linked) };
  }, [db, c]);

  if (!db) return <div className="sk" style={{ height: 400 }} />;
  if (!c || !data) return <Empty icon="clients">Client not found. <Link to="/clients" className="muted">Back to clients</Link></Empty>;

  const remove = async () => {
    if (!repo || !confirm(`Delete ${c.name}? Receipts and quotes stay but lose the link.`)) return;
    await mutate(() => repo.remove('clients', c.id), 'Client deleted');
    nav('/clients');
  };

  return (
    <>
      <Link to="/clients" className="btn quiet sm" style={{ marginLeft: -10 }}><Icon name="back" />Clients</Link>
      <PageHead eyebrow={c.status} title={c.name}>
        {can('quotes.edit') && <Link className="btn" to={`/quotes/new?client=${c.id}`}><Icon name="quote" />Quote</Link>}
        {can('money.edit') && <button className="btn ghost" onClick={() => setPay(true)}><Icon name="in" />Payment</button>}
        {can('clients.edit') && <button className="icon-btn" onClick={() => setEdit(true)} aria-label="Edit"><Icon name="edit" /></button>}
      </PageHead>

      <div className="grid grid-4">
        <div className="card stat"><div className="eyebrow">Received</div><div className="v">{inrShort(data.received)}</div></div>
        <div className="card stat"><div className="eyebrow">Direct costs</div><div className="v">{inrShort(data.costs)}</div></div>
        <div className="card stat"><div className="eyebrow">Contribution</div><div className="v">{inrShort(data.received - data.costs)}</div></div>
        <div className="card stat"><div className="eyebrow">Due on won quotes</div><div className="v">{inrShort(data.due)}</div></div>
      </div>

      <div className="grid grid-dash mt">
        <section className="card">
          <div className="card-head"><h2>Payments</h2></div>
          {data.payments.length === 0 ? <Empty icon="in">No payments yet.</Empty> : (
            <div className="list">
              {data.payments.map((p) => (
                <div className="li" key={p.id}>
                  <span className="avatar solid"><Icon name="in" /></span>
                  <div><div className="t">{p.note || 'Payment'}</div><div className="s">{fmtDay(p.received_on)} · {p.method.toUpperCase()}{p.reference ? ` · ${p.reference}` : ''}</div></div>
                  <div className="amt">{inr(p.amount)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="card-head mt2"><h2>Quotations</h2></div>
          {data.quotes.length === 0 ? <Empty icon="quote">No quotes yet.</Empty> : (
            <div className="list">
              {data.quotes.map((q) => (
                <Link className="li" key={q.id} to={`/quotes/${q.id}`}>
                  <span className="avatar"><Icon name="quote" /></span>
                  <div><div className="t">{q.title || q.number}</div><div className="s">{q.number} · {fmtDate(q.issue_date)}</div></div>
                  <div className="amt">{inr(q.total)}<small><span className={`tag${q.status === 'accepted' ? ' solid' : ''}`} style={{ height: 18 }}>{q.status}</span></small></div>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2>Details</h2></div>
          <div className="stack" style={{ gap: 14 }}>
            {c.contact_name && <Detail label="Contact" value={c.contact_name} />}
            {c.phone && <Detail label="Phone" value={<a href={`tel:${c.phone}`} className="row"><Icon name="phone" size={15} />{c.phone}</a>} />}
            {c.email && <Detail label="Email" value={<a href={`mailto:${c.email}`} className="row"><Icon name="mail" size={15} />{c.email}</a>} />}
            {c.gstin && <Detail label="GSTIN" value={<span className="num">{c.gstin}</span>} />}
            {(c.address || c.city) && <Detail label="Address" value={<span style={{ whiteSpace: 'pre-line' }}>{[c.address, c.city].filter(Boolean).join('\n')}</span>} />}
            {c.notes && <Detail label="Notes" value={<span style={{ whiteSpace: 'pre-line' }}>{c.notes}</span>} />}
          </div>
          {can('money.delete') && <button className="btn danger sm mt2" onClick={remove}><Icon name="trash" />Delete client</button>}
        </section>
      </div>

      <ClientSheet open={edit} edit={c} onClose={() => setEdit(false)} />
      <PaymentSheet open={pay} presetClient={c.id} onClose={() => setPay(false)} />
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div><div>{value}</div></div>;
}
