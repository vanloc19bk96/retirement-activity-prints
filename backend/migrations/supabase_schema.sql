-- Retirement Activity Prints — single bootstrap (fresh production database)
-- Run this file once in Supabase SQL Editor. No other migrations needed.
--
-- After running:
--   1. Settings → API → Exposed schemas: add `retirement_activity_prints`
--   2. Upload assets to storage buckets (outline-library, emoji-library)
--   3. Optional: python backend/scripts/sync_library_assets.py --kind all
--   4. Optional: set grsai_api_key on ai_runtime_settings id='default'

-- -----------------------------------------------------------------------------
-- 1) Schema + extension
-- -----------------------------------------------------------------------------
create schema if not exists retirement_activity_prints;
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 2) Shared updated_at trigger helper
-- -----------------------------------------------------------------------------
create or replace function retirement_activity_prints.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) users
-- -----------------------------------------------------------------------------
create table if not exists retirement_activity_prints.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  plan text not null default 'Starter',
  monthly_downloads_used integer not null default 0
    constraint users_monthly_downloads_used_non_negative_check check (monthly_downloads_used >= 0),
  last_download_reset_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists users_set_updated_at on retirement_activity_prints.users;
create trigger users_set_updated_at
before update on retirement_activity_prints.users
for each row
execute function retirement_activity_prints.set_updated_at();

create or replace function retirement_activity_prints.normalize_user_email()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists users_normalize_email on retirement_activity_prints.users;
create trigger users_normalize_email
before insert or update of email on retirement_activity_prints.users
for each row
execute function retirement_activity_prints.normalize_user_email();

comment on column retirement_activity_prints.users.monthly_downloads_used is
  'Canvas exports consumed in the current calendar month.';

comment on column retirement_activity_prints.users.last_download_reset_at is
  'UTC timestamp when monthly_downloads_used was last reset (start of month rollover).';

-- -----------------------------------------------------------------------------
-- 4) projects
-- -----------------------------------------------------------------------------
create table if not exists retirement_activity_prints.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique
    references retirement_activity_prints.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists projects_set_updated_at on retirement_activity_prints.projects;
create trigger projects_set_updated_at
before update on retirement_activity_prints.projects
for each row
execute function retirement_activity_prints.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5) canvases
-- -----------------------------------------------------------------------------
create table if not exists retirement_activity_prints.canvases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references retirement_activity_prints.projects (id) on delete cascade,
  canvas_data jsonb not null default '{}'::jsonb,
  page_index integer not null,
  canvas_type text not null default 'interior'
    constraint canvases_canvas_type_check check (canvas_type in ('interior', 'cover')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists canvases_set_updated_at on retirement_activity_prints.canvases;
create trigger canvases_set_updated_at
before update on retirement_activity_prints.canvases
for each row
execute function retirement_activity_prints.set_updated_at();

create unique index if not exists canvases_project_page_type_unique
  on retirement_activity_prints.canvases (project_id, page_index, canvas_type);

create index if not exists canvases_project_id_idx
  on retirement_activity_prints.canvases (project_id);

-- -----------------------------------------------------------------------------
-- 6) template library (categories + items)
-- -----------------------------------------------------------------------------
create table if not exists retirement_activity_prints.template_library_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  min_plan text not null default 'Starter',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint template_library_categories_slug_unique unique (slug)
);

create index if not exists template_library_categories_active_idx
  on retirement_activity_prints.template_library_categories (is_active);

create index if not exists template_library_categories_min_plan_idx
  on retirement_activity_prints.template_library_categories (min_plan);

create index if not exists template_library_categories_sort_idx
  on retirement_activity_prints.template_library_categories (sort_order, slug);

drop trigger if exists set_template_library_categories_updated_at
  on retirement_activity_prints.template_library_categories;
create trigger set_template_library_categories_updated_at
before update on retirement_activity_prints.template_library_categories
for each row
execute function retirement_activity_prints.set_updated_at();

create table if not exists retirement_activity_prints.template_library_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null
    references retirement_activity_prints.template_library_categories (id) on delete restrict,
  template_slug text not null,
  title text not null,
  preview_path text not null,
  template_json_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint template_library_items_category_id_template_unique unique (category_id, template_slug)
);

create index if not exists template_library_items_category_id_idx
  on retirement_activity_prints.template_library_items (category_id);

create index if not exists template_library_items_active_idx
  on retirement_activity_prints.template_library_items (is_active);

create index if not exists template_library_items_category_id_sort_idx
  on retirement_activity_prints.template_library_items (category_id, sort_order, template_slug);

drop trigger if exists set_template_library_items_updated_at
  on retirement_activity_prints.template_library_items;
create trigger set_template_library_items_updated_at
before update on retirement_activity_prints.template_library_items
for each row
execute function retirement_activity_prints.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7) page size options
-- -----------------------------------------------------------------------------
create table if not exists retirement_activity_prints.page_size_options (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  min_plan text not null default 'Starter',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint page_size_options_label_unique unique (label)
);

create index if not exists page_size_options_active_idx
  on retirement_activity_prints.page_size_options (is_active);

create index if not exists page_size_options_min_plan_idx
  on retirement_activity_prints.page_size_options (min_plan);

create index if not exists page_size_options_sort_idx
  on retirement_activity_prints.page_size_options (sort_order, label);

drop trigger if exists set_page_size_options_updated_at
  on retirement_activity_prints.page_size_options;
create trigger set_page_size_options_updated_at
before update on retirement_activity_prints.page_size_options
for each row
execute function retirement_activity_prints.set_updated_at();

