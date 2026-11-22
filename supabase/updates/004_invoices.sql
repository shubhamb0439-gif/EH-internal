-- =====================================================================
--  EVENT HORIZON v4 — invoices alongside quotations
--  Paste this whole file into the Supabase SQL Editor and Run. Safe to run more than once.
--  Invoices live in the same table as quotes (kind = 'invoice') and get their own
--  numbering: EH/INV/2026/0001. `paid` is what the client has paid against it (paise).
--  An invoice is a document only: money is counted when it's recorded in Money.
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
