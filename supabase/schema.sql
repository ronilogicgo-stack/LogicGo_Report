-- =====================================================================
-- SALES SAAS - DATABASE SCHEMA (v2)
-- Run this once in Supabase SQL Editor for a BRAND NEW project.
-- If you already ran the v1 schema on a live project, use
-- supabase/migration_v2.sql instead (it only adds what's new).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES  (one row per user, extends Supabase auth.users)
--    status 'paused' = Admin has frozen this employee's access.
--    A paused user is signed out immediately on login attempt.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  location text default 'Head Office',
  phone text,
  employee_code text,
  requested_email text,
  email_change_pending boolean not null default false,
  -- A profile can be BOTH an Admin and a Sales Person at once - both
  -- checkboxes independently control which dashboard(s) they can use.
  is_admin boolean not null default false,
  is_sales_person boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paused')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. MONTHLY TARGETS  (set by Admin per sales person, per month)
--    Mirrors the employee sheet's "Subject / Amount" block:
--    Monthly Sales Target, Monthly Collection Target,
--    Month Opening Dues, Monthly Dues Recovery (target).
-- ---------------------------------------------------------------------
create table if not exists public.monthly_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month date not null,              -- always store as first day of month, e.g. 2027-01-01
  sales_target numeric not null default 0,
  collection_target numeric not null default 0,
  opening_dues numeric not null default 0,
  dues_recovery_target numeric not null default 0,
  created_at timestamptz default now(),
  unique (user_id, month)
);

-- ---------------------------------------------------------------------
-- 3. DAILY ENTRIES  (added by Sales Person, one row per day)
--    Mirrors the employee sheet's daily table exactly:
--    Date, Sales, Collections, Collection Gap, Sales Return, Net Sales, Remarks
--    net_sales and collection_gap are GENERATED columns so every sales
--    person is always calculated the exact same way - never by hand.
-- ---------------------------------------------------------------------
create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null,
  sales numeric not null default 0,
  collections numeric not null default 0,
  sales_return numeric not null default 0,
  other_transaction numeric not null default 0,
  remarks text default '',
  net_sales numeric generated always as (sales - sales_return) stored,
  collection_gap numeric generated always as ((sales - sales_return) - collections) stored,
  -- Per-field edit counters, e.g. {"sales":0,"collections":2,"sales_return":1,"remarks":0,"other_transaction":0}
  -- Only the exact field that changes gets its counter bumped, so the UI
  -- can highlight just that one cell in red - not the whole row.
  field_edits jsonb not null default jsonb_build_object(
    'sales', 0, 'collections', 0, 'sales_return', 0, 'remarks', 0, 'other_transaction', 0
  ),
  last_edited_at timestamptz,
  last_edited_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  unique (user_id, entry_date)
);

-- Whenever a daily entry's real data changes (not a no-op re-save of the
-- same numbers), bump ONLY the counter(s) for the field(s) that actually
-- changed, and record who did it - whether that's the sales person
-- themselves or an Admin editing on their behalf.
create or replace function public.track_daily_entry_edit()
returns trigger
language plpgsql
as $$
declare
  fe jsonb;
  changed boolean := false;
begin
  fe := coalesce(
    old.field_edits,
    jsonb_build_object('sales', 0, 'collections', 0, 'sales_return', 0, 'remarks', 0, 'other_transaction', 0)
  );

  if old.sales is distinct from new.sales then
    fe := jsonb_set(fe, array['sales'], to_jsonb(coalesce((fe->>'sales')::int, 0) + 1));
    changed := true;
  end if;

  if old.collections is distinct from new.collections then
    fe := jsonb_set(fe, array['collections'], to_jsonb(coalesce((fe->>'collections')::int, 0) + 1));
    changed := true;
  end if;

  if old.sales_return is distinct from new.sales_return then
    fe := jsonb_set(fe, array['sales_return'], to_jsonb(coalesce((fe->>'sales_return')::int, 0) + 1));
    changed := true;
  end if;

  if old.remarks is distinct from new.remarks then
    fe := jsonb_set(fe, array['remarks'], to_jsonb(coalesce((fe->>'remarks')::int, 0) + 1));
    changed := true;
  end if;

  if old.other_transaction is distinct from new.other_transaction then
    fe := jsonb_set(fe, array['other_transaction'], to_jsonb(coalesce((fe->>'other_transaction')::int, 0) + 1));
    changed := true;
  end if;

  new.field_edits := fe;

  if changed then
    new.last_edited_at := now();
    new.last_edited_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_track_daily_entry_edit on public.daily_entries;
create trigger trg_track_daily_entry_edit
  before update on public.daily_entries
  for each row execute function public.track_daily_entry_edit();

-- ---------------------------------------------------------------------
-- Helper: is the currently logged-in user an admin?
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Helper: is the currently logged-in user an approved (not paused)
-- sales person? Used to block writes from paused accounts even if
-- someone tries to call the API directly.
-- ---------------------------------------------------------------------
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

