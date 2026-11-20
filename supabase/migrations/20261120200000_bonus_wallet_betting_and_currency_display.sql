-- One welcome bonus wallet per account, displayed and wagered in the profile's selected currency.
alter table public.bonus_wallet_accounts
  add column if not exists recovery_balance numeric(18,6) not null default 0
  check (recovery_balance >= 0);

alter table public.bets
  add column if not exists funding_source text not null default 'cash'
    check (funding_source in ('cash','bonus')),
  add column if not exists bonus_stake_usd numeric(18,6),
  add column if not exists bonus_currency_per_usd numeric(18,6);

alter table public.bonus_ledger
  drop constraint if exists bonus_ledger_entry_type_check;
alter table public.bonus_ledger
  add constraint bonus_ledger_entry_type_check
  check (entry_type in (
    'welcome_bonus','withdrawal_reserve','withdrawal_release',
    'withdrawal_refund','adjustment','bonus_bet_stake',
    'bonus_bet_return','bonus_bet_recovery'
  ));

CREATE OR REPLACE FUNCTION public.betnova_place_bonus_bet(p_selections jsonb, p_stake numeric, p_currency text, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_bet_id uuid := gen_random_uuid();
  v_existing_bet_id uuid;
  v_bonus public.bonus_wallet_accounts%rowtype;
  v_item jsonb;
  v_selection_id uuid;
  v_fixture_id uuid;
  v_market_id uuid;
  v_odds numeric;
  v_combined numeric := 1;
  v_count integer := 0;
  v_market_updated_at timestamptz;
  v_market_live boolean;
  v_fixture_status text;
  v_starts_at timestamptz;
  v_rate numeric(18,6);
  v_usd_stake numeric(18,6);
  v_preferred_currency text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  if p_currency not in ('DZD','USD','EUR')
    or p_stake is null or p_stake <= 0 or p_stake > 100000000
    or p_stake <> round(p_stake,2) then
    raise exception 'Invalid bonus stake or currency';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array'
    or jsonb_array_length(p_selections) < 1 or jsonb_array_length(p_selections) > 20 then
    raise exception 'Select between 1 and 20 outcomes';
  end if;
  if (select count(distinct value->>'selection_id') from jsonb_array_elements(p_selections))
      <> jsonb_array_length(p_selections) then
    raise exception 'Duplicate selections are not allowed';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_selections) a
    join public.market_selections ms on ms.id = (a.value->>'selection_id')::uuid
    join public.markets m on m.id = ms.market_id
    group by m.fixture_id
    having count(*) > 1
  ) then
    raise exception 'Only one selection per match is currently supported';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_idempotency_key::text,0));
  select id into v_existing_bet_id
  from public.bets
  where user_id = v_user and idempotency_key = p_idempotency_key;
  if found then return v_existing_bet_id; end if;

  select preferred_currency into v_preferred_currency
  from public.profiles where id = v_user;
  if v_preferred_currency is distinct from p_currency then
    raise exception 'Bonus bets must use your account currency';
  end if;

  v_rate := case p_currency when 'DZD' then 260.0 when 'EUR' then 0.9 else 1.0 end;
  v_usd_stake := round(p_stake / v_rate, 6);

  select * into v_bonus
  from public.bonus_wallet_accounts
  where user_id = v_user
  for update;
  if not found then raise exception 'Bonus wallet not found'; end if;
  if v_bonus.recovery_balance > 0 then
    raise exception 'Your bonus wallet has a pending correction balance and cannot be used yet';
  end if;
  if v_bonus.available_balance < v_usd_stake then
    raise exception 'Insufficient bonus balance';
  end if;

  for v_item in select value from jsonb_array_elements(p_selections) loop
    if not (v_item ? 'selection_id') then raise exception 'Invalid selection payload'; end if;
    v_selection_id := (v_item->>'selection_id')::uuid;
    select ms.market_id,m.fixture_id,ms.odds,m.last_updated_at,m.is_live,f.status,f.starts_at
      into v_market_id,v_fixture_id,v_odds,v_market_updated_at,v_market_live,v_fixture_status,v_starts_at
    from public.market_selections ms
    join public.markets m on m.id = ms.market_id
    join public.fixtures f on f.id = m.fixture_id
    where ms.id = v_selection_id
      and ms.status = 'active' and ms.result_status = 'pending'
      and m.status = 'open' and m.is_active = true
      and f.status in ('scheduled','live')
    for update of ms,m,f;
    if not found then raise exception 'One of your selections is no longer available'; end if;
    if v_fixture_status = 'scheduled' and v_starts_at <= now() then
      raise exception 'This event has started; live markets are required';
    end if;
    if v_fixture_status = 'live' and not v_market_live then
      raise exception 'This market is not open for live betting';
    end if;
    if v_fixture_status = 'scheduled' and v_market_live then
      raise exception 'Live market state does not match the fixture';
    end if;
    if v_market_updated_at is null or v_market_updated_at > now() + interval '30 seconds' then
      raise exception 'Odds timestamp is missing or invalid';
    end if;
    if v_market_live and v_market_updated_at < now() - interval '3 minutes' then
      raise exception 'Live odds expired. Refresh the market and try again';
    end if;
    if not v_market_live and v_market_updated_at < now() - interval '24 hours' then
      raise exception 'Pre-match odds expired. Refresh the market and try again';
    end if;
    if v_odds <= 1 then raise exception 'Invalid odds'; end if;
    v_combined := v_combined * v_odds;
    v_count := v_count + 1;
  end loop;
  if v_count <> jsonb_array_length(p_selections) then
    raise exception 'Could not validate every selection';
  end if;

  insert into public.bets(
    id,user_id,currency,stake,combined_odds,potential_return,status,
    idempotency_key,funding_source,bonus_stake_usd,bonus_currency_per_usd
  ) values (
    v_bet_id,v_user,p_currency,round(p_stake,2),v_combined,
    round(p_stake*v_combined,2),'pending',p_idempotency_key,
    'bonus',v_usd_stake,v_rate
  );

  for v_item in select value from jsonb_array_elements(p_selections) loop
    v_selection_id := (v_item->>'selection_id')::uuid;
    insert into public.bet_legs(bet_id,fixture_id,market_id,selection_id,market_label,selection_label,odds_snapshot)
    select v_bet_id,m.fixture_id,m.id,ms.id,m.name,ms.name,ms.odds
    from public.market_selections ms
    join public.markets m on m.id = ms.market_id
    where ms.id = v_selection_id;
  end loop;

  update public.bonus_wallet_accounts
  set available_balance = available_balance-v_usd_stake,updated_at=now()
  where id=v_bonus.id returning * into v_bonus;

  insert into public.bonus_ledger(
    user_id,bonus_wallet_id,entry_type,amount_usd,balance_after,reserved_after,
    reference_type,reference_id,idempotency_key,description
  ) values (
    v_user,v_bonus.id,'bonus_bet_stake',-v_usd_stake,
    v_bonus.available_balance,v_bonus.reserved_balance,
    'bet',v_bet_id,p_idempotency_key,
    'Bonus wallet stake placed on validated selections'
  );
  return v_bet_id;
