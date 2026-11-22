import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { computeDistribution } from '../lib/finance';
import { inr, inrShort } from '../lib/money';
import { bucketTasks, localDay, openBugs } from '../lib/work';
import { Mark } from '../components/Logo';
import { PageHead } from '../components/AppShell';
import { PartnerSetup } from '../components/Forms';

type Range = 'month' | 'quarter' | 'year' | 'all';

function rangeFrom(r: Range): string | undefined {
  const d = new Date();
  if (r === 'all') return undefined;
  if (r === 'month') return localDay(new Date(d.getFullYear(), d.getMonth(), 1));
  if (r === 'quarter') return localDay(new Date(d.getFullYear(), d.getMonth() - 2, 1));
  // Indian financial year starts 1 April
  const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${fyStart}-04-01`;
}

const RANGES: { value: Range; label: string; long: string }[] = [
  { value: 'month', label: 'Month', long: 'this month' },
  { value: 'quarter', label: '3M', long: 'last 3 months' },
  { value: 'year', label: 'FY', long: 'this financial year' },
  { value: 'all', label: 'All', long: 'all time' },
];

/** Executive view: what we've earned, what we kept, what each partner gets. Nothing else. */
export function Dashboard() {
  const { db, profile, can } = useStore();
  const [range, setRange] = useState<Range>('year');
  const from = rangeFrom(range);
  const dist = useMemo(() => (db ? computeDistribution(db, { from }) : null), [db, from]);
  const allTime = useMemo(() => (db ? computeDistribution(db) : null), [db]);

  if (!db || !dist || !allTime) return <DashSkeleton />;

  const margin = dist.income ? Math.round((dist.profit / dist.income) * 100) : 0;
  const payers = new Set(db.payments.filter((p) => !from || p.received_on >= from).map((p) => p.client_id).filter(Boolean)).size;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile?.full_name || '').split(' ')[0];
  const r = RANGES.find((x) => x.value === range)!;
  const owed = allTime.transfers.reduce((a, t) => a + t.amount, 0);
  const todo = bucketTasks(db.tasks, localDay()).today.length;
  const bugs = openBugs(db.bugs).length;
  const pending = db.dues.filter((d) => d.status === 'due');
  const toCollect = pending.reduce((a, d) => a + d.amount, 0);

  return (
    <>
      <PageHead eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} title={<>{greet}{firstName ? <>, <em>{firstName}</em></> : ''}</>} />

      <section className="hero exec-hero">
        <Mark className="hero-mark" />
        <div className="exec-top">
          <span className="eyebrow">Total earnings · {r.long}</span>
          <div className="range" role="tablist" aria-label="Period">
            {RANGES.map((x) => <button key={x.value} role="tab" aria-selected={range === x.value} className={range === x.value ? 'on' : ''} onClick={() => setRange(x.value)}>{x.label}</button>)}
          </div>
        </div>
        <div className="hero-num">{inrShort(dist.income)}</div>
        <div className="hero-sub">{inr(dist.income)} received{payers ? ` from ${payers} client${payers > 1 ? 's' : ''}` : ''} · {margin}% margin</div>
        <div className="hero-split">
          <div><span className="eyebrow">Profit</span><b>{inrShort(dist.profit)}</b></div>
          <div><span className="eyebrow">Expenses</span><b>{inrShort(dist.costs)}</b></div>
          <div><span className="eyebrow">To collect</span><b>{inrShort(toCollect)}</b></div>
        </div>
      </section>

      {db.partners.length === 0 && <section className="card mt"><PartnerSetup /></section>}

      <div className="kpis mt">
        {dist.partners.slice(0, 2).map((p) => (
          <div className="card kpi" key={p.id}>
            <div className="eyebrow">{p.name}’s share</div>
            <div className="v">{inrShort(p.profitShare)}</div>
            <div className="d">{Number(db.partners.find((x) => x.id === p.id)?.share_pct ?? 0)}% of profit</div>
          </div>
        ))}
        {can('money.view') && (
          <Link to="/money?tab=split" className="card kpi">
            <div className="eyebrow">To settle</div>
            <div className="v">{owed ? inrShort(owed) : 'Square'}</div>
            <div className="d">{allTime.transfers.length ? allTime.transfers.map((t) => `${pname(db, t.from)} → ${pname(db, t.to)}`).join(', ') : 'Nobody owes anybody'}</div>
          </Link>
        )}
        <Link to="/work" className="card kpi">
          <div className="eyebrow">Today</div>
          <div className="v">{todo} <span style={{ fontSize: 15, color: 'var(--ink-3)', letterSpacing: 0 }}>tasks</span></div>
          <div className="d">{bugs ? `${bugs} open bug${bugs > 1 ? 's' : ''}` : 'No open bugs'}</div>
        </Link>
      </div>
    </>
  );
}

const pname = (db: { partners: { id: string; name: string }[] }, id: string) => db.partners.find((p) => p.id === id)?.name ?? '—';

export function DashSkeleton() {
  return (
    <div className="stack">
      <div className="sk" style={{ height: 60, width: '60%' }} />
      <div className="sk" style={{ height: 260, borderRadius: 26 }} />
      <div className="kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="sk" style={{ height: 110 }} />)}</div>
    </div>
  );
}
