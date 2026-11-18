do $$
declare v_job integer;
begin
 select jobid into v_job from cron.job where jobname='betnova-api-football-live-odds-sync';
 if v_job is not null then perform cron.unschedule(v_job); end if;
end
$$;
select cron.schedule(
 'betnova-api-football-live-odds-sync',
 '*/15 * * * *',
 $job$
 select net.http_post(
   url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/api-football-live-odds-sync',
   body := '{}'::jsonb,
   headers := jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
   timeout_milliseconds := 30000
 )
 where exists(select 1 from vault.decrypted_secrets where name='api_football_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
 $job$
);