-- =====================================================================
-- MIGRATION v36 -> v37
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds a new "Accounts" role, alongside Sales Person and Admin. Someone
-- checked as Accounts (and not Admin/Sales Person) logs in and lands
-- directly on Payment Follow-Up - nothing else in the app is visible to
-- them (no Dashboard, no Admin panel). Their Editor/Viewer level per
-- branch is still set exactly the way it already works today, via
-- Admin > Payment Follow-Up > Access - this migration only adds the
-- role flag and its login routing, it doesn't change how branch access
-- itself is granted.
--
-- Safe to run once.
-- =====================================================================

alter table public.profiles add column if not exists is_accounts boolean not null default false;
