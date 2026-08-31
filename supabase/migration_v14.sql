-- =====================================================================
-- MIGRATION v13 -> v14
-- Run this in your EXISTING Supabase project's SQL Editor.
--
-- Adds:
-- 1. A company-wide "app_settings" row for the Admin's brand logo.
-- 2. An avatar_url field on profiles for each sales person's photo.
-- 3. Two Storage buckets ("avatars", "branding") with policies so
--    people can upload their own photo, and only an Admin can change
--    the company logo.
--
-- Safe to run once.
-- =====================================================================

-- 1. Company-wide settings (a single row, always id = true)
create table if not exists public.app_settings (
  id boolean primary key default true,
  logo_url text,
  constraint app_settings_singleton check (id = true)
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings: anyone can read" on public.app_settings;
create policy "app_settings: anyone can read"
  on public.app_settings for select
  using (true);

drop policy if exists "app_settings: admin can update" on public.app_settings;
create policy "app_settings: admin can update"
  on public.app_settings for update
  using (public.is_admin());

-- 2. Profile photo field
alter table public.profiles add column if not exists avatar_url text;

-- 3. Storage buckets (both public - anyone can view images via their
--    public URL; the policies below control who can UPLOAD/CHANGE them)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Avatars: each person can manage a file under their own user-id folder
-- (e.g. "abc-123-.../avatar.jpg"); an Admin can manage anyone's.
drop policy if exists "avatars: users can upload own avatar" on storage.objects;
create policy "avatars: users can upload own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: users can update own avatar" on storage.objects;
create policy "avatars: users can update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: users can delete own avatar" on storage.objects;
create policy "avatars: users can delete own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: admin can manage any avatar" on storage.objects;
create policy "avatars: admin can manage any avatar"
  on storage.objects for all
  using (bucket_id = 'avatars' and public.is_admin())
  with check (bucket_id = 'avatars' and public.is_admin());

drop policy if exists "avatars: anyone can view avatars" on storage.objects;
create policy "avatars: anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Branding (company logo): only an Admin can upload/change it.
drop policy if exists "branding: admin can manage logo" on storage.objects;
create policy "branding: admin can manage logo"
  on storage.objects for all
  using (bucket_id = 'branding' and public.is_admin())
  with check (bucket_id = 'branding' and public.is_admin());

drop policy if exists "branding: anyone can view logo" on storage.objects;
create policy "branding: anyone can view logo"
  on storage.objects for select
  using (bucket_id = 'branding');

-- Done. Push the new app code and redeploy - no other manual steps needed.
