create or replace function public.betnova_admin_provider_health()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_usage integer := 0;
  v_links integer := 0;
  v_holds integer := 0;
  v_live_markets integer := 0;
  v_fresh_markets integer := 0;
  v_prematch_markets integer := 0;
  v_fresh_prematch integer := 0;
  v_last_market_update timestamptz;
  v_five_requests integer := 0;
  v_five_fixtures integer := 0;
  v_five_live_fixtures integer := 0;
  v_five_live_markets integer := 0;
  v_five_prematch_markets integer := 0;
  v_five_last_request timestamptz;
begin
  if not public.betnova_is_admin() then
    raise exception 'Administrator access required';
  end if;

  select coalesce(request_count,0) into v_usage
  from public.sportsapi_api_usage where usage_date = v_today;

  select count(*), count(*) filter (where settlement_hold)
  into v_links, v_holds
  from public.sportsapi_fixture_links;

  select count(*) filter (where is_live and status in ('open','suspended')),
         count(*) filter (where is_live and status='open' and last_updated_at >= now() - interval '3 minutes'),
         count(*) filter (where not is_live and status in ('open','suspended')),
         count(*) filter (where not is_live and status='open' and last_updated_at >= now() - interval '24 hours'),
         max(last_updated_at)
  into v_live_markets, v_fresh_markets, v_prematch_markets, v_fresh_prematch, v_last_market_update
  from public.markets;

  select count(*), max(requested_at)
  into v_five_requests, v_five_last_request
  from public.fivedollar_api_request_log
  where requested_at >= now() - interval '1 hour';

  select count(*),
         count(*) filter (where status='live')
  into v_five_fixtures, v_five_live_fixtures
  from public.fixtures
  where source_provider='fivedollarfootballapi';

  select count(*) filter (where is_live and status in ('open','suspended')),
         count(*) filter (where not is_live and status in ('open','suspended'))
  into v_five_live_markets, v_five_prematch_markets
  from public.markets
  where source_provider='fivedollarfootballapi';

  return jsonb_build_object(
    'sportsapi_requests_today', coalesce(v_usage,0),
    'sportsapi_daily_limit', 95,
    'sportsapi_mapped_fixtures', v_links,
    'sportsapi_correction_holds', v_holds,
    'live_markets_total', v_live_markets,
    'live_markets_fresh', v_fresh_markets,
    'prematch_markets_total', v_prematch_markets,
    'prematch_markets_fresh', v_fresh_prematch,
    'last_market_update', v_last_market_update,
    'fivedollar_requests_last_hour', coalesce(v_five_requests,0),
    'fivedollar_request_hour_limit', 50,
    'fivedollar_fixtures_total', v_five_fixtures,
    'fivedollar_live_fixtures', v_five_live_fixtures,
    'fivedollar_live_markets', v_five_live_markets,
    'fivedollar_prematch_markets', v_five_prematch_markets,
    'fivedollar_last_request', v_five_last_request
  );
end;
$function$;

revoke all on function public.betnova_admin_provider_health() from public, anon;
grant execute on function public.betnova_admin_provider_health() to authenticated;