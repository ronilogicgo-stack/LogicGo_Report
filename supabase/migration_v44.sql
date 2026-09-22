-- =====================================================================
-- MIGRATION v43 -> v44
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- The WhatsApp messaging feature for Payment Follow-Up has been
-- removed from the app. This drops its table too, so nothing is left
-- behind. If you never ran migration_v43.sql, this simply does
-- nothing (the table won't exist to drop).
--
-- Safe to run once.
-- =====================================================================

drop table if exists public.payment_followup_whatsapp_targets cascade;
