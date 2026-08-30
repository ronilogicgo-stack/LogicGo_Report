-- =====================================================================
-- MIGRATION v5 -> v6
-- Run this in your EXISTING Supabase project's SQL Editor.
-- Lets an active (non-paused) sales person set/edit their OWN monthly
-- targets (Opening Dues, Sales Target, Collection Target) directly from
-- their own dashboard - not just an Admin.
--
-- This (re)creates the is_active_sales_person() helper first, in case
-- an earlier migration was skipped, so it's safe to run standalone.
-- Safe to run once.
-- =====================================================================

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

drop policy if exists "targets: sales person can insert own targets" on public.monthly_targets;
create policy "targets: sales person can insert own targets"
  on public.monthly_targets for insert
  with check (user_id = auth.uid() and public.is_active_sales_person());

drop policy if exists "targets: sales person can update own targets" on public.monthly_targets;
create policy "targets: sales person can update own targets"
  on public.monthly_targets for update
  using (user_id = auth.uid() and public.is_active_sales_person());

-- Also make sure the daily_entries policies (from earlier migrations)
-- are using this function correctly, in case those were skipped too.
drop policy if exists "entries: sales person can insert own entries" on public.daily_entries;
drop policy if exists "entries: active sales person can insert own entries" on public.daily_entries;
create policy "entries: active sales person can insert own entries"
  on public.daily_entries for insert
  with check (user_id = auth.uid() and public.is_active_sales_person());

drop policy if exists "entries: sales person can update own entries" on public.daily_entries;
drop policy if exists "entries: active sales person can update own entries" on public.daily_entries;
create policy "entries: active sales person can update own entries"
  on public.daily_entries for update
  using (user_id = auth.uid() and public.is_active_sales_person());

-- Done. Push the new app code and redeploy - no other manual steps needed.
