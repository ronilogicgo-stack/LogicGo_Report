-- =====================================================================
-- MIGRATION v45 -> v46
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds customer-facing RMA tracking, without requiring login:
--
-- 1. tracking_code: a random, non-sequential code (nothing to do with
--    rma_number, which stays sequential/internal) generated
--    automatically for every RMA. Give this code to the customer -
--    guessing another customer's code by changing a digit is not
--    feasible (12 random letters/digits).
-- 2. rma_public_track(p_tracking_code text): a SECURITY DEFINER
--    function anyone (even logged out) can call with just the code.
--    It returns ONLY a customer-appropriate subset of fields - no
--    staff names, no internal diagnosis/repair notes, no remarks -
--    plus a simplified milestone timeline (Created, Under Repair, QC
--    Passed/Failed, Sent to Courier, Delivered) with dates only.
--
-- Safe to run once.
-- =====================================================================

alter table public.rma_records add column if not exists tracking_code text unique;

create or replace function public.generate_rma_tracking_code()
returns text
language sql
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

-- Backfill any existing RMAs created before this migration.
update public.rma_records
set tracking_code = public.generate_rma_tracking_code()
where tracking_code is null;

-- Extend the creation trigger to always set a tracking_code too.
create or replace function public.stamp_rma_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  select full_name into new.created_by_name from public.profiles where id = auth.uid();
  new.created_by_role := public.current_user_display_role();

  if new.rma_number is null then
    new.rma_number := 'RMA-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.rma_number_seq')::text, 5, '0');
  end if;

  if new.tracking_code is null then
    new.tracking_code := public.generate_rma_tracking_code();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Public, unauthenticated lookup - returns null if the code doesn't
-- match anything, so a wrong guess reveals nothing.
create or replace function public.rma_public_track(p_tracking_code text)
returns table (
  rma_number text,
  status text,
  product_name text,
  product_model text,
  created_at timestamptz,
  estimated_delivery timestamptz,
  courier_company text,
  courier_tracking text,
  closed_at timestamptz,
  milestones jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select r.id into v_id from public.rma_records r where r.tracking_code = upper(trim(p_tracking_code));
  if v_id is null then
    return;
  end if;

  return query
  select
    r.rma_number, r.status, r.product_name, r.product_model, r.created_at,
    r.estimated_delivery, r.courier_company, r.courier_tracking, r.closed_at,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('label', m.label, 'at', m.at) order by m.at)
        from (
          select 'Received' as label, r.created_at as at
          union all
          select 'Under Repair', r.controlled_at where r.controlled_at is not null
          union all
          select 'QC ' || r.qc_result, r.qc_at where r.qc_at is not null
          union all
          select 'Sent to Courier', r.courier_at where r.courier_at is not null
          union all
          select 'Delivered', r.delivered_at where r.delivered_at is not null
          union all
          select 'Closed', r.closed_at where r.closed_at is not null
        ) m
      ),
      '[]'::jsonb
    ) as milestones
  from public.rma_records r
  where r.id = v_id;
end;
$$;

grant execute on function public.rma_public_track(text) to anon, authenticated;

-- Done. Give the customer their RMA's tracking_code (shown on the RMA
-- detail page to staff) - they use it at /track, no login needed.
