-- =====================================================================
--  EVENT HORIZON ERP — Supabase schema v1
--  Run once in Supabase > SQL Editor > New query > Run. Safe to re-run.
--
--  Money is stored as BIGINT paise (₹1 = 100). Never floats.
--  Access is role based (owner, admin, finance, sales, viewer, pending)
--  and enforced here with Row Level Security, not just in the UI.
--  The first account that signs up becomes OWNER; everyone after that
--  lands as PENDING until an owner/admin gives them a role.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Roles & profiles -------------------------------------------------
do $$ begin
  create type public.app_role as enum ('owner','admin','finance','sales','viewer','pending');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  role        public.app_role not null default 'pending',
  partner_id  uuid,                                  -- links a login to a partner (optional)
  created_at  timestamptz not null default now()
);

-- Current user's role. SECURITY DEFINER so policies can call it without recursion.
create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'pending'::public.app_role);
$$;

create or replace function public.has_role(variadic roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = any(roles);
$$;

-- New auth user -> profile. First user ever becomes owner.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from profiles) then 'pending'::app_role else 'owner'::app_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stop people promoting themselves: only owner/admin may change role; only owner may grant owner.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- No signed-in user = SQL Editor / service role: the project admin, always allowed.
  if auth.uid() is null then return new; end if;
  if new.role is distinct from old.role then
    if not public.has_role('owner','admin') then raise exception 'not allowed to change roles'; end if;
    if (new.role = 'owner' or old.role = 'owner') and not public.has_role('owner') then
      raise exception 'only an owner can grant or remove owner';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------- Company settings (single row) -----------------------------------
create table if not exists public.company_settings (
  id              int primary key default 1 check (id = 1),
  legal_name      text not null default 'Event Horizon',
  address         text not null default '',
  email           text not null default '',
  phone           text not null default '',
  gstin           text not null default '',
  pan             text not null default '',
  bank_details    text not null default '',
  quote_terms     text not null default E'50% advance on confirmation, balance on delivery.\nPrices are exclusive of taxes unless stated.\nQuote valid for 15 days.',
  default_tax_pct numeric(5,2) not null default 18,
  currency        text not null default 'INR',
  updated_at      timestamptz not null default now()
);
insert into public.company_settings (id) values (1) on conflict do nothing;

-- ---------- Partners (who money is split between) ---------------------------
create table if not exists public.partners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 60),
  share_pct   numeric(6,3) not null default 50 check (share_pct >= 0 and share_pct <= 100),
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

do $$ begin
  alter table public.profiles add constraint profiles_partner_fk
    foreign key (partner_id) references public.partners(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- Clients ----------------------------------------------------------
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 1 and 120),
  contact_name  text not null default '',
  email         text not null default '',
  phone         text not null default '',
  gstin         text not null default '',
  address       text not null default '',
  city          text not null default '',
  status        text not null default 'active' check (status in ('lead','active','paused','archived')),
  notes         text not null default '',
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists clients_name_idx on public.clients (lower(name));

-- ---------- Service catalogue (pre-entered quote lines) ---------------------
create table if not exists public.catalog_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  unit        text not null default 'unit',
  rate        bigint not null default 0 check (rate >= 0),        -- paise
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Quotations -------------------------------------------------------
create table if not exists public.doc_counters (
  key   text primary key,      -- e.g. 'quote-2026'
  value int  not null default 0
);

