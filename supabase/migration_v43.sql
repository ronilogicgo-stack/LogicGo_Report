-- =====================================================================
-- MIGRATION v42 -> v43
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds WhatsApp messaging support to Payment Follow-Up: a branch-wise
-- list of saved contacts (a person's phone number) or groups (a
-- chat.whatsapp.com invite link), so a message about any record can be
-- opened straight into WhatsApp with the text pre-filled.
--
-- ⚠️ EASY TO REMOVE LATER: this feature lives entirely in its own
-- table (below) and its own component file
-- (components/PaymentFollowupWhatsApp.jsx). To remove it completely:
--   1. In components/PaymentFollowupBranch.jsx, delete the import of
--      PaymentFollowupWhatsApp and the few JSX blocks that use it
--      (search for "WHATSAPP FEATURE" comments marking each one).
--   2. Delete components/PaymentFollowupWhatsApp.jsx.
--   3. Optionally run: drop table if exists public.payment_followup_whatsapp_targets;
-- Nothing else in the app depends on this table or component.
--
-- Safe to run once.
-- =====================================================================

create table if not exists public.payment_followup_whatsapp_targets (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.payment_followup_branches(id) on delete cascade,
  label text not null,
  target_type text not null check (target_type in ('number', 'group')),
  target_value text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists idx_followup_whatsapp_targets_branch
  on public.payment_followup_whatsapp_targets(branch_id);

alter table public.payment_followup_whatsapp_targets enable row level security;

-- Reuses the exact same access functions as payment_followups itself,
-- so anyone who can already view/edit a branch's Payment Follow-Up
-- records gets the same rights here - no separate permission to manage.
drop policy if exists "followup_whatsapp: admin full access" on public.payment_followup_whatsapp_targets;
create policy "followup_whatsapp: admin full access"
  on public.payment_followup_whatsapp_targets for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "followup_whatsapp: branch members can read" on public.payment_followup_whatsapp_targets;
create policy "followup_whatsapp: branch members can read"
  on public.payment_followup_whatsapp_targets for select
  using (public.has_followup_access(branch_id));

drop policy if exists "followup_whatsapp: branch editors can insert" on public.payment_followup_whatsapp_targets;
create policy "followup_whatsapp: branch editors can insert"
  on public.payment_followup_whatsapp_targets for insert
  with check (public.has_followup_edit_access(branch_id));

drop policy if exists "followup_whatsapp: branch editors can update" on public.payment_followup_whatsapp_targets;
create policy "followup_whatsapp: branch editors can update"
  on public.payment_followup_whatsapp_targets for update
  using (public.has_followup_edit_access(branch_id));

drop policy if exists "followup_whatsapp: branch editors can delete" on public.payment_followup_whatsapp_targets;
create policy "followup_whatsapp: branch editors can delete"
  on public.payment_followup_whatsapp_targets for delete
  using (public.has_followup_edit_access(branch_id));
