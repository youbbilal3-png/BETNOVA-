begin;

select plan(12);

select has_table('public','earn_post_submissions','social earn submissions table exists');
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

select * from finish();
rollback;
