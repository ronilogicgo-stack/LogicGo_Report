-- =====================================================================
-- MIGRATION v5 -> v6
-- Run this in your EXISTING Supabase project's SQL Editor.
-- Lets an active (non-paused) sales person set/edit their OWN monthly
-- targets (Opening Dues, Sales Target, Collection Target) directly from
-- their own dashboard - not just an Admin.
-- Safe to run once.
-- =====================================================================

drop policy if exists "targets: sales person can insert own targets" on public.monthly_targets;
create policy "targets: sales person can insert own targets"
  on public.monthly_targets for insert
  with check (user_id = auth.uid() and public.is_active_sales_person());

drop policy if exists "targets: sales person can update own targets" on public.monthly_targets;
create policy "targets: sales person can update own targets"
  on public.monthly_targets for update
  using (user_id = auth.uid() and public.is_active_sales_person());

-- Done. Push the new app code and redeploy - no other manual steps needed.
