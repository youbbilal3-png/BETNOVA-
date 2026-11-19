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


-- Exercise real-money cashback calculation against isolated ledger rows.
do $
declare
  v_user uuid := '99999999-9999-4999-8999-999999999999';
  v_wallet uuid;
  v_week_start date;
  v_week_open timestamptz;
begin
  v_week_start := date_trunc('week', now() at time zone 'Africa/Algiers')::date - 7;
  v_week_open := v_week_start::timestamp at time zone 'Africa/Algiers';

  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values(v_user,'authenticated','authenticated','weekly-cashback-test@example.invalid','',now(),now(),now());

  insert into public.wallet_accounts(user_id,currency) values(v_user,'DZD')
  returning id into v_wallet;

  insert into public.wallet_ledger(
    wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
    reference_type,reference_id,idempotency_key,description,created_at
  ) values
  (v_wallet,v_user,'DZD','bet_stake',-1000,0,0,'test_bet',gen_random_uuid(),gen_random_uuid(),'test stake',v_week_open+interval '1 day'),
  (v_wallet,v_user,'DZD','game_stake',-500,0,0,'test_game',gen_random_uuid(),gen_random_uuid(),'test game stake',v_week_open+interval '2 days'),
  (v_wallet,v_user,'DZD','game_payout',20000,0,0,'test_payout',gen_random_uuid(),gen_random_uuid(),'must not count',v_week_open+interval '2 days'),
  (v_wallet,v_user,'DZD','deposit',5000,0,0,'test_deposit',gen_random_uuid(),gen_random_uuid(),'must not count',v_week_open+interval '2 days'),
  (v_wallet,v_user,'DZD','bet_stake',-900,0,0,'test_current_week',gen_random_uuid(),gen_random_uuid(),'outside completed week',now());
end;
$;

select is(
  private.betnova_process_weekly_cashback(date_trunc('week', now() at time zone 'Africa/Algiers')::date - 7),
  1,
  'one eligible user and currency receive one weekly cashback claim'
);
select is(
  (select total_staked from public.weekly_cashback_claims where user_id='99999999-9999-4999-8999-999999999999' and currency='DZD'),
  1500::numeric,
  'cashback counts negative bet and game stakes only, excluding deposits and payouts'
);
select is(
  (select cashback_amount from public.weekly_cashback_claims where user_id='99999999-9999-4999-8999-999999999999' and currency='DZD'),
  75::numeric,
  'weekly cashback is exactly five percent of total stakes'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='99999999-9999-4999-8999-999999999999' and currency='DZD'),
  75::numeric,
  'weekly cashback is credited to the real-money wallet'
);
select is(
  (select count(*) from public.wallet_ledger where user_id='99999999-9999-4999-8999-999999999999' and reference_type='weekly_cashback'),
  1::bigint,
  'weekly cashback writes one auditable cash ledger entry'
);
select is(
  private.betnova_process_weekly_cashback(date_trunc('week', now() at time zone 'Africa/Algiers')::date - 7),
  0,
  're-running the same week does not issue a duplicate cashback'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='99999999-9999-4999-8999-999999999999' and currency='DZD'),
  75::numeric,
  'repeated cashback processing does not change the credited balance'
);

select * from finish();
rollback;
