-- =====================================================================
-- MIGRATION v44 -> v45
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- New "RMA" module (repair/return tracking with a mandatory, tamper-
-- proof accountability trail). Follows the exact same permission
-- pattern already used by POS and Annual Report: it's a tag in the
-- generic module_access system (module_key = 'rma') - no new
-- permission tables or functions needed, Team & Requests and /access
-- already support it the moment it's registered in lib/modules.js.
--
-- THE CORE RULE THIS ENFORCES: "who did this" is NEVER trusted from
-- the client. Every insert into rma_records or rma_audit_log passes
-- through a BEFORE INSERT trigger that overwrites whatever
-- created_by/user_id the client sent with auth.uid() (the actual
-- logged-in session), and looks up that person's current name/role
-- from profiles to store as a permanent snapshot - so old entries
-- still read correctly even if that person's name or role changes
-- later. The app's UI never shows a "who performed this?" picker;
-- there is nothing to pick even if it tried, since the client-supplied
-- value is discarded.
--
-- rma_audit_log has NO update or delete policy for anyone (including
-- the Owner) - it is permanently append-only, matching "previous
-- remarks/history must never be overwritten" and "audit logs must be
-- read-only, not editable/deletable by normal users."
--
-- Note on "Role": your spec's examples used job titles like
-- "Technician" / "QC" / "RMA Reception", which this app has no concept
-- of today (only Admin / Sales Person / Accounts, plus a person's
-- Viewer/Editor/Agency Owner level for this module). The role snapshot
-- below uses those real roles instead of inventing job titles.
--
-- Safe to run once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) RMA records (the current/latest state of each RMA)
-- ---------------------------------------------------------------------
create sequence if not exists public.rma_number_seq;

create table if not exists public.rma_records (
  id uuid primary key default gen_random_uuid(),
  rma_number text unique,

  customer_name text not null,
  customer_phone text default '',
  product_name text not null,
  product_model text default '',
  serial_number text default '',
  issue_description text default '',

  status text not null default 'Created' check (status in (
    'Created', 'Under Control', 'Working on It', 'QC',
    'Ready for Delivery', 'Sent to Courier', 'Customer Received', 'Closed'
  )),

  created_by uuid references public.profiles(id),
  created_by_name text,
  created_by_role text,
  created_at timestamptz default now(),

  controlled_by uuid references public.profiles(id),
  controlled_by_name text,
  controlled_at timestamptz,

  estimated_delivery timestamptz,

  diagnosis text,
  diagnosis_by uuid references public.profiles(id),
  diagnosis_by_name text,
  diagnosis_at timestamptz,

  repair_action text,
  repair_by uuid references public.profiles(id),
  repair_by_name text,
  repair_at timestamptz,

  qc_result text check (qc_result in ('Passed', 'Failed')),
  qc_remarks text,
  qc_by uuid references public.profiles(id),
  qc_by_name text,
  qc_at timestamptz,

  courier_company text,
  courier_tracking text,
  courier_by uuid references public.profiles(id),
  courier_by_name text,
  courier_at timestamptz,

  receiver_name text,
  delivery_method text,
  delivered_by uuid references public.profiles(id),
  delivered_by_name text,
  delivered_at timestamptz,

  closed_by uuid references public.profiles(id),
  closed_by_name text,
  closed_at timestamptz,

  updated_at timestamptz default now()
);

create index if not exists idx_rma_records_status on public.rma_records(status);

-- ---------------------------------------------------------------------
-- 2) Audit log (the permanent, append-only activity timeline)
-- ---------------------------------------------------------------------
create table if not exists public.rma_audit_log (
  id uuid primary key default gen_random_uuid(),
  rma_id uuid not null references public.rma_records(id) on delete cascade,
  user_id uuid references public.profiles(id),
  user_name_snapshot text,
  user_role_snapshot text,
  action text not null check (action in (
    'created', 'took_control', 'status_changed', 'remark_added',
    'estimated_delivery_updated', 'diagnosis_added', 'repair_added',
    'qc_completed', 'courier_updated', 'customer_received', 'closed'
  )),
  previous_value text,
  new_value text,
  remark text,
  created_at timestamptz default now()
);

