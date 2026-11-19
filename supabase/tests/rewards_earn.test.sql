create extension if not exists pgtap with schema extensions;

begin;
select plan(28);

select has_table('public','earn_post_submissions','social earn submissions table exists');
select has_column('public','earn_post_submissions','proof_sha256','screenshot SHA-256 is stored');
select ok(to_regclass('public.earn_post_submissions_proof_hash_unique') is not null,'screenshot hashes cannot be reused');
select has_table('public','referral_codes','referral code table exists');
select has_table('public','referrals','referral attribution table exists');
select has_table('public','deposit_streak_claims','deposit streak claims table exists');

select ok((select relrowsecurity from pg_class where oid='public.earn_post_submissions'::regclass),'earn submissions use RLS');
select ok((select relrowsecurity from pg_class where oid='public.referrals'::regclass),'referrals use RLS');
select ok((select relrowsecurity from pg_class where oid='public.deposit_streak_claims'::regclass),'deposit streak claims use RLS');
select ok(
  not has_table_privilege('authenticated','public.earn_post_submissions','INSERT')
  and not has_table_privilege('authenticated','public.earn_post_submissions','UPDATE')
  and not has_table_privilege('authenticated','public.earn_post_submissions','DELETE'),
  'users cannot directly write reward submissions'
);
select ok(
  not has_table_privilege('authenticated','public.referrals','INSERT')
  and not has_table_privilege('authenticated','public.deposit_streak_claims','INSERT'),
  'users cannot directly create referrals or deposit streak claims'
);
select ok(
  has_function_privilege('authenticated','public.betnova_get_referral_code()','EXECUTE')
  and not has_function_privilege('anon','public.betnova_get_referral_code()','EXECUTE'),
  'referral code RPC is authenticated-only'
);
select ok(
  has_function_privilege('authenticated','public.betnova_review_earn_submission(uuid,text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.betnova_review_referral(uuid,text,text)','EXECUTE'),
  'review RPCs are exposed only through admin-checked functions'
);
select ok(
  not has_function_privilege('authenticated','private.betnova_credit_cash_reward(uuid,numeric,text,text,uuid,text)','EXECUTE'),
  'internal cash-credit function is not executable by users'
);
select ok(
  exists(select 1 from pg_trigger where tgname='betnova_process_deposit_streak' and not tgisinternal),
  'deposit streak trigger is installed'
);
select ok(
  exists(select 1 from storage.buckets where id='earn-proofs' and public=false),
  'proof bucket is private'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('44444444-4444-4444-8444-444444444444','authenticated','authenticated','streak-four@example.invalid','',now(),now(),now());

insert into public.deposit_requests(id,user_id,payment_method,amount,currency,status,created_at)
select gen_random_uuid(),'44444444-4444-4444-8444-444444444444','baridimob',1000,'DZD','pending',now()+make_interval(secs=>g.n)
from generate_series(1,4) as g(n);

do $$
declare v_id uuid;
begin
  for v_id in select id from public.deposit_requests where user_id='44444444-4444-4444-8444-444444444444' order by created_at,id loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;
end;
$$;

select ok(
  not exists(select 1 from public.deposit_streak_claims where user_id='44444444-4444-4444-8444-444444444444'),
  'four approved deposits do not earn a reward'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('55555555-5555-4555-8555-555555555555','authenticated','authenticated','streak-ten@example.invalid','',now(),now(),now());

insert into public.deposit_requests(id,user_id,payment_method,amount,currency,status,created_at)
select gen_random_uuid(),'55555555-5555-4555-8555-555555555555','baridimob',1000,'DZD','pending',now()+make_interval(secs=>g.n)
from generate_series(1,10) as g(n);

do $$
declare v_id uuid;
begin
  for v_id in select id from public.deposit_requests where user_id='55555555-5555-4555-8555-555555555555' order by created_at,id loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;
end;
$$;

select is(
  (select count(*) from public.deposit_streak_claims where user_id='55555555-5555-4555-8555-555555555555'),
  2::bigint,
  'ten consecutive approved deposits create exactly two non-overlapping rewards'
);
select is(
  (select sum(reward_amount) from public.deposit_streak_claims where user_id='55555555-5555-4555-8555-555555555555'),
  500::numeric,
  'each five-deposit block earns exactly five percent'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='55555555-5555-4555-8555-555555555555' and currency='DZD'),
  500::numeric,
  'deposit streak rewards are credited to the real-money wallet'
);
select is(
  (select count(*) from public.wallet_ledger where user_id='55555555-5555-4555-8555-555555555555' and reference_type='deposit_streak'),
  2::bigint,
  'each completed five-deposit block has one cash ledger entry'
);

-- Referral attribution and approval use verified accounts and admin review.
do $$
declare
  v_referrer uuid:='66666666-6666-4666-8666-666666666666';
  v_referred uuid:='77777777-7777-4777-8777-777777777777';
  v_code text;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values(v_referrer,'authenticated','authenticated','referrer@example.invalid','',now(),now(),now());
  perform set_config('request.jwt.claim.sub',v_referrer::text,true);
  v_code:=public.betnova_get_referral_code();
  if v_code !~ '^[A-F0-9]{10}$' then raise exception 'Invalid generated referral code'; end if;
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values(v_referred,'authenticated','authenticated','referred@example.invalid','',now(),
    jsonb_build_object('referral_code',v_code),now(),now());
end;
$$;

select is(
  (select status from public.referrals where referred_user_id='77777777-7777-4777-8777-777777777777'),
  'pending'::text,
  'signup with a referral link creates a pending attribution'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('88888888-8888-4888-8888-888888888888','authenticated','authenticated','betnova-admin-test@example.invalid','',now(),now(),now());
update public.profiles set role='admin' where id='88888888-8888-4888-8888-888888888888';
select set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
select set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}',true);

select lives_ok(
  $$select public.betnova_review_referral('77777777-7777-4777-8777-777777777777','approve','verified test referral')$$,
  'admin can approve a verified referral'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='66666666-6666-4666-8666-666666666666' and currency='DZD'),
  100::numeric,
  'approved referral reward credits 100 DZD to the referrer cash wallet'
);

insert into public.earn_post_submissions(
  user_id,platform,post_url,proof_path,proof_sha256
) values(
  '66666666-6666-4666-8666-666666666666','instagram',
  'https://www.instagram.com/p/betnova-test-proof/',
  '66666666-6666-4666-8666-666666666666/proof.png',
  repeat('a',64)
);

select lives_ok(
  $$select public.betnova_review_earn_submission((select id from public.earn_post_submissions where proof_sha256=repeat('a',64)),'approve','verified test post')$$,
  'admin can approve a reviewed social post'
);
select is(
  (select status from public.earn_post_submissions where proof_sha256=repeat('a',64)),
  'approved'::text,
  'approved post status is recorded'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='66666666-6666-4666-8666-666666666666' and currency='DZD'),
  150::numeric,
  'approved social post reward adds 50 DZD to the cash wallet'
);
select is(
  (select count(*) from public.wallet_ledger where user_id='66666666-6666-4666-8666-666666666666' and reference_type='earn_post' and amount=50),
  1::bigint,
  'approved social post has one auditable cash ledger entry'
);

select * from finish();
rollback;
