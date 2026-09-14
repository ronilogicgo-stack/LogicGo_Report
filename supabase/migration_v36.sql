-- =====================================================================
-- MIGRATION v35 -> v36
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Corrects the previous migration's Agency Owner design: it was made a
-- GLOBAL role (full access to every module). This restores Agency
-- Owner to being PER-MODULE, as originally intended:
--
--   Each module_access row now has THREE possible levels instead of
--   two: Viewer, Editor, or Agency Owner.
--   - Viewer / Editor: same as before (read-only vs. can add/edit data).
--   - Agency Owner: Editor-level access to that ONE module, PLUS the
--     ability to grant/revoke Viewer/Editor access to that SAME module
--     for other people. It does NOT grant anything for other modules -
--     someone can be Agency Owner of POS without touching Annual Report
--     at all.
--   Only the true Owner (roni.logicgo@gmail.com) can promote someone to
--   Agency Owner - an Agency Owner cannot create another Agency Owner,
--   preventing uncontrolled delegation chains.
--
-- Anyone currently in agency_owners (the global table from
-- migration_v35) is converted into an Agency Owner of every module they
-- already had a tag for (or every known module, if they had none yet).
-- The agency_owners table is then dropped - it's no longer used.
--
-- Safe to run once. Run AFTER migration_v35.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Widen module_access to the 3-tier model
-- ---------------------------------------------------------------------
alter table public.module_access drop constraint if exists module_access_access_level_check;
alter table public.module_access add constraint module_access_access_level_check
  check (access_level in ('viewer', 'editor', 'agency_owner'));

-- Convert every previous global Agency Owner into a per-module Agency
-- Owner - of every module they already had a tag for, or of both known
-- modules if they had no tags at all (since they previously had access
-- to everything).
insert into public.module_access (user_id, module_key, access_level)
select ao.user_id, ma.module_key, 'agency_owner'
from public.agency_owners ao
join public.module_access ma on ma.user_id = ao.user_id
on conflict (user_id, module_key) do update set access_level = 'agency_owner';

insert into public.module_access (user_id, module_key, access_level)
select ao.user_id, m.module_key, 'agency_owner'
from public.agency_owners ao
cross join (values ('pos'), ('annual_report')) as m(module_key)
where not exists (
  select 1 from public.module_access ma where ma.user_id = ao.user_id
)
on conflict (user_id, module_key) do update set access_level = 'agency_owner';

drop table if exists public.agency_owners cascade;

-- ---------------------------------------------------------------------
-- 2) Per-module "can manage this module's access" check
-- ---------------------------------------------------------------------
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

-- can_manage_access() (global) is no longer meaningful - drop it so
-- nothing accidentally relies on a global bypass anymore.
drop function if exists public.can_manage_access();
drop function if exists public.is_agency_owner();

-- ---------------------------------------------------------------------
-- 3) Repoint the per-module convenience functions (used by existing
--    RLS policies on pos_* / annual_report_* tables) at the per-module
--    check instead of the old global one.
-- ---------------------------------------------------------------------
create or replace function public.can_manage_pos_access()
returns boolean language sql security definer set search_path = public as $$
  select public.can_manage_module_access('pos');
$$;

create or replace function public.can_manage_annual_report_access()
returns boolean language sql security definer set search_path = public as $$
  select public.can_manage_module_access('annual_report');
$$;

-- has_pos_access() / has_pos_edit_access() / has_annual_report_access() /
-- has_annual_report_edit_access() already just call has_module_access() /
-- has_module_edit_access() (from migration_v35) - those now correctly
-- resolve through the redefined functions above with no further change.

-- ---------------------------------------------------------------------
-- 4) RLS: a module's Agency Owner can only manage THAT module's rows
-- ---------------------------------------------------------------------
drop policy if exists "module_access: managers can do everything" on public.module_access;

drop policy if exists "module_access: owner or agency owner can manage" on public.module_access;
create policy "module_access: owner or agency owner can manage"
  on public.module_access for all
  using (public.is_owner() or public.can_manage_module_access(module_key))
  with check (
    public.is_owner()
    or (public.can_manage_module_access(module_key) and access_level in ('viewer', 'editor'))
  );

-- "module_access: user can read own rows" (from migration_v35) stays
-- unchanged - a person can always see their own grants.

-- Done. Next, push the new app code and redeploy.