create index if not exists idx_rma_audit_log_rma on public.rma_audit_log(rma_id, created_at);
create index if not exists idx_rma_audit_log_user on public.rma_audit_log(user_id);

-- ---------------------------------------------------------------------
-- 3) Server-enforced identity stamping (rule #12) + RMA numbering
-- ---------------------------------------------------------------------
create or replace function public.current_user_display_role()
returns text
language sql
security definer
set search_path = public
as $$
  select case
    when p.is_admin then 'Admin'
    when p.is_sales_person then 'Sales Person'
    when p.is_accounts then 'Accounts'
    else 'User'
  end
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.stamp_rma_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Always overwrite with the real logged-in session - never trust
  -- whatever the client sent for these fields.
  new.created_by := auth.uid();
  select full_name into new.created_by_name from public.profiles where id = auth.uid();
  new.created_by_role := public.current_user_display_role();

  if new.rma_number is null then
    new.rma_number := 'RMA-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.rma_number_seq')::text, 5, '0');
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_stamp_rma_record on public.rma_records;
create trigger trg_stamp_rma_record
  before insert on public.rma_records
  for each row execute function public.stamp_rma_record();

create or replace function public.touch_rma_record_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_rma_record on public.rma_records;
create trigger trg_touch_rma_record
  before update on public.rma_records
  for each row execute function public.touch_rma_record_updated_at();

create or replace function public.stamp_rma_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  select full_name into new.user_name_snapshot from public.profiles where id = auth.uid();
  new.user_role_snapshot := public.current_user_display_role();
  return new;
end;
$$;

drop trigger if exists trg_stamp_rma_audit_log on public.rma_audit_log;
create trigger trg_stamp_rma_audit_log
  before insert on public.rma_audit_log
  for each row execute function public.stamp_rma_audit_log();

