-- =====================================================================
-- MIGRATION v33 -> v34
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds date-aware pause/resume tracking. Until now, profiles.status
-- was just a single current value ("approved" or "paused") - there was
-- no record of WHEN a person was paused or resumed, so any report
-- could only ask "are they paused right now?", not "were they paused
-- on this specific date?".
--
-- profile_status_history: one row every time an Admin pauses or
-- resumes a Sales Person, dated to the day the action was taken. A
-- trigger on profiles writes this automatically - nothing in the app
-- code needs to explicitly call it.
--
-- One-time backfill: anyone who is ALREADY paused right now gets a
-- single history row dated today, since we have no record of when
-- they were actually paused before this migration. That means for
-- someone already paused, "today onward" will correctly hide them,
-- but any date BEFORE today will still show them as active (we simply
-- don't know their real historical pause date). Going forward, every
-- new pause/resume is captured exactly.
--
-- Safe to run once. Run AFTER migration_v33_data_backfill_2026.sql.
-- =====================================================================

create table if not exists public.profile_status_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('approved', 'paused')),
  effective_date date not null default current_date,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists idx_profile_status_history_user
  on public.profile_status_history(user_id, effective_date);

alter table public.profile_status_history enable row level security;

drop policy if exists "profile_status_history: admin can read" on public.profile_status_history;
create policy "profile_status_history: admin can read"
  on public.profile_status_history for select
  using (public.is_admin());

-- Automatically logs a history row whenever an Admin changes someone's
-- status to/from 'approved' or 'paused' - security definer so it can
-- write here regardless of the RLS policy above (which only allows
-- reads, not writes, from the app).
create or replace function public.log_profile_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('approved', 'paused') and (old.status is distinct from new.status) then
    insert into public.profile_status_history (user_id, status, effective_date, changed_by)
    values (new.id, new.status, current_date, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_profile_status_change on public.profiles;
create trigger trg_log_profile_status_change
  after update of status on public.profiles
  for each row execute function public.log_profile_status_change();

-- One-time backfill for anyone already paused (see note above).
insert into public.profile_status_history (user_id, status, effective_date)
select id, 'paused', current_date
from public.profiles
where status = 'paused'
  and not exists (
    select 1 from public.profile_status_history h where h.user_id = profiles.id
  );
