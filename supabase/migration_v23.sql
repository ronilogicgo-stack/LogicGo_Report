-- =====================================================================
-- MIGRATION v22 -> v23
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds a full "Payment Follow-Up" module, branch-wise:
-- - payment_followup_branches: the list of branches (Head Office,
--   Sylhet, Rangpur to start - Admin can add more later).
-- - payment_followups: the actual records, one per company/client.
-- - payment_followup_access: which team members can view or edit a
--   given branch's records - separate from their Sales Person/Admin
--   role, so someone can be granted access to just one branch's
--   payment follow-ups without touching their sales duties at all.
--
-- Priority logic (Red / Yellow / Normal) is computed and sorted in the
-- app itself, from whichever follow-up date is the most recent among
-- the 5 - no stored "row order" or locking is needed, since the
-- database naturally handles concurrent access; every viewer always
-- sees a freshly-sorted list.
--
-- Safe to run once.
-- =====================================================================

create table if not exists public.payment_followup_branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

insert into public.payment_followup_branches (name)
values ('Head Office'), ('Sylhet'), ('Rangpur')
on conflict (name) do nothing;

create table if not exists public.payment_followups (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.payment_followup_branches(id) on delete cascade,
  serial numeric,
  entry_date date,
  executive_name text default '',
  area_name text default '',
  company_name text not null default '',
  phone_number text default '',
  location text default '',
  received_amount numeric not null default 0,
  due_amount numeric not null default 0,
  payment_status text not null default 'Due' check (payment_status in ('Due', 'Received')),
  ledger_due numeric not null default 0,
  note text default '',
  followup_date_1 date,
  followup_date_2 date,
  followup_date_3 date,
  followup_date_4 date,
  followup_date_5 date,
  created_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_payment_followups_branch on public.payment_followups(branch_id);

create table if not exists public.payment_followup_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.payment_followup_branches(id) on delete cascade,
  access_level text not null check (access_level in ('editor', 'viewer')),
  created_at timestamptz default now(),
  unique (user_id, branch_id)
);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.has_followup_access(target_branch_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.payment_followup_access
    where user_id = auth.uid() and branch_id = target_branch_id
  );
$$;

create or replace function public.has_followup_edit_access(target_branch_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.payment_followup_access
    where user_id = auth.uid() and branch_id = target_branch_id and access_level = 'editor'
  );
$$;

-- Automatically stamp updated_at on every edit.
create or replace function public.set_payment_followup_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_payment_followups_updated_at on public.payment_followups;
create trigger trg_payment_followups_updated_at
  before update on public.payment_followups
  for each row execute function public.set_payment_followup_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.payment_followup_branches enable row level security;
alter table public.payment_followups enable row level security;
alter table public.payment_followup_access enable row level security;

-- Branches: anyone signed in can read the branch list (needed to show
-- names in dropdowns); only an Admin can add/rename/remove branches.
drop policy if exists "branches: authenticated can read" on public.payment_followup_branches;
create policy "branches: authenticated can read"
  on public.payment_followup_branches for select
  using (auth.uid() is not null);

drop policy if exists "branches: admin can manage" on public.payment_followup_branches;
create policy "branches: admin can manage"
  on public.payment_followup_branches for all
  using (public.is_admin())
  with check (public.is_admin());

-- Access grants: only an Admin manages who has access to what; a
-- person can read their own grants (to know what they can see).
drop policy if exists "access: admin can manage" on public.payment_followup_access;
create policy "access: admin can manage"
  on public.payment_followup_access for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "access: user can read own access" on public.payment_followup_access;
create policy "access: user can read own access"
  on public.payment_followup_access for select
  using (user_id = auth.uid());

-- Followups: Admin has full access to every branch. A team member can
-- read a branch's records if granted EITHER editor or viewer access,
-- but can only insert/update/delete if granted EDITOR access.
drop policy if exists "followups: admin full access" on public.payment_followups;
create policy "followups: admin full access"
  on public.payment_followups for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "followups: branch members can read" on public.payment_followups;
create policy "followups: branch members can read"
  on public.payment_followups for select
  using (public.has_followup_access(branch_id));

drop policy if exists "followups: branch editors can insert" on public.payment_followups;
create policy "followups: branch editors can insert"
  on public.payment_followups for insert
  with check (public.has_followup_edit_access(branch_id));

drop policy if exists "followups: branch editors can update" on public.payment_followups;
create policy "followups: branch editors can update"
  on public.payment_followups for update
  using (public.has_followup_edit_access(branch_id));

drop policy if exists "followups: branch editors can delete" on public.payment_followups;
create policy "followups: branch editors can delete"
  on public.payment_followups for delete
  using (public.has_followup_edit_access(branch_id));

-- Done. Next, run supabase/seed_payment_followups.sql to import the
-- existing spreadsheet data, then push the new app code and redeploy.
