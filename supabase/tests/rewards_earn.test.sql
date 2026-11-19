create extension if not exists pgtap with schema extensions;
begin;
select plan(35);

select has_table('public','earn_post_submissions','social Earn submissions table exists');
select has_column('public','earn_post_submissions','status','Earn submissions have a review status');
select has_column('public','earn_post_submissions','proof_sha256','Earn screenshots are hashed server-side');
select ok(to_regclass('public.earn_post_submissions_proof_hash_unique') is not null,'a screenshot hash cannot be submitted twice');
select has_table('public','referral_codes','referral codes table exists');
select has_table('public','referrals','referral attribution table exists');
select has_table('public','deposit_streak_claims','deposit streak claims table exists');
select ok((select relrowsecurity from pg_class where oid='public.earn_post_submissions'::regclass),'Earn submissions have RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.referrals'::regclass),'referrals have RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.deposit_streak_claims'::regclass),'deposit streak claims have RLS enabled');
select ok(not has_table_privilege('authenticated','public.earn_post_submissions','INSERT'),'clients cannot bypass the proof-verification Edge Function');
select ok(not has_table_privilege('authenticated','public.earn_post_submissions','UPDATE'),'clients cannot change Earn review outcomes');
select ok(not has_table_privilege('authenticated','public.earn_post_submissions','DELETE'),'clients cannot erase Earn review history');
select ok(not has_table_privilege('authenticated','public.referrals','INSERT') and not has_table_privilege('authenticated','public.deposit_streak_claims','INSERT'),'clients cannot create referral or deposit reward claims');
select ok(has_function_privilege('authenticated','public.betnova_get_referral_code()','EXECUTE'),'signed-in users can request their referral code');
select ok(not has_function_privilege('anon','public.betnova_get_referral_code()','EXECUTE'),'anonymous users cannot request a referral code');
select ok(has_function_privilege('authenticated','public.betnova_review_earn_submission(uuid,text,text)','EXECUTE'),'admin review RPC is exposed only behind its internal admin check');
select ok(has_function_privilege('authenticated','public.betnova_review_referral(uuid,text,text)','EXECUTE'),'referral review RPC is exposed only behind its internal admin check');
select ok(exists(select 1 from pg_trigger where tgname='betnova_process_deposit_streak' and not tgisinternal),'deposit approval trigger is installed');

do $$
declare
  v_referrer uuid := '55555555-5555-4555-8555-555555555555';
  v_referred uuid := '66666666-6666-4666-8666-666666666666';
  v_admin uuid := '77777777-7777-4777-8777-777777777777';
  v_earn_user uuid := '88888888-8888-4888-8888-888888888888';
  v_code text;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
  values(v_referrer,'authenticated','authenticated','referrer-test@example.invalid','',now(),now(),now(),'{}'::jsonb);

  perform set_config('request.jwt.claim.sub',v_referrer::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_referrer::text,'role','authenticated')::text,true);
  v_code:=public.betnova_get_referral_code();

  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
  values(v_referred,'authenticated','authenticated','referred-test@example.invalid','',now(),now(),now(),jsonb_build_object('referral_code',v_code));

  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
  values(v_admin,'authenticated','authenticated','rewards-admin-test@example.invalid','',now(),now(),now(),'{}'::jsonb);
  update public.profiles set role='admin' where id=v_admin;

  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
  values(v_earn_user,'authenticated','authenticated','earn-user-test@example.invalid','',now(),now(),now(),'{}'::jsonb);

  insert into public.earn_post_submissions(user_id,platform,post_url,proof_path,proof_sha256)
  values(v_earn_user,'instagram','https://www.instagram.com/p/betnova-test/ ',v_earn_user::text||'/proof.png',repeat('a',64));

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform public.betnova_review_referral(v_referred,'approve','pgTAP verified email referral');
  perform public.betnova_review_earn_submission(
    (select id from public.earn_post_submissions where user_id=v_earn_user),'approve','pgTAP approved proof'
  );

  begin
    perform public.betnova_review_referral(v_referred,'approve',null);
    raise exception 'duplicate referral approval was not rejected';
  exception when others then
    if sqlerrm<>'Referral is not pending' then raise; end if;
  end;

  begin
    perform public.betnova_review_earn_submission(
      (select id from public.earn_post_submissions where user_id=v_earn_user),'approve',null
    );
    raise exception 'duplicate Earn approval was not rejected';
  exception when others then
    if sqlerrm<>'Submission is not pending' then raise; end if;
  end;
end;
$$;

