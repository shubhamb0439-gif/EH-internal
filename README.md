# Event Horizon — internal ERP

React + Vite + TypeScript front end, Supabase back end. Monochrome, phone-first, installable on a phone's home screen.

## Run it

```bash
npm install
npm run dev          # http://localhost:6001 (also on your LAN IP, so you can open it on your phone)
```

With no Supabase keys it runs in **demo mode**: sample data, saved in that browser only.

## Go live with Supabase

1. Supabase → SQL Editor → paste all of `supabase/schema.sql` → Run.
2. Supabase → Project Settings → API → copy the Project URL and the **anon / publishable** key into `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. Restart `npm run dev`. Create your account: **the first sign-up becomes Owner**. Everyone after that waits as
   "Awaiting access" until an owner or admin gives them a role in Settings → Team & access.
4. In Settings → Partners, rename the partners (or add yours) and set the profit share (50/50 by default).
   Link each partner's login to their partner record in Team & access, so "Landed with" pre-selects them.

**Already set up before v2?** Run `supabase/updates/002_work.sql` once in the SQL Editor to add projects, tasks and bugs.

If you used the old "Our split" app (`legacy/`), the bottom of `schema.sql` has a commented block that copies its members and entries over.

## How the money maths works

Same model as the old split app, extended to client income (`src/lib/finance.ts`):

| Event | Effect |
|---|---|
| Client pays ₹X into partner A's account | A holds ₹X; each partner is owed their share (50/50 by default, or a custom split for that receipt) |
| Partner pays an expense | They're owed back by everyone it's split between, in equal parts |
| Investment | Same as an expense for balances, but counted as capital, not cost |
| Settle-up | Clears what one partner owes another |

**Profit = money from clients − expenses.** The Distribution tab shows the smallest set of transfers that makes everyone square.
All money is stored as whole paise (`bigint`), never floats.

## Work

`/work` has three tabs: **To-do** (one-off and recurring tasks: daily, weekdays, weekly, monthly; ticked per day), **Projects** (client, lead, start → deadline, a timeline of milestones and client deliverables), and **Bugs** (severity, status, assignee). Logic is in `src/lib/work.ts`.

## Roles

`owner · admin · finance · sales · viewer · pending`. Enforced in the database with RLS policies (`schema.sql`) and mirrored
in the UI (`src/lib/roles.ts`). To add a permission, add it in both places.

## Brand assets

`public/brand/` holds black and white versions of the logo and the mark as SVG + PNG, plus app icons.
They are pure vector (the wordmark is drawn as strokes, with no font needed). Regenerate with `npm run logos` after editing `src/lib/brand.ts`.

## Layout

```
src/
  data/      types, Supabase + demo repositories, store (auth, realtime, roles)
  lib/       money formatting (₹ L/Cr), distribution maths, roles, brand geometry
  pdf/       quotation PDF (jsPDF), share sheet on phones / download on desktop
  components/ dock, side rail, splash, sheets, chart, icons, forms
  pages/     Dashboard, Work (+ project), Money, Clients, Quotes (+ builder), Settings, Login
supabase/schema.sql
```
