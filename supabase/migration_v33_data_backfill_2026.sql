-- =====================================================================
-- ONE-TIME DATA MIGRATION (not a schema change)
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Backfills historical 2026 data from the uploaded Excel file's
-- "Monthly & Yearly Sales Report26" tab ONLY (no other tab was used).
-- For each Sales Person matched by exact full_name:
--   - monthly_targets: Opening Balance Dues, Sales Target, Collection
--     Target for each month Jan-Aug 2026.
--   - daily_entries: one row dated the 1st of each month, containing
--     that month's Sales Achievement, Collections Achievement, and
--     Sales Return as if it were a single day's entry - this makes
--     the existing monthly totals (which SUM daily_entries) come out
--     correct for these historical months without needing a
--     day-by-day breakdown.
--
-- Notes:
-- - A name that doesn't exactly match an existing Sales Person's
--   full_name is silently skipped (0 rows affected for that name) -
--   check afterwards if a name you expected doesn't show up.
-- - "Others" has no August data in the source sheet, so only
--   Jan-Jul is inserted for that one.
-- - Blank cells in the source (August's Opening Dues, and Collection
--   Target for Jan-Jul, which the sheet never filled in historically)
--   are inserted as 0, not guessed at.
-- - Safe to re-run: both inserts UPSERT on (user_id, month) /
--   (user_id, entry_date), so re-running just overwrites with the
--   same numbers.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Monthly Targets: Opening Balance Dues, Sales Target, Collection Target
-- ---------------------------------------------------------------------
with target_data (full_name, month, opening_dues, sales_target, collection_target) as (
  values
  -- Office Wholesales
  ('Office Wholesales', date '2026-01-01', 3967254.43, 400000, 0),
  ('Office Wholesales', date '2026-02-01', 4141978.43, 0, 0),
  ('Office Wholesales', date '2026-03-01', 5055436.43, 0, 0),
  ('Office Wholesales', date '2026-04-01', 6056261.43, 0, 0),
  ('Office Wholesales', date '2026-05-01', 7698135.43, 0, 0),
  ('Office Wholesales', date '2026-06-01', 8648768.43, 0, 0),
  ('Office Wholesales', date '2026-07-01', 8197512.43, 0, 0),
  ('Office Wholesales', date '2026-08-01', 0, 4000000, 4000000),
  -- Fahima Akter Lima
  ('Fahima Akter Lima', date '2026-01-01', 2493469.59, 300000, 0),
  ('Fahima Akter Lima', date '2026-02-01', 3352976.59, 0, 0),
  ('Fahima Akter Lima', date '2026-03-01', 3183776.59, 0, 0),
  ('Fahima Akter Lima', date '2026-04-01', 3172784.59, 0, 0),
  ('Fahima Akter Lima', date '2026-05-01', 3410977.59, 0, 0),
  ('Fahima Akter Lima', date '2026-06-01', 3442165.59, 0, 0),
  ('Fahima Akter Lima', date '2026-07-01', 3160107.19, 0, 0),
  ('Fahima Akter Lima', date '2026-08-01', 0, 4000000, 4000000),
  -- Sohel rana
  ('Sohel rana', date '2026-01-01', 2200104.72, 400000, 0),
  ('Sohel rana', date '2026-02-01', 2273173.72, 0, 0),
  ('Sohel rana', date '2026-03-01', 3135224.72, 0, 0),
  ('Sohel rana', date '2026-04-01', 2588971.72, 0, 0),
  ('Sohel rana', date '2026-05-01', 2807406.72, 0, 0),
  ('Sohel rana', date '2026-06-01', 2889437.72, 0, 0),
  ('Sohel rana', date '2026-07-01', 2832839.72, 0, 0),
  ('Sohel rana', date '2026-08-01', 0, 4000000, 4000000),
  -- Khandaker Md. Rakib
  ('Khandaker Md. Rakib', date '2026-01-01', 383430.5, 2500000, 0),
  ('Khandaker Md. Rakib', date '2026-02-01', 785375.5, 2500000, 0),
  ('Khandaker Md. Rakib', date '2026-03-01', 917940.5, 2500000, 0),
  ('Khandaker Md. Rakib', date '2026-04-01', 1225224.5, 2500000, 0),
  ('Khandaker Md. Rakib', date '2026-05-01', 1366889.5, 2500000, 0),
  ('Khandaker Md. Rakib', date '2026-06-01', 1205504.5, 2500000, 0),
  ('Khandaker Md. Rakib', date '2026-07-01', 1344149, 0, 0),
  ('Khandaker Md. Rakib', date '2026-08-01', 0, 3500000, 3500000),
  -- Sahir Hasan
  ('Sahir Hasan', date '2026-01-01', 1485795.35, 3000000, 0),
  ('Sahir Hasan', date '2026-02-01', 1367251.35, 0, 0),
  ('Sahir Hasan', date '2026-03-01', 1513817.35, 0, 0),
  ('Sahir Hasan', date '2026-04-01', 1500372.35, 0, 0),
  ('Sahir Hasan', date '2026-05-01', 2081103.35, 0, 0),
  ('Sahir Hasan', date '2026-06-01', 2849547.35, 0, 0),
  ('Sahir Hasan', date '2026-07-01', 2341885.35, 0, 0),
  ('Sahir Hasan', date '2026-08-01', 0, 3500000, 3500000),
  -- Abu Jafar
  ('Abu Jafar', date '2026-01-01', 2807186.92, 300000, 0),
  ('Abu Jafar', date '2026-02-01', 2807186.92, 0, 0),
  ('Abu Jafar', date '2026-03-01', 2807186.92, 0, 0),
  ('Abu Jafar', date '2026-04-01', 2807186.92, 0, 0),
  ('Abu Jafar', date '2026-05-01', 2627226.92, 0, 0),
  ('Abu Jafar', date '2026-06-01', 2995032.92, 0, 0),
  ('Abu Jafar', date '2026-07-01', 3474295.92, 0, 0),
  ('Abu Jafar', date '2026-08-01', 0, 3500000, 3500000),
  -- Sk Shams Nur
  ('Sk Shams Nur', date '2026-01-01', 75767.15, 200000, 0),
  ('Sk Shams Nur', date '2026-02-01', 75767.15, 0, 0),
  ('Sk Shams Nur', date '2026-03-01', 75767.15, 0, 0),
  ('Sk Shams Nur', date '2026-04-01', 75767.15, 0, 0),
  ('Sk Shams Nur', date '2026-05-01', 45267.15, 0, 0),
  ('Sk Shams Nur', date '2026-06-01', 52407.15, 0, 0),
  ('Sk Shams Nur', date '2026-07-01', 162077.15, 0, 0),
  ('Sk Shams Nur', date '2026-08-01', 0, 2500000, 2500000),
  -- Others
  ('Others', date '2026-01-01', 798023.41, 0, 0),
  ('Others', date '2026-02-01', 791088.41, 0, 0),
  ('Others', date '2026-03-01', 749281.41, 0, 0),
  ('Others', date '2026-04-01', 890201.41, 0, 0),
  ('Others', date '2026-05-01', 743939.41, 0, 0),
  ('Others', date '2026-06-01', 624525.41, 0, 0),
  ('Others', date '2026-07-01', 487359.22, 0, 0)
)
insert into public.monthly_targets (user_id, month, opening_dues, sales_target, collection_target)
select p.id, td.month, td.opening_dues, td.sales_target, td.collection_target
from target_data td
join public.profiles p on p.full_name = td.full_name and p.is_sales_person = true
on conflict (user_id, month) do update set
  opening_dues = excluded.opening_dues,
  sales_target = excluded.sales_target,
  collection_target = excluded.collection_target;

