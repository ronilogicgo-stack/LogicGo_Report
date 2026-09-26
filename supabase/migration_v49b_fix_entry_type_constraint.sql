-- =====================================================================
-- FIX for migration_v49_fix_needs_entry_status.sql
-- Run this in your EXISTING Supabase project's SQL Editor, THEN re-run
-- migration_v49_fix_needs_entry_status.sql.
--
-- The daily_entries.entry_type column has a check constraint that
-- didn't yet allow the new 'entered_after_notice' value - this adds it.
--
-- Safe to run once.
-- =====================================================================

alter table public.daily_entries drop constraint if exists daily_entries_entry_type_check;
alter table public.daily_entries add constraint daily_entries_entry_type_check
  check (entry_type in ('submitted', 'holiday', 'leave', 'custom', 'requested', 'entered_after_notice'));
