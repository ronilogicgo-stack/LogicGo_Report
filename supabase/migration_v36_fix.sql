-- =====================================================================
-- MIGRATION v36 FIX
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Your last run of migration_v36.sql stopped partway through with:
--   "cannot drop function can_manage_access() because other objects
--    depend on it" - the old policy still referenced it. This script
-- fixes the ordering (drop the old policy FIRST, then the old
-- functions) and is safe to run whether migration_v36.sql got partway
-- through or not at all - every statement uses IF EXISTS / OR REPLACE.
-- =====================================================================

-- 1) Make sure the 3-tier constraint is in place (safe if already done).
alter table public.module_access drop constraint if exists module_access_access_level_check;
alter table public.module_access add constraint module_access_access_level_check
  check (access_level in ('viewer', 'editor', 'agency_owner'));

-- 2) Make sure the per-module functions exist (safe if already created).
create or replace function public.can_manage_module_access(p_module_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1 from public.module_access
    where user_id = auth.uid() and module_key = p_module_key and access_level = 'agency_owner'
  );
$$;

create or replace function public.has_module_access(p_module_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
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
  select public.is_owner() or exists (
    select 1 from public.module_access
    where user_id = auth.uid() and module_key = p_module_key
      and access_level in ('editor', 'agency_owner')
  );
$$;

-- 3) Drop the OLD policy that depends on the old global function -
--    THIS must happen before dropping that function.
drop policy if exists "module_access: managers can do everything" on public.module_access;
drop policy if exists "module_access: owner or agency owner can manage" on public.module_access;

create policy "module_access: owner or agency owner can manage"
  on public.module_access for all
  using (public.is_owner() or public.can_manage_module_access(module_key))
  with check (
    public.is_owner()
    or (public.can_manage_module_access(module_key) and access_level in ('viewer', 'editor'))
  );

-- 4) NOW it's safe to drop the old global functions - nothing
--    references them anymore.
drop function if exists public.can_manage_access();
drop function if exists public.is_agency_owner();

-- 5) Repoint the per-module convenience functions.
create or replace function public.can_manage_pos_access()
returns boolean language sql security definer set search_path = public as $$
  select public.can_manage_module_access('pos');
$$;

create or replace function public.can_manage_annual_report_access()
returns boolean language sql security definer set search_path = public as $$
  select public.can_manage_module_access('annual_report');
$$;

-- 6) Clean up the old global table if it's somehow still there.
drop table if exists public.agency_owners cascade;

-- Done.
