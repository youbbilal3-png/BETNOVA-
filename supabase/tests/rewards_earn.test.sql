create extension if not exists pgtap with schema extensions;

begin;
select plan(15);

select has_table('public','earn_post_submissions','social earn submissions table exists');
select has_column('public','earn_post_submissions','status','submission review status exists');
select has_column('public','earn_post_submissions','proof_sha256','server-verified screenshot hash is stored');
select has_table('public','referral_codes','referral code table exists');
select has_table('public','referrals','referral attribution table exists');
select has_table('public','deposit_streak_claims','five-deposit reward claims table exists');

select ok((select relrowsecurity from pg_class where oid='public.earn_post_submissions'::regclass),
  'earn submissions enforce row level security');
select ok((select relrowsecurity from pg_class where oid='public.referrals'::regclass),
  'referrals enforce row level security');
select ok((select relrowsecurity from pg_class where oid='public.deposit_streak_claims'::regclass),
  'deposit streak claims enforce row level security');

select ok(not has_table_privilege('authenticated','public.earn_post_submissions','INSERT')
  and not has_table_privilege('authenticated','public.earn_post_submissions','UPDATE')
  and not has_table_privilege('authenticated','public.earn_post_submissions','DELETE'),
  'users cannot write or modify submissions outside the verified Edge Function');
select ok(not has_table_privilege('authenticated','public.referrals','INSERT')
  and not has_table_privilege('authenticated','public.deposit_streak_claims','INSERT'),
  'users cannot create referral or deposit reward claims directly');
select ok(not has_table_privilege('authenticated','public.referral_codes','SELECT'),
  'referral codes are exposed only through the authenticated RPC');

select ok(to_regprocedure('public.betnova_get_referral_code()') is not null,
  'authenticated referral code RPC exists');
select ok(to_regprocedure('public.betnova_review_earn_submission(uuid,text,text)') is not null
  and to_regprocedure('public.betnova_review_referral(uuid,text,text)') is not null,
  'admin reward review RPCs exist');
select ok(exists(select 1 from storage.buckets where id='earn-proofs' and public=false
  and file_size_limit=5242880),
  'earn proof screenshots use a private 5 MB storage bucket');

select * from finish();
rollback;
