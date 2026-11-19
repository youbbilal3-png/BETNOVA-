create extension if not exists pg_cron;

do $schedule$
begin
  if exists(select 1 from cron.job where jobname='betnova-fivedollar-live-sync') then
    perform cron.unschedule('betnova-fivedollar-live-sync');
  end if;
  if exists(select 1 from cron.job where jobname='betnova-fivedollar-prematch-sync') then
    perform cron.unschedule('betnova-fivedollar-prematch-sync');
  end if;
end
$schedule$;

select cron.schedule(
  'betnova-fivedollar-live-sync',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
      body := '{"mode":"live"}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)
      ),
      timeout_milliseconds := 120000
    )
    where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
      and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
  $job$
);

select cron.schedule(
  'betnova-fivedollar-prematch-sync',
  '0 4 * * *',
  $job$
    select net.http_post(
      url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
      body := '{"mode":"prematch"}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)
      ),
      timeout_milliseconds := 120000
    )
    where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
      and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
  $job$
);