-- ---------------------------------------------------------------------
-- 2) Daily Entries: Sales Achievement, Collections Achievement, Sales
--    Return - one row per month, dated the 1st of that month.
-- ---------------------------------------------------------------------
with entry_data (full_name, entry_date, sales, collections, sales_return) as (
  values
  -- Office Wholesales
  ('Office Wholesales', date '2026-01-01', 2917325, 2867682, 286959),
  ('Office Wholesales', date '2026-02-01', 2396295, 1295810, 130895),
  ('Office Wholesales', date '2026-03-01', 2582470, 1589445, 34600),
  ('Office Wholesales', date '2026-04-01', 4987827, 2950250, 206003),
  ('Office Wholesales', date '2026-05-01', 2842500, 2203743, 165784),
  ('Office Wholesales', date '2026-06-01', 3682551, 2882095, 354384),
  ('Office Wholesales', date '2026-07-01', 2372968, 2273485, 628070),
  ('Office Wholesales', date '2026-08-01', 6000769, 5013536, 230503),
  -- Fahima Akter Lima
  ('Fahima Akter Lima', date '2026-01-01', 3134142, 2309054, 84400),
  ('Fahima Akter Lima', date '2026-02-01', 2238587, 2190793, 166496),
  ('Fahima Akter Lima', date '2026-03-01', 1840276, 1821908, 16720),
  ('Fahima Akter Lima', date '2026-04-01', 2881828, 2478661, 176142),
  ('Fahima Akter Lima', date '2026-05-01', 2826590, 2520019, 215033),
  ('Fahima Akter Lima', date '2026-06-01', 3214682, 2754184, 347951),
  ('Fahima Akter Lima', date '2026-07-01', 2414725, 2302114, 369926),
  ('Fahima Akter Lima', date '2026-08-01', 2242728, 1303353, 114500),
  -- Sohel rana
  ('Sohel rana', date '2026-01-01', 3909255, 3713676, 207500),
  ('Sohel rana', date '2026-02-01', 3804902, 2894800, 67168),
  ('Sohel rana', date '2026-03-01', 2856432, 3192766, 314744),
  ('Sohel rana', date '2026-04-01', 5155724, 4803616, 157773),
  ('Sohel rana', date '2026-05-01', 3359268, 3123737, 178200),
  ('Sohel rana', date '2026-06-01', 4556953, 4355983, 233462),
  ('Sohel rana', date '2026-07-01', 2697438, 2781677, 242826),
  ('Sohel rana', date '2026-08-01', 4479893, 3632941, 218614),
  -- Khandaker Md. Rakib
  ('Khandaker Md. Rakib', date '2026-01-01', 852778, 445523, 5310),
  ('Khandaker Md. Rakib', date '2026-02-01', 561614, 415345, 13704),
  ('Khandaker Md. Rakib', date '2026-03-01', 956098, 587224, 61590),
  ('Khandaker Md. Rakib', date '2026-04-01', 1146862, 833520, 171677),
  ('Khandaker Md. Rakib', date '2026-05-01', 729176, 845669, 44892),
  ('Khandaker Md. Rakib', date '2026-06-01', 1506154, 1282853, 52850),
  ('Khandaker Md. Rakib', date '2026-07-01', 671860, 731711, 9460),
  ('Khandaker Md. Rakib', date '2026-08-01', 215830, 436627, 12260),
  -- Sahir Hasan
  ('Sahir Hasan', date '2026-01-01', 927284, 775976, 53790),
  ('Sahir Hasan', date '2026-02-01', 1538244, 1271991, 94887),
  ('Sahir Hasan', date '2026-03-01', 1650017, 1552988, 108714),
  ('Sahir Hasan', date '2026-04-01', 2986004, 2176638, 222475),
  ('Sahir Hasan', date '2026-05-01', 2595777, 1535371, 270927),
  ('Sahir Hasan', date '2026-06-01', 2733258, 2513425, 727295),
  ('Sahir Hasan', date '2026-07-01', 2618255, 2138678, 225039),
  ('Sahir Hasan', date '2026-08-01', 2870748, 1757712, 370823),
  -- Abu Jafar
  ('Abu Jafar', date '2026-01-01', 1376543, 1552654.35, 44765),
  ('Abu Jafar', date '2026-02-01', 1958571, 1932200, 169400),
  ('Abu Jafar', date '2026-03-01', 1083537, 712520, 5550),
  ('Abu Jafar', date '2026-04-01', 2558650, 1695383, 7760),
  ('Abu Jafar', date '2026-05-01', 1227956, 852570, 0),
  ('Abu Jafar', date '2026-06-01', 2053565, 1546647, 16655),
  ('Abu Jafar', date '2026-07-01', 1615187, 1673825, 105370),
  ('Abu Jafar', date '2026-08-01', 2173539, 1923619, 0),
  -- Sk Shams Nur
  ('Sk Shams Nur', date '2026-01-01', 0, 0, 0),
  ('Sk Shams Nur', date '2026-02-01', 0, 0, 0),
  ('Sk Shams Nur', date '2026-03-01', 0, 0, 0),
  ('Sk Shams Nur', date '2026-04-01', 0, 30500, 0),
  ('Sk Shams Nur', date '2026-05-01', 85200, 56600, 10750),
  ('Sk Shams Nur', date '2026-06-01', 194180, 83990, 520),
  ('Sk Shams Nur', date '2026-07-01', 242907, 169390, 17710),
  ('Sk Shams Nur', date '2026-08-01', 457345, 304995, 0),
  -- Others (no August data in the source sheet)
  ('Others', date '2026-01-01', 1284753, 1286188, 16300),
  ('Others', date '2026-02-01', 787623, 726960, 71510),
  ('Others', date '2026-03-01', 703787, 506707, 9520),
  ('Others', date '2026-04-01', 737978, 942800, 5210),
  ('Others', date '2026-05-01', 484721, 585500, 2550),
  ('Others', date '2026-06-01', 587418, 561842, 32000),
  ('Others', date '2026-07-01', 324270, 452750, 9480)
)
insert into public.daily_entries (user_id, entry_date, sales, collections, sales_return)
select p.id, ed.entry_date, ed.sales, ed.collections, ed.sales_return
from entry_data ed
join public.profiles p on p.full_name = ed.full_name and p.is_sales_person = true
on conflict (user_id, entry_date) do update set
  sales = excluded.sales,
  collections = excluded.collections,
  sales_return = excluded.sales_return;

-- ---------------------------------------------------------------------
-- 3) Verification - run this after and check every expected name shows
--    up with count = 8 (or 7 for "Others"). A missing name means the
--    full_name didn't match exactly - check the profiles table.
-- ---------------------------------------------------------------------
-- select p.full_name, count(*) as months_inserted
-- from public.daily_entries de
-- join public.profiles p on p.id = de.user_id
-- where de.entry_date between '2026-01-01' and '2026-08-01'
--   and de.entry_date = date_trunc('month', de.entry_date)
-- group by p.full_name
-- order by p.full_name;
