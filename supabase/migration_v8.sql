-- =====================================================================
-- MIGRATION v7 -> v8
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Replaces the old single "role" (pending / sales_person / admin) with
-- two independent flags: is_admin and is_sales_person. A profile can
-- now have BOTH checked at once - that person sees the Admin panel AND
-- their own Sales Person dashboard, with a link to switch between them.
-- Any existing Admin can promote/demote any other profile's roles.
--
-- Safe to run once. Existing accounts are migrated automatically:
-- role='admin' -> is_admin=true, role='sales_person' -> is_sales_person=true.
-- =====================================================================

alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists is_sales_person boolean not null default false;

update public.profiles set is_admin = true where role = 'admin';
update public.profiles set is_sales_person = true where role = 'sales_person';

-- is_admin() now checks the boolean flag instead of the old role column.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

-- Likewise for is_active_sales_person() - a profile no longer needs
-- role='sales_person' specifically; it just needs the flag checked,
-- to be approved, and to have no pending email change.
create or replace function public.is_active_sales_person()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_sales_person = true
      and status = 'approved'
      and email_change_pending = false
  );
$$;

-- Update the self-update policy to match (drop the old role reference).
drop policy if exists "profiles: sales person can update own row" on public.profiles;
create policy "profiles: sales person can update own row"
  on public.profiles for update
  using (id = auth.uid() and is_sales_person = true and status = 'approved');

-- The guard trigger (from earlier migrations) protected `role`, which no
-- longer exists - it must now protect is_admin/is_sales_person instead,
-- so a sales person can never grant themselves Admin rights.
create or replace function public.guard_profile_self_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if old.email_change_pending = true then
      raise exception 'Your email change request is pending admin approval. No edits are allowed until it is resolved.';
    end if;
    new.is_admin := old.is_admin;
    new.is_sales_person := old.is_sales_person;
    new.status := old.status;
    new.email := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_self_edit on public.profiles;
create trigger trg_guard_profile_self_edit
  before update on public.profiles
  for each row execute function public.guard_profile_self_edit();

-- Done. Push the new app code and redeploy - no other manual steps needed.
