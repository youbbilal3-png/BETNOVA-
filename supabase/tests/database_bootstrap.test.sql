create extension if not exists pgtap with schema extensions;

begin;
select plan(21);

select has_table('public','profiles','profiles table exists');
select has_table('public','wallet_accounts','real-money wallet table exists');
select has_table('public','wallet_ledger','real-money ledger table exists');
select has_table('public','bonus_wallet_accounts','separate bonus wallet table exists');
select has_table('public','bonus_ledger','separate bonus ledger table exists');
select has_table('public','bonus_withdrawal_requests','bonus withdrawal requests table exists');

select ok((select relrowsecurity from pg_class where oid='public.wallet_accounts'::regclass),'real-money wallet RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.wallet_ledger'::regclass),'real-money ledger RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.bonus_wallet_accounts'::regclass),'bonus wallet RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.bonus_ledger'::regclass),'bonus ledger RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.bonus_withdrawal_requests'::regclass),'bonus withdrawal RLS is enabled');

select ok(has_table_privilege('authenticated','public.wallet_accounts','SELECT'),'authenticated users can read wallet rows subject to RLS');
select ok(not has_table_privilege('authenticated','public.wallet_accounts','UPDATE'),'authenticated users cannot update real-money balances directly');
select ok(not has_table_privilege('authenticated','public.wallet_ledger','INSERT'),'authenticated users cannot insert real-money ledger entries directly');
select ok(not has_table_privilege('authenticated','public.bonus_wallet_accounts','INSERT'),'authenticated users cannot create bonus wallets directly');
select ok(not has_table_privilege('authenticated','public.bonus_ledger','INSERT'),'authenticated users cannot insert bonus ledger entries directly');

select ok(to_regprocedure('public.betnova_place_bet(jsonb,numeric,text,uuid)') is not null,'bet placement RPC exists');
select ok(to_regprocedure('public.betnova_settle_market(uuid,uuid[],boolean)') is not null,'market settlement RPC exists');
select ok(to_regprocedure('public.betnova_request_bonus_withdrawal(text,numeric,text,text)') is not null,'bonus withdrawal request RPC exists');
select ok(to_regprocedure('public.betnova_review_bonus_withdrawal(uuid,text,text,text)') is not null,'bonus withdrawal review RPC exists');
select ok(to_regclass('cron.job') is not null,'pg_cron is enabled before scheduled provider jobs');

select * from finish();
rollback;
