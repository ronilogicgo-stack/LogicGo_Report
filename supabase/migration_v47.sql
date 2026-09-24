-- =====================================================================
-- MIGRATION v46 -> v47
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds two things to RMA:
--
-- 1. Editing an RMA's basic details (Customer Name/Phone, Product
--    Name/Model, Serial Number, Issue Description) after creation -
--    anyone with RMA edit access can do this, logged in the audit
--    trail like every other action.
--
-- 2. Deleting an RMA - but as a SOFT delete: the record and its full
--    audit history are never actually erased (deleting them for real
--    would also destroy the accountability trail this whole module
--    exists to protect). A deleted RMA is hidden from the normal list
--    and marked with who deleted it and when - permanently recorded,
--    exactly like every other action here.
--
--    Who can delete: anyone with RMA edit access EXCEPT a person whose
--    ONLY access in the whole system is the RMA grant itself (no
--    Sales Person / Admin / Accounts role, and not the Owner). This is
--    enforced inside the function itself - a client bypass attempt
--    would still be rejected server-side.
--
-- Safe to run once.
-- =====================================================================

alter table public.rma_records add column if not exists deleted_at timestamptz;
alter table public.rma_records add column if not exists deleted_by uuid references public.profiles(id);
alter table public.rma_records add column if not exists deleted_by_name text;

alter table public.rma_audit_log drop constraint if exists rma_audit_log_action_check;
alter table public.rma_audit_log add constraint rma_audit_log_action_check
  check (action in (
    'created', 'took_control', 'status_changed', 'remark_added',
    'estimated_delivery_updated', 'diagnosis_added', 'repair_added',
    'qc_completed', 'courier_updated', 'customer_received', 'closed',
    'details_edited', 'deleted'
  ));

create or replace function public.rma_update_details(
  p_rma_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_product_name text,
  p_product_model text,
  p_serial_number text,
  p_issue_description text
)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  select jsonb_build_object(
    'customer_name', customer_name, 'customer_phone', customer_phone,
    'product_name', product_name, 'product_model', product_model,
    'serial_number', serial_number, 'issue_description', issue_description
  ) into v_before from public.rma_records where id = p_rma_id;

  update public.rma_records
    set customer_name = p_customer_name, customer_phone = p_customer_phone,
        product_name = p_product_name, product_model = p_product_model,
        serial_number = p_serial_number, issue_description = p_issue_description
    where id = p_rma_id;

  insert into public.rma_audit_log (rma_id, action, previous_value, new_value)
    values (p_rma_id, 'details_edited', v_before::text, jsonb_build_object(
      'customer_name', p_customer_name, 'customer_phone', p_customer_phone,
      'product_name', p_product_name, 'product_model', p_product_model,
      'serial_number', p_serial_number, 'issue_description', p_issue_description
    )::text);
end;
$$;

-- True if this person has some base role beyond just an RMA grant
-- (Owner, Admin, Sales Person, or Accounts) - used to gate deletion.
create or replace function public.rma_can_delete()
returns boolean language sql security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1 from public.profiles
    where id = auth.uid() and (is_admin or is_sales_person or is_accounts)
  );
$$;

create or replace function public.rma_delete(p_rma_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.has_module_edit_access('rma') then
    raise exception 'Not authorized.';
  end if;
  if not public.rma_can_delete() then
    raise exception 'An RMA-only account cannot delete records - ask an Admin, Sales Person, or the Owner.';
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();
  update public.rma_records
    set deleted_at = now(), deleted_by = auth.uid(), deleted_by_name = v_name
    where id = p_rma_id;

  insert into public.rma_audit_log (rma_id, action, new_value)
    values (p_rma_id, 'deleted', v_name);
end;
$$;

-- Done. The RMA list view will be updated (in the app code) to only
-- show rows where deleted_at is null.