create table if not exists public.quotes (
  id            uuid primary key default gen_random_uuid(),
  number        text unique,
  client_id     uuid references public.clients(id) on delete set null,
  client_snapshot jsonb not null default '{}'::jsonb,   -- name/address/gstin frozen at time of quote
  title         text not null default '',
  issue_date    date not null default current_date,
  valid_until   date,
  status        text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  items         jsonb not null default '[]'::jsonb,     -- [{name, description, qty, unit, rate(paise)}]
  discount      bigint not null default 0 check (discount >= 0),  -- paise, flat
  tax_pct       numeric(5,2) not null default 18,
  subtotal      bigint not null default 0,
  tax_amount    bigint not null default 0,
  total         bigint not null default 0,
  notes         text not null default '',
  terms         text not null default '',
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists quotes_client_idx on public.quotes (client_id);

-- Atomic per-year numbering: EH/Q/2026/0001
create or replace function public.assign_quote_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text; n int;
begin
  if new.number is null or new.number = '' then
    k := 'quote-' || to_char(coalesce(new.issue_date, current_date), 'YYYY');
    insert into doc_counters (key, value) values (k, 1)
      on conflict (key) do update set value = doc_counters.value + 1
      returning value into n;
    new.number := 'EH/Q/' || to_char(coalesce(new.issue_date, current_date), 'YYYY') || '/' || lpad(n::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists quotes_number on public.quotes;
create trigger quotes_number before insert or update on public.quotes
  for each row execute function public.assign_quote_number();

-- ---------- Money in: client receipts ---------------------------------------
-- received_by = the partner whose account the money landed in.
-- split = [{partner_id, pct}] — defaults to partners' share_pct (50/50) in the app.
-- That partner then owes every other partner their share (same maths as costs, reversed).
create table if not exists public.client_payments (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references public.clients(id) on delete set null,
  quote_id     uuid references public.quotes(id) on delete set null,
  amount       bigint not null check (amount > 0),                 -- paise
  received_by  uuid not null references public.partners(id),
  split        jsonb not null default '[]'::jsonb,
  method       text not null default 'bank' check (method in ('bank','upi','cash','cheque','card','other')),
  reference    text not null default '',
  received_on  date not null default current_date,
  note         text not null default '',
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists client_payments_date_idx on public.client_payments (received_on desc);
create index if not exists client_payments_client_idx on public.client_payments (client_id);

-- ---------- Partner ledger: costs, investments, settle-ups ------------------
-- Same model as the original split app: payer paid `amount`, split equally among `among`.
create table if not exists public.ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('cost','investment','payment')),
  payer_id    uuid not null references public.partners(id),
  amount      bigint not null check (amount > 0),                  -- paise
  among       uuid[] not null,
  category    text not null default '',
  client_id   uuid references public.clients(id) on delete set null,  -- optional: cost tied to a client
  note        text not null default '',
  entry_date  date not null default current_date,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists ledger_date_idx on public.ledger_entries (entry_date desc);

-- ---------- Activity log (who did what) -------------------------------------
create table if not exists public.activity_log (
  id         bigint generated always as identity primary key,
  actor      uuid default auth.uid(),
  action     text not null,
  entity     text not null,
  entity_id  text,
  at         timestamptz not null default now()
);

create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (action, entity, entity_id)
  values (lower(tg_op), tg_table_name, coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, null));
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['clients','quotes','client_payments','ledger_entries','partners'] loop
    execute format('drop trigger if exists %I_log on public.%I', t, t);
    execute format('create trigger %I_log after insert or update or delete on public.%I for each row execute function public.log_activity()', t, t);
  end loop;
end $$;

-- =====================================================================
--  ROW LEVEL SECURITY
--  owner   : everything
--  admin   : everything except granting owner
--  finance : money (payments, ledger), clients, quotes read
--  sales   : clients + quotes + catalogue
--  viewer  : read-only on clients/quotes/dashboard figures
--  pending : nothing until approved
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.company_settings enable row level security;
alter table public.partners         enable row level security;
alter table public.clients          enable row level security;
alter table public.catalog_items    enable row level security;
alter table public.quotes           enable row level security;
alter table public.doc_counters     enable row level security;
alter table public.client_payments  enable row level security;
alter table public.ledger_entries   enable row level security;
alter table public.activity_log     enable row level security;

-- Table privileges. Newer Supabase projects don't grant these automatically.
-- Only signed-in users get them; RLS below then decides row by row. anon gets nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.company_settings, public.partners, public.clients, public.catalog_items,
  public.quotes, public.client_payments, public.ledger_entries
  to authenticated;
grant select on public.activity_log to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;
revoke all on public.doc_counters from anon, authenticated;

-- helper to (re)create a policy idempotently
create or replace function pg_temp.pol(p_table text, p_name text, p_cmd text, p_using text, p_check text default null)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', p_name, p_table);
  if p_cmd = 'insert' then
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', p_name, p_table, coalesce(p_check, p_using));
  elsif p_cmd = 'select' or p_cmd = 'delete' then
    execute format('create policy %I on public.%I for %s to authenticated using (%s)', p_name, p_table, p_cmd, p_using);
  else
    execute format('create policy %I on public.%I for %s to authenticated using (%s) with check (%s)', p_name, p_table, p_cmd, p_using, coalesce(p_check, p_using));
  end if;
end $$;

-- profiles
select pg_temp.pol('profiles','profiles_read','select', $$ id = auth.uid() or public.my_role() <> 'pending' $$);  -- team directory
select pg_temp.pol('profiles','profiles_self_update','update', $$ id = auth.uid() or public.has_role('owner','admin') $$);

-- company settings
select pg_temp.pol('company_settings','settings_read','select', $$ public.my_role() <> 'pending' $$);
select pg_temp.pol('company_settings','settings_write','update', $$ public.has_role('owner','admin') $$);

-- partners
select pg_temp.pol('partners','partners_read','select', $$ public.my_role() <> 'pending' $$);
select pg_temp.pol('partners','partners_ins','insert', $$ public.has_role('owner') $$);
select pg_temp.pol('partners','partners_upd','update', $$ public.has_role('owner') $$);
select pg_temp.pol('partners','partners_del','delete', $$ public.has_role('owner') $$);

-- clients
select pg_temp.pol('clients','clients_read','select', $$ public.my_role() <> 'pending' $$);
select pg_temp.pol('clients','clients_ins','insert', $$ public.has_role('owner','admin','finance','sales') $$);
select pg_temp.pol('clients','clients_upd','update', $$ public.has_role('owner','admin','finance','sales') $$);
select pg_temp.pol('clients','clients_del','delete', $$ public.has_role('owner','admin') $$);

-- catalogue
select pg_temp.pol('catalog_items','catalog_read','select', $$ public.my_role() <> 'pending' $$);
select pg_temp.pol('catalog_items','catalog_ins','insert', $$ public.has_role('owner','admin','sales') $$);
select pg_temp.pol('catalog_items','catalog_upd','update', $$ public.has_role('owner','admin','sales') $$);
select pg_temp.pol('catalog_items','catalog_del','delete', $$ public.has_role('owner','admin') $$);

-- quotes
select pg_temp.pol('quotes','quotes_read','select', $$ public.my_role() <> 'pending' $$);
select pg_temp.pol('quotes','quotes_ins','insert', $$ public.has_role('owner','admin','sales') $$);
select pg_temp.pol('quotes','quotes_upd','update', $$ public.has_role('owner','admin','sales') $$);
select pg_temp.pol('quotes','quotes_del','delete', $$ public.has_role('owner','admin') $$);

-- money in
select pg_temp.pol('client_payments','pay_read','select', $$ public.has_role('owner','admin','finance','viewer') $$);
select pg_temp.pol('client_payments','pay_ins','insert', $$ public.has_role('owner','admin','finance') $$);
select pg_temp.pol('client_payments','pay_upd','update', $$ public.has_role('owner','admin','finance') $$);
select pg_temp.pol('client_payments','pay_del','delete', $$ public.has_role('owner','admin') $$);

-- partner ledger
select pg_temp.pol('ledger_entries','led_read','select', $$ public.has_role('owner','admin','finance','viewer') $$);
select pg_temp.pol('ledger_entries','led_ins','insert', $$ public.has_role('owner','admin','finance') $$);
select pg_temp.pol('ledger_entries','led_upd','update', $$ public.has_role('owner','admin','finance') $$);
select pg_temp.pol('ledger_entries','led_del','delete', $$ public.has_role('owner','admin') $$);

-- activity log: read only for owner/admin; rows only come from the trigger
select pg_temp.pol('activity_log','log_read','select', $$ public.has_role('owner','admin') $$);

-- doc_counters: no policies -> only the SECURITY DEFINER trigger touches it.

-- ---------- Realtime: push changes to every open phone/desktop --------------
do $$ declare t text; begin
  foreach t in array array['clients','quotes','client_payments','ledger_entries','partners','catalog_items','company_settings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

-- =====================================================================
--  OPTIONAL: bring data over from the old "Our split" app (legacy/setup.sql).
--  Fill in the group id from your old share link, then run this block once.
-- =====================================================================
-- do $$
-- declare gid text := 'PASTE_OLD_GROUP_ID'; m jsonb; map jsonb := '{}';
-- begin
--   for m in select * from jsonb_array_elements((select members from public.groups where id = gid)) loop
--     with p as (insert into public.partners (name, share_pct) values (m->>'name', 50) returning id)
--     select map || jsonb_build_object(m->>'id', (select id from p)) into map;
--   end loop;
--   insert into public.ledger_entries (kind, payer_id, amount, among, note, entry_date)
--   select e.kind, (map->>e.payer)::uuid, e.amount,
--          array(select (map->>x)::uuid from jsonb_array_elements_text(e.among) x where map ? x),
--          e.note, to_timestamp(e.at / 1000)::date
--   from public.entries e where e.group_id = gid and map ? e.payer;
-- end $$;

-- =====================================================================
--  WORK (v2): projects, timeline, tasks, bugs — same as supabase/updates/002_work.sql
-- =====================================================================
-- ---------- Projects ---------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 1 and 160),
  client_id    uuid references public.clients(id) on delete set null,
  status       text not null default 'active' check (status in ('planning','active','on_hold','done')),
  start_date   date,
  due_date     date,
  description  text not null default '',
  lead_id      uuid references public.profiles(id) on delete set null,
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists projects_client_idx on public.projects (client_id);

-- ---------- Timeline: milestones + client deliverables -----------------------
create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  kind        text not null default 'deliverable' check (kind in ('milestone','deliverable')),
  title       text not null check (length(title) between 1 and 200),
  due_date    date,
  done        boolean not null default false,
  done_on     date,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists milestones_project_idx on public.milestones (project_id);

-- ---------- Tasks (to-do list) -----------------------------------------------
-- repeat <> 'none': a recurring task. due_date is its start/anchor, done_on is the last day it was ticked.
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(title) between 1 and 300),
  notes        text not null default '',
  project_id   uuid references public.projects(id) on delete set null,
  assignee_id  uuid references public.profiles(id) on delete set null,
  due_date     date,
  priority     text not null default 'normal' check (priority in ('low','normal','high')),
  repeat       text not null default 'none' check (repeat in ('none','daily','weekdays','weekly','monthly')),
  done         boolean not null default false,
  done_on      date,
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists tasks_project_idx on public.tasks (project_id);

