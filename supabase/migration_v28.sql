-- =====================================================================
-- MIGRATION v27 -> v28
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Tightens the Owner concept further: previously, ANY Admin
-- automatically had full access to the Billing and POS modules' data
-- (clients, invoices, products, traders, stock) via is_admin(), and
-- only the *granting* of access to others was Owner-only. That meant
-- other Admin accounts could still open and use these modules without
-- being explicitly granted access.
--
-- This migration removes that automatic Admin bypass: from now on,
-- ONLY the Owner (roni.logicgo@gmail.com) has automatic full access to
-- Billing/POS data. Any other Admin - just like a Sales Person - must
-- be explicitly granted Editor/Viewer access via billing_access /
-- pos_access (by the Owner) before they can see anything in these
-- modules.
--
-- Safe to run once. Run AFTER migration_v27.sql.
-- =====================================================================

-- --- Billing module data tables: swap is_admin() -> is_owner() -------
drop policy if exists "billing_clients: admin full access" on public.billing_clients;
create policy "billing_clients: owner full access" on public.billing_clients for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "billing_invoices: admin full access" on public.billing_invoices;
create policy "billing_invoices: owner full access" on public.billing_invoices for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "billing_items: admin full access" on public.billing_invoice_items;
create policy "billing_items: owner full access" on public.billing_invoice_items for all
  using (public.is_owner()) with check (public.is_owner());

-- --- POS module data tables: swap is_admin() -> is_owner() -----------
drop policy if exists "pos_traders: admin full access" on public.pos_traders;
create policy "pos_traders: owner full access" on public.pos_traders for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "pos_products: admin full access" on public.pos_products;
create policy "pos_products: owner full access" on public.pos_products for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "pos_stock_ledger: admin full access" on public.pos_stock_ledger;
create policy "pos_stock_ledger: owner full access" on public.pos_stock_ledger for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "pos_sales_invoices: admin full access" on public.pos_sales_invoices;
create policy "pos_sales_invoices: owner full access" on public.pos_sales_invoices for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "pos_sales_items: admin full access" on public.pos_sales_invoice_items;
create policy "pos_sales_items: owner full access" on public.pos_sales_invoice_items for all
  using (public.is_owner()) with check (public.is_owner());

-- Note: the "members can read" / "editors can insert/update/delete"
-- policies (driven by has_billing_access() / has_billing_edit_access()
-- / has_pos_access() / has_pos_edit_access(), i.e. an explicit grant in
-- billing_access / pos_access) are untouched - that's still exactly how
-- a non-Owner person, Admin or not, gets into these modules.
