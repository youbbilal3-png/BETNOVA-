do $$ declare j record; begin
 for j in select jobid from cron.job where jobname like 'betnova-fivedollar-prematch-sync%' loop perform cron.unschedule(j.jobid); end loop;
end $$;
select cron.schedule('betnova-fivedollar-prematch-sync-batch-0','0 */3 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
  '{"mode":"prematch","batch":0}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-1','15 */3 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
  '{"mode":"prematch","batch":1}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-2','30 */3 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
  '{"mode":"prematch","batch":2}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-3','45 */3 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
  '{"mode":"prematch","batch":3}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-4','0 1-23/3 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
  '{"mode":"prematch","batch":4}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-5','15 1-23/3 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
  '{"mode":"prematch","batch":5}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-6','30 1-23/3 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
  '{"mode":"prematch","batch":6}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-7','45 1-23/3 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
  '{"mode":"prematch","batch":7}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-8','0 2-23/3 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
  '{"mode":"prematch","batch":8}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-fivedollar-prematch-sync-batch-9','15 2-23/3 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
  '{"mode":"prematch","batch":9}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  120000
 )
 where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
