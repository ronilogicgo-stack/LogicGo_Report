-- =====================================================================
-- MIGRATION v26 -> v27
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Introduces an "Owner" concept: only the account with email
-- roni.logicgo@gmail.com may grant or revoke access to add-on modules
-- (currently Billing and POS; any future module should reuse the same
-- pattern). A regular Admin can still use these modules themselves
-- (is_admin() still grants full access to the module's own data), but
-- an Admin who is NOT the Owner can no longer add/remove other
-- people's billing_access / pos_access grants - only the Owner can.
--
-- If the Owner's email ever changes, update the email string inside
-- is_owner() below and re-run this file.
--
-- Safe to run once.
-- =====================================================================

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.email() = 'roni.logicgo@gmail.com';
$$;

-- --- Billing module: only the Owner manages who has access ---------
drop policy if exists "billing_access: admin can manage" on public.billing_access;
create policy "billing_access: owner can manage"
  on public.billing_access for all
  using (public.is_owner())
  with check (public.is_owner());

-- --- POS module: only the Owner manages who has access --------------
drop policy if exists "pos_access: admin can manage" on public.pos_access;
create policy "pos_access: owner can manage"
  on public.pos_access for all
  using (public.is_owner())
  with check (public.is_owner());

-- Note: "billing_access: user can read own access" and
-- "pos_access: user can read own access" policies (added earlier)
-- are untouched - anyone can still see their own grant, just not
-- create/edit/delete anyone else's.
