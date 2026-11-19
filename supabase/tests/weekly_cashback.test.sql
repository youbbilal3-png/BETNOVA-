create extension if not exists pgtap with schema extensions;

begin;
select plan(12);

select has_table('public','weekly_cashback_claims','weekly cashback claims table exists');
select has_column('public','weekly_cashback_claims','total_staked','weekly staked total is recorded');
select has_column('public','weekly_cashback_claims','cashback_amount','cashback amount is recorded');

select ok(
  (select relrowsecurity from pg_class where oid='public.weekly_cashback_claims'::regclass),
  'weekly cashback claims enforce row level security'
);
select ok(
  has_table_privilege('authenticated','public.weekly_cashback_claims','SELECT'),
  'authenticated users can read their cashback claims subject to RLS'
);
select ok(
  not has_table_privilege('authenticated','public.weekly_cashback_claims','INSERT')
  and not has_table_privilege('authenticated','public.weekly_cashback_claims','UPDATE')
  and not has_table_privilege('authenticated','public.weekly_cashback_claims','DELETE'),
  'users cannot create or alter cashback claims directly'
);

select ok(
  to_regprocedure('private.betnova_process_weekly_cashback(date)') is not null,
  'weekly cashback processor exists'
);
select ok(
  not has_function_privilege('authenticated','private.betnova_process_weekly_cashback(date)','EXECUTE'),
  'weekly cashback processor is not callable by app users'
);
select ok(
  exists(select 1 from cron.job where jobname='betnova-weekly-cashback-5-percent' and schedule='5 0 * * 1'),
  'weekly cashback runs Monday at 00:05 UTC'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='public.weekly_cashback_claims'::regclass and conname='weekly_cashback_claims_unique'),
  'a user can only claim each currency and week once'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='public.weekly_cashback_claims'::regclass and pg_get_constraintdef(oid) ilike '%cashback_rate = 0.05%'),
  'cashback rate is fixed at five percent'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='public.weekly_cashback_claims'::regclass and pg_get_constraintdef(oid) ilike '%week_end = (week_start + 7)%'),
  'claim covers exactly one complete week'
);

select * from finish();
rollback;
