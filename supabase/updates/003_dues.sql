-- =====================================================================
--  EVENT HORIZON v3 — money clients still owe us ("To collect")
--  Paste this whole file into the Supabase SQL Editor and Run. Safe to run more than once.
--  A due is NOT income: it isn't split or counted in profit until it's marked received,
--  which records a normal receipt in client_payments and links it here.
-- =====================================================================
create table if not exists public.client_dues (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.clients(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  amount      bigint not null check (amount > 0),                 -- paise still outstanding
  due_date    date,
  note        text not null default '',
  status      text not null default 'due' check (status in ('due','received','cancelled')),
  payment_id  uuid references public.client_payments(id) on delete set null,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists client_dues_client_idx on public.client_dues (client_id);

do $$ begin
  drop trigger if exists client_dues_log on public.client_dues;
  create trigger client_dues_log after insert or update or delete on public.client_dues
    for each row execute function public.log_activity();
end $$;

alter table public.client_dues enable row level security;
grant select, insert, update, delete on public.client_dues to authenticated;

-- same access as receipts
drop policy if exists dues_read on public.client_dues;
drop policy if exists dues_ins  on public.client_dues;
drop policy if exists dues_upd  on public.client_dues;
drop policy if exists dues_del  on public.client_dues;
create policy dues_read on public.client_dues for select to authenticated using (public.has_role('owner','admin','finance','viewer'));
create policy dues_ins  on public.client_dues for insert to authenticated with check (public.has_role('owner','admin','finance'));
create policy dues_upd  on public.client_dues for update to authenticated using (public.has_role('owner','admin','finance')) with check (public.has_role('owner','admin','finance'));
create policy dues_del  on public.client_dues for delete to authenticated using (public.has_role('owner','admin'));

do $$ begin
  alter publication supabase_realtime add table public.client_dues;
exception when duplicate_object then null; when undefined_object then null;
end $$;
