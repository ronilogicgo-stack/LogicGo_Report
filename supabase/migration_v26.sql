-- =====================================================================
-- MIGRATION v25 -> v26
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds Phase 1 of a new, separate "POS" module (Product/Item + Sales
-- Invoice + Stock) - completely independent from the Billing module
-- added earlier and from Sales Person daily entries. Modeled loosely
-- on tools like "BMS Smart Trader": Product master, Trader master
-- (Customer / Supplier / Dealer / Retailer as one table with a type,
-- so the DB stays simple while the UI shows them as separate lists),
-- Sales Invoices with line items, and a stock ledger that tracks every
-- stock movement (opening balance, sale, manual adjustment) so current
-- stock is always derivable and auditable.
--
-- NOT included yet (later phases): Purchase, Purchase Return, RMA,
-- Sales Order/Quotation/Challan, Accounts/Voucher/Cheque, multi-branch
-- stock. This migration is written so those can be added later without
-- reshaping what's built here.
--
-- Safe to run once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Traders (Customer / Supplier / Dealer / Retailer)
-- ---------------------------------------------------------------------
create table if not exists public.pos_traders (
  id uuid primary key default gen_random_uuid(),
  trader_type text not null check (trader_type in ('customer', 'supplier', 'dealer', 'retailer')),
  name text not null,
  phone text default '',
  email text default '',
  address text default '',
  notes text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists idx_pos_traders_type on public.pos_traders(trader_type);

-- ---------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------
create table if not exists public.pos_products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text default '',
  unit text not null default 'pcs',
  purchase_price numeric not null default 0,
  sales_price numeric not null default 0,
  current_stock numeric not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Every stock change (opening balance, a sale, or a manual correction)
-- is one row here - current_stock on pos_products is a running total
-- kept in sync by a trigger, so it's fast to read but every change is
-- still fully auditable from this table.
create table if not exists public.pos_stock_ledger (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.pos_products(id) on delete cascade,
  change_qty numeric not null,
  reference_type text not null check (reference_type in ('opening', 'sale', 'sale_cancelled', 'adjustment')),
  reference_id uuid,
  note text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists idx_pos_stock_ledger_product on public.pos_stock_ledger(product_id);

create or replace function public.apply_pos_stock_change()
returns trigger
language plpgsql
as $$
begin
  update public.pos_products
    set current_stock = current_stock + new.change_qty
    where id = new.product_id;
  return new;
end;
$$;

drop trigger if exists trg_pos_stock_ledger_apply on public.pos_stock_ledger;
create trigger trg_pos_stock_ledger_apply
  after insert on public.pos_stock_ledger
  for each row execute function public.apply_pos_stock_change();

-- ---------------------------------------------------------------------
-- Sales Invoices
-- ---------------------------------------------------------------------
create sequence if not exists public.pos_invoice_seq;

create table if not exists public.pos_sales_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  trader_id uuid not null references public.pos_traders(id) on delete restrict,
  sale_type text not null default 'cash' check (sale_type in ('cash', 'credit')),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  invoice_date date not null default current_date,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  tax numeric not null default 0,
  total numeric generated always as (subtotal - discount + tax) stored,
  paid_amount numeric not null default 0,
  due_amount numeric generated always as (subtotal - discount + tax - paid_amount) stored,
  notes text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_pos_sales_invoices_trader on public.pos_sales_invoices(trader_id);
create index if not exists idx_pos_sales_invoices_status on public.pos_sales_invoices(status);

create table if not exists public.pos_sales_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.pos_sales_invoices(id) on delete cascade,
  product_id uuid references public.pos_products(id) on delete set null,
  description text not null default '',
  quantity numeric not null default 1,
  rate numeric not null default 0,
  amount numeric generated always as (quantity * rate) stored,
  sort_order int not null default 0
);

create index if not exists idx_pos_sales_items_invoice on public.pos_sales_invoice_items(invoice_id);

create or replace function public.set_pos_invoice_no()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_no is null then
    new.invoice_no := 'POS-' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pos_invoice_no on public.pos_sales_invoices;
create trigger trg_pos_invoice_no
  before insert on public.pos_sales_invoices
  for each row execute function public.set_pos_invoice_no();

create or replace function public.set_pos_invoice_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pos_invoices_updated_at on public.pos_sales_invoices;
create trigger trg_pos_invoices_updated_at
  before update on public.pos_sales_invoices
  for each row execute function public.set_pos_invoice_updated_at();

-- ---------------------------------------------------------------------
-- Access control (separate from billing_access and payment_followup_access)
-- ---------------------------------------------------------------------
create table if not exists public.pos_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  access_level text not null check (access_level in ('editor', 'viewer')),
  created_at timestamptz default now()
);