insert into retirement_activity_prints.page_size_options (label, min_plan, sort_order, is_active)
values
  ('5 x 8 in', 'Starter', 10, true),
  ('5.06 x 7.81 in', 'Standard', 20, true),
  ('5.25 x 8 in', 'Standard', 30, true),
  ('5.5 x 8.5 in', 'Starter', 40, true),
  ('6 x 9 in', 'Starter', 50, true),
  ('6.14 x 9.21 in', 'Standard', 60, true),
  ('6.69 x 9.61 in', 'Standard', 70, true),
  ('7 x 10 in', 'Starter', 80, true),
  ('7.44 x 9.69 in', 'Standard', 90, true),
  ('7.5 x 9.25 in', 'Starter', 100, true),
  ('8 x 10 in', 'Starter', 110, true),
  ('8.25 x 11 in', 'Starter', 140, true),
  ('8.5 x 11 in', 'Starter', 160, true),
  ('8.27 x 11.69 in', 'Standard', 170, true)
on conflict (label) do nothing;

-- -----------------------------------------------------------------------------
-- 8) AI runtime settings (singleton; edit in Table Editor)
-- -----------------------------------------------------------------------------
create table if not exists retirement_activity_prints.ai_runtime_settings (
  id text primary key default 'default',
  grsai_api_key text,
  grsai_base_url text not null default 'https://grsaiapi.com',
  -- Primary GrsAI draw route (nano-banana | completions).
  grsai_primary_endpoint text not null default 'completions'
    constraint ai_runtime_settings_grsai_primary_endpoint_check
      check (grsai_primary_endpoint in ('nano-banana', 'completions')),
  grsai_nano_banana_model text not null default 'nano-banana',
  grsai_completions_model text not null default 'gpt-image-2',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_runtime_settings_singleton_id_check check (id = 'default')
);

drop trigger if exists ai_runtime_settings_set_updated_at
  on retirement_activity_prints.ai_runtime_settings;
create trigger ai_runtime_settings_set_updated_at
before update on retirement_activity_prints.ai_runtime_settings
for each row
execute function retirement_activity_prints.set_updated_at();

insert into retirement_activity_prints.ai_runtime_settings (id)
values ('default')
on conflict (id) do nothing;

comment on table retirement_activity_prints.ai_runtime_settings is
  'Singleton runtime AI config. Backend reads via service role; secrets stay server-side.';

comment on column retirement_activity_prints.ai_runtime_settings.grsai_primary_endpoint is
  'Primary GrsAI draw route: nano-banana -> POST /v1/draw/nano-banana; completions -> POST /v1/draw/completions.';

comment on column retirement_activity_prints.ai_runtime_settings.grsai_nano_banana_model is
  'Model id when using /v1/draw/nano-banana (e.g. nano-banana-pro). Also fallback if completions fails.';

comment on column retirement_activity_prints.ai_runtime_settings.grsai_completions_model is
  'Model id when using /v1/draw/completions (e.g. gpt-image-2). Used only when grsai_primary_endpoint = completions.';

-- -----------------------------------------------------------------------------
-- 9) Shared library asset metadata
-- -----------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

create table if not exists retirement_activity_prints.library_assets (
  id uuid primary key,
  kind text not null
    constraint library_assets_kind_check check (kind in ('outline', 'emoji')),
  bucket text not null,
  object_path text not null,
  thumbnail_object_path text,
  title text not null,
  slug text not null,
  tags text[] not null default '{}'::text[],
  search_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_assets_bucket_path_unique unique (bucket, object_path)
);

create index if not exists library_assets_page_idx
  on retirement_activity_prints.library_assets (kind, is_active, slug, id);

create index if not exists library_assets_search_idx
  on retirement_activity_prints.library_assets
  using gin (search_text extensions.gin_trgm_ops);

drop trigger if exists set_library_assets_updated_at
  on retirement_activity_prints.library_assets;
create trigger set_library_assets_updated_at
before update on retirement_activity_prints.library_assets
for each row
execute function retirement_activity_prints.set_updated_at();

comment on table retirement_activity_prints.library_assets is
  'Searchable metadata index for shared Storage assets. Storage remains the source of file bytes.';

-- -----------------------------------------------------------------------------
-- 10) Grants
-- -----------------------------------------------------------------------------
grant usage on schema retirement_activity_prints to anon, authenticated, service_role;

grant all privileges on all tables in schema retirement_activity_prints to anon, authenticated, service_role;
grant all privileges on all sequences in schema retirement_activity_prints to anon, authenticated, service_role;

alter default privileges in schema retirement_activity_prints
  grant all on tables to anon, authenticated, service_role;

alter default privileges in schema retirement_activity_prints
  grant all on sequences to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 11) Storage buckets
-- -----------------------------------------------------------------------------

-- User uploads + processed images (public read; writes via service role).
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'retirement-activity-prints',
  'retirement-activity-prints',
  true,
  104857600,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Shared outline image library.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'outline-library',
  'outline-library',
  true,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Shared emoji SVG library.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'emoji-library',
  'emoji-library',
  true,
  1048576,
  array[
    'image/svg+xml'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read user images objects" on storage.objects;
create policy "Public read user images objects"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'retirement-activity-prints'
);

drop policy if exists "Public read outlines objects" on storage.objects;
create policy "Public read outlines objects"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'outline-library'
);

drop policy if exists "Public read emoji objects" on storage.objects;
create policy "Public read emoji objects"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'emoji-library'
);
