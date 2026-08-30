-- =====================================================================
-- SALES SAAS - DATABASE SCHEMA
-- Run this once in Supabase SQL Editor (Project -> SQL Editor -> New query)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES  (one row per user, extends Supabase auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  location text default 'Head Office',
  role text not null default 'pending' check (role in ('pending', 'sales_person', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. MONTHLY TARGETS  (set by Admin per sales person, per month)
--    Mirrors: Monthly Sales Target, Monthly Collection Target, Opening Dues
-- ---------------------------------------------------------------------
create table if not exists public.monthly_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month date not null,              -- always store as first day of month, e.g. 2027-01-01
  sales_target numeric not null default 0,
  collection_target numeric not null default 0,
  opening_dues numeric not null default 0,
  created_at timestamptz default now(),
  unique (user_id, month)
);

-- ---------------------------------------------------------------------
-- 3. DAILY ENTRIES  (added by Sales Person, one row per day)
--    Mirrors: Date, Sales, Collections, Sales Return, Remarks
--    net_sales is a GENERATED column so it is ALWAYS calculated the
--    same way for every sales person - never entered by hand.
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
  created_at timestamptz default now(),
  unique (user_id, entry_date)
);

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

create policy "profiles: admin can update any row (approve / reject / edit)"
  on public.profiles for update
  using (public.is_admin());

-- MONTHLY TARGETS policies
create policy "targets: sales person can read own targets"
  on public.monthly_targets for select
  using (user_id = auth.uid());

create policy "targets: admin can read all targets"
  on public.monthly_targets for select
  using (public.is_admin());

create policy "targets: admin can insert/update targets"
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

create policy "entries: sales person can insert own entries"
  on public.daily_entries for insert
  with check (user_id = auth.uid());

create policy "entries: sales person can update own entries"
  on public.daily_entries for update
  using (user_id = auth.uid());

-- =====================================================================
-- MAKE THE FIRST ADMIN
-- After you sign up once through the app's /signup page, run this
-- (replace the email) so that first account becomes Admin:
--
--   update public.profiles
--   set role = 'admin', status = 'approved'
--   where email = 'you@example.com';
-- =====================================================================
