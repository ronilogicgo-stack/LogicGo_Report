-- =====================================================================
-- SALES SAAS - DATABASE SCHEMA (v2)
-- Run this once in Supabase SQL Editor for a BRAND NEW project.
-- If you already ran the v1 schema on a live project, use
-- supabase/migration_v2.sql instead (it only adds what's new).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES  (one row per user, extends Supabase auth.users)
--    status 'paused' = Admin has frozen this employee's access.
--    A paused user is signed out immediately on login attempt.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  location text default 'Head Office',
  role text not null default 'pending' check (role in ('pending', 'sales_person', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paused')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. MONTHLY TARGETS  (set by Admin per sales person, per month)
--    Mirrors the employee sheet's "Subject / Amount" block:
--    Monthly Sales Target, Monthly Collection Target,
--    Month Opening Dues, Monthly Dues Recovery (target).
-- ---------------------------------------------------------------------
create table if not exists public.monthly_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month date not null,              -- always store as first day of month, e.g. 2027-01-01
  sales_target numeric not null default 0,
  collection_target numeric not null default 0,
  opening_dues numeric not null default 0,
  dues_recovery_target numeric not null default 0,
  created_at timestamptz default now(),
  unique (user_id, month)
);

-- ---------------------------------------------------------------------
-- 3. DAILY ENTRIES  (added by Sales Person, one row per day)
--    Mirrors the employee sheet's daily table exactly:
--    Date, Sales, Collections, Collection Gap, Sales Return, Net Sales, Remarks
--    net_sales and collection_gap are GENERATED columns so every sales
--    person is always calculated the exact same way - never by hand.
-- ---------------------------------------------------------------------
create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null,
  sales numeric not null default 0,
  collections numeric not null default 0,
  sales_return numeric not null default 0,
  remarks text default '',
  net_sales numeric generated always as (sales - sales_return) stored,
  collection_gap numeric generated always as (sales - collections) stored,
  -- Per-field edit counters, e.g. {"sales":0,"collections":2,"sales_return":1,"remarks":0}
  -- Only the exact field that changes gets its counter bumped, so the UI
  -- can highlight just that one cell in red - not the whole row.
  field_edits jsonb not null default '{"sales":0,"collections":0,"sales_return":0,"remarks":0}'::jsonb,
  last_edited_at timestamptz,
  last_edited_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  unique (user_id, entry_date)
);

-- Whenever a daily entry's real data changes (not a no-op re-save of the
-- same numbers), bump ONLY the counter(s) for the field(s) that actually
-- changed, and record who did it - whether that's the sales person
-- themselves or an Admin editing on their behalf.
create or replace function public.track_daily_entry_edit()
returns trigger
language plpgsql
as $$
declare
  fe jsonb;
  changed boolean := false;
begin
  fe := coalesce(old.field_edits, '{"sales":0,"collections":0,"sales_return":0,"remarks":0}'::jsonb);

  if old.sales is distinct from new.sales then
    fe := jsonb_set(fe, '{sales}', to_jsonb(coalesce((fe->>'sales')::int, 0) + 1));
    changed := true;
  end if;

  if old.collections is distinct from new.collections then
    fe := jsonb_set(fe, '{collections}', to_jsonb(coalesce((fe->>'collections')::int, 0) + 1));
    changed := true;
  end if;

  if old.sales_return is distinct from new.sales_return then
    fe := jsonb_set(fe, '{sales_return}', to_jsonb(coalesce((fe->>'sales_return')::int, 0) + 1));
    changed := true;
  end if;

  if old.remarks is distinct from new.remarks then
    fe := jsonb_set(fe, '{remarks}', to_jsonb(coalesce((fe->>'remarks')::int, 0) + 1));
    changed := true;
  end if;

  new.field_edits := fe;

  if changed then
    new.last_edited_at := now();
    new.last_edited_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_track_daily_entry_edit on public.daily_entries;
create trigger trg_track_daily_entry_edit
  before update on public.daily_entries
  for each row execute function public.track_daily_entry_edit();

-- ---------------------------------------------------------------------
-- Helper: is the currently logged-in user an admin?
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Helper: is the currently logged-in user an approved (not paused)
-- sales person? Used to block writes from paused accounts even if
-- someone tries to call the API directly.
-- ---------------------------------------------------------------------
create or replace function public.is_active_sales_person()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'sales_person' and status = 'approved'
  );
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.monthly_targets enable row level security;
alter table public.daily_entries enable row level security;

-- PROFILES policies
create policy "profiles: user can read own row"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: admin can read all rows"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: user can insert own row on signup"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles: admin can update any row (approve / reject / pause / edit)"
  on public.profiles for update
  using (public.is_admin());

-- MONTHLY TARGETS policies
create policy "targets: sales person can read own targets"
  on public.monthly_targets for select
  using (user_id = auth.uid());

create policy "targets: admin can read all targets"
  on public.monthly_targets for select
  using (public.is_admin());

create policy "targets: admin can insert targets"
  on public.monthly_targets for insert
  with check (public.is_admin());

create policy "targets: admin can update targets"
  on public.monthly_targets for update
  using (public.is_admin());

-- DAILY ENTRIES policies
create policy "entries: sales person can read own entries"
  on public.daily_entries for select
  using (user_id = auth.uid());

create policy "entries: admin can read all entries"
  on public.daily_entries for select
  using (public.is_admin());

-- Only an ACTIVE (approved, not paused) sales person may add/edit entries
create policy "entries: active sales person can insert own entries"
  on public.daily_entries for insert
  with check (user_id = auth.uid() and public.is_active_sales_person());

create policy "entries: active sales person can update own entries"
  on public.daily_entries for update
  using (user_id = auth.uid() and public.is_active_sales_person());

-- An Admin may also edit ANY sales person's daily entries directly
create policy "entries: admin can insert any entries"
  on public.daily_entries for insert
  with check (public.is_admin());

create policy "entries: admin can update any entries"
  on public.daily_entries for update
  using (public.is_admin());

-- =====================================================================
-- MAKE THE FIRST ADMIN
-- After you sign up once through the app's /signup page, run this
-- (replace the email) so that first account becomes Admin:
--
--   update public.profiles
--   set role = 'admin', status = 'approved'
--   where email = 'you@example.com';
-- =====================================================================
