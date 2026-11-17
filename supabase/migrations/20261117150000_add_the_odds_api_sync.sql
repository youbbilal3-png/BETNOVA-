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
  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    v_claims->>'role'
  );
  if v_role is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  select jsonb_build_object(
    'api_key', max(decrypted_secret) filter (where name = 'the_odds_api_key'),
    'sync_secret', max(decrypted_secret) filter (where name = 'betnova_sync_secret')
  )
  into v_config
  from vault.decrypted_secrets
  where name in ('the_odds_api_key', 'betnova_sync_secret');

  return coalesce(v_config, '{}'::jsonb);
end;
$function$;

revoke all on function public.betnova_get_odds_sync_config() from public, anon, authenticated;
grant execute on function public.betnova_get_odds_sync_config() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'betnova-the-odds-api-sync';

select cron.schedule(
  'betnova-the-odds-api-sync',
  '10 2 * * *',
  $cron$
    select net.http_post(
      url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-betnova-sync-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'betnova_sync_secret' limit 1)
      ),
      timeout_milliseconds := 120000
    )
    where exists (
      select 1 from vault.decrypted_secrets where name = 'the_odds_api_key'
    )
    and exists (
      select 1 from vault.decrypted_secrets where name = 'betnova_sync_secret'
    );
  $cron$
);
