// Two interchangeable backends: Supabase (real, shared, role-checked) and Demo (this browser only).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanySettings, Db, Profile, Role, TableName } from './types';
import { demoDb } from './demoSeed';

export interface Repo {
  kind: 'supabase' | 'demo';
  load(): Promise<Db>;
  insert<T = { id: string }>(table: TableName, row: object): Promise<T>;
  update<T>(table: TableName, id: string, patch: Partial<T>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  saveSettings(patch: Partial<CompanySettings>): Promise<void>;
  subscribe(onChange: () => void): () => void;
  listProfiles(): Promise<Profile[]>;
  setRole(userId: string, role: Role, partnerId?: string | null): Promise<void>;
}

const DB_KEY: Record<TableName, keyof Db> = {
  partners: 'partners', clients: 'clients', catalog_items: 'catalog', quotes: 'quotes', client_payments: 'payments', ledger_entries: 'ledger', client_dues: 'dues',
  projects: 'projects', milestones: 'milestones', tasks: 'tasks', bugs: 'bugs',
};

// ---------------------------------------------------------------- Supabase
export function supabaseRepo(sb: SupabaseClient): Repo {
  const must = <T,>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };
  return {
    kind: 'supabase',
    async load() {
      const [settings, partners, clients, catalog, quotes, payments, ledger, dues, projects, milestones, tasks, bugs, people] = await Promise.all([
        sb.from('company_settings').select('*').eq('id', 1).maybeSingle(),
        sb.from('partners').select('*').order('sort'),
        sb.from('clients').select('*').order('name'),
        sb.from('catalog_items').select('*').order('name'),
        sb.from('quotes').select('*').order('created_at', { ascending: false }),
        sb.from('client_payments').select('*').order('received_on', { ascending: false }),
        sb.from('ledger_entries').select('*').order('entry_date', { ascending: false }),
        sb.from('client_dues').select('*').order('due_date', { nullsFirst: false }),
        sb.from('projects').select('*').order('created_at', { ascending: false }),
        sb.from('milestones').select('*').order('due_date', { nullsFirst: false }),
        sb.from('tasks').select('*').order('created_at', { ascending: false }),
        sb.from('bugs').select('*').order('created_at', { ascending: false }),
        sb.from('profiles').select('*').neq('role', 'pending').order('full_name'),
      ]);
      // payments/ledger are blocked by RLS for some roles: treat as empty, not an error
      return {
        settings: must(settings) ?? demoDb().settings,
        partners: must(partners) ?? [],
        clients: must(clients) ?? [],
        catalog: must(catalog) ?? [],
        quotes: must(quotes) ?? [],
        payments: payments.error ? [] : payments.data ?? [],
        ledger: ledger.error ? [] : ledger.data ?? [],
        dues: dues.error ? [] : dues.data ?? [],
        duesMissing: !!dues.error && /does not exist|schema cache/i.test(dues.error.message),
        // Work tables arrive with the v2 SQL; until it's run, the app still works and shows a banner.
        projects: projects.error ? [] : projects.data ?? [],
        milestones: milestones.error ? [] : milestones.data ?? [],
        tasks: tasks.error ? [] : tasks.data ?? [],
        bugs: bugs.error ? [] : bugs.data ?? [],
        people: people.error ? [] : people.data ?? [],
        workMissing: !!(projects.error || tasks.error || bugs.error || milestones.error),
      } as Db;
    },
    async insert(table, row) {
      const { id: _drop, ...rest } = row as { id?: string };
      return must(await sb.from(table).insert(rest).select("*").single()) as never;
    },
    async update(table, id, patch) { must(await sb.from(table).update(patch as object).eq('id', id)); },
    async remove(table, id) { must(await sb.from(table).delete().eq('id', id)); },
    async saveSettings(patch) { must(await sb.from('company_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1)); },
    subscribe(onChange) {
      let t: ReturnType<typeof setTimeout> | undefined;
      const bump = () => { clearTimeout(t); t = setTimeout(onChange, 250); };
      const ch = sb.channel('eh-db').on('postgres_changes', { event: '*', schema: 'public' }, bump).subscribe();
      return () => { clearTimeout(t); sb.removeChannel(ch); };
    },
    async listProfiles() { return must(await sb.from('profiles').select('*').order('created_at')) as Profile[]; },
    async setRole(userId, role, partnerId) {
      const patch: Record<string, unknown> = { role };
      if (partnerId !== undefined) patch.partner_id = partnerId;
      must(await sb.from('profiles').update(patch).eq('id', userId));
    },
  };
}

// ---------------------------------------------------------------- Demo (localStorage)
const LS = 'eh-demo-v1';
export function demoRepo(): Repo {
  const read = (): Db => {
    try {
      const raw = localStorage.getItem(LS);
      if (raw) {
        // older demo data predates some tables: fill those from the seed
        const db = JSON.parse(raw) as Db; const base = demoDb();
        for (const k of Object.keys(base) as (keyof Db)[]) if (db[k] === undefined) (db as unknown as Record<string, unknown>)[k] = base[k];
        return db;
      }
    } catch { /* fall through */ }
    const seeded = demoDb(); write(seeded); return seeded;
  };
  const write = (db: Db) => { try { localStorage.setItem(LS, JSON.stringify(db)); } catch { /* private mode */ } };
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((f) => f());
  const delay = () => new Promise((r) => setTimeout(r, 120));

  return {
    kind: 'demo',
    async load() { await delay(); return read(); },
    async insert(table, row) {
      const db = read();
      const rec = { ...row, id: (row as { id?: string }).id ?? crypto.randomUUID(), created_at: new Date().toISOString() } as Record<string, unknown>;
      if (table === 'quotes' && !rec.number) {
        const y = String(rec.issue_date ?? new Date().toISOString()).slice(0, 4);
        const pre = rec.kind === 'invoice' ? 'INV' : 'Q';
        const n = db.quotes.filter((q) => q.number?.startsWith(`EH/${pre}/${y}/`)).length + 1;
        rec.number = `EH/${pre}/${y}/${String(n).padStart(4, '0')}`;
      }
      (db[DB_KEY[table]] as unknown[]).unshift(rec);
      write(db); changed();
      return rec as never;
    },
    async update(table, id, patch) {
      const db = read();
      const list = db[DB_KEY[table]] as { id: string }[];
      const i = list.findIndex((r) => r.id === id);
      if (i >= 0) list[i] = { ...list[i], ...patch };
      write(db); changed();
    },
    async remove(table, id) {
      const db = read();
      (db[DB_KEY[table]] as unknown) = (db[DB_KEY[table]] as { id: string }[]).filter((r) => r.id !== id);
      write(db); changed();
    },
    async saveSettings(patch) { const db = read(); db.settings = { ...db.settings, ...patch }; write(db); changed(); },
    subscribe(onChange) { listeners.add(onChange); return () => { listeners.delete(onChange); }; },
    async listProfiles() {
      return read().people;
    },
    async setRole() { /* demo: single user */ },
  };
}

export function resetDemo() { try { localStorage.removeItem(LS); } catch { /* ignore */ } }
