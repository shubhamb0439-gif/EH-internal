-- =====================================================================
--  EVENT HORIZON v2 — WORK: projects, timeline, tasks (incl. recurring), bugs
--  For an existing database: paste this whole file into the Supabase SQL Editor and Run.
--  Safe to run more than once. (Fresh installs get the same thing from schema.sql.)
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
