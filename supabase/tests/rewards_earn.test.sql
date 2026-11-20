create extension if not exists pgtap with schema extensions;

begin;
select plan(40);

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
select ok(
  exists(select 1 from pg_trigger where tgname='on_auth_user_created' and not tgisinternal)
  and to_regprocedure('public.handle_new_user()') is not null,
  'existing auth signup trigger grants the currency-specific welcome bonus'
);
select ok(
  exists(select 1 from pg_trigger where tgname='betnova_process_referral_verification' and not tgisinternal),
  'referral rewards are automatically processed after email verification'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('99999999-9999-4999-8999-999999999999','authenticated','authenticated','welcome-bonus-test@example.invalid','',now(),now(),now());
select is(
  (select available_balance from public.bonus_wallet_accounts where user_id='99999999-9999-4999-8999-999999999999'),
  96.153846::numeric,
  'DZD signups receive 25,000 DZD in the separate USD-denominated bonus wallet'
);
select is(
  (select count(*) from public.bonus_ledger where user_id='99999999-9999-4999-8999-999999999999' and entry_type='welcome_bonus'),
  1::bigint,
  'welcome bonus is recorded once in the bonus ledger'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','welcome-usd-test@example.invalid','',now(),
  jsonb_build_object('preferred_currency','USD'),now(),now());
select is(
  (select available_balance from public.bonus_wallet_accounts where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  100::numeric,
  'USD signups receive a $100 welcome bonus'
);
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','welcome-eur-test@example.invalid','',now(),
  jsonb_build_object('preferred_currency','EUR'),now(),now());
select is(
  (select available_balance from public.bonus_wallet_accounts where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  100::numeric,
  'EUR signups receive a €90 equivalent welcome bonus'
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

-- Referral attribution is automatic after the referred user confirms email.
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
  values(v_referred,'authenticated','authenticated','referred@example.invalid','',null,
    jsonb_build_object('referral_code',v_code),now(),now());
end;
$$;

select is(
  (select status from public.referrals where referred_user_id='77777777-7777-4777-8777-777777777777'),
  'pending'::text,
  'signup with a referral link creates a pending attribution until email verification'
);
update auth.users
set email_confirmed_at=now()
where id='77777777-7777-4777-8777-777777777777';
select is(
  (select status from public.referrals where referred_user_id='77777777-7777-4777-8777-777777777777'),
  'approved'::text,
  'email verification automatically approves the referral'
);
select is(
  (select available_balance from public.wallet_accounts where user_id='66666666-6666-4666-8666-666666666666' and currency='DZD'),
  100::numeric,
  'verified referral automatically credits 100 DZD to the referrer cash wallet'
);
update auth.users
set email_confirmed_at=now()+interval '1 minute'
where id='77777777-7777-4777-8777-777777777777';
select is(
  (select available_balance from public.wallet_accounts where user_id='66666666-6666-4666-8666-666666666666' and currency='DZD'),
  100::numeric,
  're-verifying an account cannot duplicate its referral reward'
);


insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('10101010-1010-4010-8010-101010101010','authenticated','authenticated','currency-streak-test@example.invalid','',now(),now(),now());
insert into public.deposit_requests(id,user_id,payment_method,amount,currency,status,created_at)
select gen_random_uuid(),'10101010-1010-4010-8010-101010101010','baridimob',1000,
  case when g.n<=4 or g.n=10 then 'DZD' else 'EUR' end,
  'pending',now()+make_interval(secs=>g.n)
from generate_series(1,10) as g(n);
do $$
declare v_id uuid;
begin
  for v_id in select id from public.deposit_requests
    where user_id='10101010-1010-4010-8010-101010101010' order by created_at,id
  loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;
end;
$$;
select is(
  (select count(*) from public.deposit_streak_claims where user_id='10101010-1010-4010-8010-101010101010'),
  1::bigint,
  'currency changes reset the consecutive deposit streak'
);
select is(
  (select currency from public.deposit_streak_claims where user_id='10101010-1010-4010-8010-101010101010'),
  'EUR'::text,
  'only the complete five-deposit EUR streak receives a reward'
);
select is(
  (select reward_amount from public.deposit_streak_claims where user_id='10101010-1010-4010-8010-101010101010'),
  250::numeric,
  'currency-reset streak reward is exactly five percent of its own deposits'
);

-- A rejected deposit must break an otherwise same-currency streak.
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('12121212-1212-4121-8121-121212121212','authenticated','authenticated','streak-rejected-break@example.invalid','',now(),now(),now());
insert into public.deposit_requests(id,user_id,payment_method,amount,currency,status,created_at)
select gen_random_uuid(),'12121212-1212-4121-8121-121212121212','baridimob',1000,'DZD','pending',now()+make_interval(secs=>g.n)
from generate_series(1,6) as g(n);
do $
declare v_id uuid;
begin
  for v_id in select id from public.deposit_requests
    where user_id='12121212-1212-4121-8121-121212121212' and created_at < now()+interval '5 seconds'
    order by created_at,id
  loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;
  update public.deposit_requests set status='rejected'
    where user_id='12121212-1212-4121-8121-121212121212'
      and created_at >= now()+interval '5 seconds' and created_at < now()+interval '6 seconds';
  update public.deposit_requests set status='approved'
    where user_id='12121212-1212-4121-8121-121212121212'
      and created_at >= now()+interval '6 seconds';
end;
$;
select is(
  (select count(*) from public.deposit_streak_claims where user_id='12121212-1212-4121-8121-121212121212'),
  0::bigint,
  'a rejected deposit breaks the streak and four prior plus one later approval do not qualify'
);
insert into public.deposit_requests(id,user_id,payment_method,amount,currency,status,created_at)
select gen_random_uuid(),'12121212-1212-4121-8121-121212121212','baridimob',1000,'DZD','pending',now()+make_interval(secs=>g.n+10)
from generate_series(1,4) as g(n);
do $
declare v_id uuid;
begin
  for v_id in select id from public.deposit_requests
    where user_id='12121212-1212-4121-8121-121212121212'
      and status='pending' order by created_at,id
  loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;
end;
$;
select is(
  (select count(*) from public.deposit_streak_claims where user_id='12121212-1212-4121-8121-121212121212'),
  1::bigint,
  'five consecutive approvals after a rejected deposit earn exactly one streak reward'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('88888888-8888-4888-8888-888888888888','authenticated','authenticated','betnova-admin-test@example.invalid','',now(),now(),now());
update public.profiles set role='admin' where id='88888888-8888-4888-8888-888888888888';
do $claims$
begin
  perform set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
  perform set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}',true);
end;
$claims$;

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
