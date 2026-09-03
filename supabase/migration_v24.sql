-- =====================================================================
-- MIGRATION v23 -> v24
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Lets an Admin attach a reference Google Sheet link to each Payment
-- Follow-Up branch (e.g. the original spreadsheet you still keep
-- updated manually). It's shown as an "Open Google Sheet" button on
-- that branch's page for both the Admin and any team member with
-- access to it - editing the link itself stays Admin-only, same as
-- managing branches in general.
--
-- Safe to run once.
-- =====================================================================

alter table public.payment_followup_branches
  add column if not exists google_sheet_url text;

-- Done. Push the new app code and redeploy - no other manual steps needed.