end;
$function$;

revoke all on function public.betnova_place_bonus_bet(jsonb,numeric,text,uuid) from public,anon;
grant execute on function public.betnova_place_bonus_bet(jsonb,numeric,text,uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.betnova_reconcile_bet_payout(p_bet_id uuid, p_revision_key text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_bet public.bets%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_bonus public.bonus_wallet_accounts%rowtype;
  v_existing public.bet_settlement_corrections%rowtype;
  v_status text;
  v_target_payout numeric;
  v_previous_payout numeric;
  v_delta numeric;
  v_recover numeric := 0;
  v_debt numeric := 0;
  v_correction_id uuid := gen_random_uuid();
  v_key uuid := gen_random_uuid();
  v_delta_usd numeric(18,6);
  v_recover_usd numeric(18,6) := 0;
  v_debt_usd numeric(18,6) := 0;
  v_offset_usd numeric(18,6) := 0;
  v_credit_usd numeric(18,6) := 0;
begin
  if not (v_role = 'service_role' or (auth.uid() is not null and public.betnova_is_admin())) then
    raise exception 'Trusted settlement processor or administrator only';
  end if;
  if p_bet_id is null or p_revision_key is null
     or length(trim(p_revision_key)) not between 1 and 160
     or p_reason is null or length(trim(p_reason)) not between 4 and 500 then
    raise exception 'Invalid correction metadata';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if not found then raise exception 'Bet not found'; end if;

  select * into v_existing
  from public.bet_settlement_corrections
  where bet_id = p_bet_id and revision_key = p_revision_key;
  if found then
    return jsonb_build_object(
      'ok',true,'already_applied',true,
      'correction_id',v_existing.id,
      'credited_payout',v_existing.corrected_payout,
      'payout_delta',v_existing.payout_delta,
      'debt_created',v_existing.debt_created
    );
  end if;

  if not exists(select 1 from public.bet_legs where bet_id = p_bet_id) then
    raise exception 'Bet has no selections to reconcile';
  end if;

  if exists(select 1 from public.bet_legs where bet_id = p_bet_id and result_status = 'lost') then
    v_status := 'lost';
    v_target_payout := 0;
  elsif exists(select 1 from public.bet_legs where bet_id = p_bet_id and result_status = 'pending') then
    raise exception 'Bet still has unresolved selections';
  elsif exists(select 1 from public.bet_legs where bet_id = p_bet_id and result_status = 'won') then
    v_status := 'won';
    select round(v_bet.stake * exp(coalesce(sum(ln(odds_snapshot)),0)),2)
      into v_target_payout
    from public.bet_legs
    where bet_id = p_bet_id and result_status = 'won';
  else
    v_status := 'void';
    v_target_payout := v_bet.stake;
  end if;

  v_previous_payout := coalesce(v_bet.credited_payout,0);
  v_delta := round(v_target_payout - v_previous_payout,2);

  if v_delta = 0 and v_bet.status = v_status then
    return jsonb_build_object(
      'ok',true,'already_applied',true,
      'credited_payout',v_previous_payout,
      'payout_delta',0,
      'bet_status',v_status
    );
  end if;

  if v_bet.funding_source = 'bonus' then
    if coalesce(v_bet.bonus_currency_per_usd,0) <= 0 then
      raise exception 'Bonus bet exchange-rate snapshot is missing';
    end if;
    select * into v_bonus
    from public.bonus_wallet_accounts
    where user_id = v_bet.user_id
    for update;
    if not found then raise exception 'Bonus wallet missing during payout reconciliation'; end if;

    if v_delta < 0 then
      v_delta_usd := round(abs(v_delta) / v_bet.bonus_currency_per_usd,6);
      v_recover_usd := least(v_bonus.available_balance,v_delta_usd);
      v_debt_usd := round(v_delta_usd-v_recover_usd,6);
      update public.bonus_wallet_accounts
      set available_balance = available_balance-v_recover_usd,
          recovery_balance = recovery_balance+v_debt_usd,
          updated_at = now()
      where id = v_bonus.id
      returning * into v_bonus;
      if v_recover_usd > 0 then
        insert into public.bonus_ledger(
          user_id,bonus_wallet_id,entry_type,amount_usd,balance_after,reserved_after,
          reference_type,reference_id,idempotency_key,description
        ) values (
          v_bet.user_id,v_bonus.id,'bonus_bet_recovery',-v_recover_usd,
          v_bonus.available_balance,v_bonus.reserved_balance,
          'bet_correction',v_bet.id,v_key,
          'Bonus winnings correction recovered from available bonus balance'
        );
      end if;
      v_recover := round(v_recover_usd*v_bet.bonus_currency_per_usd,2);
      v_debt := round(v_debt_usd*v_bet.bonus_currency_per_usd,2);
    elsif v_delta > 0 then
      v_delta_usd := round(v_delta/v_bet.bonus_currency_per_usd,6);
      v_offset_usd := least(v_bonus.recovery_balance,v_delta_usd);
      v_credit_usd := round(v_delta_usd-v_offset_usd,6);
      update public.bonus_wallet_accounts
      set available_balance = available_balance+v_credit_usd,
          recovery_balance = recovery_balance-v_offset_usd,
          updated_at = now()
      where id = v_bonus.id
      returning * into v_bonus;
      if v_offset_usd > 0 then
        insert into public.bonus_ledger(
          user_id,bonus_wallet_id,entry_type,amount_usd,balance_after,reserved_after,
          reference_type,reference_id,idempotency_key,description
        ) values (
          v_bet.user_id,v_bonus.id,'bonus_bet_recovery',-v_offset_usd,
          v_bonus.available_balance,v_bonus.reserved_balance,
          'bet_correction',v_bet.id,gen_random_uuid(),
          'Bonus payout correction offset prior bonus recovery balance'
        );
      end if;
      if v_credit_usd > 0 then
        insert into public.bonus_ledger(
          user_id,bonus_wallet_id,entry_type,amount_usd,balance_after,reserved_after,
          reference_type,reference_id,idempotency_key,description
        ) values (
          v_bet.user_id,v_bonus.id,'bonus_bet_return',v_credit_usd,
          v_bonus.available_balance,v_bonus.reserved_balance,
          'bet',v_bet.id,v_key,
          'Winning bonus bet payout credited to bonus wallet'
        );
      end if;
      v_recover := round(v_offset_usd*v_bet.bonus_currency_per_usd,2);
    end if;
  else
    select * into v_wallet
    from public.wallet_accounts
    where user_id = v_bet.user_id and currency = v_bet.currency
    for update;
    if not found then raise exception 'Wallet account missing during payout reconciliation'; end if;

    if v_delta < 0 then
      v_recover := least(v_wallet.available_balance,abs(v_delta));
      v_debt := round(abs(v_delta)-v_recover,2);
      perform set_config('betnova.recovery_collection','on',true);
      update public.wallet_accounts
      set available_balance = available_balance-v_recover,
          recovery_balance = recovery_balance+v_debt,
          updated_at = now()
      where id = v_wallet.id
      returning * into v_wallet;
      perform set_config('betnova.recovery_collection','off',true);
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
      update public.wallet_accounts
      set available_balance = available_balance+v_delta,
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
  end if;

  update public.bets
  set status = v_status, credited_payout = v_target_payout, settled_at = now()
  where id = p_bet_id;

  insert into public.bet_settlement_corrections(
    id,bet_id,user_id,currency,revision_key,previous_payout,
    corrected_payout,payout_delta,recovered_from_available,debt_created,reason
  ) values (
    v_correction_id,p_bet_id,v_bet.user_id,v_bet.currency,p_revision_key,
    v_previous_payout,v_target_payout,v_delta,v_recover,v_debt,trim(p_reason)
  );

  return jsonb_build_object(
    'ok',true,'already_applied',false,
    'correction_id',v_correction_id,
    'previous_payout',v_previous_payout,
    'corrected_payout',v_target_payout,
    'payout_delta',v_delta,
    'recovered_from_available',v_recover,
    'debt_created',v_debt,
    'remaining_recovery_balance',case when v_bet.funding_source='bonus' then v_bonus.recovery_balance else v_wallet.recovery_balance end,
    'bet_status',v_status
  );
end;
$function$;

revoke all on function public.betnova_reconcile_bet_payout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.betnova_reconcile_bet_payout(uuid,text,text) to service_role,authenticated;
