-- =====================================================================
-- MIGRATION v38 -> v39
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- "Area Name" and "Area" turned out to be the same concept - this
-- consolidates them into just "Area":
-- 1. Copies every existing area_name value into area (only where area
--    is still empty, so this is safe to re-run without overwriting
--    anything).
-- 2. Drops the now-redundant area_name column.
--
-- Safe to run once.
-- =====================================================================

update public.payment_followups
set area = area_name
where (area is null or area = '') and area_name is not null and area_name != '';

alter table public.payment_followups drop column if exists area_name;
