-- =====================================================================
-- MIGRATION v30 -> v31
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Permanently REMOVES the Billing module, since the app now uses POS
-- (product/stock/serial-based invoicing) for everything instead.
--
-- ⚠️ WARNING: this permanently deletes ALL Billing data - every
-- billing_clients row and every billing_invoices/billing_invoice_items
-- row, with no way to recover them afterwards. If you need to keep any
-- of this data, export it from Supabase's Table Editor BEFORE running
-- this file. This does NOT touch POS, Payment Follow-Up, or anything
-- else - only tables/functions whose name starts with "billing_" (plus
-- the two shared functions marked below).
--
-- Safe to run once you've confirmed you no longer need this data.
-- =====================================================================

drop table if exists public.billing_invoice_items cascade;
drop table if exists public.billing_invoices cascade;
drop table if exists public.billing_clients cascade;
drop table if exists public.billing_access cascade;

drop sequence if exists public.billing_invoice_seq;

drop function if exists public.has_billing_access();
drop function if exists public.has_billing_edit_access();
drop function if exists public.can_manage_billing_access();
drop function if exists public.set_billing_invoice_no();
drop function if exists public.set_billing_invoice_updated_at();

-- Note: is_owner() is NOT dropped - it's shared with the POS module
-- (and any future module) and must stay.
