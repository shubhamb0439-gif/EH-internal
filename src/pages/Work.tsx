import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabaseConfigured, useMutate, useStore } from '../data/store';
import type { Bug, BugStatus, Db, Milestone, Project, Task } from '../data/types';
import {
  REPEAT_LABEL, SEV_ORDER, STATUS_LABEL, bucketTasks, daysBetween, isDone, localDay, nextOccurrence, openBugs, personName, projectStats, relDay, togglePatch,
} from '../lib/work';
import { Icon } from '../components/Icon';
import { Empty, Seg, fmtDate } from '../components/Sheet';
import { PageHead } from '../components/AppShell';
import { BUG_STATUS_LABEL, BugSheet, MilestoneSheet, ProjectSheet, SEV_LABEL, TaskSheet } from '../components/WorkForms';

type Tab = 'todo' | 'projects' | 'bugs';

export function Work() {
  const { db } = useStore();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'todo';
  if (!db) return <div className="sk" style={{ height: 400 }} />;
  const day = localDay();
  const todayN = bucketTasks(db.tasks, day).today.length;
  return (
    <>
      <PageHead eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} title={<>Work</>} />
      <WorkMissing db={db} />
      <div style={{ marginBottom: 16 }}>
        <Seg value={tab} onChange={(t) => setSp(t === 'todo' ? {} : { tab: t }, { replace: true })} options={[
          { value: 'todo', label: `To-do${todayN ? ` · ${todayN}` : ''}` },
          { value: 'projects', label: 'Projects' },
          { value: 'bugs', label: `Bugs${openBugs(db.bugs).length ? ` · ${openBugs(db.bugs).length}` : ''}` },
        ]} />
      </div>
      {tab === 'todo' && <TodoTab db={db} />}
      {tab === 'projects' && <ProjectsTab db={db} />}
      {tab === 'bugs' && <BugsTab db={db} />}
    </>
  );
}

function WorkMissing({ db }: { db: Db }) {
  if (!db.workMissing || !supabaseConfigured) return null;
  return <div className="banner"><Icon name="layers" size={16} /><span><b>One step left:</b> run <span className="num">supabase/updates/002_work.sql</span> in the Supabase SQL Editor to switch on tasks, projects and bugs.</span></div>;
}

// ---------------------------------------------------------------- To-do
function TodoTab({ db }: { db: Db }) {
  const { profile, can, repo } = useStore();
  const mutate = useMutate();
  const [who, setWho] = useState<'me' | 'all'>('all');
  const [sheet, setSheet] = useState<Task | null | undefined>(undefined);
  const [quick, setQuick] = useState('');
  const day = localDay();
  const mine = (t: Task) => who === 'all' || t.assignee_id === profile?.id || (!t.assignee_id && t.created_by === profile?.id);
  const b = useMemo(() => bucketTasks(db.tasks.filter(mine), day), [db, who, day]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    const title = quick.trim();
    if (!repo || !title) return;
    setQuick('');
    await mutate(() => repo.insert('tasks', { title, notes: '', project_id: null, assignee_id: profile?.id ?? null, due_date: day, priority: 'normal', repeat: 'none', done: false, done_on: null }));
  };

  const sections: [string, Task[], string][] = [
    ['Today', b.today, 'Nothing due today.'],
    ['Upcoming', b.upcoming, ''],
    ['No date', b.someday, ''],
    ['Done', b.done, ''],
  ];

  return (
    <>
      <div className="between wrap" style={{ marginBottom: 12 }}>
        <div className="chips">
          <button className={`chip${who === 'all' ? ' on' : ''}`} onClick={() => setWho('all')}>Everyone</button>
          <button className={`chip${who === 'me' ? ' on' : ''}`} onClick={() => setWho('me')}>Mine</button>
        </div>
        {can('work.edit') && <button className="btn sm ghost" onClick={() => setSheet(null)}><Icon name="repeat" />Recurring / detailed</button>}
      </div>
      {can('work.edit') && (
        <form className="quick-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="input" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a task for today, press Enter" />
          <button className="btn" disabled={!quick.trim()} aria-label="Add task"><Icon name="plus" /></button>
        </form>
      )}
      {sections.map(([label, list, empty]) => (list.length || empty) ? (
        <div key={label}>
          <div className="section-label"><span className="eyebrow">{label}</span><span className="count">{String(list.length).padStart(2, '0')}</span></div>
          <section className="card" style={{ padding: '4px 16px' }}>
            {list.length === 0 ? <div className="empty" style={{ padding: 22 }}>{empty}</div>
              : list.map((t) => <TaskRow key={t.id} t={t} db={db} day={day} onOpen={() => setSheet(t)} />)}
          </section>
        </div>
      ) : null)}
      <TaskSheet open={sheet !== undefined} edit={sheet} onClose={() => setSheet(undefined)} />
    </>
  );
}

