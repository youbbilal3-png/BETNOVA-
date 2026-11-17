-- Automatic VAR payout correction and wallet recovery safeguards.
-- This migration adds the financial correction engine only. Provider event
-- reconciliation must call betnova_reconcile_bet_payout after recomputing legs.

alter table public.wallet_accounts
  add column if not exists recovery_balance numeric not null default 0
  check (recovery_balance >= 0);

alter table public.bets
  add column if not exists credited_payout numeric not null default 0
  check (credited_payout >= 0);

-- Backfill the amount actually credited by the legacy settlement flow.
update public.bets b
set credited_payout = coalesce((
  select sum(wl.amount)
  from public.wallet_ledger wl
  where wl.reference_type = 'bet'
    and wl.reference_id = b.id
    and wl.entry_type = 'bet_return'
), 0)
where b.credited_payout = 0;

create table if not exists public.bet_settlement_corrections (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null check (currency in ('DZD','USD','EUR')),
  revision_key text not null check (length(trim(revision_key)) between 1 and 160),
  previous_payout numeric not null check (previous_payout >= 0),
  corrected_payout numeric not null check (corrected_payout >= 0),
  payout_delta numeric not null,
  recovered_from_available numeric not null default 0 check (recovered_from_available >= 0),
  debt_created numeric not null default 0 check (debt_created >= 0),
  reason text not null check (length(trim(reason)) between 4 and 500),
  created_at timestamptz not null default now(),
  unique (bet_id, revision_key)
);

create index if not exists bet_settlement_corrections_user_created_idx
  on public.bet_settlement_corrections(user_id, created_at desc);

