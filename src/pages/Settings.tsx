import { useEffect, useState } from 'react';
import { supabaseConfigured, useMutate, useStore } from '../data/store';
import type { CatalogItem, CompanySettings, Partner, Profile, Role } from '../data/types';
import { resetDemo } from '../data/repo';
import { ROLE_LABEL } from '../lib/roles';
import { inr, parseInr, toRupeeInput } from '../lib/money';
import { Icon } from '../components/Icon';
import { Field, MoneyInput, Seg, Sheet, initials } from '../components/Sheet';
import { PageHead } from '../components/AppShell';

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('eh-theme', theme); } catch { /* ignore */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F2F2EF' : '#0A0A0A');
  }, [theme]);
  return [theme, setTheme] as const;
}

export function Settings() {
  const { db, profile, can, signOut } = useStore();
  const [theme, setTheme] = useTheme();
  if (!db) return <div className="sk" style={{ height: 400 }} />;
  return (
    <>
      <PageHead eyebrow="Workspace" title={<>Settings</>} />
      <div className="grid grid-2">
        <section className="card">
          <div className="row">
            <span className="avatar solid" style={{ width: 52, height: 52, borderRadius: 16, fontSize: 16 }}>{initials(profile?.full_name || 'EH')}</span>
            <div><div style={{ fontWeight: 600, fontSize: 17 }}>{profile?.full_name || profile?.email}</div><div className="eyebrow" style={{ marginTop: 6 }}>{profile && ROLE_LABEL[profile.role]}</div></div>
          </div>
          <div className="mt2"><Field label="Appearance"><Seg value={theme} onChange={setTheme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} /></Field></div>
          <div className="row mt2 wrap">
            {supabaseConfigured
              ? <button className="btn ghost" onClick={signOut}><Icon name="logout" />Sign out</button>
              : <button className="btn ghost" onClick={() => { if (confirm('Reset demo data on this device?')) { resetDemo(); location.reload(); } }}><Icon name="trash" />Reset demo data</button>}
          </div>
        </section>
        {can('settings.edit') && <CompanyCard settings={db.settings} />}
        {can('partners.edit') && <PartnersCard partners={db.partners} />}
        {can('catalog.edit') && <CatalogCard items={db.catalog} />}
        {can('team.manage') && supabaseConfigured && <TeamCard partners={db.partners} />}
      </div>
    </>
  );
}

function CompanyCard({ settings }: { settings: CompanySettings }) {
  const { repo } = useStore();
  const mutate = useMutate();
  const [f, setF] = useState(settings);
  useEffect(() => setF(settings), [settings]);
  const set = (k: keyof CompanySettings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="card form">
      <div className="card-head" style={{ margin: 0 }}><h2>Company & quote defaults</h2><span className="eyebrow">printed on PDFs</span></div>
      <Field label="Legal name"><input className="input" value={f.legal_name} onChange={set('legal_name')} /></Field>
      <Field label="Address"><textarea className="textarea" value={f.address} onChange={set('address')} /></Field>
      <div className="form-2">
        <Field label="Email"><input className="input" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
      </div>
      <div className="form-2">
        <Field label="GSTIN"><input className="input num" value={f.gstin} onChange={set('gstin')} /></Field>
        <Field label="Default GST %"><input className="input num" inputMode="decimal" value={String(f.default_tax_pct)} onChange={(e) => setF({ ...f, default_tax_pct: Number(e.target.value) || 0 })} /></Field>
      </div>
      <Field label="Bank details"><textarea className="textarea" value={f.bank_details} onChange={set('bank_details')} /></Field>
      <Field label="Default terms"><textarea className="textarea" value={f.quote_terms} onChange={set('quote_terms')} /></Field>
      <button className="btn" onClick={() => repo && mutate(() => repo.saveSettings(f), 'Company details saved')}>Save</button>
    </section>
  );
}

function PartnersCard({ partners }: { partners: Partner[] }) {
  const { repo } = useStore();
  const mutate = useMutate();
  const [rows, setRows] = useState(partners);
  const [name, setName] = useState('');
  useEffect(() => setRows(partners), [partners]);
  const total = rows.filter((p) => p.active).reduce((a, p) => a + Number(p.share_pct), 0);
  const save = () => repo && mutate(async () => { for (const p of rows) await repo.update('partners', p.id, { name: p.name, share_pct: p.share_pct, active: p.active }); }, 'Shares saved');
  return (
    <section className="card">
      <div className="card-head"><h2>Partners & profit share</h2><span className={`tag${Math.abs(total - 100) < 0.01 ? ' solid' : ''}`}>{total}%</span></div>
      <div className="stack">
        {rows.map((p, i) => (
          <div key={p.id} className="row">
            <input className="input" value={p.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className="input num" style={{ width: 90 }} inputMode="decimal" value={String(p.share_pct)} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, share_pct: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 } : x)))} aria-label="Share %" />
            <button className={`chip${p.active ? ' on' : ''}`} onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, active: !x.active } : x)))}>{p.active ? 'Active' : 'Off'}</button>
          </div>
        ))}
        <p className="hint">Default split for client money. Active shares should total 100%. Each receipt can still be split differently.</p>
        <div className="row">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add partner" />
          <button className="btn ghost" disabled={!name.trim()} onClick={() => repo && mutate(() => repo.insert('partners', { name: name.trim(), share_pct: 0, active: true, sort: rows.length }), 'Partner added').then(() => setName(''))}><Icon name="plus" /></button>
        </div>
        <button className="btn" onClick={save} disabled={Math.abs(total - 100) >= 0.01}>Save shares</button>
      </div>
    </section>
  );
}

