-- =====================================================================
-- MIGRATION v1 -> v2
-- Run this in your EXISTING (already-live) Supabase project's SQL
-- Editor. It only ADDS new things - it does not touch or delete any
-- data you already have. Safe to run once.
-- =====================================================================

-- 1. Allow a 'paused' status on profiles (Admin can freeze an employee)
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('pending', 'approved', 'rejected', 'paused'));

-- 2. Add the "Monthly Dues Recovery" target field (from the employee sheet)
alter table public.monthly_targets
  add column if not exists dues_recovery_target numeric not null default 0;

-- 3. Add the "Collection Gap" generated column to daily entries
--    (Sales - Collections, per day, exactly like the employee sheet)
alter table public.daily_entries
  add column if not exists collection_gap numeric generated always as (sales - collections) stored;

-- 4. Helper: is the currently logged-in user an approved (not paused)
--    sales person? Needed so paused accounts can't write new entries
--    even if they call the API directly.
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

-- 5. Tighten the daily_entries write policies to require an active
--    (non-paused) account. Drop the old, looser policies first.
drop policy if exists "entries: sales person can insert own entries" on public.daily_entries;
drop policy if exists "entries: sales person can update own entries" on public.daily_entries;

create policy "entries: active sales person can insert own entries"
  on public.daily_entries for insert
  with check (user_id = auth.uid() and public.is_active_sales_person());

create policy "entries: active sales person can update own entries"
  on public.daily_entries for update
  using (user_id = auth.uid() and public.is_active_sales_person());

-- Done. You can now redeploy the app - no other manual steps needed.