create table if not exists public.wallet_recovery_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_account_id uuid not null references public.wallet_accounts(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null check (currency in ('DZD','USD','EUR')),
  entry_type text not null check (entry_type in ('debt_created','debt_repaid')),
  amount numeric not null check (amount > 0),
  recovery_balance_after numeric not null check (recovery_balance_after >= 0),
  reference_type text not null,
  reference_id uuid,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists wallet_recovery_ledger_user_created_idx
  on public.wallet_recovery_ledger(user_id, created_at desc);

alter table public.bet_settlement_corrections enable row level security;
alter table public.wallet_recovery_ledger enable row level security;
revoke all on table public.bet_settlement_corrections from public, anon, authenticated;
revoke all on table public.wallet_recovery_ledger from public, anon, authenticated;
grant all on table public.bet_settlement_corrections to service_role;
grant all on table public.wallet_recovery_ledger to service_role;

create or replace function public.betnova_guard_wallet_recovery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_credit numeric;
  v_offset numeric;
begin
  if tg_op = 'UPDATE' then
    if new.available_balance < old.available_balance and old.recovery_balance > 0
       and not (v_role = 'service_role'
                and current_setting('betnova.recovery_collection', true) = 'on') then
      raise exception 'Outstanding wallet recovery must be cleared before spending or withdrawing funds';
    end if;

    if new.reserved_balance < old.reserved_balance
       and old.recovery_balance > 0
       and new.available_balance <= old.available_balance then
      raise exception 'Outstanding wallet recovery must be cleared before a reserved withdrawal can be paid';
    end if;

    v_credit := greatest(new.available_balance - old.available_balance, 0);
    if v_credit > 0 and old.recovery_balance > 0 then
      v_offset := least(v_credit, old.recovery_balance);
      new.available_balance := new.available_balance - v_offset;
      new.recovery_balance := old.recovery_balance - v_offset;

      insert into public.wallet_recovery_ledger(
        wallet_account_id,user_id,currency,entry_type,amount,
        recovery_balance_after,reference_type,reference_id,description
      ) values (
        old.id,old.user_id,old.currency,'debt_repaid',v_offset,
        new.recovery_balance,'wallet_credit',null,
        'Incoming wallet credit automatically applied to outstanding VAR settlement recovery'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists wallet_recovery_guard on public.wallet_accounts;
create trigger wallet_recovery_guard
before update of available_balance, reserved_balance, recovery_balance on public.wallet_accounts
for each row execute function public.betnova_guard_wallet_recovery();

revoke all on function public.betnova_guard_wallet_recovery() from public, anon, authenticated;

create or replace function public.betnova_reconcile_bet_payout(
  p_bet_id uuid,
  p_revision_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_bet public.bets%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_existing public.bet_settlement_corrections%rowtype;
  v_status text;
  v_target_payout numeric;
  v_previous_payout numeric;
  v_delta numeric;
  v_recover numeric := 0;
  v_debt numeric := 0;
  v_correction_id uuid := gen_random_uuid();
  v_key uuid := gen_random_uuid();
begin
  if v_role <> 'service_role' then
    raise exception 'Trusted settlement processor only';
  end if;
  if p_bet_id is null or p_revision_key is null
     or length(trim(p_revision_key)) not between 1 and 160
     or p_reason is null or length(trim(p_reason)) not between 4 and 500 then
    raise exception 'Invalid correction metadata';
  end if;

  select * into v_bet
  from public.bets
  where id = p_bet_id
  for update;
  if not found then raise exception 'Bet not found'; end if;

  select * into v_existing
  from public.bet_settlement_corrections
  where bet_id = p_bet_id and revision_key = p_revision_key;
  if found then
    return jsonb_build_object(
      'ok', true, 'already_applied', true,
      'correction_id', v_existing.id,
      'credited_payout', v_existing.corrected_payout,
      'payout_delta', v_existing.payout_delta,
      'debt_created', v_existing.debt_created
    );
  end if;

  if not exists (select 1 from public.bet_legs where bet_id = p_bet_id) then
    raise exception 'Bet has no selections to reconcile';
  end if;

  if exists (select 1 from public.bet_legs where bet_id = p_bet_id and result_status = 'lost') then
    v_status := 'lost';
    v_target_payout := 0;
  elsif exists (select 1 from public.bet_legs where bet_id = p_bet_id and result_status = 'pending') then
    raise exception 'Bet still has unresolved selections';
  elsif exists (select 1 from public.bet_legs where bet_id = p_bet_id and result_status = 'won') then
    v_status := 'won';
    select round(v_bet.stake * exp(coalesce(sum(ln(odds_snapshot)),0)),2)
      into v_target_payout
    from public.bet_legs
    where bet_id = p_bet_id and result_status = 'won';
  else
    v_status := 'void';
    v_target_payout := v_bet.stake;
  end if;

  v_previous_payout := coalesce(v_bet.credited_payout, 0);
  v_delta := round(v_target_payout - v_previous_payout, 2);

  -- Repeated event delivery must not create duplicate audit rows or wallet entries.
  if v_delta = 0 and v_bet.status = v_status then
    return jsonb_build_object(
      'ok', true, 'already_applied', true,
      'credited_payout', v_previous_payout,
      'payout_delta', 0,
      'bet_status', v_status
    );
  end if;

  select * into v_wallet
  from public.wallet_accounts
  where user_id = v_bet.user_id and currency = v_bet.currency
  for update;
  if not found then raise exception 'Wallet account missing during payout reconciliation'; end if;

  if v_delta < 0 then
    v_recover := least(v_wallet.available_balance, abs(v_delta));
    v_debt := round(abs(v_delta) - v_recover, 2);

    perform set_config('betnova.recovery_collection', 'on', true);
    update public.wallet_accounts
    set available_balance = available_balance - v_recover,
        recovery_balance = recovery_balance + v_debt,
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;
    perform set_config('betnova.recovery_collection', 'off', true);

    if v_recover > 0 then
      insert into public.wallet_ledger(
        wallet_account_id,user_id,currency,entry_type,amount,balance_after,
        reserved_after,reference_type,reference_id,idempotency_key,description
      ) values (
        v_wallet.id,v_bet.user_id,v_bet.currency,'adjustment',-v_recover,
        v_wallet.available_balance,v_wallet.reserved_balance,'bet',v_bet.id,v_key,
        'Automatic VAR payout correction: previously credited winnings recovered'
      );
    end if;

    if v_debt > 0 then
      insert into public.wallet_recovery_ledger(
        wallet_account_id,user_id,currency,entry_type,amount,
        recovery_balance_after,reference_type,reference_id,description
      ) values (
        v_wallet.id,v_bet.user_id,v_bet.currency,'debt_created',v_debt,
        v_wallet.recovery_balance,'bet_correction',v_correction_id,
        'Automatic VAR correction created a recoverable wallet balance'
      );
    end if;
  elsif v_delta > 0 then
    -- The wallet trigger automatically diverts any outstanding recovery first.
    update public.wallet_accounts
    set available_balance = available_balance + v_delta,
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;

    insert into public.wallet_ledger(
      wallet_account_id,user_id,currency,entry_type,amount,balance_after,
      reserved_after,reference_type,reference_id,idempotency_key,description
    ) values (
      v_wallet.id,v_bet.user_id,v_bet.currency,'adjustment',v_delta,
      v_wallet.available_balance,v_wallet.reserved_balance,'bet',v_bet.id,v_key,
      'Automatic VAR payout correction: additional winnings credited after authoritative result update'
    );
  end if;

  update public.bets
  set status = v_status,
      credited_payout = v_target_payout,
      settled_at = now()
  where id = p_bet_id;

  insert into public.bet_settlement_corrections(
    id,bet_id,user_id,currency,revision_key,previous_payout,
    corrected_payout,payout_delta,recovered_from_available,debt_created,reason
  ) values (
    v_correction_id,p_bet_id,v_bet.user_id,v_bet.currency,p_revision_key,
    v_previous_payout,v_target_payout,v_delta,v_recover,v_debt,trim(p_reason)
  );

  return jsonb_build_object(
    'ok', true, 'already_applied', false,
    'correction_id', v_correction_id,
    'previous_payout', v_previous_payout,
    'corrected_payout', v_target_payout,
    'payout_delta', v_delta,
    'recovered_from_available', v_recover,
    'debt_created', v_debt,
    'remaining_recovery_balance', v_wallet.recovery_balance,
    'bet_status', v_status
  );
end;
$$;

revoke all on function public.betnova_reconcile_bet_payout(uuid,text,text) from public, anon, authenticated;
grant execute on function public.betnova_reconcile_bet_payout(uuid,text,text) to service_role;

comment on column public.wallet_accounts.recovery_balance is
  'Outstanding amount from automatic post-settlement corrections; incoming credits are automatically offset.';
comment on column public.bets.credited_payout is
  'Net payout currently recognized for this bet after all automatic settlement corrections.';


-- Keep the audit trail append-only, including for trusted application roles.
create or replace function public.betnova_reject_recovery_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Financial recovery audit records are immutable';
end;
$$;

revoke all on function public.betnova_reject_recovery_audit_mutation() from public, anon, authenticated;

drop trigger if exists bet_settlement_corrections_immutable on public.bet_settlement_corrections;
create trigger bet_settlement_corrections_immutable
before update or delete on public.bet_settlement_corrections
for each row execute function public.betnova_reject_recovery_audit_mutation();

drop trigger if exists wallet_recovery_ledger_immutable on public.wallet_recovery_ledger;
create trigger wallet_recovery_ledger_immutable
before update or delete on public.wallet_recovery_ledger
for each row execute function public.betnova_reject_recovery_audit_mutation();


-- Record all initial settlement credits in the same cumulative payout field used
-- by corrections. The legacy settlement RPC remains compatible with this trigger.
create or replace function public.betnova_track_initial_bet_return()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_type = 'bet_return'
     and new.reference_type = 'bet'
     and new.reference_id is not null then
    update public.bets
    set credited_payout = credited_payout + new.amount
    where id = new.reference_id;
  end if;
  return new;
end;
$$;

revoke all on function public.betnova_track_initial_bet_return() from public, anon, authenticated;
drop trigger if exists wallet_ledger_track_bet_return on public.wallet_ledger;
create trigger wallet_ledger_track_bet_return
after insert on public.wallet_ledger
for each row execute function public.betnova_track_initial_bet_return();

-- Ensure first-goal / first-corner replay uses the event's actual match time,
-- not the time it happened to arrive at our server. This matters when VAR inserts
-- or removes an earlier event during a later reconciliation.
do $
declare
  v_definition text;
  v_old text := 'e.received_at<v_event.received_at';
  v_new text := 'coalesce(e.occurred_at,e.received_at)<coalesce(v_event.occurred_at,v_event.received_at)';
begin
  select pg_get_functiondef('public.betnova_process_live_event(uuid)'::regprocedure)
    into v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'Could not locate event ordering expressions in live event processor';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end;
$;

-- Re-open only the affected fixture's settlement graph. Historical wallet
-- credits remain untouched; the subsequent replay applies payout deltas.
create or replace function public.betnova_reopen_fixture_for_correction(p_fixture_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_count integer := 0;
begin
  if v_role <> 'service_role' then
    raise exception 'Trusted settlement processor only';
  end if;
  if p_fixture_id is null then raise exception 'Fixture is required'; end if;

  perform 1 from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found'; end if;

  -- Only reopen markets that were actually settled/voided. Suspended markets
  -- stay suspended and inactive markets stay inactive.
  update public.market_selections ms
  set status = 'active', result_status = 'pending', updated_at = now()
  from public.markets m
  where m.id = ms.market_id
    and m.fixture_id = p_fixture_id
    and m.is_active = true
    and m.status in ('settled','void')
    and ms.result_status in ('won','lost','void');

  update public.markets
  set status = 'open', settled_at = null, last_updated_at = now()
  where fixture_id = p_fixture_id
    and is_active = true
    and status in ('settled','void');
  get diagnostics v_count = row_count;

  update public.bet_legs
  set result_status = 'pending', settled_at = null
  where fixture_id = p_fixture_id
    and result_status in ('won','lost','void');

  -- Keep bets lost if another leg is still lost; only reopen bets whose
  -- previous terminal result may have depended on this fixture.
  update public.bets b
  set status = case
        when exists (select 1 from public.bet_legs x where x.bet_id = b.id and x.result_status = 'lost')
          then 'lost'
        else 'pending'
      end,
      settled_at = case
        when exists (select 1 from public.bet_legs x where x.bet_id = b.id and x.result_status = 'lost')
          then now()
        else null
      end
  where b.status in ('won','lost','void')
    and exists (
      select 1 from public.bet_legs bl
      where bl.bet_id = b.id
        and bl.fixture_id = p_fixture_id
        and bl.result_status = 'pending'
    );

  return v_count;
end;
$$;

revoke all on function public.betnova_reopen_fixture_for_correction(uuid) from public, anon, authenticated;
grant execute on function public.betnova_reopen_fixture_for_correction(uuid) to service_role;

-- Recalculate each affected bet from its immutable odds snapshots. This replaces
-- direct payout insertion with an idempotent payout-delta reconciliation.
create or replace function public.betnova_settle_market(
  p_market_id uuid,
  p_winning_selection_ids uuid[],
  p_void boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_market public.markets%rowtype;
  v_bet_id uuid;
  v_result integer := 0;
  v_revision text;
begin
  if not ((v_user is not null and public.betnova_is_admin()) or v_role = 'service_role') then
    raise exception 'Administrator or trusted event processor required';
  end if;

  select * into v_market
  from public.markets
  where id = p_market_id
  for update;
  if not found or v_market.status not in ('open','suspended') then
    raise exception 'Market is not available for settlement';
  end if;

  if p_void is not true and (
    coalesce(array_length(p_winning_selection_ids,1),0) = 0
    or exists (
      select 1 from unnest(p_winning_selection_ids) x
      where not exists (
        select 1 from public.market_selections ms
        where ms.id = x and ms.market_id = p_market_id
      )
    )
  ) then
    raise exception 'Winning selections must belong to this market';
  end if;

  update public.market_selections ms
  set result_status = case when p_void then 'void'
                           when ms.id = any(p_winning_selection_ids) then 'won'
                           else 'lost' end,
      status = case when p_void then 'void'
                    when ms.id = any(p_winning_selection_ids) then 'won'
                    else 'lost' end,
      updated_at = now()
  where ms.market_id = p_market_id;

  update public.markets
  set status = case when p_void then 'void' else 'settled' end,
      settled_at = now(), last_updated_at = now()
  where id = p_market_id;

  update public.bet_legs bl
  set result_status = ms.result_status, settled_at = now()
  from public.market_selections ms
  where bl.selection_id = ms.id and bl.market_id = p_market_id;

  for v_bet_id in
    select distinct b.id
    from public.bets b
    join public.bet_legs bl on bl.bet_id = b.id
    where bl.market_id = p_market_id
      and b.status = 'pending'
      and (
        exists (select 1 from public.bet_legs x where x.bet_id = b.id and x.result_status = 'lost')
        or not exists (select 1 from public.bet_legs x where x.bet_id = b.id and x.result_status = 'pending')
      )
    order by b.id
  loop
    v_revision := p_market_id::text || ':' || gen_random_uuid()::text;
    perform public.betnova_reconcile_bet_payout(
      v_bet_id, v_revision, 'Automatic market settlement'
    );
    v_result := v_result + 1;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.betnova_settle_market(uuid,uuid[],boolean) from public, anon;
grant execute on function public.betnova_settle_market(uuid,uuid[],boolean) to authenticated, service_role;
