-- =====================================================================
--  EVENT HORIZON v5 — show / hide partner names under the signatures
--  Paste this whole file into the Supabase SQL Editor and Run. Safe to run more than once.
--  Per quotation / invoice. Signatures always print; this only controls the names.
-- =====================================================================
alter table public.quotes add column if not exists show_names boolean not null default true;
