begin;

select plan(34);

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

select has_table('public','game_rounds','real-money arcade rounds table is present');
select has_table('private','crash_round_secrets','crash outcomes are stored in a private table');
select has_table('private','apple_round_secrets','apple trap columns are stored in a private table');
select ok((select relrowsecurity from pg_class where oid='public.game_rounds'::regclass),
  'arcade rounds enforce row level security');
select ok(has_table_privilege('authenticated','public.game_rounds','SELECT'),
  'authenticated users can read only their own arcade rounds through RLS');
select ok(not has_table_privilege('authenticated','private.crash_round_secrets','SELECT'),
  'users cannot read hidden crash outcomes');
select ok(not has_table_privilege('authenticated','private.apple_round_secrets','SELECT'),
  'users cannot read hidden apple trap columns');

select ok(to_regprocedure('public.betnova_start_crash_round(numeric,uuid)') is not null,
  'Crash start RPC is present');
select ok(to_regprocedure('public.betnova_cashout_crash_round(uuid,uuid)') is not null,
  'Crash cash-out RPC is present');
select ok(to_regprocedure('public.betnova_resume_crash_round()') is not null,
  'Crash resume RPC is present');
select ok(to_regprocedure('public.betnova_start_apple_round(numeric,uuid)') is not null,
  'Apple start RPC is present');
select ok(to_regprocedure('public.betnova_pick_apple(uuid,integer,uuid)') is not null,
  'Apple pick RPC is present');
select ok(to_regprocedure('public.betnova_cashout_apple_round(uuid,uuid)') is not null,
  'Apple cash-out RPC is present');
select ok(to_regprocedure('public.betnova_play_arcade_round(text,numeric,text,uuid)') is not null,
  'other arcade game RPC is present');

select ok(
  (select prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path=%'
   from pg_proc where oid='public.betnova_start_crash_round(numeric,uuid)'::regprocedure),
  'Crash start RPC runs as a protected security definer'
);
select ok(
  (select prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path=%'
   from pg_proc where oid='public.betnova_pick_apple(uuid,integer,uuid)'::regprocedure),
  'Apple pick RPC runs as a protected security definer'
);
select ok(
  (select prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path=%'
   from pg_proc where oid='public.betnova_cashout_apple_round(uuid,uuid)'::regprocedure),
  'Apple cash-out RPC runs as a protected security definer'
);

select * from finish();
rollback;
