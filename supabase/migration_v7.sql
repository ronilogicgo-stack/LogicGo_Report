-- =====================================================================
-- MIGRATION v6 -> v7
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds:
-- 1. Self-service profile editing for sales persons (name, phone,
--    branch/region, employee ID) - everything except email.
-- 2. Email change requests: a sales person can request a new email,
--    but is completely locked out of entering/editing ANYTHING until
--    an Admin approves or rejects the request.
-- 3. A paused account is now also blocked from editing its own
--    profile (in addition to already being blocked from entries/login).
--
-- Safe to run once.
-- =====================================================================

-- 1. New columns for the email-change-request workflow.
alter table public.profiles add column if not exists requested_email text;
alter table public.profiles add column if not exists email_change_pending boolean not null default false;

-- 2. An "active" sales person now also means their email change request
--    (if any) is not pending - so a pending request locks them out of
--    daily entries and targets too, exactly like being paused would.
create or replace function public.is_active_sales_person()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'sales_person'
      and status = 'approved'
      and email_change_pending = false
  );
$$;

-- 3. Guard trigger: when a NON-admin updates their own profile row,
--    silently protect role/status/email from being changed directly,
--    and hard-block the update entirely while an email change request
--    is pending (only an Admin may touch the row in that state).
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
    new.role := old.role;
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

-- 4. Let an active, approved sales person update their OWN profile row
--    (paused/pending/rejected accounts are excluded by this condition,
--    so a paused account truly cannot change anything about itself).
drop policy if exists "profiles: sales person can update own row" on public.profiles;
create policy "profiles: sales person can update own row"
  on public.profiles for update
  using (id = auth.uid() and role = 'sales_person' and status = 'approved');

-- Done. Push the new app code and redeploy - no other manual steps needed.
