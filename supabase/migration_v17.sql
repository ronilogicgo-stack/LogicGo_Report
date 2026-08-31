-- =====================================================================
-- MIGRATION v16 -> v17 (PERFORMANCE, part 2)
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds a "pre-summed" view so the Admin's main monthly dashboard
-- fetches ONE row per sales person (already totaled) instead of every
-- single daily entry for the whole month and adding them up in the
-- browser. This is the biggest remaining speed win, and it matters
-- more and more as months of history pile up.
--
-- Safe to run once.
-- =====================================================================

create or replace view public.monthly_entry_totals
with (security_invoker = true) as
select
  user_id,
  date_trunc('month', entry_date)::date as month,
  sum(sales) as total_sales,
  sum(collections) as total_collections,
  sum(sales_return) as total_sales_return,
  sum(net_sales) as total_net_sales,
  count(*) as days_reported
from public.daily_entries
group by user_id, date_trunc('month', entry_date);

-- Done. Push the new app code and redeploy - no other manual steps needed.
