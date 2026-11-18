do $$ declare j record; begin
 for j in select jobid from cron.job where jobname like 'betnova-the-odds-api-events-batch-%' loop perform cron.unschedule(j.jobid); end loop;
end $$;
select cron.schedule('betnova-the-odds-api-events-batch-0','0 */6 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  '{"mode":"events","batch":0}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  150000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-the-odds-api-events-batch-1','5 */6 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  '{"mode":"events","batch":1}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  150000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-the-odds-api-events-batch-2','10 */6 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  '{"mode":"events","batch":2}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  150000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-the-odds-api-events-batch-3','15 */6 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  '{"mode":"events","batch":3}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  150000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-the-odds-api-events-batch-4','20 */6 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  '{"mode":"events","batch":4}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  150000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-the-odds-api-events-batch-5','25 */6 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  '{"mode":"events","batch":5}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  150000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-the-odds-api-events-batch-6','30 */6 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  '{"mode":"events","batch":6}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  150000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-the-odds-api-events-batch-7','35 */6 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  '{"mode":"events","batch":7}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  150000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-the-odds-api-events-batch-8','40 */6 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  '{"mode":"events","batch":8}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  150000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
select cron.schedule('betnova-the-odds-api-events-batch-9','45 */6 * * *',$cron$
 select net.http_post(
  'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
  '{"mode":"events","batch":9}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','x-betnova-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)),
  150000
 )
 where exists(select 1 from vault.decrypted_secrets where name='the_odds_api_key')
   and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
$cron$);
