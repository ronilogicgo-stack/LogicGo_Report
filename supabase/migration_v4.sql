-- =====================================================================
-- MIGRATION v3 -> v4
-- Run this in your EXISTING Supabase project's SQL Editor.
-- Changes edit tracking from "whole row turns red" to
-- "only the exact field that changed turns red" - with its own
-- per-field edit count (e.g. Sales Return edited 3 times, Sales
-- edited once, Collections never touched).
-- Safe to run once. Does not touch existing data.
-- =====================================================================

-- 1. One JSON column holding a separate counter per editable field:
--    { "sales": 0, "collections": 0, "sales_return": 0, "remarks": 0 }
alter table public.daily_entries
  add column if not exists field_edits jsonb not null
  default '{"sales":0,"collections":0,"sales_return":0,"remarks":0}'::jsonb;

-- 2. Replace the old row-level trigger with a field-level one.
create or replace function public.track_daily_entry_edit()
returns trigger
language plpgsql
as $$
declare
  fe jsonb;
  changed boolean := false;
begin
  fe := coalesce(old.field_edits, '{"sales":0,"collections":0,"sales_return":0,"remarks":0}'::jsonb);

  if old.sales is distinct from new.sales then
    fe := jsonb_set(fe, '{sales}', to_jsonb(coalesce((fe->>'sales')::int, 0) + 1));
    changed := true;
  end if;

  if old.collections is distinct from new.collections then
    fe := jsonb_set(fe, '{collections}', to_jsonb(coalesce((fe->>'collections')::int, 0) + 1));
    changed := true;
  end if;

  if old.sales_return is distinct from new.sales_return then
    fe := jsonb_set(fe, '{sales_return}', to_jsonb(coalesce((fe->>'sales_return')::int, 0) + 1));
    changed := true;
  end if;

  if old.remarks is distinct from new.remarks then
    fe := jsonb_set(fe, '{remarks}', to_jsonb(coalesce((fe->>'remarks')::int, 0) + 1));
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

-- Done. Push the new app code and redeploy - no other manual steps needed.
