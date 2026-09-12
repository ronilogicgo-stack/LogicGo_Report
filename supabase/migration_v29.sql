-- =====================================================================
-- MIGRATION v28 -> v29
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds a third access tier - "Agency Owner" - to both Billing and POS,
-- alongside the existing Viewer/Editor tiers:
--
--   Owner (roni.logicgo@gmail.com)
--     -> controls EVERYTHING, on every module, always. Only the Owner
--        can promote someone to Agency Owner.
--   Agency Owner (per module, e.g. "Agency Owner of Billing")
--     -> full Editor-level use of that one module, AND can grant/revoke
--        Viewer/Editor access to that same module for other people
--        (but cannot make anyone else an Agency Owner - only the Owner
--        can do that).
--   Editor / Viewer (per module)
--     -> unchanged from before.
--
-- Every NEW module added in the future should follow this exact same
-- pattern (its own access table with this 3-tier access_level check,
-- its own has_X_access()/has_X_edit_access()/can_manage_X_access()
-- functions) - by default a brand-new module has no rows in its access
-- table at all, so only the Owner can see it until the Owner grants
-- someone access (Agency Owner, Editor, or Viewer) for that module
-- specifically.
--
-- Safe to run once. Run AFTER migration_v28.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------
alter table public.billing_access drop constraint if exists billing_access_access_level_check;
alter table public.billing_access add constraint billing_access_access_level_check
  check (access_level in ('viewer', 'editor', 'agency_owner'));

create or replace function public.has_billing_edit_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.billing_access
    where user_id = auth.uid() and access_level in ('editor', 'agency_owner')
  );
$$;

create or replace function public.can_manage_billing_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1 from public.billing_access
    where user_id = auth.uid() and access_level = 'agency_owner'
  );
$$;

drop policy if exists "billing_access: owner can manage" on public.billing_access;
create policy "billing_access: owner or agency owner can manage"
  on public.billing_access for all
  using (public.can_manage_billing_access())
  with check (
    -- Anyone allowed to manage this module's access can grant/revoke
    -- Viewer or Editor. Only the true Owner can hand out the
    -- Agency Owner tier itself, so access can't cascade uncontrolled.
    public.is_owner()
    or (public.can_manage_billing_access() and access_level in ('viewer', 'editor'))
  );

-- ---------------------------------------------------------------------
-- POS
-- ---------------------------------------------------------------------
alter table public.pos_access drop constraint if exists pos_access_access_level_check;
alter table public.pos_access add constraint pos_access_access_level_check
  check (access_level in ('viewer', 'editor', 'agency_owner'));

create or replace function public.has_pos_edit_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pos_access
    where user_id = auth.uid() and access_level in ('editor', 'agency_owner')
  );
$$;

create or replace function public.can_manage_pos_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1 from public.pos_access
    where user_id = auth.uid() and access_level = 'agency_owner'
  );
$$;

drop policy if exists "pos_access: owner can manage" on public.pos_access;
create policy "pos_access: owner or agency owner can manage"
  on public.pos_access for all
  using (public.can_manage_pos_access())
  with check (
    public.is_owner()
    or (public.can_manage_pos_access() and access_level in ('viewer', 'editor'))
  );

-- Note: has_billing_access() / has_pos_access() (used for read access to
-- the module's own data) are untouched - "agency_owner" already counts
-- as having access since it's still a row in the table, and now also
-- counts as edit access via has_*_edit_access() above.
