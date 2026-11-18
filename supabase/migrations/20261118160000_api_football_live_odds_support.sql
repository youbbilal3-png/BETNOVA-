create table if not exists public.api_football_live_usage (
  usage_date date primary key,
  request_count integer not null default 0 check (request_count between 0 and 96),
  updated_at timestamptz not null default now()
);
alter table public.api_football_live_usage enable row level security;
revoke all on public.api_football_live_usage from anon, authenticated;

create or replace function public.betnova_reserve_api_football_live_request()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '')
  );
  v_reserved integer;
begin
  if v_role is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  insert into public.api_football_live_usage(usage_date, request_count, updated_at)
  values ((now() at time zone 'UTC')::date, 1, now())
  on conflict (usage_date) do update
    set request_count = public.api_football_live_usage.request_count + 1,
        updated_at = now()
    where public.api_football_live_usage.request_count < 96
  returning request_count into v_reserved;
  return v_reserved is not null;
end;
$function$;
revoke all on function public.betnova_reserve_api_football_live_request() from public, anon, authenticated;
grant execute on function public.betnova_reserve_api_football_live_request() to service_role;

update public.market_templates set supports_live=true
where market_key in ('match_result','double_chance','asian_handicap','corner_asian');
