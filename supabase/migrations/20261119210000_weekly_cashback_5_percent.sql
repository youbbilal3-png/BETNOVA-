-- Weekly cashback: 5% of all accepted cash stakes in the previous
-- completed Algeria-local calendar week. Covers football bets and real-money games
-- through the canonical wallet ledger, without counting deposits or payouts.
create table if not exists public.weekly_cashback_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null check (currency in ('DZD','USD','EUR')),
  week_start date not null,
  week_end date not null,
  total_staked numeric(20,2) not null check (total_staked > 0),
  cashback_rate numeric(5,4) not null default 0.05 check (cashback_rate = 0.05),
  cashback_amount numeric(20,2) not null check (cashback_amount > 0),
  wallet_ledger_id uuid unique references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint weekly_cashback_claims_week check (week_end = week_start + 7),
  constraint weekly_cashback_claims_unique unique (user_id, currency, week_start)
);

create index if not exists weekly_cashback_claims_user_week_idx
  on public.weekly_cashback_claims(user_id, week_start desc);

alter table public.weekly_cashback_claims enable row level security;

create policy "Users read own weekly cashback"
  on public.weekly_cashback_claims for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Admins read weekly cashback"
  on public.weekly_cashback_claims for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));

grant select on public.weekly_cashback_claims to authenticated;
revoke insert, update, delete on public.weekly_cashback_claims from anon, authenticated;

create or replace function private.betnova_process_weekly_cashback(
  p_week_start date default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week_start date;
  v_week_end date;
  v_start timestamptz;
  v_end timestamptz;
  v_group record;
  v_total numeric(20,2);
  v_cashback numeric(20,2);
  v_claim_id uuid;
  v_wallet public.wallet_accounts%rowtype;
  v_processed integer := 0;
begin
  -- Only the scheduled database job (postgres) may execute this function.
  if session_user <> 'postgres' then
    raise exception 'Scheduled database execution required';
  end if;

  v_week_start := coalesce(
    p_week_start,
    (date_trunc('week', now() at time zone 'Africa/Algiers')::date - 7)
  );
  if v_week_start <> date_trunc('week', v_week_start::timestamp)::date
     or v_week_start >= (now() at time zone 'Africa/Algiers')::date then
    raise exception 'Week start must be a past Monday';
  end if;
  v_week_end := v_week_start + 7;
  if v_week_end > (now() at time zone 'Africa/Algiers')::date then
    raise exception 'Only a fully completed Algeria-local week can be processed';
  end if;
  v_start := v_week_start::timestamp at time zone 'Africa/Algiers';
  v_end := v_week_end::timestamp at time zone 'Africa/Algiers';

  for v_group in
    select wl.user_id, wl.currency, round(sum(-wl.amount), 2) as total_staked
    from public.wallet_ledger wl
    where wl.entry_type in ('bet_stake','game_stake')
      and wl.amount < 0
      and wl.created_at >= v_start
      and wl.created_at < v_end
    group by wl.user_id, wl.currency
  loop
    v_total := v_group.total_staked;
    v_cashback := round(v_total * 0.05, 2);
    if v_cashback <= 0 then continue; end if;

    v_claim_id := gen_random_uuid();
    insert into public.weekly_cashback_claims(
      id,user_id,currency,week_start,week_end,total_staked,cashback_rate,cashback_amount
    ) values (
      v_claim_id,v_group.user_id,v_group.currency,v_week_start,v_week_end,
      v_total,0.05,v_cashback
    )
    on conflict (user_id,currency,week_start) do nothing
    returning id into v_claim_id;

    -- A prior successful run already processed this user/currency/week.
    if v_claim_id is null then continue; end if;

    insert into public.wallet_accounts(user_id,currency)
    values(v_group.user_id,v_group.currency)
    on conflict(user_id,currency) do nothing;

    select * into v_wallet
    from public.wallet_accounts
    where user_id=v_group.user_id and currency=v_group.currency
    for update;

    update public.wallet_accounts
      set available_balance=available_balance+v_cashback, updated_at=now()
      where id=v_wallet.id
      returning * into v_wallet;

    insert into public.wallet_ledger(
      id,wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
      reference_type,reference_id,idempotency_key,description
    ) values (
      v_claim_id,v_wallet.id,v_group.user_id,v_group.currency,'bonus',v_cashback,
      v_wallet.available_balance,v_wallet.reserved_balance,
      'weekly_cashback',v_claim_id,v_claim_id,
      'Weekly cashback 5% · ' || v_week_start::text || ' to ' || v_week_end::text
    );

    update public.weekly_cashback_claims
      set wallet_ledger_id=v_claim_id
      where id=v_claim_id;

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

revoke all on function private.betnova_process_weekly_cashback(date) from public, anon, authenticated;

-- Monday 00:05 UTC = 01:05 in Algeria. The function itself calculates the
-- previous fully completed Africa/Algiers week and is idempotent on re-runs.
do $$
begin
  if exists(select 1 from cron.job where jobname='betnova-weekly-cashback-5-percent') then
    perform cron.unschedule('betnova-weekly-cashback-5-percent');
  end if;
end
$$;

select cron.schedule(
  'betnova-weekly-cashback-5-percent',
  '5 0 * * 1',
  $job$ select private.betnova_process_weekly_cashback(); $job$
);