export function TaskRow({ t, db, day, onOpen, hideProject }: { t: Task; db: Db; day: string; onOpen: () => void; hideProject?: boolean }) {
  const { repo, can } = useStore();
  const mutate = useMutate();
  const [pending, setPending] = useState<boolean | null>(null);
  const done = pending ?? isDone(t, day);
  const toggle = async () => {
    if (!repo || !can('work.edit')) return;
    try { navigator.vibrate?.(6); } catch { /* not supported */ }
    setPending(!done);
    await mutate(() => repo.update('tasks', t.id, togglePatch(t, day)));
    setPending(null);
  };
  const project = !hideProject && t.project_id ? db.projects.find((p) => p.id === t.project_id) : null;
  const when = t.repeat === 'none' ? (t.done ? null : t.due_date) : nextOccurrence(t, day);
  const late = t.repeat === 'none' && !t.done && !!t.due_date && t.due_date < day;
  return (
    <div className={`task${done ? ' done' : ''}`}>
      <button className={`check${done ? ' on' : ''}`} onClick={toggle} aria-label={done ? 'Mark not done' : 'Mark done'} aria-pressed={done}><Icon name="check" /></button>
      <div onClick={onOpen}>
        <div className="t">{t.title}</div>
        <div className="meta">
          {t.repeat !== 'none' && <span><Icon name="repeat" />{REPEAT_LABEL[t.repeat]}</span>}
          {when && !(t.repeat !== 'none' && when === day) && <span className={late ? 'late' : ''}><Icon name="calendar" />{relDay(when, day)}</span>}
          {project && <span><Icon name="folder" />{project.name}</span>}
          {t.assignee_id && <span><Icon name="user" />{personName(db, t.assignee_id)}</span>}
        </div>
      </div>
      <span className={`pri ${t.priority}`} title={`${t.priority} priority`} />
    </div>
  );
}

