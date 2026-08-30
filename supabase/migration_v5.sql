-- =====================================================================
-- MIGRATION v4 -> v5
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- 1. Fixes the daily Collection Gap formula to match your latest sheet:
--    it's now Net Sales - Collections (was Sales - Collections before).
-- 2. Adds Phone and Employee/Branch ID fields to each sales person's
--    profile, for the expanded Team Management page.
--
-- Safe to run once. Existing daily_entries rows automatically
-- recalculate collection_gap with the corrected formula.
-- =====================================================================

-- 1. Correct the generated column's formula (must drop + recreate since
--    Postgres doesn't allow altering a generated column's expression).
alter table public.daily_entries drop column if exists collection_gap;
alter table public.daily_entries
  add column collection_gap numeric generated always as ((sales - sales_return) - collections) stored;

-- 2. New profile fields for the Team Management page.
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists employee_code text;

-- Done. Push the new app code and redeploy - no other manual steps needed.