-- Guard trigger: when a NON-admin updates their own profile row,
-- silently protect role/status/email from being changed directly, and
-- hard-block the update entirely while an email change request is
-- pending (only an Admin may touch the row in that state).
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

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.monthly_targets enable row level security;
alter table public.daily_entries enable row level security;

-- PROFILES policies
create policy "profiles: user can read own row"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: admin can read all rows"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: user can insert own row on signup"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles: admin can update any row (approve / reject / pause / edit)"
  on public.profiles for update
  using (public.is_admin());

-- An active, approved sales person may update their OWN profile row
-- (paused/pending/rejected accounts are excluded, so a paused account
-- truly cannot change anything about itself).
create policy "profiles: sales person can update own row"
  on public.profiles for update
  using (id = auth.uid() and is_sales_person = true and status = 'approved');

-- MONTHLY TARGETS policies
create policy "targets: sales person can read own targets"
  on public.monthly_targets for select
  using (user_id = auth.uid());

create policy "targets: admin can read all targets"
  on public.monthly_targets for select
  using (public.is_admin());

create policy "targets: admin can insert targets"
  on public.monthly_targets for insert
  with check (public.is_admin());

create policy "targets: admin can update targets"
  on public.monthly_targets for update
  using (public.is_admin());

-- An active (non-paused) sales person may also set/edit their OWN
-- monthly targets directly - not just an Admin.
create policy "targets: sales person can insert own targets"
  on public.monthly_targets for insert
  with check (user_id = auth.uid() and public.is_active_sales_person());

create policy "targets: sales person can update own targets"
  on public.monthly_targets for update
  using (user_id = auth.uid() and public.is_active_sales_person());

-- DAILY ENTRIES policies
create policy "entries: sales person can read own entries"
  on public.daily_entries for select
  using (user_id = auth.uid());

create policy "entries: admin can read all entries"
  on public.daily_entries for select
  using (public.is_admin());

-- Only an ACTIVE (approved, not paused) sales person may add/edit entries
create policy "entries: active sales person can insert own entries"
  on public.daily_entries for insert
  with check (user_id = auth.uid() and public.is_active_sales_person());

create policy "entries: active sales person can update own entries"
  on public.daily_entries for update
  using (user_id = auth.uid() and public.is_active_sales_person());

-- An Admin may also edit ANY sales person's daily entries directly
create policy "entries: admin can insert any entries"
  on public.daily_entries for insert
  with check (public.is_admin());

create policy "entries: admin can update any entries"
  on public.daily_entries for update
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. APP SETTINGS (company-wide, single row) - brand logo
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_url text;

create table if not exists public.app_settings (
  id boolean primary key default true,
  logo_url text,
  constraint app_settings_singleton check (id = true)
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

create policy "app_settings: anyone can read"
  on public.app_settings for select
  using (true);

create policy "app_settings: admin can update"
  on public.app_settings for update
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. STORAGE BUCKETS - avatars (self photo) and branding (company logo)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "avatars: users can upload own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: users can update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: users can delete own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: admin can manage any avatar"
  on storage.objects for all
  using (bucket_id = 'avatars' and public.is_admin())
  with check (bucket_id = 'avatars' and public.is_admin());

create policy "avatars: anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "branding: admin can manage logo"
  on storage.objects for all
  using (bucket_id = 'branding' and public.is_admin())
  with check (bucket_id = 'branding' and public.is_admin());

create policy "branding: anyone can view logo"
  on storage.objects for select
  using (bucket_id = 'branding');

-- ---------------------------------------------------------------------
-- 6. PERFORMANCE: view + indexes
-- ---------------------------------------------------------------------
create or replace view public.last_report_per_user
with (security_invoker = true) as
select user_id, max(entry_date) as last_report
from public.daily_entries
group by user_id;

create index if not exists idx_daily_entries_entry_date
  on public.daily_entries (entry_date);

create index if not exists idx_profiles_sales_person_status
  on public.profiles (is_sales_person, status);

create index if not exists idx_profiles_admin
  on public.profiles (is_admin) where is_admin = true;

-- Pre-summed monthly totals per sales person, so the Admin's main
-- dashboard fetches one already-totaled row per person instead of
-- every daily entry for the month.
create or replace view public.monthly_entry_totals
with (security_invoker = true) as
select
  user_id,
  date_trunc('month', entry_date)::date as month,
  sum(sales) as total_sales,
  sum(collections) as total_collections,
  sum(sales_return) as total_sales_return,
  sum(net_sales) as total_net_sales,
  count(*) as days_reported,
  sum(other_transaction) as total_other_transaction
from public.daily_entries
group by user_id, date_trunc('month', entry_date);

-- =====================================================================
-- MAKE THE FIRST ADMIN
-- After you sign up once through the app's /signup page, run this
-- (replace the email) so that first account becomes Admin:
--
--   update public.profiles
--   set is_admin = true, status = 'approved'
--   where email = 'you@example.com';
-- =====================================================================