// ---------------------------------------------------------------- Projects
function ProjectsTab({ db }: { db: Db }) {
  const { can } = useStore();
  const nav = useNavigate();
  const [filter, setFilter] = useState<'live' | 'done' | 'all'>('live');
  const [sheet, setSheet] = useState(false);
  const list = db.projects
    .filter((p) => (filter === 'all' ? true : filter === 'done' ? p.status === 'done' : p.status !== 'done'))
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'));
  return (
    <>
      <div className="between wrap" style={{ marginBottom: 14 }}>
        <div className="chips">
          {(['live', 'done', 'all'] as const).map((f) => <button key={f} className={`chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{f === 'live' ? 'In progress' : f === 'done' ? 'Done' : 'All'}</button>)}
        </div>
        {can('projects.edit') && <button className="btn sm" onClick={() => setSheet(true)}><Icon name="plus" />New project</button>}
      </div>
      {list.length === 0 ? <section className="card"><Empty icon="folder">No projects here yet.</Empty></section> : (
        <div className="proj-grid">
          {list.map((p) => <ProjectCard key={p.id} p={p} db={db} />)}
        </div>
      )}
      <ProjectSheet open={sheet} onClose={() => setSheet(false)} onSaved={(p) => nav(`/work/projects/${p.id}`)} />
    </>
  );
}

function ProjectCard({ p, db }: { p: Project; db: Db }) {
  const s = projectStats(db, p);
  const client = db.clients.find((c) => c.id === p.client_id);
  return (
    <Link to={`/work/projects/${p.id}`} className="card proj">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3>{p.name}</h3>
          <div className="sub">{client?.name ?? 'Internal'}{p.lead_id ? ` · ${personName(db, p.lead_id)}` : ''}</div>
        </div>
        <span className={`tag${p.status === 'active' ? ' solid' : p.status === 'on_hold' ? ' dash' : ''}`}>{STATUS_LABEL[p.status]}</span>
      </div>
      <div>
        <div className="between" style={{ marginBottom: 8 }}>
          <span className="eyebrow">Progress</span>
          <span className="count">{s.done}/{s.total} delivered</span>
        </div>
        <div className="bar2">
          <i style={{ width: `${s.progress * 100}%` }} />
          {s.elapsed !== null && <b style={{ left: `${s.elapsed * 100}%` }} title="Time elapsed" />}
        </div>
      </div>
      <div className="nums">
        {p.due_date && <span>{s.late ? 'LATE · ' : ''}{relDay(p.due_date).toUpperCase()}</span>}
        <span>{s.openTasks} TASKS</span>
        <span>{s.openBugs} BUGS</span>
      </div>
      {s.next && <div className="row" style={{ fontSize: 13, color: 'var(--ink-2)' }}><Icon name="diamond" size={13} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Next: {s.next.title}{s.next.due_date ? ` · ${relDay(s.next.due_date)}` : ''}</span></div>}
    </Link>
  );
}

// ---------------------------------------------------------------- Bugs
function BugsTab({ db }: { db: Db }) {
  const { can } = useStore();
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [sheet, setSheet] = useState<Bug | null | undefined>(undefined);
  const list = db.bugs
    .filter((b) => (filter === 'all' ? true : filter === 'open' ? b.status === 'open' || b.status === 'in_progress' : b.status === 'fixed' || b.status === 'closed'))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.created_at.localeCompare(a.created_at));
  return (
    <>
      <div className="between wrap" style={{ marginBottom: 14 }}>
        <div className="chips">
          {(['open', 'resolved', 'all'] as const).map((f) => <button key={f} className={`chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
        </div>
        {can('work.edit') && <button className="btn sm" onClick={() => setSheet(null)}><Icon name="bug" />Report bug</button>}
      </div>
      <section className="card" style={{ padding: '4px 16px' }}>
        {list.length === 0 ? <Empty icon="bug">{filter === 'open' ? 'No open bugs.' : 'Nothing here.'}</Empty> : list.map((b) => <BugRow key={b.id} b={b} db={db} onOpen={() => setSheet(b)} />)}
      </section>
      <BugSheet open={sheet !== undefined} edit={sheet} onClose={() => setSheet(undefined)} />
    </>
  );
}

export function BugRow({ b, db, onOpen, hideProject }: { b: Bug; db: Db; onOpen: () => void; hideProject?: boolean }) {
  const project = !hideProject && b.project_id ? db.projects.find((p) => p.id === b.project_id) : null;
  const age = daysBetween(b.created_at.slice(0, 10), localDay());
  const resolved = b.status === 'fixed' || b.status === 'closed';
  return (
    <button className={`task${resolved ? ' done' : ''}`} onClick={onOpen} style={{ width: '100%', textAlign: 'left' }}>
      <span className={`tag sev-${b.severity}`} style={{ minWidth: 74, justifyContent: 'center' }}>{SEV_LABEL[b.severity]}</span>
      <div>
        <div className="t">{b.title}</div>
        <div className="meta">
          <span>{BUG_STATUS_LABEL[b.status as BugStatus].toUpperCase()}</span>
          {project && <span><Icon name="folder" />{project.name}</span>}
          {b.assignee_id && <span><Icon name="user" />{personName(db, b.assignee_id)}</span>}
          <span>{resolved && b.resolved_on ? `fixed ${relDay(b.resolved_on).toLowerCase()}` : age === 0 ? 'today' : `${age}d old`}</span>
        </div>
      </div>
      <Icon name="chevron" size={16} />
    </button>
  );
}

// ---------------------------------------------------------------- Project detail
export function ProjectDetail() {
  const { id } = useParams();
  const { db, can, repo } = useStore();
  const mutate = useMutate();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [ms, setMs] = useState<Milestone | null | undefined>(undefined);
  const [task, setTask] = useState<Task | null | undefined>(undefined);
  const [bug, setBug] = useState<Bug | null | undefined>(undefined);
  const p = db?.projects.find((x) => x.id === id);
  if (!db) return <div className="sk" style={{ height: 400 }} />;
  if (!p) return <Empty icon="folder">Project not found. <Link to="/work?tab=projects" style={{ textDecoration: 'underline' }}>Back to projects</Link></Empty>;

  const day = localDay();
  const s = projectStats(db, p, day);
  const client = db.clients.find((c) => c.id === p.client_id);
  const tasks = db.tasks.filter((t) => t.project_id === p.id);
  const b = bucketTasks(tasks, day);
  const openTasks = [...b.today, ...b.upcoming, ...b.someday];
  const bugs = db.bugs.filter((x) => x.project_id === p.id).sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity]);

  const toggleMs = (m: Milestone) => repo && can('work.edit') && mutate(() => repo.update<Milestone>('milestones', m.id, m.done ? { done: false, done_on: null } : { done: true, done_on: day }));

  // timeline: dated items in order, with a "today" marker between past and future
  const dated = s.milestones.filter((m) => m.due_date);
  const undated = s.milestones.filter((m) => !m.due_date);
  const nowIdx = dated.findIndex((m) => (m.due_date as string) >= day);

  return (
    <>
      <button className="btn quiet sm" style={{ marginLeft: -10 }} onClick={() => nav('/work?tab=projects')}><Icon name="back" />Projects</button>
      <PageHead eyebrow={client ? client.name : 'Internal project'} title={<>{p.name}</>}>
        {can('projects.edit') && <button className="btn ghost sm" onClick={() => setEdit(true)}><Icon name="edit" />Edit</button>}
      </PageHead>

      <div className="grid grid-dash">
        <section className="card">
          <div className="between wrap">
            <div className="row wrap">
              <span className={`tag${p.status === 'active' ? ' solid' : p.status === 'on_hold' ? ' dash' : ''}`}>{STATUS_LABEL[p.status]}</span>
              {s.late && <span className="tag sev-high">Behind schedule</span>}
            </div>
            <span className="count">{s.done}/{s.total} DELIVERED · {Math.round(s.progress * 100)}%</span>
          </div>
          {p.start_date && p.due_date && p.due_date > p.start_date ? <Track p={p} ms={s.milestones} day={day} /> : (
            <p className="hint" style={{ margin: '14px 0 0' }}>Add a start date and deadline to see the timeline.</p>
          )}
          {p.description && <p className="muted" style={{ margin: '14px 0 0', whiteSpace: 'pre-wrap' }}>{p.description}</p>}
          <div className="row wrap mt" style={{ gap: 18, fontSize: 13 }}>
            {p.lead_id && <span className="row" style={{ gap: 6 }}><Icon name="user" size={15} />{personName(db, p.lead_id)}</span>}
            {p.start_date && <span className="row" style={{ gap: 6 }}><Icon name="calendar" size={15} />{fmtDate(p.start_date)} → {fmtDate(p.due_date) || '—'}</span>}
            {client && <Link to={`/clients/${client.id}`} className="row" style={{ gap: 6, textDecoration: 'underline', textUnderlineOffset: 3 }}><Icon name="clients" size={15} />{client.name}</Link>}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>Timeline & deliverables</h2>{can('work.edit') && <button className="btn ghost sm" onClick={() => setMs(null)}><Icon name="plus" />Add</button>}</div>
          {s.milestones.length === 0 ? <Empty icon="diamond">Add what you’ll deliver to the client and when.</Empty> : (
            <div className="tl">
              {dated.map((m, i) => (
                <div key={m.id}>
                  {i === nowIdx && <div className="tl-now">TODAY · {fmtDate(day)}</div>}
                  <MsRow m={m} day={day} onToggle={() => toggleMs(m)} onOpen={() => setMs(m)} />
                </div>
              ))}
              {nowIdx === -1 && dated.length > 0 && <div className="tl-now">TODAY · {fmtDate(day)}</div>}
              {undated.map((m) => <MsRow key={m.id} m={m} day={day} onToggle={() => toggleMs(m)} onOpen={() => setMs(m)} />)}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-2 mt">
        <section className="card">
          <div className="card-head"><h2>Tasks <span className="count">{openTasks.length}</span></h2>{can('work.edit') && <button className="btn ghost sm" onClick={() => setTask(null)}><Icon name="plus" />Task</button>}</div>
          {openTasks.length + b.done.length === 0 ? <Empty icon="work">No tasks on this project.</Empty>
            : [...openTasks, ...b.done].map((t) => <TaskRow key={t.id} t={t} db={db} day={day} hideProject onOpen={() => setTask(t)} />)}
        </section>
        <section className="card">
          <div className="card-head"><h2>Bugs <span className="count">{openBugs(bugs).length} open</span></h2>{can('work.edit') && <button className="btn ghost sm" onClick={() => setBug(null)}><Icon name="bug" />Report</button>}</div>
          {bugs.length === 0 ? <Empty icon="bug">No bugs reported.</Empty> : bugs.map((x) => <BugRow key={x.id} b={x} db={db} hideProject onOpen={() => setBug(x)} />)}
        </section>
      </div>

      <ProjectSheet open={edit} edit={p} onClose={() => { setEdit(false); }} />
      <MilestoneSheet open={ms !== undefined} edit={ms} projectId={p.id} onClose={() => setMs(undefined)} />
      <TaskSheet open={task !== undefined} edit={task} presetProject={p.id} onClose={() => setTask(undefined)} />
      <BugSheet open={bug !== undefined} edit={bug} presetProject={p.id} onClose={() => setBug(undefined)} />
    </>
  );
}

function MsRow({ m, day, onToggle, onOpen }: { m: Milestone; day: string; onToggle: () => void; onOpen: () => void }) {
  const late = !m.done && !!m.due_date && m.due_date < day;
  return (
    <div className={`tl-item${m.done ? ' done' : ''}`}>
      <button className={`check${m.done ? ' on' : ''}`} onClick={onToggle} aria-label={m.done ? 'Mark not done' : 'Mark delivered'} aria-pressed={m.done}><Icon name="check" /></button>
      <div onClick={onOpen}>
        <div className="t">{m.title}</div>
        <div className="s">{m.kind === 'deliverable' ? 'DELIVERABLE' : 'MILESTONE'}{m.due_date ? ` · ${fmtDate(m.due_date)}` : ''}{m.done && m.done_on ? ` · done ${fmtDate(m.done_on)}` : ''}</div>
      </div>
      {late ? <span className="tag sev-high">{relDay(m.due_date, day)}</span> : !m.done && m.due_date ? <span className="count">{relDay(m.due_date, day)}</span> : <span />}
    </div>
  );
}

/** Horizontal span: start → deadline, deliverables as diamonds, a dashed line for today. */
function Track({ p, ms, day }: { p: Project; ms: Milestone[]; day: string }) {
  const total = daysBetween(p.start_date!, p.due_date!);
  const pos = (d: string) => Math.min(100, Math.max(0, (daysBetween(p.start_date!, d) / total) * 100));
  const today = pos(day);
  return (
    <div className="track" aria-label="Project timeline">
      <div className="rail-line" />
      <div className="elapsed" style={{ width: `${today}%` }} />
      {ms.filter((m) => m.due_date).map((m) => <span key={m.id} className={`tick${m.done ? ' done' : ''}`} style={{ left: `${pos(m.due_date!)}%` }} title={`${m.title} · ${fmtDate(m.due_date)}`} />)}
      {day >= p.start_date! && day <= p.due_date! && <div className="today" style={{ left: `${today}%` }}><span>{today > 80 ? '' : 'TODAY'}</span></div>}
      <span className="end" style={{ left: 0 }}>{fmtDate(p.start_date).toUpperCase()}</span>
      <span className="end" style={{ right: 0 }}>{fmtDate(p.due_date).toUpperCase()}</span>
    </div>
  );
}
