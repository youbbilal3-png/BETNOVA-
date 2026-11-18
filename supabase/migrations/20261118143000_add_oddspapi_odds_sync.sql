create table if not exists public.oddspapi_tournament_catalog (
  tournament_id bigint primary key,
  tournament_slug text,
  tournament_name text not null,
  category_slug text,
  category_name text,
  future_fixtures integer,
  upcoming_fixtures integer,
  live_fixtures integer,
  synced_at timestamptz not null default now()
);
create table if not exists public.oddspapi_market_catalog (
  market_id bigint primary key,
  market_name text not null,
  market_type text,
  period text,
  handicap numeric,
  player_prop boolean not null default false,
  outcomes jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now()
);
create table if not exists public.oddspapi_fixture_links (
  provider_fixture_id text primary key,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  provider_start_time timestamptz not null,
  last_seen_at timestamptz not null default now(),
  match_confidence numeric not null default 1
);
create index if not exists oddspapi_fixture_links_fixture_idx on public.oddspapi_fixture_links(fixture_id);
create table if not exists public.oddspapi_sync_state (
  id integer primary key default 1 check (id=1),
  tournament_cursor integer not null default 0,
  call_count bigint not null default 0,
  last_sync_at timestamptz,
  last_bookmaker text
);
insert into public.oddspapi_sync_state(id) values(1) on conflict(id) do nothing;

alter table public.oddspapi_tournament_catalog enable row level security;
alter table public.oddspapi_market_catalog enable row level security;
alter table public.oddspapi_fixture_links enable row level security;
alter table public.oddspapi_sync_state enable row level security;
revoke all on public.oddspapi_tournament_catalog,public.oddspapi_market_catalog,public.oddspapi_fixture_links,public.oddspapi_sync_state from anon,authenticated;

create or replace function public.betnova_get_odds_sync_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb;
  v_role text;
  v_config jsonb;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), v_claims->>'role');
  if v_role is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  select jsonb_build_object(
    'api_key', max(decrypted_secret) filter (where name = 'the_odds_api_key'),
    'oddspapi_api_key', max(decrypted_secret) filter (where name = 'oddspapi_api_key'),
    'sync_secret', max(decrypted_secret) filter (where name = 'betnova_sync_secret')
  )
  into v_config
  from vault.decrypted_secrets
  where name in ('the_odds_api_key', 'oddspapi_api_key', 'betnova_sync_secret');
  return coalesce(v_config, '{}'::jsonb);
end;
$function$;
revoke all on function public.betnova_get_odds_sync_config() from public,anon,authenticated;
grant execute on function public.betnova_get_odds_sync_config() to service_role;

do $$
declare v_job integer;
begin
  select jobid into v_job from cron.job where jobname='betnova-oddspapi-sync';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  select jobid into v_job from cron.job where jobname='betnova-api-football-sync';
  if v_job is not null then perform cron.unschedule(v_job); end if;
end
$$;

select cron.schedule(
  'betnova-oddspapi-sync',
  '0 */4 * * *',
  $job$
    select net.http_post(
      url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/oddspapi-sync',
      body := '{"mode":"sync"}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-betnova-sync-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)
      ),
      timeout_milliseconds := 180000
    )
    where exists(select 1 from vault.decrypted_secrets where name='oddspapi_api_key')
      and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
  $job$
);
