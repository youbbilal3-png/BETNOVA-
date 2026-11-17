-- SportsAPI free-tier live score/event integration.
-- The cron is dormant until sportsapi_live_api_key is added to Supabase Vault.
create table if not exists public.sportsapi_fixture_links (
  provider_fixture_id bigint primary key,
  fixture_id uuid not null unique references public.fixtures(id) on delete cascade,
  last_status text not null default 'inprogress',
  last_seen_at timestamptz not null default now(),
  last_home_score integer,
  last_away_score integer,
  score_observations integer not null default 0 check (score_observations >= 0),
  score_stable_since timestamptz,
  last_processed_goal_count integer not null default 0 check (last_processed_goal_count >= 0),
  settled_goal_count integer not null default 0 check (settled_goal_count >= 0),
  baseline_ready boolean not null default true,
  last_events_checked_at timestamptz,
  last_final_checked_at timestamptz,
  settlement_hold boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sportsapi_fixture_links_scores_nonnegative
    check ((last_home_score is null or last_home_score >= 0) and (last_away_score is null or last_away_score >= 0))
);

create index if not exists sportsapi_fixture_links_recent_idx
  on public.sportsapi_fixture_links(last_status, last_seen_at desc);

create table if not exists public.sportsapi_api_usage (
  usage_date date primary key,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.sportsapi_fixture_links enable row level security;
alter table public.sportsapi_api_usage enable row level security;
revoke all on public.sportsapi_fixture_links from public, anon, authenticated;
revoke all on public.sportsapi_api_usage from public, anon, authenticated;
grant all on public.sportsapi_fixture_links to service_role;
grant all on public.sportsapi_api_usage to service_role;

create or replace function public.betnova_get_sportsapi_live_config()
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
  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    v_claims->>'role'
  );
  if v_role is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  select jsonb_build_object(
    'api_key', max(decrypted_secret) filter (where name = 'sportsapi_live_api_key'),
    'sync_secret', max(decrypted_secret) filter (where name = 'betnova_sync_secret')
  )
  into v_config
  from vault.decrypted_secrets
  where name in ('sportsapi_live_api_key', 'betnova_sync_secret');

  return coalesce(v_config, '{}'::jsonb);
end;
$function$;

create or replace function public.betnova_reserve_sportsapi_request(p_daily_limit integer default 950)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb;
  v_role text;
  v_count integer;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    v_claims->>'role'
  );
  if v_role is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_daily_limit is null or p_daily_limit < 1 or p_daily_limit > 1000 then
    raise exception 'Invalid daily request limit';
  end if;

  insert into public.sportsapi_api_usage(usage_date, request_count)
  values (current_date, 0)
  on conflict (usage_date) do nothing;

  update public.sportsapi_api_usage
  set request_count = request_count + 1, updated_at = now()
  where usage_date = current_date and request_count < p_daily_limit
  returning request_count into v_count;

  return found;
end;
$function$;

create or replace function public.betnova_match_sportsapi_fixture(
  p_home_name text,
  p_away_name text,
  p_start_time timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb;
  v_role text;
  v_matches uuid[];
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    v_claims->>'role'
  );
  if v_role is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if nullif(trim(p_home_name), '') is null
     or nullif(trim(p_away_name), '') is null
     or p_start_time is null then
    return null;
  end if;

  select array_agg(candidate.id)
  into v_matches
  from (
    select f.id
    from public.fixtures f
    join public.teams h on h.id = f.home_team_id
    join public.teams a on a.id = f.away_team_id
    where f.status in ('scheduled', 'live')
      and f.starts_at between p_start_time - interval '4 hours'
                          and p_start_time + interval '4 hours'
      and regexp_replace(lower(h.name), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(p_home_name), '[^a-z0-9]+', '', 'g')
      and regexp_replace(lower(a.name), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(p_away_name), '[^a-z0-9]+', '', 'g')
    limit 2
  ) candidate;

  if coalesce(cardinality(v_matches), 0) = 1 then
    return v_matches[1];
  end if;
  return null;
end;
$function$;

revoke all on function public.betnova_get_sportsapi_live_config() from public, anon, authenticated;
revoke all on function public.betnova_reserve_sportsapi_request(integer) from public, anon, authenticated;
revoke all on function public.betnova_match_sportsapi_fixture(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.betnova_get_sportsapi_live_config() to service_role;
grant execute on function public.betnova_reserve_sportsapi_request(integer) to service_role;
grant execute on function public.betnova_match_sportsapi_fixture(text, text, timestamptz) to service_role;

-- Sustainable free-tier polling: 72 baseline requests/day at 20-minute intervals,
-- leaving a limited reserve for event and final-result checks. The provider's beta
-- allowance may be higher temporarily, but the design targets the post-beta 100/day tier.
-- No provider requests are made until the API key exists in Vault.
select cron.unschedule(jobid)
from cron.job
where jobname = 'betnova-sportsapi-live-sync';

select cron.schedule(
  'betnova-sportsapi-live-sync',
  '*/20 * * * *',
  $job$
    select net.http_post(
      url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/sportsapi-live-sync',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-betnova-sync-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'betnova_sync_secret' limit 1)
      ),
      timeout_milliseconds := 120000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'sportsapi_live_api_key')
      and exists (select 1 from vault.decrypted_secrets where name = 'betnova_sync_secret');
  $job$
);