-- ---------- Bugs -------------------------------------------------------------
create table if not exists public.bugs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(title) between 1 and 300),
  description  text not null default '',
  project_id   uuid references public.projects(id) on delete set null,
  severity     text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status       text not null default 'open' check (status in ('open','in_progress','fixed','closed')),
  assignee_id  uuid references public.profiles(id) on delete set null,
  resolved_on  date,
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists bugs_project_idx on public.bugs (project_id);

-- ---------- Activity log -----------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['projects','milestones','tasks','bugs'] loop
    execute format('drop trigger if exists %I_log on public.%I', t, t);
    execute format('create trigger %I_log after insert or update or delete on public.%I for each row execute function public.log_activity()', t, t);
  end loop;
end $$;

-- ---------- Access -----------------------------------------------------------
--  read          : every approved role
--  tasks / bugs / timeline : owner, admin, finance, sales  (viewer is read-only)
--  projects      : owner, admin, sales create & edit
--  delete        : owner/admin, or whoever created the task/bug
alter table public.projects   enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks      enable row level security;
alter table public.bugs       enable row level security;

grant select, insert, update, delete on public.projects, public.milestones, public.tasks, public.bugs to authenticated;

create or replace function pg_temp.pol(p_table text, p_name text, p_cmd text, p_using text, p_check text default null)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', p_name, p_table);
  if p_cmd = 'insert' then
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', p_name, p_table, coalesce(p_check, p_using));
  elsif p_cmd = 'select' or p_cmd = 'delete' then
    execute format('create policy %I on public.%I for %s to authenticated using (%s)', p_name, p_table, p_cmd, p_using);
  else
    execute format('create policy %I on public.%I for %s to authenticated using (%s) with check (%s)', p_name, p_table, p_cmd, p_using, coalesce(p_check, p_using));
  end if;
