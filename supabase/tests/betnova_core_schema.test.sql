begin;

select plan(17);

select has_table('public', 'profiles', 'profiles table is present');
select has_table('public', 'wallet_accounts', 'cash wallet accounts table is present');
select has_table('public', 'wallet_ledger', 'wallet ledger table is present');
select has_table('public', 'bets', 'bets table is present');
select has_table('public', 'bet_legs', 'bet legs table is present');
select has_table('public', 'fixtures', 'fixtures table is present');
select has_table('public', 'markets', 'markets table is present');
select has_table('public', 'market_selections', 'market selections table is present');
select has_table('public', 'notification_preferences', 'notification preferences table is present');
select has_table('public', 'device_push_tokens', 'device push tokens table is present');

select ok(to_regprocedure('public.betnova_place_bet(jsonb,numeric,text,uuid)') is not null,
  'idempotent bet placement function is present');
select ok(to_regprocedure('public.betnova_settle_market(uuid,uuid[],boolean)') is not null,
  'market settlement function is present');
select ok(to_regprocedure('public.betnova_process_live_event(uuid)') is not null,
  'live event processing function is present');

select ok((select relrowsecurity from pg_class where oid='public.wallet_accounts'::regclass),
  'wallet accounts enforce row level security');
select ok((select relrowsecurity from pg_class where oid='public.wallet_ledger'::regclass),
  'wallet ledger enforces row level security');

select ok((select relrowsecurity from pg_class where oid='public.notification_preferences'::regclass),
  'notification preferences enforce row level security');
select ok((select relrowsecurity from pg_class where oid='public.bet_legs'::regclass),
  'bet legs enforce row level security');

select * from finish();
rollback;
