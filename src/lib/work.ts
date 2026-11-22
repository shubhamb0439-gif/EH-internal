// To-dos, recurring tasks, project timelines. Dates are local 'YYYY-MM-DD' strings.
import type { Bug, BugSeverity, Db, Milestone, Project, ProjectStatus, Repeat, Task } from '../data/types';

export const localDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const parse = (s: string) => new Date(s + 'T00:00:00');
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return localDay(d); };
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

export const REPEAT_LABEL: Record<Repeat, string> = { none: 'Once', daily: 'Every day', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };
export const STATUS_LABEL: Record<ProjectStatus, string> = { planning: 'Planning', active: 'Active', on_hold: 'On hold', done: 'Done' };
export const SEV_ORDER: Record<BugSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Does a repeating task come up on `day`? The anchor is its due date (or the day it was created). */
export function occursOn(t: Task, day: string): boolean {
  const anchor = t.due_date ?? t.created_at.slice(0, 10);
  if (day < anchor) return false;
  const d = parse(day), a = parse(anchor);
  switch (t.repeat) {
    case 'daily': return true;
    case 'weekdays': return d.getDay() !== 0 && d.getDay() !== 6;
    case 'weekly': return d.getDay() === a.getDay();
    case 'monthly': {
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(a.getDate(), last);
    }
    default: return t.due_date === day;
  }
}

/** Is the task ticked off for `day`? One-off tasks: done at all. Repeating: ticked on that day. */
export const isDone = (t: Task, day: string) => (t.repeat === 'none' ? t.done : t.done_on === day);

/** The patch that ticks / unticks a task for today. */
export function togglePatch(t: Task, day: string): Partial<Task> {
  if (t.repeat === 'none') return t.done ? { done: false, done_on: null } : { done: true, done_on: day };
  return t.done_on === day ? { done_on: null } : { done_on: day };
}

/** Next date a repeating task comes up, from `day` (inclusive) — for the "upcoming" label. */
export function nextOccurrence(t: Task, day: string): string | null {
  if (t.repeat === 'none') return t.due_date;
  for (let i = 0; i < 40; i++) { const d = addDays(day, i); if (occursOn(t, d) && !(i === 0 && isDone(t, d))) return d; }
  return null;
}

export interface TaskBuckets { today: Task[]; upcoming: Task[]; someday: Task[]; done: Task[] }

/** Splits tasks into Today (incl. overdue), Upcoming, No date and recently Done. */
export function bucketTasks(tasks: Task[], day: string): TaskBuckets {
  const b: TaskBuckets = { today: [], upcoming: [], someday: [], done: [] };
  for (const t of tasks) {
    if (t.repeat !== 'none') {
      if (occursOn(t, day)) (isDone(t, day) ? b.done : b.today).push(t);
      else b.upcoming.push(t);
      continue;
    }
    if (t.done) { if (!t.done_on || daysBetween(t.done_on, day) <= 7) b.done.push(t); continue; }
    if (!t.due_date) b.someday.push(t);
    else if (t.due_date <= day) b.today.push(t);
    else b.upcoming.push(t);
  }
  const pr = { high: 0, normal: 1, low: 2 } as const;
  b.today.sort((x, y) => pr[x.priority] - pr[y.priority] || (x.due_date ?? '').localeCompare(y.due_date ?? ''));
  b.upcoming.sort((x, y) => (nextOccurrence(x, day) ?? '9').localeCompare(nextOccurrence(y, day) ?? '9'));
  b.someday.sort((x, y) => pr[x.priority] - pr[y.priority]);
  return b;
}

export const openBugs = (bugs: Bug[]) => bugs.filter((b) => b.status === 'open' || b.status === 'in_progress');

export interface ProjectStats {
  milestones: Milestone[];
  done: number;
  total: number;
  progress: number;       // 0..1 by milestones/deliverables done
  elapsed: number | null; // 0..1 of the time between start and due
  openTasks: number;
  openBugs: number;
  next: Milestone | null;
  late: boolean;
}

export function projectStats(db: Db, p: Project, day = localDay()): ProjectStats {
  const ms = db.milestones.filter((m) => m.project_id === p.id).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'));
  const done = ms.filter((m) => m.done).length;
  const elapsed = p.start_date && p.due_date && p.due_date > p.start_date
    ? Math.min(1, Math.max(0, daysBetween(p.start_date, day) / daysBetween(p.start_date, p.due_date))) : null;
  const next = ms.find((m) => !m.done) ?? null;
  return {
    milestones: ms, done, total: ms.length, progress: ms.length ? done / ms.length : p.status === 'done' ? 1 : 0, elapsed,
    openTasks: db.tasks.filter((t) => t.project_id === p.id && t.repeat === 'none' && !t.done).length,
    openBugs: openBugs(db.bugs.filter((b) => b.project_id === p.id)).length,
    next,
    late: p.status !== 'done' && ((!!p.due_date && p.due_date < day) || ms.some((m) => !m.done && !!m.due_date && m.due_date < day)),
  };
}

export const personName = (db: Db, id: string | null | undefined) => {
  if (!id) return '';
  const p = db.people.find((x) => x.id === id);
  return p ? (p.full_name || p.email || '').split(' ')[0] : '';
};

export function relDay(d: string | null, day = localDay()): string {
  if (!d) return '';
  const n = daysBetween(day, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${-n}d late`;
  if (n < 7) return parse(d).toLocaleDateString('en-IN', { weekday: 'short' });
  return parse(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
