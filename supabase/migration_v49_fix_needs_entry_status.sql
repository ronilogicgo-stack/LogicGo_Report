-- =====================================================================
-- DATA FIX (not a schema change)
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- A daily_entries row tagged entry_type = 'requested' (an Admin's
-- "Request Entry") is supposed to flip away from that status once the
-- Sales Person actually fills it in. Going forward this now correctly
-- becomes 'entered_after_notice' (a new "Entry After Notifying" badge)
-- instead of losing that context entirely - but any row that was
-- already filled in before this fix stayed stuck showing "Needs Entry"
-- forever, even though real numbers are sitting right there.
--
-- This one-time fix corrects every existing row like that: if it's
-- still tagged 'requested' AND has any real data (a non-zero
-- sales/collections/sales_return/other_transaction, or any remarks
-- text), it's clearly already been filled in - relabel it
-- 'entered_after_notice'. A 'requested' row with nothing filled in at
-- all is left untouched (correctly still "Needs Entry").
--
-- Safe to re-run - only touches rows still matching the condition.
-- =====================================================================

update public.daily_entries
set entry_type = 'entered_after_notice'
where entry_type = 'requested'
  and (
    coalesce(sales, 0) != 0
    or coalesce(collections, 0) != 0
    or coalesce(sales_return, 0) != 0
    or coalesce(other_transaction, 0) != 0
    or coalesce(nullif(trim(remarks), ''), '') != ''
  );