function CatalogCard({ items }: { items: CatalogItem[] }) {
  const { repo } = useStore();
  const mutate = useMutate();
  const [edit, setEdit] = useState<CatalogItem | null | undefined>(undefined);
  const [f, setF] = useState({ name: '', description: '', unit: 'unit', rate: '' });
  useEffect(() => { if (edit !== undefined) setF(edit ? { name: edit.name, description: edit.description, unit: edit.unit, rate: toRupeeInput(edit.rate) } : { name: '', description: '', unit: 'unit', rate: '' }); }, [edit]);
  const save = async () => {
    if (!repo) return;
    const row = { name: f.name.trim(), description: f.description.trim(), unit: f.unit.trim() || 'unit', rate: Number.isFinite(parseInr(f.rate)) ? parseInr(f.rate) : 0, active: true };
    await mutate<unknown>(() => (edit ? repo.update('catalog_items', edit.id, row) : repo.insert('catalog_items', row)), 'Catalogue saved');
    setEdit(undefined);
  };
  return (
    <section className="card">
      <div className="card-head"><h2>Service catalogue</h2><button className="btn ghost sm" onClick={() => setEdit(null)}><Icon name="plus" />Item</button></div>
      <p className="hint" style={{ marginTop: -6 }}>Pre-entered lines you can drop into any quote.</p>
      <div className="list">
        {items.map((c) => (
          <button className="li" key={c.id} onClick={() => setEdit(c)}>
            <span className="avatar"><Icon name="layers" /></span>
            <div><div className="t">{c.name}</div><div className="s">{c.description || '—'}</div></div>
            <div className="amt">{inr(c.rate)}<small>/{c.unit}</small></div>
          </button>
        ))}
      </div>
      <Sheet open={edit !== undefined} title={edit ? 'Edit item' : 'New item'} onClose={() => setEdit(undefined)}>
        <div className="form">
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="form-2">
            <Field label="Rate"><MoneyInput value={f.rate} onChange={(v) => setF({ ...f, rate: v })} /></Field>
            <Field label="Per"><input className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="day / hour / project" /></Field>
          </div>
          <button className="btn block" disabled={!f.name.trim()} onClick={save}>Save</button>
          {edit && <button className="btn danger block" onClick={async () => { if (repo && confirm('Delete item?')) { await mutate(() => repo.remove('catalog_items', edit.id), 'Deleted'); setEdit(undefined); } }}>Delete</button>}
        </div>
      </Sheet>
    </section>
  );
}

const ROLES: Role[] = ['owner', 'admin', 'finance', 'sales', 'viewer', 'pending'];
function TeamCard({ partners }: { partners: Partner[] }) {
  const { repo, profile, toast } = useStore();
  const [people, setPeople] = useState<Profile[]>([]);
  const load = () => repo?.listProfiles().then(setPeople).catch(() => toast('Could not load team'));
  useEffect(() => { load(); }, [repo]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = async (p: Profile, role: Role, partner_id?: string | null) => {
    try { await repo?.setRole(p.id, role, partner_id); toast('Access updated'); load(); }
    catch (e) { toast((e as Error).message ?? 'Not allowed'); }
  };
  return (
    <section className="card">
      <div className="card-head"><h2>Team & access</h2><Icon name="shield" size={18} /></div>
      <p className="hint" style={{ marginTop: -6 }}>New sign-ups wait as “Awaiting access” until you give them a role.</p>
      <div className="list">
        {people.map((p) => (
          <div className="li" key={p.id} style={{ gridTemplateColumns: 'auto 1fr' }}>
            <span className={`avatar${p.role === 'pending' ? '' : ' solid'}`}>{initials(p.full_name || p.email || '?')}</span>
            <div>
              <div className="t">{p.full_name || p.email}{p.id === profile?.id ? ' (you)' : ''}</div>
              <div className="row mt" style={{ marginTop: 8 }}>
                <select className="select" style={{ minHeight: 38, padding: '6px 34px 6px 10px', fontSize: 14, backgroundPosition: 'calc(100% - 20px) 16px, calc(100% - 15px) 16px' }} value={p.role} disabled={p.id === profile?.id} onChange={(e) => change(p, e.target.value as Role)}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <select className="select" style={{ minHeight: 38, padding: '6px 34px 6px 10px', fontSize: 14, backgroundPosition: 'calc(100% - 20px) 16px, calc(100% - 15px) 16px' }} value={p.partner_id ?? ''} onChange={(e) => change(p, p.role, e.target.value || null)} aria-label="Linked partner">
                  <option value="">No partner link</option>
                  {partners.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
