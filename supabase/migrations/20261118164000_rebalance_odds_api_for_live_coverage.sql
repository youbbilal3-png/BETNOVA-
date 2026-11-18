update public.market_templates set supports_live=true
where market_key in ('match_result','double_chance','asian_handicap','corner_asian');

do $$
declare r record;
begin
 for r in select jobid from cron.job
   where jobname in ('betnova-the-odds-api-sync-batch-0','betnova-the-odds-api-sync-batch-1','betnova-the-odds-api-live-sync')
 loop
   perform cron.unschedule(r.jobid);
 end loop;
end $$;

select cron.schedule(
 'betnova-the-odds-api-sync-batch-0',
 '10 2 1,11,21 * *',
 $job$
 select net.http_post(
  url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  body := '{"mode":"prematch","batch":0}'::jsonb,
  headers := jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  timeout_milliseconds := 120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
 $job$
);
select cron.schedule(
 'betnova-the-odds-api-sync-batch-1',
 '20 2 1,11,21 * *',
 $job$
 select net.http_post(
  url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  body := '{"mode":"prematch","batch":1}'::jsonb,
  headers := jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  timeout_milliseconds := 120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
 $job$
);
select cron.schedule(
 'betnova-the-odds-api-live-sync',
 '0 */2 * * *',
 $job$
 select net.http_post(
  url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  body := '{"mode":"live"}'::jsonb,
  headers := jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  timeout_milliseconds := 120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
 $job$
);