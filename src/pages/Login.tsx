import { useState } from 'react';
import { errText, useStore } from '../data/store';
import { Lockup } from '../components/Logo';
import { Field } from '../components/Sheet';
import { Icon } from '../components/Icon';

export function Login() {
  const { sb } = useStore();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sb) return;
    setBusy(true); setMsg(null);
    try {
      if (mode === 'in') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setMsg('Check your inbox to confirm your email, then sign in.');
      }
    } catch (err) { setMsg(errText(err)); }
    setBusy(false);
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="logo"><Lockup /></div>
        <div className="eyebrow">Internal systems · restricted</div>
        <h1 className="serif" style={{ fontSize: 46, lineHeight: 1, margin: '10px 0 28px', letterSpacing: '-.02em' }}>{mode === 'in' ? <>Welcome <em style={{ color: 'var(--ink-2)' }}>back</em></> : <>Request <em style={{ color: 'var(--ink-2)' }}>access</em></>}</h1>
        <div className="form">
          {mode === 'up' && <Field label="Full name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></Field>}
          <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
          <Field label="Password"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
          {msg && <div className="banner" style={{ margin: 0 }}>{msg}</div>}
          <button className="btn block" disabled={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}<Icon name="chevron" /></button>
          <button type="button" className="btn quiet block" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
            {mode === 'in' ? 'New here? Request access' : 'Have an account? Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Pending() {
  const { signOut, profile } = useStore();
  return (
    <div className="login">
      <div className="login-card">
        <div className="logo"><Lockup /></div>
        <div className="eyebrow">Signed in as {profile?.email}</div>
        <h1 className="serif" style={{ fontSize: 44, lineHeight: 1, margin: '10px 0 16px' }}>Awaiting <em style={{ color: 'var(--ink-2)' }}>access</em></h1>
        <p className="muted">An owner or admin needs to give your account a role in Settings → Team. Reload once they have.</p>
        <div className="row mt2"><button className="btn" onClick={() => location.reload()}>Reload</button><button className="btn ghost" onClick={signOut}>Sign out</button></div>
      </div>
    </div>
  );
}
