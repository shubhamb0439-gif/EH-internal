-- Our split: run this once in Supabase > SQL Editor > New query > Run.

create table if not exists public.groups (
  id          text primary key check (length(id) between 16 and 64),
  members     jsonb not null default '[]'::jsonb,
  currency    text  not null default '€',
  updated_at  timestamptz not null default now()
);

create table if not exists public.entries (
  id          text primary key check (length(id) between 8 and 64),
  group_id    text not null references public.groups(id) on delete cascade,
  payer       text not null,
  amount      integer not null check (amount > 0),          -- cents
  kind        text not null check (kind in ('cost', 'investment', 'payment')),
  among       jsonb not null,                                -- member ids the amount is split between
  note        text not null default '',
  at          bigint not null,                               -- ms since epoch
  created_at  timestamptz not null default now()
);

create index if not exists entries_group_at on public.entries (group_id, at desc);

-- Lock the tables: with RLS on and no policies, the public key can't read or list them directly.
-- The app only goes through the functions below, which need the group's secret id from the link.
alter table public.groups  enable row level security;
alter table public.entries enable row level security;

create or replace function public.get_group(gid text)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'group',   (select json_build_object('members', g.members, 'currency', g.currency)
                from groups g where g.id = gid),
    'entries', coalesce((
                 select json_agg(e order by e.at desc)
                 from (select id, payer, amount, kind, among, note, at
                       from entries where group_id = gid
                       order by at desc limit 1000) e
               ), '[]'::json)
  );
$$;

create or replace function public.save_group(gid text, p_members jsonb, p_currency text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if length(gid) < 16 then raise exception 'invalid group id'; end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) > 50 then
    raise exception 'invalid members';
  end if;
  insert into groups (id, members, currency, updated_at)
  values (gid, p_members, left(coalesce(p_currency, '€'), 4), now())
  on conflict (id) do update
    set members = excluded.members, currency = excluded.currency, updated_at = now();
end;
$$;

create or replace function public.add_entry(
  gid text, p_id text, p_payer text, p_amount integer, p_kind text,
  p_among jsonb, p_note text, p_at bigint
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if length(gid) < 16 then raise exception 'invalid group id'; end if;
  if jsonb_typeof(p_among) <> 'array' then raise exception 'invalid split'; end if;
  insert into groups (id) values (gid) on conflict (id) do nothing;
  insert into entries (id, group_id, payer, amount, kind, among, note, at)
  values (p_id, gid, left(p_payer, 40), p_amount, p_kind, p_among, left(coalesce(p_note, ''), 120), p_at)
  on conflict (id) do nothing;   -- a retried save never creates a duplicate
end;
$$;

create or replace function public.delete_entry(gid text, p_id text)
returns void
language sql security definer set search_path = public
as $$
  delete from entries where group_id = gid and id = p_id;
$$;

revoke all on function public.get_group(text)                                          from public;
revoke all on function public.save_group(text, jsonb, text)                            from public;
revoke all on function public.add_entry(text, text, text, integer, text, jsonb, text, bigint) from public;
revoke all on function public.delete_entry(text, text)                                 from public;

grant execute on function public.get_group(text)                                          to anon, authenticated;
grant execute on function public.save_group(text, jsonb, text)                            to anon, authenticated;
grant execute on function public.add_entry(text, text, text, integer, text, jsonb, text, bigint) to anon, authenticated;
grant execute on function public.delete_entry(text, text)                                 to anon, authenticated;
