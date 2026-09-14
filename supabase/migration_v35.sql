-- =====================================================================
-- MIGRATION v34 -> v35
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Replaces the per-module access tables (pos_access, annual_report_access
-- - each with its own copy of the same viewer/editor/agency_owner logic)
-- with ONE generic system:
--
-- - agency_owners: a GLOBAL role. Anyone in this table (or the Owner)
--   can grant/revoke access to EVERY module, not just one - "make
--   someone an Agency Owner" now means exactly that, company-wide.
--   Only the Owner can add/remove someone from this table.
-- - module_access: one row per (person, module) - just a tag. Add a
--   row with module_key='pos' and that person can use POS; add
--   module_key='annual_report' and they can see the Annual Report.
--   A brand-new module in the future needs NO new table and NO new
--   access-grant page - it just starts checking has_module_access('its_key')
--   and immediately plugs into this same system.
--
-- Existing grants are migrated automatically: anyone who was an
-- 'agency_owner' of POS or the Annual Report becomes a global Agency
-- Owner (and their per-module row becomes a plain 'editor' tag, since
-- their real elevated power now lives in agency_owners instead).
-- Everyone else's viewer/editor tag carries over unchanged.
--
-- Safe to run once. Run AFTER migration_v34.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) New tables
-- ---------------------------------------------------------------------
create table if not exists public.agency_owners (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.module_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_key text not null,
  access_level text not null default 'viewer' check (access_level in ('viewer', 'editor')),
  created_at timestamptz default now(),
  unique (user_id, module_key)
);

create index if not exists idx_module_access_user on public.module_access(user_id);
create index if not exists idx_module_access_module on public.module_access(module_key);

-- ---------------------------------------------------------------------
-- 2) Migrate existing data
-- ---------------------------------------------------------------------
insert into public.agency_owners (user_id)
select user_id from public.pos_access where access_level = 'agency_owner'
union
select user_id from public.annual_report_access where access_level = 'agency_owner'
on conflict (user_id) do nothing;

insert into public.module_access (user_id, module_key, access_level)
select user_id, 'pos', case when access_level = 'agency_owner' then 'editor' else access_level end
from public.pos_access
on conflict (user_id, module_key) do update set access_level = excluded.access_level;

insert into public.module_access (user_id, module_key, access_level)
select user_id, 'annual_report', case when access_level = 'agency_owner' then 'editor' else access_level end
from public.annual_report_access
on conflict (user_id, module_key) do update set access_level = excluded.access_level;

-- ---------------------------------------------------------------------
-- 3) Generic helper functions
-- ---------------------------------------------------------------------
create or replace function public.is_agency_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.agency_owners where user_id = auth.uid());
$$;

-- Can this person grant/revoke access for ANY module?
create or replace function public.can_manage_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner() or public.is_agency_owner();
$$;

create or replace function public.has_module_access(p_module_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.can_manage_access() or exists (
    select 1 from public.module_access
    where user_id = auth.uid() and module_key = p_module_key
  );
$$;

create or replace function public.has_module_edit_access(p_module_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.can_manage_access() or exists (
    select 1 from public.module_access
    where user_id = auth.uid() and module_key = p_module_key and access_level = 'editor'
  );
$$;

-- ---------------------------------------------------------------------
-- 4) Repoint the existing per-module functions at the new generic
--    system, so every RLS policy already written for pos_* and
--    annual_report_* tables (which call these exact function names)
--    keeps working completely unchanged.
-- ---------------------------------------------------------------------
create or replace function public.has_pos_access()
returns boolean language sql security definer set search_path = public as $$
  select public.has_module_access('pos');
$$;

create or replace function public.has_pos_edit_access()
returns boolean language sql security definer set search_path = public as $$
  select public.has_module_edit_access('pos');
$$;

create or replace function public.can_manage_pos_access()
returns boolean language sql security definer set search_path = public as $$
  select public.can_manage_access();
$$;

create or replace function public.has_annual_report_access()
returns boolean language sql security definer set search_path = public as $$
  select public.has_module_access('annual_report');
$$;

create or replace function public.has_annual_report_edit_access()
returns boolean language sql security definer set search_path = public as $$
  select public.has_module_edit_access('annual_report');
$$;

create or replace function public.can_manage_annual_report_access()
returns boolean language sql security definer set search_path = public as $$
  select public.can_manage_access();
$$;

-- ---------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------
alter table public.agency_owners enable row level security;
alter table public.module_access enable row level security;

drop policy if exists "agency_owners: owner can manage" on public.agency_owners;
create policy "agency_owners: owner can manage"
  on public.agency_owners for all
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists "agency_owners: user can read own row" on public.agency_owners;
create policy "agency_owners: user can read own row"
  on public.agency_owners for select
  using (user_id = auth.uid());

drop policy if exists "module_access: managers can do everything" on public.module_access;
create policy "module_access: managers can do everything"
  on public.module_access for all
  using (public.can_manage_access())
  with check (public.can_manage_access());

drop policy if exists "module_access: user can read own rows" on public.module_access;
create policy "module_access: user can read own rows"
  on public.module_access for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6) Drop the now-unused per-module tables (their data is already
--    migrated into module_access / agency_owners above).
-- ---------------------------------------------------------------------
drop table if exists public.pos_access cascade;
drop table if exists public.annual_report_access cascade;

-- Done. Next, push the new app code and redeploy.
