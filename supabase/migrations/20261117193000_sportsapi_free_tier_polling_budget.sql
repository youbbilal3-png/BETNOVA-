-- Adjust live polling to the provider's post-beta free allowance of 100 requests/day.
-- 72 baseline live-score reads/day (one every 20 minutes), reserve up to 23 for events/final checks.
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
