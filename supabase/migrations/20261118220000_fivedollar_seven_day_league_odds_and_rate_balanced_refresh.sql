do $$ declare j record; begin
 for j in select jobid from cron.job where jobname like 'betnova-fivedollar-prematch-sync-batch-%' or jobname='betnova-fivedollar-live-odds-sync' loop perform cron.unschedule(j.jobid); end loop;
end $$;
select cron.schedule('betnova-fivedollar-prematch-sync-batch-0','0 */6 * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"prematch","batch":0}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),150000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-1','36 */6 * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"prematch","batch":1}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),150000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-2','12 1-23/6 * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"prematch","batch":2}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),150000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-3','48 1-23/6 * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"prematch","batch":3}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),150000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-4','24 2-23/6 * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"prematch","batch":4}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),150000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-5','0 3-23/6 * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"prematch","batch":5}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),150000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-6','36 3-23/6 * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"prematch","batch":6}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),150000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-7','12 4-23/6 * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"prematch","batch":7}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),150000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-8','48 4-23/6 * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"prematch","batch":8}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),150000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-9','24 5-23/6 * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"prematch","batch":9}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),150000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-live-odds-sync','*/10 * * * *',$cron$
 select net.http_post('https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync','{"mode":"live"}'::jsonb,'{}'::jsonb,
 jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),120000)
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key') and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