end $$;

select pg_temp.pol('projects','projects_read','select', $$ public.my_role() <> 'pending' $$);
select pg_temp.pol('projects','projects_ins','insert', $$ public.has_role('owner','admin','sales') $$);
select pg_temp.pol('projects','projects_upd','update', $$ public.has_role('owner','admin','sales') $$);
select pg_temp.pol('projects','projects_del','delete', $$ public.has_role('owner','admin') $$);

select pg_temp.pol('milestones','ms_read','select', $$ public.my_role() <> 'pending' $$);
select pg_temp.pol('milestones','ms_ins','insert', $$ public.has_role('owner','admin','finance','sales') $$);
select pg_temp.pol('milestones','ms_upd','update', $$ public.has_role('owner','admin','finance','sales') $$);
select pg_temp.pol('milestones','ms_del','delete', $$ public.has_role('owner','admin','finance','sales') $$);

select pg_temp.pol('tasks','tasks_read','select', $$ public.my_role() <> 'pending' $$);
select pg_temp.pol('tasks','tasks_ins','insert', $$ public.has_role('owner','admin','finance','sales') $$);
select pg_temp.pol('tasks','tasks_upd','update', $$ public.has_role('owner','admin','finance','sales') $$);
select pg_temp.pol('tasks','tasks_del','delete', $$ public.has_role('owner','admin') or created_by = auth.uid() $$);

