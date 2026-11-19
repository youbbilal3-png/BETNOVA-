create extension if not exists pgtap with schema extensions;
begin;
select plan(14);

select has_table('public','weekly_cashback_claims','weekly cashback history table exists');
select has_column('public','weekly_cashback_claims','total_staked','cashback stores the exact weekly stake total');
select ok((select relrowsecurity from pg_class where oid='public.weekly_cashback_claims'::regclass),'cashback history has RLS enabled');
select ok(to_regclass('public.weekly_cashback_claims_unique') is not null,'one cashback claim is allowed per user, currency, and week');
select ok(not has_table_privilege('authenticated','public.weekly_cashback_claims','INSERT'),'users cannot insert cashback claims directly');
select ok(not has_function_privilege('authenticated','private.betnova_process_weekly_cashback(date)','EXECUTE'),'authenticated users cannot execute the cashback processor');
select ok(not has_function_privilege('anon','private.betnova_process_weekly_cashback(date)','EXECUTE'),'anonymous users cannot execute the cashback processor');

do $$
declare
  v_user uuid := '33333333-3333-4333-8333-333333333333';
  v_wallet uuid;
  v_week_start date := date_trunc('week',now() at time zone 'Africa/Algiers')::date - 7;
  v_week_ts timestamptz;
begin
  v_week_ts := v_week_start::timestamp at time zone 'Africa/Algiers';
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
  values(v_user,'authenticated','authenticated','weekly-cashback-test@example.invalid','',now(),now(),now(),'{}'::jsonb);

  insert into public.wallet_accounts(user_id,currency,available_balance)
  values(v_user,'DZD',0) returning id into v_wallet;

  insert into public.wallet_ledger(
    wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
    reference_type,reference_id,idempotency_key,description,created_at
  ) values
    (v_wallet,v_user,'DZD','bet_stake',-10000,0,0,'bet',gen_random_uuid(),gen_random_uuid(),'test football stake',v_week_ts+interval '1 day'),
    (v_wallet,v_user,'DZD','game_stake',-10000,0,0,'game_round',gen_random_uuid(),gen_random_uuid(),'test arcade stake',v_week_ts+interval '2 days'),
    (v_wallet,v_user,'DZD','deposit',50000,0,0,'deposit',gen_random_uuid(),gen_random_uuid(),'must be excluded',v_week_ts+interval '3 days'),
    (v_wallet,v_user,'DZD','bet_return',5000,0,0,'bet',gen_random_uuid(),gen_random_uuid(),'must be excluded',v_week_ts+interval '4 days');
end;
$$;

select is(
  private.betnova_process_weekly_cashback(date_trunc('week',now() at time zone 'Africa/Algiers')::date - 7),
  1,
  'one user with football and arcade stakes receives one weekly claim'
);
select is(
  (select total_staked from public.weekly_cashback_claims where user_id='33333333-3333-4333-8333-333333333333' and currency='DZD'),
  20000::numeric,
  'deposits and returns are excluded from the wagered total'
);
select is(
  (select cashback_amount from public.weekly_cashback_claims where user_id='33333333-3333-4333-8333-333333333333' and currency='DZD'),
  1000::numeric,
  'cashback is exactly five percent of the 20,000 DZD stakes'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='33333333-3333-4333-8333-333333333333' and currency='DZD'),
  1000::numeric,
  'cashback credits the real-money wallet'
);
select is(
  (select count(*) from public.wallet_ledger where user_id='33333333-3333-4333-8333-333333333333' and reference_type='weekly_cashback'),
  1::bigint,
  'cashback credit has one auditable ledger entry'
);
select is(
  private.betnova_process_weekly_cashback(date_trunc('week',now() at time zone 'Africa/Algiers')::date - 7),
  0,
  'reprocessing the same week does not create another claim'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='33333333-3333-4333-8333-333333333333' and currency='DZD'),
  1000::numeric,
  'reprocessing does not duplicate the cash-wallet credit'
);

select * from finish();
rollback;
