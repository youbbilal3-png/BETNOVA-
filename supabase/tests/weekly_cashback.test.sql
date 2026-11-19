begin;

select plan(9);

select has_table(
  'public',
  'weekly_cashback_claims',
  'weekly cashback history table exists'
);

select has_column(
  'public',
  'weekly_cashback_claims',
  'cashback_amount',
  'cashback amount is recorded'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.weekly_cashback_claims'::regclass),
  'RLS is enabled on cashback history'
);

select ok(
  has_table_privilege('authenticated', 'public.weekly_cashback_claims', 'SELECT'),
  'authenticated users can read cashback history subject to RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.weekly_cashback_claims', 'INSERT'),
  'authenticated users cannot insert cashback claims directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.weekly_cashback_claims', 'UPDATE'),
  'authenticated users cannot edit cashback claims'
);

select ok(
  not has_table_privilege('authenticated', 'public.weekly_cashback_claims', 'DELETE'),
  'authenticated users cannot delete cashback claims'
);

select ok(
  not has_function_privilege('authenticated', 'private.betnova_process_weekly_cashback(date)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.betnova_process_weekly_cashback(date)', 'EXECUTE'),
  'cashback processor is not executable by client roles'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.weekly_cashback_claims'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%user_id, currency, week_start%'
  ),
  'one cashback claim per user, currency, and week is enforced'
);

select * from finish();
rollback;