select pg_temp.pol('bugs','bugs_read','select', $$ public.my_role() <> 'pending' $$);
select pg_temp.pol('bugs','bugs_ins','insert', $$ public.has_role('owner','admin','finance','sales') $$);
select pg_temp.pol('bugs','bugs_upd','update', $$ public.has_role('owner','admin','finance','sales') $$);
select pg_temp.pol('bugs','bugs_del','delete', $$ public.has_role('owner','admin') or created_by = auth.uid() $$);

-- Team directory: approved members can see each other (names for "assigned to").
-- Role changes are still limited to owner/admin by the guard trigger and the update policy.
select pg_temp.pol('profiles','profiles_read','select', $$ id = auth.uid() or public.my_role() <> 'pending' $$);

-- ---------- Realtime ---------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['projects','milestones','tasks','bugs'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

-- =====================================================================
--  TO COLLECT (v3): same as supabase/updates/003_dues.sql
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

-- =====================================================================
--  INVOICES (v4): same as supabase/updates/004_invoices.sql
-- =====================================================================
alter table public.quotes add column if not exists kind text not null default 'quote';
alter table public.quotes add column if not exists paid bigint not null default 0;

do $$ begin
  alter table public.quotes add constraint quotes_kind_check check (kind in ('quote','invoice'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.quotes add constraint quotes_paid_check check (paid >= 0);
exception when duplicate_object then null; end $$;

-- allow the 'paid' status
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('draft','sent','accepted','rejected','expired','paid'));

-- numbering: EH/Q/2026/0001 for quotes, EH/INV/2026/0001 for invoices
create or replace function public.assign_quote_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text; n int; pre text; yr text;
begin
  if new.number is null or new.number = '' then
    pre := case when new.kind = 'invoice' then 'INV' else 'Q' end;
    yr  := to_char(coalesce(new.issue_date, current_date), 'YYYY');
    k   := case when new.kind = 'invoice' then 'invoice-' else 'quote-' end || yr;
    insert into doc_counters (key, value) values (k, 1)
      on conflict (key) do update set value = doc_counters.value + 1
      returning value into n;
    new.number := 'EH/' || pre || '/' || yr || '/' || lpad(n::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end $$;

-- v5: show / hide partner names under the signatures (updates/005_signature_names.sql)
alter table public.quotes add column if not exists show_names boolean not null default true;
