import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Db, Profile, Role } from './types';
import { demoRepo, supabaseRepo, type Repo } from './repo';
import { can as canRole, type Capability } from '../lib/roles';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseConfigured = !!(URL_ && KEY_);

type AuthState = 'booting' | 'signed-out' | 'ready';

interface Ctx {
  auth: AuthState;
  repo: Repo | null;
  sb: SupabaseClient | null;
  profile: Profile | null;
  db: Db | null;
  error: string | null;
  refresh: () => Promise<void>;
  can: (cap: Capability) => boolean;
  role: Role | undefined;
  signOut: () => Promise<void>;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>('booting');
  const [sb, setSb] = useState<SupabaseClient | null>(null);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const seq = useRef(0);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const loadAll = useCallback(async (r: Repo) => {
    const n = ++seq.current;
    try {
      const next = await r.load();
      if (n === seq.current) { setDb(next); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(errText(e));
    }
  }, []);

  // Boot: demo mode or Supabase session.
  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    (async () => {
      if (!supabaseConfigured) {
        const r = demoRepo();
        setRepo(r);
        setProfile({ id: 'demo', email: null, full_name: 'Demo owner', role: 'owner', partner_id: null });
        await loadAll(r);
        if (!cancelled) setAuth('ready');
        return;
      }
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(URL_!, KEY_!, { auth: { persistSession: true, autoRefreshToken: true } });
      setSb(client);
      const onSession = async (session: Session | null) => {
        if (cancelled) return;
        if (!session) { setProfile(null); setDb(null); setRepo(null); setAuth('signed-out'); return; }
        const { data: prof, error: profErr } = await client.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
        if (profErr) { setError(`Can’t read your profile: ${errText(profErr)}`); setAuth('ready'); return; }
        const r = supabaseRepo(client);
        setRepo(r);
        setProfile((prof as Profile) ?? { id: session.user.id, email: session.user.email ?? null, full_name: '', role: 'pending', partner_id: null });
        if (prof && (prof as Profile).role !== 'pending') await loadAll(r);
        setAuth('ready');
      };
      const { data } = await client.auth.getSession();
      await onSession(data.session);
      const sub = client.auth.onAuthStateChange((evt, session) => {
        // defer: supabase-js holds an auth lock during this callback; querying inside it can deadlock
        if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'USER_UPDATED') setTimeout(() => onSession(session), 0);
      });
      off = () => sub.data.subscription.unsubscribe();
    })();
    return () => { cancelled = true; off(); };
  }, [loadAll]);

  // Live updates from other devices.
  useEffect(() => {
    if (!repo || auth !== 'ready' || profile?.role === 'pending') return;
    return repo.subscribe(() => loadAll(repo));
  }, [repo, auth, profile?.role, loadAll]);

  const value = useMemo<Ctx>(() => ({
    auth, repo, sb, profile, db, error, toast, toastMsg,
    role: profile?.role,
    refresh: async () => { if (repo) await loadAll(repo); },
    can: (cap) => canRole(profile?.role, cap),
    signOut: async () => { if (sb) await sb.auth.signOut(); },
  }), [auth, repo, sb, profile, db, error, toast, toastMsg, loadAll]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore outside provider');
  return v;
}

/** Runs a write, refreshes, and reports errors as a toast. Returns the result or undefined. */
export function useMutate() {
  const { refresh, toast } = useStore();
  return useCallback(async <T,>(fn: () => Promise<T>, done?: string): Promise<T | undefined> => {
    try {
      const r = await fn();
      await refresh();
      if (done) toast(done);
      return r;
    } catch (e) {
      toast(errText(e));
      return undefined;
    }
  }, [refresh, toast]);
}

export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  const code = (e as { code?: string })?.code;
  if (code === '42501' || /row-level security|permission denied/i.test(m)) return 'Your role does not allow that.';
  if (code === '42P01' || /schema cache|does not exist/i.test(m)) return 'Database not set up yet — run supabase/schema.sql.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Offline — check your connection.';
  return m.slice(0, 140);
}
