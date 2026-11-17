create table if not exists public.fivedollar_api_request_log (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default now()
);
create index if not exists fivedollar_api_request_log_requested_at_idx
  on public.fivedollar_api_request_log (requested_at desc);
alter table public.fivedollar_api_request_log enable row level security;
revoke all on public.fivedollar_api_request_log from public, anon, authenticated;
grant all on public.fivedollar_api_request_log to service_role;

create or replace function public.betnova_get_fivedollar_config()
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
  if v_role is distinct from 'service_role' then raise exception 'Service role required'; end if;

  select jsonb_build_object(
    'api_key', max(decrypted_secret) filter (where name = 'fivedollarfootball_api_key'),
    'sync_secret', max(decrypted_secret) filter (where name = 'betnova_sync_secret')
  )
  into v_config
  from vault.decrypted_secrets
  where name in ('fivedollarfootball_api_key', 'betnova_sync_secret');
  return coalesce(v_config, '{}'::jsonb);
end;
$function$;

create or replace function public.betnova_reserve_fivedollar_request()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb;
  v_role text;
  v_hour_count integer;
  v_minute_count integer;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), v_claims->>'role');
  if v_role is distinct from 'service_role' then raise exception 'Service role required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('betnova:fivedollar:request-budget', 0));
  delete from public.fivedollar_api_request_log where requested_at < now() - interval '1 hour';

  select count(*) filter (where requested_at >= now() - interval '1 hour'),
         count(*) filter (where requested_at >= now() - interval '1 minute')
    into v_hour_count, v_minute_count
  from public.fivedollar_api_request_log;

  -- Stay below the provider's published 60/hour and 20/minute account limits.
  if v_hour_count >= 50 or v_minute_count >= 15 then return false; end if;
  insert into public.fivedollar_api_request_log(requested_at) values(now());
  return true;
end;
$function$;

revoke all on function public.betnova_get_fivedollar_config() from public, anon, authenticated;
revoke all on function public.betnova_reserve_fivedollar_request() from public, anon, authenticated;
grant execute on function public.betnova_get_fivedollar_config() to service_role;
grant execute on function public.betnova_reserve_fivedollar_request() to service_role;
