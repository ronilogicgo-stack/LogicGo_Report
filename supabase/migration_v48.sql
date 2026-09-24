-- =====================================================================
-- MIGRATION v47 -> v48
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds real push notifications (sound + a floating/banner alert on the
-- phone, even if the app isn't open) for:
-- 1. A Sales Person submitting a Daily Entry -> notifies every Admin.
-- 2. An RMA being created, or its status changing -> notifies everyone
--    with RMA access (any level) plus the Owner.
--
-- How it works: pg_net (Supabase's built-in extension for making HTTP
-- calls from Postgres) lets a database trigger call our own app's API
-- route the instant a row is inserted - no separate "Database Webhook"
-- to configure by hand in the Supabase dashboard.
--
-- ⚠️ This migration alone does NOT send anything yet - it only calls
-- the app's /api/notify/* routes, which don't exist until the matching
-- code is deployed (already pushed to GitHub). Also requires two
-- environment variables in Vercel (VAPID keys) - see the message after
-- this migration for the exact values to add.
--
-- Safe to run once.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- 1) Where each person's push subscription (their phone's registration
--    with the browser's push service) is stored.
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: user manages own" on public.push_subscriptions;
create policy "push_subscriptions: user manages own"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2) Trigger: a Sales Person's real (not admin-requested-placeholder)
--    daily entry notifies every Admin.
-- ---------------------------------------------------------------------
create or replace function public.notify_new_daily_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entry_type = 'submitted' then
    perform net.http_post(
      url := 'https://logic-go-report-zj1v.vercel.app/api/notify/daily-entry',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notify-secret', 'bf5675cffcb787c829be9b7218238fc1e121256bb9398adb'
      ),
      body := jsonb_build_object('entry_id', new.id, 'user_id', new.user_id, 'entry_date', new.entry_date)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_daily_entry on public.daily_entries;
create trigger trg_notify_new_daily_entry
  after insert on public.daily_entries
  for each row execute function public.notify_new_daily_entry();

-- ---------------------------------------------------------------------
-- 3) Triggers: a new RMA, or an RMA status change, notifies everyone
--    with RMA access.
-- ---------------------------------------------------------------------
create or replace function public.notify_rma_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://logic-go-report-zj1v.vercel.app/api/notify/rma',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', 'bf5675cffcb787c829be9b7218238fc1e121256bb9398adb'
    ),
    body := jsonb_build_object('rma_id', new.id, 'rma_number', new.rma_number, 'event', 'created')
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_rma_created on public.rma_records;
create trigger trg_notify_rma_created
  after insert on public.rma_records
  for each row execute function public.notify_rma_created();

create or replace function public.notify_rma_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.action = 'status_changed' then
    perform net.http_post(
      url := 'https://logic-go-report-zj1v.vercel.app/api/notify/rma',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notify-secret', 'bf5675cffcb787c829be9b7218238fc1e121256bb9398adb'
      ),
      body := jsonb_build_object(
        'rma_id', new.rma_id, 'event', 'status_changed',
        'previous_value', new.previous_value, 'new_value', new.new_value
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_rma_status_changed on public.rma_audit_log;
create trigger trg_notify_rma_status_changed
  after insert on public.rma_audit_log
  for each row execute function public.notify_rma_status_changed();

-- Done. Next: add the two VAPID environment variables to Vercel (see
-- the message after this migration), redeploy, then everyone needs to
-- open the app once and tap "Allow" when asked for notification
-- permission.
