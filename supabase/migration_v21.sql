-- =====================================================================
-- MIGRATION v20 -> v21
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds "Other Transaction" - a free-form daily adjustment (bonus,
-- write-off, correction, etc., positive or negative) that factors into
-- Closing Dues and Dues Recovery, exactly like the "Other Tran." column
-- in the reference SR Wise Statement report. It does NOT affect Net
-- Sales or Collection Gap - those stay purely Sales/Collections/Return
-- based, unchanged.
--
-- New formulas:
--   Closing Dues  = Opening Dues + Net Sales - Collections + Other Transaction
--   Dues Recovery = Collections - Net Sales - Other Transaction
--
-- Safe to run once.
-- =====================================================================

alter table public.daily_entries
  add column if not exists other_transaction numeric not null default 0;

-- Track edits to this field too, same as the other daily-entry fields.
alter table public.daily_entries
  alter column field_edits set default jsonb_build_object(
    'sales', 0, 'collections', 0, 'sales_return', 0, 'remarks', 0, 'other_transaction', 0
  );

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

-- Include the new field in the pre-summed monthly totals view too.
create or replace view public.monthly_entry_totals
with (security_invoker = true) as
select
  user_id,
  date_trunc('month', entry_date)::date as month,
  sum(sales) as total_sales,
  sum(collections) as total_collections,
  sum(sales_return) as total_sales_return,
  sum(net_sales) as total_net_sales,
  sum(other_transaction) as total_other_transaction,
  count(*) as days_reported
from public.daily_entries
group by user_id, date_trunc('month', entry_date);

-- Done. Push the new app code and redeploy - no other manual steps needed.
