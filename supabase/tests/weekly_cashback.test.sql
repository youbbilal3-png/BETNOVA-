create extension if not exists pgtap with schema extensions;

begin;
select plan(21);

select has_table('public','weekly_cashback_claims','weekly cashback history table exists');
select has_column('public','weekly_cashback_claims','cashback_amount','cashback amount is stored');
select ok((select relrowsecurity from pg_class where oid='public.weekly_cashback_claims'::regclass),'cashback history uses RLS');
select ok(has_table_privilege('authenticated','public.weekly_cashback_claims','SELECT'),'users can read their own cashback claims through RLS');
select ok(not has_table_privilege('authenticated','public.weekly_cashback_claims','INSERT'),'users cannot insert cashback claims');
select ok(not has_table_privilege('authenticated','public.weekly_cashback_claims','UPDATE'),'users cannot alter cashback claims');
select ok(not has_table_privilege('authenticated','public.weekly_cashback_claims','DELETE'),'users cannot delete cashback claims');
select ok(
  not has_function_privilege('authenticated','private.betnova_process_weekly_cashback(date)','EXECUTE')
  and not has_function_privilege('anon','private.betnova_process_weekly_cashback(date)','EXECUTE'),
  'cashback processor is unavailable to client roles'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='public.weekly_cashback_claims'::regclass
    and contype='u' and pg_get_constraintdef(oid) ilike '%user_id, currency, week_start%'),
  'only one cashback claim per user, currency, and week is possible'
);
select is(
  (select schedule from cron.job where jobname='betnova-weekly-cashback-5-percent'),
  '5 0 * * 1'::text,
  'cashback is scheduled every Monday at 00:05 UTC'
);
select ok(
  position('bet_stake' in pg_get_functiondef('private.betnova_process_weekly_cashback(date)'::regprocedure))>0
  and position('game_stake' in pg_get_functiondef('private.betnova_process_weekly_cashback(date)'::regprocedure))>0,
  'processor includes football and real-money game stakes'
);
select ok(
  position('amount < 0' in pg_get_functiondef('private.betnova_process_weekly_cashback(date)'::regprocedure))>0,
  'processor includes only negative stake ledger entries'
);
select ok(
  position('0.05' in pg_get_functiondef('private.betnova_process_weekly_cashback(date)'::regprocedure))>0
  and position('Africa/Algiers' in pg_get_functiondef('private.betnova_process_weekly_cashback(date)'::regprocedure))>0,
  'processor applies 5 percent and Algeria-local week boundaries'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('33333333-3333-4333-8333-333333333333','authenticated','authenticated','weekly-cashback-test@example.invalid','',now(),now(),now());

insert into public.wallet_accounts(user_id,currency,available_balance,reserved_balance)
values('33333333-3333-4333-8333-333333333333','DZD',1000,0);

insert into public.wallet_ledger(
  id,wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
  reference_type,reference_id,idempotency_key,description,created_at
)
select gen_random_uuid(),w.id,w.user_id,'DZD',v.entry_type,v.amount,1000,0,
  'cashback_test',null,gen_random_uuid(),'isolated weekly cashback test',
  timestamptz '2026-11-03 12:00:00+01'
from public.wallet_accounts w
cross join (values
  ('bet_stake'::text,-2000::numeric),
  ('game_stake'::text,-3000::numeric),
  ('deposit'::text,10000::numeric),
  ('bet_return'::text,5000::numeric),
  ('game_payout'::text,5000::numeric)
) as v(entry_type,amount)
where w.user_id='33333333-3333-4333-8333-333333333333' and w.currency='DZD';

select is(
  private.betnova_process_weekly_cashback('2026-11-02'::date),
  1,
  'processor creates one cashback claim for the eligible user'
);
select is(
  (select total_staked from public.weekly_cashback_claims where user_id='33333333-3333-4333-8333-333333333333' and week_start='2026-11-02'),
  5000::numeric,
  'deposits, returns, and payouts are excluded from the stake total'
);
select is(
  (select cashback_amount from public.weekly_cashback_claims where user_id='33333333-3333-4333-8333-333333333333' and week_start='2026-11-02'),
  250::numeric,
  'cashback is exactly five percent of the weekly stake total'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='33333333-3333-4333-8333-333333333333' and currency='DZD'),
  1250::numeric,
  'cashback is credited to the real-money wallet'
);
select is(
  (select count(*) from public.wallet_ledger where user_id='33333333-3333-4333-8333-333333333333' and reference_type='weekly_cashback' and amount=250),
  1::bigint,
  'cashback credit is recorded once in the real-money ledger'
);
select is(
  private.betnova_process_weekly_cashback('2026-11-02'::date),
  0,
  'rerunning the same week does not create a second claim'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='33333333-3333-4333-8333-333333333333' and currency='DZD'),
  1250::numeric,
  'reprocessing does not duplicate wallet credit'
);
select is(
  (select count(*) from public.weekly_cashback_claims where user_id='33333333-3333-4333-8333-333333333333' and week_start='2026-11-02'),
  1::bigint,
  'the weekly claim remains unique after reprocessing'
);

select * from finish();
rollback;
