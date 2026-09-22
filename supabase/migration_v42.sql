-- =====================================================================
-- MIGRATION v41 -> v42
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Extends the same live-sync fix from Payment Follow-Up to the core
-- Sales Person data: adding daily_entries and monthly_targets to the
-- Realtime publication. This means:
-- - Admin's Monthly Sales & Collection Report and Daily Report now
--   refresh automatically the moment any Sales Person submits or
--   edits a daily entry (or an Admin edits a target) - no manual
--   reload needed, even if the report was already open.
-- - A Sales Person's own Dashboard refreshes live too - most usefully,
--   so an Admin's "Request Entry" (the red banner) appears instantly.
--
-- Safe to run once (skips silently if either is already added).
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'daily_entries'
  ) then
    alter publication supabase_realtime add table public.daily_entries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'monthly_targets'
  ) then
    alter publication supabase_realtime add table public.monthly_targets;
  end if;
end $$;
