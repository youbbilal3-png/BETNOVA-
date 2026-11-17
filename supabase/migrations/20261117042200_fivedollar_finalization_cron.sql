-- Finalize matches that have left the live endpoint and reconcile late VAR updates.
do $$
begin
  if exists(select 1 from cron.job where jobname='betnova-fivedollar-finalize-sync') then
    perform cron.unschedule('betnova-fivedollar-finalize-sync');
  end if;
end
$$;

select cron.schedule(
  'betnova-fivedollar-finalize-sync',
  '*/20 * * * *',
  $job$
    select net.http_post(
      url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
      body := '{"mode":"finalize"}'::jsonb,
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