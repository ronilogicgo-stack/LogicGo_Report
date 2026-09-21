-- =====================================================================
-- MIGRATION v37 -> v38
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Matches the updated "Payment Follow-Up" Excel template: one column
-- removed, two added.
-- - Removed: Entry Date (entry_date) - no longer in the sheet.
-- - Added: Area (area, plain text - a short area/zone label, separate
--   from the existing "Area Name" / area_name field) and Last Bill
--   (last_bill, a date - when the last bill was issued to this client).
--
-- ⚠️ This permanently deletes any Entry Date values already saved.
-- If you need to keep that data, export payment_followups from
-- Supabase's Table Editor first.
--
-- Safe to run once.
-- =====================================================================

alter table public.payment_followups add column if not exists area text default '';
alter table public.payment_followups add column if not exists last_bill date;
alter table public.payment_followups drop column if exists entry_date;
