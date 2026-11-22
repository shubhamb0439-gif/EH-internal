import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Lockup, Mark } from './Logo';
import { ClientSheet, DueSheet, LedgerSheet, PaymentSheet } from './Forms';
import { BugSheet, ProjectSheet, TaskSheet } from './WorkForms';
import { initials } from './Sheet';
import { supabaseConfigured, useStore } from '../data/store';
import type { Capability } from '../lib/roles';
import { ROLE_LABEL } from '../lib/roles';

type Quick = 'payment' | 'due' | 'expense' | 'client' | 'task' | 'bug' | 'project' | null;
const QuickCtx = createContext<(q: Exclude<Quick, null>) => void>(() => {});
export const useQuick = () => useContext(QuickCtx);

const NAV: { to: string; label: string; icon: IconName; cap?: Capability }[] = [
  { to: '/', label: 'Home', icon: 'home', cap: 'dashboard.view' },
  { to: '/work', label: 'Work', icon: 'work', cap: 'work.view' },
  { to: '/money', label: 'Money', icon: 'money', cap: 'money.view' },
  { to: '/clients', label: 'Clients', icon: 'clients', cap: 'clients.view' },
  { to: '/quotes', label: 'Quotes', icon: 'quote', cap: 'quotes.view' },
  { to: '/settings', label: 'Setup', icon: 'settings' },
];

const buzz = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };

export function AppShell() {
  const { profile, toastMsg, can } = useStore();
  const [quick, setQuick] = useState<Quick>(null);
  const [fan, setFan] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const items = NAV.filter((n) => !n.cap || can(n.cap));

  const actions = ([
    { icon: 'quote', title: 'New quotation', sub: 'Build & share a PDF', run: () => nav('/quotes/new'), cap: 'quotes.edit' },
    { icon: 'in', title: 'Money in', sub: 'Client paid — split it', run: () => setQuick('payment'), cap: 'money.edit' },
    { icon: 'calendar', title: 'Client owes us', sub: 'Pending payment, kept separate', run: () => setQuick('due'), cap: 'money.edit' },
    { icon: 'out', title: 'Expense', sub: 'Someone paid a cost', run: () => setQuick('expense'), cap: 'money.edit' },
    { icon: 'work', title: 'New task', sub: 'One-off or recurring', run: () => setQuick('task'), cap: 'work.edit' },
    { icon: 'bug', title: 'Report a bug', sub: 'Log it before you forget', run: () => setQuick('bug'), cap: 'work.edit' },
    { icon: 'folder', title: 'New project', sub: 'Timeline & deliverables', run: () => setQuick('project'), cap: 'projects.edit' },
    { icon: 'clients', title: 'New client', sub: 'Add to the book', run: () => setQuick('client'), cap: 'clients.edit' },
  ] as { icon: IconName; title: string; sub: string; run: () => void; cap: Capability }[]).filter((a) => can(a.cap));

  return (
    <QuickCtx.Provider value={setQuick}>
      <div className="shell">
        <main className="main">
          <header className="topbar">
            <NavLink to="/" className="brand-mini" aria-label="Event Horizon home"><span className="mark-only row" style={{ gap: 10 }}><Mark /><span className="eyebrow" style={{ color: 'var(--ink)' }}>Event Horizon</span></span><Lockup className="lockup" /></NavLink>
            <div className="topbar-actions">
              {profile && <span className="tag">{ROLE_LABEL[profile.role]}{supabaseConfigured ? '' : ' · demo'}</span>}
              <NavLink to="/settings" className="icon-btn" aria-label="Settings">
                <span className="num" style={{ fontSize: 12, fontWeight: 600 }}>{initials(profile?.full_name || 'EH')}</span>
              </NavLink>
            </div>
          </header>
          {!supabaseConfigured && (
            <div className="banner"><Icon name="layers" size={16} /><span><b>Demo mode.</b> Sample data on this device. Add Supabase keys to <span className="num">.env</span> to go live.</span></div>
          )}
          <div className="page-enter" key={loc.pathname}><Outlet /></div>
        </main>

        <Dock items={items} onFab={() => { buzz(); setFan(!fan); }} fanOpen={fan} />
        {fan && (
          <>
            <div className="fan-scrim" onClick={() => setFan(false)} />
            <div className="fan">
              {actions.map((a, i) => (
                <button key={a.title} className="fan-btn" style={{ animationDelay: `${(actions.length - i) * 40}ms` }} onClick={() => { buzz(); setFan(false); a.run(); }}>
                  <span className="ic"><Icon name={a.icon} /></span>
                  <span><b>{a.title}</b><small>{a.sub}</small></span>
                </button>
              ))}
            </div>
          </>
        )}

        <PaymentSheet open={quick === 'payment'} onClose={() => setQuick(null)} />
        <DueSheet open={quick === 'due'} onClose={() => setQuick(null)} />
        <LedgerSheet open={quick === 'expense'} onClose={() => setQuick(null)} />
        <ClientSheet open={quick === 'client'} onClose={() => setQuick(null)} />
        <TaskSheet open={quick === 'task'} onClose={() => setQuick(null)} />
        <BugSheet open={quick === 'bug'} onClose={() => setQuick(null)} />
        <ProjectSheet open={quick === 'project'} onClose={() => setQuick(null)} onSaved={(p) => nav('/work/projects/' + p.id)} />
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </QuickCtx.Provider>
  );
}

function Dock({ items, onFab, fanOpen }: { items: typeof NAV; onFab: () => void; fanOpen: boolean }) {
  const loc = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // 3 tabs either side of the FAB; pad so it always sits in the middle
  const slots: (typeof NAV[number] | null)[] = [...items.slice(0, 6)];
  while (slots.length < 6) slots.splice(slots.length - 1, 0, null);
  const ordered = [slots[0], slots[1], slots[2], 'fab' as const, slots[3], slots[4], slots[5]];

  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.dock-item.active');
    if (!el || !ref.current) { setPill(null); return; }
    setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [loc.pathname, items.length]);
  useLayoutEffect(() => {
    const on = () => { const el = ref.current?.querySelector<HTMLElement>('.dock-item.active'); if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth }); };
    window.addEventListener('resize', on);
    document.fonts?.ready.then(on);
    return () => window.removeEventListener('resize', on);
  }, []);

  return (
    <div className="dock-wrap">
      <nav className="dock" ref={ref} aria-label="Main">
        {pill && <span className="dock-pill" style={{ left: pill.left, width: pill.width }} />}
        {ordered.map((n, i) =>
          n === 'fab' ? (
            <button key="fab" className={`fab${fanOpen ? ' open' : ''}`} onClick={onFab} aria-label="Quick actions" aria-expanded={fanOpen}>
              <Icon name="plus" />
            </button>
          ) : n ? (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `dock-item${isActive ? ' active' : ''}`} onClick={buzz}>
              <Icon name={n.icon} /><span>{n.label}</span>
            </NavLink>
          ) : <span key={i} />,
        )}
      </nav>
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>
      {children && <div className="row wrap">{children}</div>}
    </div>
  );
}
