-- =====================================================================
-- MIGRATION v39 -> v41
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Enables Realtime for payment_followups, so that when one person
-- adds/edits/deletes a record, everyone else currently viewing that
-- branch (other tabs, other devices, other team members) sees it
-- update live - without needing to refresh the page.
--
-- Root cause this fixes: adding a record only updated the browser tab
-- that made the change (a local, in-memory update for speed) - it was
-- always saved correctly to the database, but nothing told OTHER open
-- tabs/sessions a change had happened, so they kept showing stale data
-- until manually reloaded.
--
-- Safe to run once (skips silently if already added).
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'payment_followups'
  ) then
    alter publication supabase_realtime add table public.payment_followups;
  end if;
end $$;
