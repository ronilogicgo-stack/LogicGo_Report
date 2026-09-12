-- =====================================================================
-- MIGRATION v29 -> v30
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds ERPNext-style per-unit SERIAL NUMBER tracking to the POS module
-- (for gadgets/electronics with IMEI, or any product where each
-- physical unit needs its own identity and history - fashion/cosmetics
-- items usually won't use this and can keep plain quantity tracking).
--
-- Design:
-- - pos_products.has_serial: a product opts into serial tracking at
--   creation time. Non-serialized products are completely unaffected -
--   they keep working exactly as before (plain quantity).
-- - pos_serial_numbers: one row per physical unit ever received, with
--   a lifecycle status (in_stock / sold / returned / damaged) and,
--   once sold, which invoice and when - this is the "Serial No"
--   record from ERPNext, giving full warranty/history per unit.
-- - The existing pos_stock_ledger + pos_products.current_stock system
--   is UNTOUCHED - for a serialized product, adding/selling/cancelling
--   serials still also writes a normal ledger entry (+N / -N), so every
--   dashboard, stock-count, and low-stock feature already built keeps
--   working with zero changes. Serial tracking is an additional layer
--   of detail on top, not a replacement.
--
-- Safe to run once. Run AFTER migration_v29.sql.
-- =====================================================================

alter table public.pos_products add column if not exists has_serial boolean not null default false;

create table if not exists public.pos_serial_numbers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.pos_products(id) on delete cascade,
  serial_no text not null,
  status text not null default 'in_stock' check (status in ('in_stock', 'sold', 'returned', 'damaged')),
  sales_invoice_id uuid references public.pos_sales_invoices(id) on delete set null,
  sold_at timestamptz,
  warranty_end_date date,
  notes text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  unique (serial_no)
);

create index if not exists idx_pos_serial_numbers_product on public.pos_serial_numbers(product_id);
create index if not exists idx_pos_serial_numbers_status on public.pos_serial_numbers(status);
create index if not exists idx_pos_serial_numbers_invoice on public.pos_serial_numbers(sales_invoice_id);

alter table public.pos_serial_numbers enable row level security;

drop policy if exists "pos_serials: owner full access" on public.pos_serial_numbers;
create policy "pos_serials: owner full access" on public.pos_serial_numbers for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "pos_serials: members can read" on public.pos_serial_numbers;
create policy "pos_serials: members can read" on public.pos_serial_numbers for select
  using (public.has_pos_access());

drop policy if exists "pos_serials: editors can insert" on public.pos_serial_numbers;
create policy "pos_serials: editors can insert" on public.pos_serial_numbers for insert
  with check (public.has_pos_edit_access());

drop policy if exists "pos_serials: editors can update" on public.pos_serial_numbers;
create policy "pos_serials: editors can update" on public.pos_serial_numbers for update
  using (public.has_pos_edit_access());

drop policy if exists "pos_serials: editors can delete" on public.pos_serial_numbers;
create policy "pos_serials: editors can delete" on public.pos_serial_numbers for delete
  using (public.has_pos_edit_access());

-- Done. Next, push the new app code and redeploy.