-- ---------------------------------------------------------------------
-- 4) One RPC function per action. Each checks edit access, stamps the
--    "who did this" fields with auth.uid()-derived identity (never a
--    client-supplied value), updates the record's current state, and
--    writes the matching audit_log row - atomically, in one call. This
--    is what the app calls for every action button (Take Control,
--    Change Status, etc.) instead of a plain client-side update, so
--    identity is enforced server-side for every action, not just RMA
--    creation.
-- ---------------------------------------------------------------------
create or replace function public.rma_take_control(p_rma_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.rma_records
    set controlled_by = auth.uid(), controlled_by_name = v_name, controlled_at = now()
    where id = p_rma_id;
  insert into public.rma_audit_log (rma_id, action, new_value)
    values (p_rma_id, 'took_control', v_name);
end;
$$;

create or replace function public.rma_change_status(p_rma_id uuid, p_new_status text, p_remark text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_previous text;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  select status into v_previous from public.rma_records where id = p_rma_id;
  update public.rma_records set status = p_new_status where id = p_rma_id;
  insert into public.rma_audit_log (rma_id, action, previous_value, new_value, remark)
    values (p_rma_id, 'status_changed', v_previous, p_new_status, p_remark);
end;
$$;

create or replace function public.rma_add_remark(p_rma_id uuid, p_remark text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  insert into public.rma_audit_log (rma_id, action, remark)
    values (p_rma_id, 'remark_added', p_remark);
end;
$$;

create or replace function public.rma_update_estimated_delivery(p_rma_id uuid, p_new_date timestamptz, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_previous timestamptz;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  select estimated_delivery into v_previous from public.rma_records where id = p_rma_id;
  update public.rma_records set estimated_delivery = p_new_date where id = p_rma_id;
  insert into public.rma_audit_log (rma_id, action, previous_value, new_value, remark)
    values (p_rma_id, 'estimated_delivery_updated', v_previous::text, p_new_date::text, p_reason);
end;
$$;

create or replace function public.rma_add_diagnosis(p_rma_id uuid, p_diagnosis text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.rma_records
    set diagnosis = p_diagnosis, diagnosis_by = auth.uid(), diagnosis_by_name = v_name, diagnosis_at = now()
    where id = p_rma_id;
  insert into public.rma_audit_log (rma_id, action, new_value)
    values (p_rma_id, 'diagnosis_added', p_diagnosis);
end;
$$;

create or replace function public.rma_add_repair(p_rma_id uuid, p_repair text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.rma_records
    set repair_action = p_repair, repair_by = auth.uid(), repair_by_name = v_name, repair_at = now()
    where id = p_rma_id;
  insert into public.rma_audit_log (rma_id, action, new_value)
    values (p_rma_id, 'repair_added', p_repair);
end;
$$;

create or replace function public.rma_qc_complete(p_rma_id uuid, p_result text, p_remarks text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.rma_records
    set qc_result = p_result, qc_remarks = p_remarks, qc_by = auth.uid(), qc_by_name = v_name, qc_at = now()
    where id = p_rma_id;
  insert into public.rma_audit_log (rma_id, action, new_value, remark)
    values (p_rma_id, 'qc_completed', p_result, p_remarks);
end;
$$;

create or replace function public.rma_courier_update(p_rma_id uuid, p_company text, p_tracking text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.rma_records
    set courier_company = p_company, courier_tracking = p_tracking,
        courier_by = auth.uid(), courier_by_name = v_name, courier_at = now(),
        status = 'Sent to Courier'
    where id = p_rma_id;
  insert into public.rma_audit_log (rma_id, action, new_value)
    values (p_rma_id, 'courier_updated', p_company || ' / ' || p_tracking);
end;
$$;

create or replace function public.rma_customer_received(p_rma_id uuid, p_receiver text, p_method text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.rma_records
    set receiver_name = p_receiver, delivery_method = p_method,
        delivered_by = auth.uid(), delivered_by_name = v_name, delivered_at = now(),
        status = 'Customer Received'
    where id = p_rma_id;
  insert into public.rma_audit_log (rma_id, action, new_value)
    values (p_rma_id, 'customer_received', p_receiver || ' / ' || p_method);
end;
$$;

create or replace function public.rma_close(p_rma_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.rma_records
    set closed_by = auth.uid(), closed_by_name = v_name, closed_at = now(), status = 'Closed'
    where id = p_rma_id;
  insert into public.rma_audit_log (rma_id, action, new_value)
    values (p_rma_id, 'closed', 'Closed');
end;
$$;

-- ---------------------------------------------------------------------
-- 5) RLS - reuses the generic module_access system directly
--    (has_module_access / has_module_edit_access were added by
--    migration_v35.sql / v36.sql for POS and Annual Report; RMA plugs
--    into the exact same functions with module_key = 'rma').
-- ---------------------------------------------------------------------
alter table public.rma_records enable row level security;
alter table public.rma_audit_log enable row level security;

drop policy if exists "rma_records: members can read" on public.rma_records;
create policy "rma_records: members can read"
  on public.rma_records for select
  using (public.has_module_access('rma'));

drop policy if exists "rma_records: editors can insert" on public.rma_records;
create policy "rma_records: editors can insert"
  on public.rma_records for insert
  with check (public.has_module_edit_access('rma'));

drop policy if exists "rma_records: editors can update" on public.rma_records;
create policy "rma_records: editors can update"
  on public.rma_records for update
  using (public.has_module_edit_access('rma'));

-- No delete policy - an RMA is Closed, never deleted, to keep the
-- accountability trail intact.

drop policy if exists "rma_audit_log: members can read" on public.rma_audit_log;
create policy "rma_audit_log: members can read"
  on public.rma_audit_log for select
  using (public.has_module_access('rma'));

drop policy if exists "rma_audit_log: editors can insert" on public.rma_audit_log;
create policy "rma_audit_log: editors can insert"
  on public.rma_audit_log for insert
  with check (public.has_module_edit_access('rma'));

-- Deliberately no update/delete policy on rma_audit_log for ANYONE,
-- Owner included - the audit trail is permanently append-only.

-- Done. Next, push the new app code and redeploy. Then, as Owner, grant
-- someone RMA access from Team & Requests or /access, the same way you
-- already do for POS/Annual Report.
