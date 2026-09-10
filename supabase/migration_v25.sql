-- =====================================================================
-- MIGRATION v24 -> v25
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds a full "Billing" module, separate from Sales/Collections:
-- - billing_clients: the customers/companies being billed.
-- - billing_invoices: one row per invoice - covers a one-time
--   product/service bill AND a recurring/subscription bill (via
--   billing_type + recurring_interval + next_billing_date). There is
--   no automatic cron for recurring bills in this version - an editor
--   clicks "Generate Next Invoice" on a recurring invoice, which
--   creates a fresh one-time invoice with the same line items and
--   advances next_billing_date. Keeping it manual avoids surprise
--   charges and needs no extra Vercel cron/env setup.
-- - billing_invoice_items: line items per invoice (description, qty,
--   rate) - used both for itemized product/service bills and for
--   describing what a subscription invoice is for.
-- - billing_access: who can view/edit this module at all - a person
--   can be granted access here completely independently of their
--   Sales Person or Admin role, same pattern as payment_followup_access
--   but without branch scoping (this module is global, not per-branch).
--
-- Safe to run once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.billing_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text default '',
  email text default '',
  address text default '',
  notes text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create sequence if not exists public.billing_invoice_seq;

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  client_id uuid not null references public.billing_clients(id) on delete restrict,
  billing_type text not null default 'one_time'
    check (billing_type in ('one_time', 'recurring')),
  recurring_interval text
    check (recurring_interval in ('weekly', 'monthly', 'yearly')),
  next_billing_date date,
  invoice_date date not null default current_date,
  due_date date,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
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

create index if not exists idx_billing_invoices_client on public.billing_invoices(client_id);
create index if not exists idx_billing_invoices_status on public.billing_invoices(status);

create table if not exists public.billing_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  description text not null default '',
  quantity numeric not null default 1,
  rate numeric not null default 0,
  amount numeric generated always as (quantity * rate) stored,
  sort_order int not null default 0
);

create index if not exists idx_billing_items_invoice on public.billing_invoice_items(invoice_id);

create table if not exists public.billing_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  access_level text not null check (access_level in ('editor', 'viewer')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.has_billing_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.billing_access where user_id = auth.uid()
  );
$$;

create or replace function public.has_billing_edit_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.billing_access
    where user_id = auth.uid() and access_level = 'editor'
  );
$$;

-- Auto-assign a human-friendly invoice number like INV-000123 if the
-- caller didn't supply one.
create or replace function public.set_billing_invoice_no()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_no is null then
    new.invoice_no := 'INV-' || lpad(nextval('public.billing_invoice_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_billing_invoice_no on public.billing_invoices;
create trigger trg_billing_invoice_no
  before insert on public.billing_invoices
  for each row execute function public.set_billing_invoice_no();

create or replace function public.set_billing_invoice_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_billing_invoices_updated_at on public.billing_invoices;
create trigger trg_billing_invoices_updated_at
  before update on public.billing_invoices
  for each row execute function public.set_billing_invoice_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.billing_clients enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_invoice_items enable row level security;
alter table public.billing_access enable row level security;

-- Access grants: only an Admin manages who has access; a person can
-- read their own grant (to know their own access level in the UI).
drop policy if exists "billing_access: admin can manage" on public.billing_access;
create policy "billing_access: admin can manage"
  on public.billing_access for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "billing_access: user can read own access" on public.billing_access;
create policy "billing_access: user can read own access"
  on public.billing_access for select
  using (user_id = auth.uid());

-- Clients: Admin has full access. Anyone granted billing access
-- (viewer or editor) can read the client list; only an editor (or
-- Admin) can add/edit/delete clients.
drop policy if exists "billing_clients: admin full access" on public.billing_clients;
create policy "billing_clients: admin full access"
  on public.billing_clients for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "billing_clients: members can read" on public.billing_clients;
create policy "billing_clients: members can read"
  on public.billing_clients for select
  using (public.has_billing_access());

drop policy if exists "billing_clients: editors can insert" on public.billing_clients;
create policy "billing_clients: editors can insert"
  on public.billing_clients for insert
  with check (public.has_billing_edit_access());

drop policy if exists "billing_clients: editors can update" on public.billing_clients;
create policy "billing_clients: editors can update"
  on public.billing_clients for update
  using (public.has_billing_edit_access());

drop policy if exists "billing_clients: editors can delete" on public.billing_clients;
create policy "billing_clients: editors can delete"
  on public.billing_clients for delete
  using (public.has_billing_edit_access());

-- Invoices: same Admin / viewer / editor pattern as clients.
drop policy if exists "billing_invoices: admin full access" on public.billing_invoices;
create policy "billing_invoices: admin full access"
  on public.billing_invoices for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "billing_invoices: members can read" on public.billing_invoices;
create policy "billing_invoices: members can read"
  on public.billing_invoices for select
  using (public.has_billing_access());

drop policy if exists "billing_invoices: editors can insert" on public.billing_invoices;
create policy "billing_invoices: editors can insert"
  on public.billing_invoices for insert
  with check (public.has_billing_edit_access());

drop policy if exists "billing_invoices: editors can update" on public.billing_invoices;
create policy "billing_invoices: editors can update"
  on public.billing_invoices for update
  using (public.has_billing_edit_access());

drop policy if exists "billing_invoices: editors can delete" on public.billing_invoices;
create policy "billing_invoices: editors can delete"
  on public.billing_invoices for delete
  using (public.has_billing_edit_access());

-- Invoice items: follow the parent invoice's access, so a viewer can
-- read line items but only an editor/Admin can change them.
drop policy if exists "billing_items: admin full access" on public.billing_invoice_items;
create policy "billing_items: admin full access"
  on public.billing_invoice_items for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "billing_items: members can read" on public.billing_invoice_items;
create policy "billing_items: members can read"
  on public.billing_invoice_items for select
  using (public.has_billing_access());

drop policy if exists "billing_items: editors can insert" on public.billing_invoice_items;
create policy "billing_items: editors can insert"
  on public.billing_invoice_items for insert
  with check (public.has_billing_edit_access());

drop policy if exists "billing_items: editors can update" on public.billing_invoice_items;
create policy "billing_items: editors can update"
  on public.billing_invoice_items for update
  using (public.has_billing_edit_access());

drop policy if exists "billing_items: editors can delete" on public.billing_invoice_items;
create policy "billing_items: editors can delete"
  on public.billing_invoice_items for delete
  using (public.has_billing_edit_access());

-- Done. Next, push the new app code (app/billing/*, app/admin/billing-access)
-- and redeploy. Then, as Admin, go to Admin > Billing Access to grant
-- specific people Editor or Viewer access to this module.