create or replace function public.has_pos_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.pos_access where user_id = auth.uid());
$$;

create or replace function public.has_pos_edit_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pos_access
    where user_id = auth.uid() and access_level = 'editor'
  );
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.pos_traders enable row level security;
alter table public.pos_products enable row level security;
alter table public.pos_stock_ledger enable row level security;
alter table public.pos_sales_invoices enable row level security;
alter table public.pos_sales_invoice_items enable row level security;
alter table public.pos_access enable row level security;

drop policy if exists "pos_access: admin can manage" on public.pos_access;
create policy "pos_access: admin can manage"
  on public.pos_access for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pos_access: user can read own access" on public.pos_access;
create policy "pos_access: user can read own access"
  on public.pos_access for select
  using (user_id = auth.uid());

-- Same Admin / viewer(read) / editor(write) pattern, repeated for each
-- table: pos_traders, pos_products, pos_stock_ledger, pos_sales_invoices,
-- pos_sales_invoice_items.
drop policy if exists "pos_traders: admin full access" on public.pos_traders;
create policy "pos_traders: admin full access" on public.pos_traders for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pos_traders: members can read" on public.pos_traders;
create policy "pos_traders: members can read" on public.pos_traders for select
  using (public.has_pos_access());
drop policy if exists "pos_traders: editors can insert" on public.pos_traders;
create policy "pos_traders: editors can insert" on public.pos_traders for insert
  with check (public.has_pos_edit_access());
drop policy if exists "pos_traders: editors can update" on public.pos_traders;
create policy "pos_traders: editors can update" on public.pos_traders for update
  using (public.has_pos_edit_access());
drop policy if exists "pos_traders: editors can delete" on public.pos_traders;
create policy "pos_traders: editors can delete" on public.pos_traders for delete
  using (public.has_pos_edit_access());

drop policy if exists "pos_products: admin full access" on public.pos_products;
create policy "pos_products: admin full access" on public.pos_products for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pos_products: members can read" on public.pos_products;
create policy "pos_products: members can read" on public.pos_products for select
  using (public.has_pos_access());
drop policy if exists "pos_products: editors can insert" on public.pos_products;
create policy "pos_products: editors can insert" on public.pos_products for insert
  with check (public.has_pos_edit_access());
drop policy if exists "pos_products: editors can update" on public.pos_products;
create policy "pos_products: editors can update" on public.pos_products for update
  using (public.has_pos_edit_access());
drop policy if exists "pos_products: editors can delete" on public.pos_products;
create policy "pos_products: editors can delete" on public.pos_products for delete
  using (public.has_pos_edit_access());

drop policy if exists "pos_stock_ledger: admin full access" on public.pos_stock_ledger;
create policy "pos_stock_ledger: admin full access" on public.pos_stock_ledger for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pos_stock_ledger: members can read" on public.pos_stock_ledger;
create policy "pos_stock_ledger: members can read" on public.pos_stock_ledger for select
  using (public.has_pos_access());
drop policy if exists "pos_stock_ledger: editors can insert" on public.pos_stock_ledger;
create policy "pos_stock_ledger: editors can insert" on public.pos_stock_ledger for insert
  with check (public.has_pos_edit_access());

drop policy if exists "pos_sales_invoices: admin full access" on public.pos_sales_invoices;
create policy "pos_sales_invoices: admin full access" on public.pos_sales_invoices for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pos_sales_invoices: members can read" on public.pos_sales_invoices;
create policy "pos_sales_invoices: members can read" on public.pos_sales_invoices for select
  using (public.has_pos_access());
drop policy if exists "pos_sales_invoices: editors can insert" on public.pos_sales_invoices;
create policy "pos_sales_invoices: editors can insert" on public.pos_sales_invoices for insert
  with check (public.has_pos_edit_access());
drop policy if exists "pos_sales_invoices: editors can update" on public.pos_sales_invoices;
create policy "pos_sales_invoices: editors can update" on public.pos_sales_invoices for update
  using (public.has_pos_edit_access());

drop policy if exists "pos_sales_items: admin full access" on public.pos_sales_invoice_items;
create policy "pos_sales_items: admin full access" on public.pos_sales_invoice_items for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pos_sales_items: members can read" on public.pos_sales_invoice_items;
create policy "pos_sales_items: members can read" on public.pos_sales_invoice_items for select
  using (public.has_pos_access());
drop policy if exists "pos_sales_items: editors can insert" on public.pos_sales_invoice_items;
create policy "pos_sales_items: editors can insert" on public.pos_sales_invoice_items for insert
  with check (public.has_pos_edit_access());

-- Done. Next, push the new app code (app/pos/*, app/admin/pos-access)
-- and redeploy. Then, as Admin, go to Admin > POS Access to grant
-- specific people Editor or Viewer access to this module.
