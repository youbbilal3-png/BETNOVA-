-- Match PostgREST's ON CONFLICT (source_provider, external_id) inference.
-- Existing partial unique indexes already guarantee uniqueness for non-null pairs.
create unique index if not exists teams_source_external_full_uidx
  on public.teams (source_provider, external_id);

create unique index if not exists competitions_source_external_full_uidx
  on public.competitions (source_provider, external_id);
