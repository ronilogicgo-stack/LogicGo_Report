-- =====================================================================
-- MIGRATION v2 -> v3
-- Run this in your EXISTING Supabase project's SQL Editor.
-- Adds: edit tracking (who edited a daily entry, how many times) and
-- lets an Admin edit any sales person's daily entries directly.
-- Safe to run once. Does not touch existing data.
-- =====================================================================

-- 1. Track how many times an entry has been edited, by whom, and when.
alter table public.daily_entries
  add column if not exists edit_count integer not null default 0;
alter table public.daily_entries
  add column if not exists last_edited_at timestamptz;
alter table public.daily_entries
  add column if not exists last_edited_by uuid references public.profiles(id);

-- 2. Trigger: whenever a daily entry's real data changes (not just a
--    no-op re-save of the same numbers), bump the edit counter and
--    record who did it. This fires no matter who edits - the sales
--    person themselves, or an Admin - so the count is always accurate.
create or replace function public.track_daily_entry_edit()
returns trigger
language plpgsql
as $$
begin
  if (old.sales is distinct from new.sales)
     or (old.collections is distinct from new.collections)
     or (old.sales_return is distinct from new.sales_return)
     or (old.remarks is distinct from new.remarks) then
    new.edit_count := old.edit_count + 1;
    new.last_edited_at := now();
    new.last_edited_by := auth.uid();
  else
    new.edit_count := old.edit_count;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_track_daily_entry_edit on public.daily_entries;
create trigger trg_track_daily_entry_edit
  before update on public.daily_entries
  for each row execute function public.track_daily_entry_edit();

-- 3. Let an Admin edit ANY sales person's daily entries directly
--    (in addition to the sales person editing their own).
drop policy if exists "entries: admin can update any entries" on public.daily_entries;
create policy "entries: admin can update any entries"
  on public.daily_entries for update
  using (public.is_admin());

drop policy if exists "entries: admin can insert any entries" on public.daily_entries;
create policy "entries: admin can insert any entries"
  on public.daily_entries for insert
  with check (public.is_admin());

-- Done. Push the new app code and redeploy - no other manual steps needed.
