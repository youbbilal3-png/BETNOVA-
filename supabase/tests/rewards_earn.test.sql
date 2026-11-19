create extension if not exists pgtap with schema extensions;

begin;

select plan(20);

select has_table('public','earn_post_submissions','social earn submissions table exists');
select has_column('public','earn_post_submissions','proof_sha256','screenshot SHA-256 is recorded');
select ok(to_regclass('public.earn_post_submissions_proof_hash_unique') is not null,'screenshot hashes cannot be reused');
select has_table('public','referral_codes','referral code table exists');
select has_table('public','referrals','referral attribution table exists');
select has_table('public','deposit_streak_claims','deposit streak claims table exists');

select ok(
  (select relrowsecurity from pg_class where oid='public.earn_post_submissions'::regclass),
  'earn submissions use row level security'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.referrals'::regclass),
  'referrals use row level security'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.deposit_streak_claims'::regclass),
  'deposit streak claims use row level security'
);

select ok(
  has_table_privilege('authenticated','public.earn_post_submissions','INSERT')
  and not has_table_privilege('authenticated','public.earn_post_submissions','UPDATE')
  and not has_table_privilege('authenticated','public.earn_post_submissions','DELETE'),
  'users may submit earn proofs but cannot alter or erase submissions'
);
select ok(
  not has_table_privilege('authenticated','public.referrals','INSERT')
  and not has_table_privilege('authenticated','public.deposit_streak_claims','INSERT'),
  'referrals and deposit streak claims cannot be written directly by users'
);
select ok(
  has_function_privilege('authenticated','public.betnova_get_referral_code()','EXECUTE')
  and not has_function_privilege('anon','public.betnova_get_referral_code()','EXECUTE'),
  'referral code RPC is authenticated-only'
);
select ok(
  has_function_privilege('authenticated','public.betnova_review_earn_submission(uuid,text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.betnova_review_referral(uuid,text,text)','EXECUTE'),
  'review RPCs are callable by authenticated admins and enforce admin checks internally'
);
select ok(
  exists(select 1 from pg_trigger where tgname='betnova_process_deposit_streak' and not tgisinternal),
  'approved deposit trigger is installed'
);

-- Exercise the five-deposit trigger with isolated users and roll back all test credits.
do $
declare
  v_user uuid := '11111111-1111-4111-8111-111111111111';
  v_id uuid;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values(v_user,'authenticated','authenticated','cashback-four-test@example.invalid','',now(),now(),now());

  insert into public.deposit_requests(id,user_id,payment_method,amount,currency,status,created_at)
  select gen_random_uuid(),v_user,'baridimob',1000,'DZD','pending',now()+make_interval(secs=>g.n)
  from generate_series(1,4) as g(n);

  for v_id in select id from public.deposit_requests where user_id=v_user order by created_at,id loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;
end;
$;

select ok(
  not exists(select 1 from public.deposit_streak_claims where user_id='11111111-1111-4111-8111-111111111111'),
  'four approved deposits do not earn a streak reward'
);

do $
declare
  v_user uuid := '22222222-2222-4222-8222-222222222222';
  v_id uuid;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values(v_user,'authenticated','authenticated','cashback-five-test@example.invalid','',now(),now(),now());

  insert into public.deposit_requests(id,user_id,payment_method,amount,currency,status,created_at)
  select gen_random_uuid(),v_user,'baridimob',1000,'DZD','pending',now()+make_interval(secs=>g.n)
  from generate_series(1,5) as g(n);

  for v_id in select id from public.deposit_requests where user_id=v_user order by created_at,id loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;
end;
$;

select is(
  (select total_deposited from public.deposit_streak_claims where user_id='22222222-2222-4222-8222-222222222222'),
  5000::numeric,
  'five approved DZD deposits are aggregated'
);
select is(
  (select reward_amount from public.deposit_streak_claims where user_id='22222222-2222-4222-8222-222222222222'),
  250::numeric,
  'deposit streak reward is exactly 5 percent'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='22222222-2222-4222-8222-222222222222' and currency='DZD'),
  250::numeric,
  'deposit streak reward reaches the real-money wallet'
);
select is(
  (select count(*) from public.wallet_ledger where user_id='22222222-2222-4222-8222-222222222222' and reference_type='deposit_streak'),
  1::bigint,
  'deposit streak creates one cash ledger entry'
);

update public.deposit_requests
set status='approved'
where user_id='22222222-2222-4222-8222-222222222222' and status='approved';

select is(
  (select available_balance from public.wallet_accounts where user_id='22222222-2222-4222-8222-222222222222' and currency='DZD'),
  250::numeric,
  'repeated approved-state updates do not duplicate cash credit'
);

select * from finish();
rollback;
