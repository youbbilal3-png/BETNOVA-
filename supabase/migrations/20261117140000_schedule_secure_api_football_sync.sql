create or replace function public.betnova_get_provider_sync_config()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '')
  );
  v_config jsonb;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required';
  end if;
  select jsonb_build_object(
    'api_key', max(decrypted_secret) filter (where name='api_football_key'),
    'sync_secret', max(decrypted_secret) filter (where name='betnova_sync_secret')
  ) into v_config
  from vault.decrypted_secrets
  where name in ('api_football_key','betnova_sync_secret');
  return coalesce(v_config,'{}'::jsonb);
end;
$function$;
revoke all on function public.betnova_get_provider_sync_config() from public, anon, authenticated;
grant execute on function public.betnova_get_provider_sync_config() to service_role;

select cron.unschedule(jobid) from cron.job where jobname='betnova-api-football-sync';
select cron.schedule(
  'betnova-api-football-sync',
  '15 */3 * * *',
  $cron$
    select net.http_post(
      url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/api-football-sync',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-betnova-sync-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)
      ),
      timeout_milliseconds := 120000
    )
    where exists(select 1 from vault.decrypted_secrets where name='api_football_key')
      and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
  $cron$
);