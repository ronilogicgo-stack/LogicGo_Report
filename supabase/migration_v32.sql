-- =====================================================================
-- MIGRATION v31 -> v32
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds a new "Annual Report" module - reproduces the uploaded
-- "Monthly & Yearly Sales Report" Excel template, live, inside the app:
-- every Sales Person, 12 months side-by-side (Opening Balance Dues,
-- Sales Target/Achievement, Collection Target/Achievement, Collection
-- Gap, Sales Return, Net Sales), a Grand Total FY column, and an
-- editable Remarks column. New sales persons who sign up automatically
-- appear here too - nothing to configure per person.
--
-- Follows the exact same Owner-controlled pattern as Billing/POS:
-- - annual_report_access: viewer / editor / agency_owner, managed by
--   the Owner (or an Agency Owner of this module). By default a brand
--   new module has zero rows here, so only the Owner can see it.
-- - Sales data itself (profiles, monthly_targets, monthly_entry_totals)
--   is normally locked to Admin-only via existing RLS - a granted
--   Annual Report Viewer might not be an Admin. get_annual_report_data()
--   below is a SECURITY DEFINER function that safely bypasses that,
--   but ONLY after checking has_annual_report_access() itself, so it
--   can't be used to read sales data any other way.
--
-- Safe to run once. Run AFTER migration_v31.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Access control (same 3-tier pattern as billing_access / pos_access)
-- ---------------------------------------------------------------------
create table if not exists public.annual_report_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  access_level text not null check (access_level in ('viewer', 'editor', 'agency_owner')),
  created_at timestamptz default now()
);

alter table public.annual_report_access enable row level security;

create or replace function public.has_annual_report_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1 from public.annual_report_access where user_id = auth.uid()
  );
$$;

create or replace function public.has_annual_report_edit_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1 from public.annual_report_access
    where user_id = auth.uid() and access_level in ('editor', 'agency_owner')
  );
$$;

create or replace function public.can_manage_annual_report_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1 from public.annual_report_access
    where user_id = auth.uid() and access_level = 'agency_owner'
  );
$$;

drop policy if exists "annual_report_access: owner or agency owner can manage" on public.annual_report_access;
create policy "annual_report_access: owner or agency owner can manage"
  on public.annual_report_access for all
  using (public.can_manage_annual_report_access())
  with check (
    public.is_owner()
    or (public.can_manage_annual_report_access() and access_level in ('viewer', 'editor'))
  );

drop policy if exists "annual_report_access: user can read own access" on public.annual_report_access;
create policy "annual_report_access: user can read own access"
  on public.annual_report_access for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Remarks (the one manually-typed column in the template - everything
-- else is derived from existing sales data)
-- ---------------------------------------------------------------------
create table if not exists public.annual_report_remarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  year int not null,
  remarks text default '',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  unique (user_id, year)
);

alter table public.annual_report_remarks enable row level security;

drop policy if exists "annual_report_remarks: owner full access" on public.annual_report_remarks;
create policy "annual_report_remarks: owner full access" on public.annual_report_remarks for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "annual_report_remarks: members can read" on public.annual_report_remarks;
create policy "annual_report_remarks: members can read" on public.annual_report_remarks for select
  using (public.has_annual_report_access());

drop policy if exists "annual_report_remarks: editors can write" on public.annual_report_remarks;
create policy "annual_report_remarks: editors can write" on public.annual_report_remarks for insert
  with check (public.has_annual_report_edit_access());

drop policy if exists "annual_report_remarks: editors can update" on public.annual_report_remarks;
create policy "annual_report_remarks: editors can update" on public.annual_report_remarks for update
  using (public.has_annual_report_edit_access());

-- ---------------------------------------------------------------------
-- The report data itself - one row per Sales Person per month of the
-- requested year, for EVERY approved/paused sales person (so a newly
-- added one shows up automatically, with zeros until they have data).
-- ---------------------------------------------------------------------
create or replace function public.get_annual_report_data(p_year int)
returns table (
  user_id uuid,
  full_name text,
  location text,
  month date,
  opening_dues numeric,
  sales_target numeric,
  collection_target numeric,
  total_sales numeric,
  total_collections numeric,
  total_sales_return numeric,
  total_other_transaction numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_annual_report_access() then
    raise exception 'Not authorized to view the Annual Report.';
  end if;

  return query
  select
    p.id as user_id,
    p.full_name,
    p.location,
    gm.month::date as month,
    coalesce(mt.opening_dues, 0) as opening_dues,
    coalesce(mt.sales_target, 0) as sales_target,
    coalesce(mt.collection_target, 0) as collection_target,
    coalesce(met.total_sales, 0) as total_sales,
    coalesce(met.total_collections, 0) as total_collections,
    coalesce(met.total_sales_return, 0) as total_sales_return,
    coalesce(met.total_other_transaction, 0) as total_other_transaction
  from public.profiles p
  cross join generate_series(
    make_date(p_year, 1, 1), make_date(p_year, 12, 1), interval '1 month'
  ) as gm(month)
  left join public.monthly_targets mt
    on mt.user_id = p.id and mt.month = gm.month::date
  left join public.monthly_entry_totals met
    on met.user_id = p.id and met.month = gm.month::date
  where p.is_sales_person = true
    and p.status in ('approved', 'paused')
  order by p.location, p.full_name, gm.month;
end;
$$;

-- Done. Next, push the new app code and redeploy. Then, as Owner, grant
-- Annual Report access to whoever should see it (Admin > Team & Requests,
-- or the module's own Team Access page).
