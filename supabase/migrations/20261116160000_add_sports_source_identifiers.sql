-- Preserve upstream identifiers for safe, repeatable sports-data imports.
-- Fixtures already contain these source columns in the core schema.

alter table public.teams
  add column if not exists source_provider text,
  add column if not exists external_id text;

alter table public.competitions
  add column if not exists source_provider text,
  add column if not exists external_id text;

create unique index if not exists teams_source_external_uidx
  on public.teams (source_provider, external_id)
  where source_provider is not null and external_id is not null;

create unique index if not exists competitions_source_external_uidx
  on public.competitions (source_provider, external_id)
  where source_provider is not null and external_id is not null;
