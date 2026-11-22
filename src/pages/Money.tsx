import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutate, useStore } from '../data/store';
import type { ClientDue, ClientPayment, LedgerEntry } from '../data/types';
import { computeDistribution, paymentShares } from '../lib/finance';
import { inr, inrShort } from '../lib/money';
import { Icon } from '../components/Icon';
import { Empty, Seg, fmtDay, initials } from '../components/Sheet';
import { DueSheet, LedgerSheet, PaymentSheet } from '../components/Forms';
import { localDay, relDay } from '../lib/work';
import { PageHead } from '../components/AppShell';

type Tab = 'in' | 'due' | 'out' | 'split';

export function Money() {
  const { db, can, repo } = useStore();
  const mutate = useMutate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'in';
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  const [payEdit, setPayEdit] = useState<ClientPayment | null | undefined>(undefined);
  const [ledEdit, setLedEdit] = useState<LedgerEntry | null | undefined>(undefined);
  const [settle, setSettle] = useState<{ from: string; to: string; amount: number } | null>(null);
  const [q, setQ] = useState('');
  const [dueEdit, setDueEdit] = useState<ClientDue | null | undefined>(undefined);
  const [receiving, setReceiving] = useState<ClientDue | null>(null);

  const dist = useMemo(() => (db ? computeDistribution(db) : null), [db]);
  const pName = (id: string) => db?.partners.find((p) => p.id === id)?.name ?? '—';
  const cName = (id: string | null) => (id && db?.clients.find((c) => c.id === id)?.name) || 'No client';

  const payments = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (db?.payments ?? []).filter((p) => !s || cName(p.client_id).toLowerCase().includes(s) || p.note.toLowerCase().includes(s) || p.reference.toLowerCase().includes(s))
      .sort((a, b) => b.received_on.localeCompare(a.received_on));
  }, [db, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const ledger = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (db?.ledger ?? []).filter((l) => !s || l.note.toLowerCase().includes(s) || l.category.toLowerCase().includes(s))
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  }, [db, q]);

  const dues = useMemo(() => (db?.dues ?? []).filter((d) => d.status === 'due')
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9')), [db]);

  if (!db || !dist) return <div className="sk" style={{ height: 400 }} />;
  const toCollect = dues.reduce((a, d) => a + d.amount, 0);
  const day = localDay();

  // A pending payment came in: the receipt is recorded, then the due is closed (or reduced if part-paid).
  const onReceived = async (due: ClientDue, pay: ClientPayment) => {
    if (!repo) return;
    await mutate(() => (pay.amount >= due.amount
      ? repo.update<ClientDue>('client_dues', due.id, { status: 'received', payment_id: pay.id })
      : repo.update<ClientDue>('client_dues', due.id, { amount: due.amount - pay.amount })));
  };
  const canEdit = can('money.edit');

  const del = (table: 'client_payments' | 'ledger_entries', id: string) => {
    if (!repo || !confirm('Delete this entry? This can’t be undone.')) return;
    mutate(() => repo.remove(table, id), 'Deleted');
    setPayEdit(undefined); setLedEdit(undefined);
  };

  return (
    <>
      <PageHead eyebrow="Ledger" title={<>Money <em>&amp; split</em></>}>
        {canEdit && tab === 'in' && <button className="btn" onClick={() => setPayEdit(null)}><Icon name="in" />Money in</button>}
        {canEdit && tab === 'due' && <button className="btn" onClick={() => setDueEdit(null)}><Icon name="calendar" />Client owes us</button>}
        {canEdit && tab === 'out' && <button className="btn" onClick={() => setLedEdit(null)}><Icon name="out" />Add expense</button>}
      </PageHead>

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="eyebrow">Total in</div><div className="v">{inrShort(dist.income)}</div><div className="d">{db.payments.length} receipts</div></div>
        <button className="card stat" style={{ textAlign: 'left' }} onClick={() => setTab('due')}><div className="eyebrow">To collect</div><div className="v">{inrShort(toCollect)}</div><div className="d">{dues.length ? `${dues.length} pending · not in profit` : 'Nothing pending'}</div></button>
        <div className="card stat"><div className="eyebrow">Total costs</div><div className="v">{inrShort(dist.costs)}</div><div className="d">{db.ledger.filter((l) => l.kind === 'cost').length} expenses</div></div>
        <div className="card stat"><div className="eyebrow">Profit</div><div className="v">{inrShort(dist.profit)}</div><div className="d">{dist.partners.map((p) => `${p.name.split(' ')[0]} ${inrShort(p.profitShare)}`).join(' · ')}</div></div>
      </div>

      <Seg value={tab} onChange={setTab} options={[{ value: 'in', label: 'Received' }, { value: 'due', label: `To collect${dues.length ? ` · ${dues.length}` : ''}` }, { value: 'out', label: 'Expenses' }, { value: 'split', label: 'Split' }]} />

      {(tab === 'in' || tab === 'out') && (
        <div className="search mt"><Icon name="search" /><input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      )}

      {tab === 'in' && (
        <section className="card mt">
          {payments.length === 0 ? <Empty icon="in">No receipts yet.</Empty> : (
            <div className="list">
              {payments.map((p) => {
                const shares = paymentShares(p, db.partners);
                return (
                  <button className="li" key={p.id} onClick={() => canEdit && setPayEdit(p)} disabled={!canEdit}>
                    <span className="avatar solid"><Icon name="in" /></span>
                    <div>
                      <div className="t">{cName(p.client_id)}</div>
                      <div className="s">{fmtDay(p.received_on)} · to {pName(p.received_by)} · {shares.map((s) => `${pName(s.partner_id).split(' ')[0]} ${inrShort(s.amount)}`).join(' / ')}</div>
                    </div>
                    <div className="amt">+{inr(p.amount)}<small>{p.method.toUpperCase()}{p.reference ? ` · ${p.reference}` : ''}</small></div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'due' && (
        <section className="card mt">
          {db.duesMissing ? <Empty icon="layers">Run <span className="num">supabase/updates/003_dues.sql</span> in Supabase to switch this on.</Empty>
            : dues.length === 0 ? <Empty icon="check">No client owes you anything right now.</Empty> : (
            <div className="list">
              {dues.map((d) => {
                const late = !!d.due_date && d.due_date < day;
                const proj = db.projects.find((p) => p.id === d.project_id);
                return (
                  <div className="li due-row" key={d.id}>
                    <span className="avatar due"><Icon name="calendar" /></span>
                    <div onClick={() => canEdit && setDueEdit(d)} style={{ cursor: canEdit ? 'pointer' : undefined }}>
                      <div className="t">{cName(d.client_id)}</div>
                      <div className="s">{[d.note, proj?.name].filter(Boolean).join(' · ') || 'Pending'}{d.due_date ? <> · <span className={late ? 'late' : ''}>{late ? relDay(d.due_date, day) : `due ${relDay(d.due_date, day).toLowerCase()}`}</span></> : null}</div>
                    </div>
                    <div className="amt">{inr(d.amount)}
                      {canEdit ? <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setReceiving(d)}><Icon name="check" />Received</button> : <small>pending</small>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'out' && (
        <section className="card mt">
          {ledger.length === 0 ? <Empty icon="out">Nothing logged yet.</Empty> : (
            <div className="list">
              {ledger.map((l) => (
                <button className="li" key={l.id} onClick={() => canEdit && setLedEdit(l)} disabled={!canEdit}>
                  <span className="avatar"><Icon name={l.kind === 'payment' ? 'split' : l.kind === 'investment' ? 'layers' : 'out'} /></span>
                  <div>
                    <div className="t">{l.kind === 'payment' ? `${pName(l.payer_id)} paid ${l.among.map(pName).join(', ')}` : l.note || l.category || 'Expense'}</div>
                    <div className="s">
                      <span className={`tag${l.kind === 'investment' ? ' solid' : l.kind === 'payment' ? ' dash' : ''}`} style={{ height: 18, marginRight: 6 }}>{l.kind === 'cost' ? l.category || 'cost' : l.kind === 'payment' ? 'settle' : 'capital'}</span>
                      {fmtDay(l.entry_date)} · paid by {pName(l.payer_id)}
                    </div>
                  </div>
                  <div className="amt">{l.kind === 'cost' ? '−' : ''}{inr(l.amount)}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'split' && (
        <>
          <section className="card mt">
            <div className="card-head"><h2>To settle up</h2><span className="eyebrow">all time</span></div>
            {dist.transfers.length === 0 ? (
              <Empty icon="check">All square. Nobody owes anybody.</Empty>
            ) : (
              <div className="stack">
                {dist.transfers.map((t) => (
                  <div className="transfer" key={t.from + t.to}>
                    <div className="row"><span className="avatar">{initials(pName(t.from))}</span><span className="who">{pName(t.from)}</span></div>
                    <div className="arrow"><b>{inr(t.amount)}</b><Icon name="arrow" /></div>
                    <div className="row" style={{ justifyContent: 'flex-end' }}><span className="who">{pName(t.to)}</span><span className="avatar solid">{initials(pName(t.to))}</span></div>
                    {canEdit && <button className="btn ghost sm" style={{ gridColumn: '1 / -1' }} onClick={() => setSettle(t)}><Icon name="check" />Mark as paid</button>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card mt">
            <div className="card-head"><h2>Per partner</h2></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="num" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 520 }}>
                <thead>
                  <tr className="eyebrow" style={{ textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: '8px 0' }}>Partner</th><th>Collected</th><th>Share of in</th><th>Share of costs</th><th>Profit</th><th>Capital</th><th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {dist.partners.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--line)', textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '12px 0', fontFamily: 'var(--f-ui)', fontWeight: 600 }}>{p.name}</td>
                      <td>{inr(p.holding)}</td><td>{inr(p.incomeShare)}</td><td>{inr(p.costShare)}</td><td><b>{inr(p.profitShare)}</b></td><td>{inr(p.invested)}</td>
                      <td>{p.net === 0 ? 'even' : p.net > 0 ? `gets ${inr(p.net)}` : `owes ${inr(-p.net)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint mt">
              Client money: whoever it lands with owes the others their share ({db.partners.filter((p) => p.active).map((p) => `${p.name} ${p.share_pct}%`).join(' / ')}). Expenses: whoever pays is owed back by the others, split equally.
              Settle-ups clear the balance. Investments are capital and don’t reduce profit.
            </p>
          </section>
        </>
      )}

      <DueSheet open={dueEdit !== undefined} edit={dueEdit} onClose={() => setDueEdit(undefined)} />
      <PaymentSheet open={!!receiving} presetClient={receiving?.client_id ?? undefined} presetAmount={receiving?.amount} presetNote={receiving?.note}
        onSaved={(pay) => (receiving ? onReceived(receiving, pay) : undefined)} onClose={() => setReceiving(null)} />
      <PaymentSheet open={payEdit !== undefined} edit={payEdit} onClose={() => setPayEdit(undefined)}
        onDelete={can("money.delete") && payEdit ? () => del("client_payments", payEdit.id) : undefined} />
      <LedgerSheet open={ledEdit !== undefined || !!settle} edit={ledEdit} presetSettle={settle} onClose={() => { setLedEdit(undefined); setSettle(null); }}
        onDelete={can("money.delete") && ledEdit ? () => del("ledger_entries", ledEdit.id) : undefined} />
    </>
  );
}
