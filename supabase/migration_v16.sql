-- =====================================================================
-- MIGRATION v15 -> v16 (PERFORMANCE)
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Fixes slow page loads as data grows:
-- 1. A "last report per user" database view - computes the aggregate
--    in Postgres (fast, uses an index) instead of downloading every
--    single daily entry ever made and finding the max in the browser.
-- 2. Indexes that speed up the date-range and status/role filters used
--    on almost every page.
--
-- Safe to run once. Does not touch existing data.
-- =====================================================================

-- 1. Fast "last report" lookup. security_invoker means it respects the
--    same Row Level Security as the underlying table for whoever runs
--    the query (an Admin sees everyone, a Sales Person would only see
--    their own row) - so it's exactly as safe as the table itself.
create or replace view public.last_report_per_user
with (security_invoker = true) as
select user_id, max(entry_date) as last_report
from public.daily_entries
group by user_id;

-- 2. Indexes for the filters used constantly across the app.
create index if not exists idx_daily_entries_entry_date
  on public.daily_entries (entry_date);

create index if not exists idx_profiles_sales_person_status
  on public.profiles (is_sales_person, status);

create index if not exists idx_profiles_admin
  on public.profiles (is_admin) where is_admin = true;

-- Done. Push the new app code and redeploy - no other manual steps needed.