select is((select count(*) from public.referrals where referred_user_id='66666666-6666-4666-8666-666666666666'),1::bigint,'signup referral code is captured once');
select is((select status from public.referrals where referred_user_id='66666666-6666-4666-8666-666666666666'),'approved','verified referral is approved');
select is((select available_balance from public.wallet_accounts where user_id='55555555-5555-4555-8555-555555555555' and currency='DZD'),100::numeric,'referral reward is credited to the referrer cash wallet');
select is((select count(*) from public.wallet_ledger where user_id='55555555-5555-4555-8555-555555555555' and reference_type='referral'),1::bigint,'referral cash credit has one ledger entry');
select is((select status from public.earn_post_submissions where user_id='88888888-8888-4888-8888-888888888888'),'approved','admin can approve a verified Earn submission');
select is((select available_balance from public.wallet_accounts where user_id='88888888-8888-4888-8888-888888888888' and currency='DZD'),50::numeric,'approved social post reward credits the cash wallet');
select is((select count(*) from public.wallet_ledger where user_id='88888888-8888-4888-8888-888888888888' and reference_type='earn_post'),1::bigint,'Earn reward has one auditable ledger entry');

do $$
declare
  v_four uuid := '99999999-9999-4999-8999-999999999999';
  v_five uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_ten uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_mixed uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_id uuid;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at,raw_user_meta_data)
  values
    (v_four,'authenticated','authenticated','four-deposit-test@example.invalid','',now(),now(),'{}'::jsonb),
    (v_five,'authenticated','authenticated','five-deposit-test@example.invalid','',now(),now(),'{}'::jsonb),
    (v_ten,'authenticated','authenticated','ten-deposit-test@example.invalid','',now(),now(),'{}'::jsonb),
    (v_mixed,'authenticated','authenticated','mixed-deposit-test@example.invalid','',now(),now(),'{}'::jsonb);

  insert into public.deposit_requests(user_id,payment_method,amount,currency,status,created_at)
  select v_four,'baridimob',1000,'DZD','pending',now()+make_interval(secs=>g.n)
  from generate_series(1,4) as g(n);
  for v_id in select id from public.deposit_requests where user_id=v_four order by created_at,id loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;

  insert into public.deposit_requests(user_id,payment_method,amount,currency,status,created_at)
  select v_five,'baridimob',1000,'DZD','pending',now()+make_interval(secs=>g.n)
  from generate_series(1,5) as g(n);
  for v_id in select id from public.deposit_requests where user_id=v_five order by created_at,id loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;

  insert into public.deposit_requests(user_id,payment_method,amount,currency,status,created_at)
  select v_ten,'baridimob',1000,'DZD','pending',now()+make_interval(secs=>g.n)
  from generate_series(1,10) as g(n);
  for v_id in select id from public.deposit_requests where user_id=v_ten order by created_at,id loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;

  insert into public.deposit_requests(user_id,payment_method,amount,currency,status,created_at)
  select v_mixed,'baridimob',1000,case when g.n=5 then 'USD' else 'DZD' end,'pending',now()+make_interval(secs=>g.n)
  from generate_series(1,5) as g(n);
  for v_id in select id from public.deposit_requests where user_id=v_mixed order by created_at,id loop
    update public.deposit_requests set status='approved' where id=v_id;
  end loop;

  update public.deposit_requests set status='approved' where user_id=v_five and status='approved';
end;
$$;

select is((select count(*) from public.deposit_streak_claims where user_id='99999999-9999-4999-8999-999999999999'),0::bigint,'four approved deposits do not qualify');
select is((select total_deposited from public.deposit_streak_claims where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),5000::numeric,'five approved same-currency deposits are aggregated');
select is((select reward_amount from public.deposit_streak_claims where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),250::numeric,'five-deposit reward is exactly five percent');
select is((select available_balance from public.wallet_accounts where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and currency='DZD'),250::numeric,'deposit streak reward credits the real-money wallet');
select is((select count(*) from public.wallet_ledger where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and reference_type='deposit_streak'),1::bigint,'one five-deposit block creates one cash ledger entry');
select is((select available_balance from public.wallet_accounts where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and currency='DZD'),250::numeric,'repeated approval updates do not duplicate the reward');
select is((select count(*) from public.deposit_streak_claims where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),2::bigint,'ten consecutive approved deposits earn two separate streak rewards');
select is((select sum(reward_amount) from public.deposit_streak_claims where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),500::numeric,'two five-deposit blocks each earn five percent');
select is((select count(*) from public.deposit_streak_claims where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),0::bigint,'mixed-currency five-deposit blocks are not combined');

select * from finish();
rollback;
