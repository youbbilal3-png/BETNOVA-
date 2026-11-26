-- Increase Crash flight pace for new rounds while preserving the original curve for already-running rounds.
CREATE OR REPLACE FUNCTION public.betnova_cashout_crash_round(p_round_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_wallet public.wallet_accounts%rowtype;
  v_round public.game_rounds%rowtype;
  v_crash_point numeric(12,2);
  v_now timestamptz := clock_timestamp();
  v_elapsed numeric;
  v_multiplier numeric(12,2);
  v_payout numeric(18,2) := 0;
  v_result text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_round_id is null or p_idempotency_key is null then raise exception 'Round and idempotency key are required'; end if;

  select * into v_round from public.game_rounds
  where id=p_round_id and user_id=v_user and game_id='crash';
  if not found then raise exception 'Crash round not found'; end if;

  insert into public.wallet_accounts(user_id,currency)
  values(v_user,'DZD') on conflict(user_id,currency) do nothing;
  select * into v_wallet from public.wallet_accounts
  where user_id=v_user and currency='DZD' for update;

  select * into v_round from public.game_rounds
  where id=p_round_id and user_id=v_user and game_id='crash'
  for update;

  if v_round.cashout_idempotency_key is not null and v_round.cashout_idempotency_key=p_idempotency_key then
    return jsonb_build_object(
      'round_id',v_round.id,'status',v_round.status,'stake',v_round.stake,
      'payout',v_round.payout,'multiplier',v_round.payout_multiplier,
      'net_result',v_round.payout-v_round.stake,'result',v_round.outcome->>'result',
      'balance_after',v_wallet.available_balance,'replayed',true
    );
  end if;

  if v_round.status <> 'active' then
    return jsonb_build_object(
      'round_id',v_round.id,'status',v_round.status,'stake',v_round.stake,
      'payout',v_round.payout,'multiplier',v_round.payout_multiplier,
      'net_result',v_round.payout-v_round.stake,'result',v_round.outcome->>'result',
      'balance_after',v_wallet.available_balance,'replayed',true
    );
  end if;

  select crash_point into v_crash_point
  from private.crash_round_secrets where round_id=v_round.id;
  if v_crash_point is null then raise exception 'Crash round integrity check failed'; end if;

  v_elapsed := greatest(0,extract(epoch from (v_now-v_round.started_at)));
  v_multiplier := floor(exp(v_elapsed*coalesce((v_round.outcome->>'curve_rate')::numeric,0.06))*100)/100;

  if v_multiplier >= v_crash_point then
    v_result := 'CRASHED';
    update public.game_rounds
    set status='crashed',settled_at=v_now,cashout_idempotency_key=p_idempotency_key,
        payout=0,payout_multiplier=0,
        outcome=jsonb_build_object('result',v_result,'server_multiplier',v_multiplier)
    where id=v_round.id returning * into v_round;
  else
    v_result := 'CASHED_OUT';
    v_payout := round(v_round.stake*v_multiplier,2);
    update public.wallet_accounts
    set available_balance=available_balance+v_payout,updated_at=v_now
    where id=v_wallet.id returning * into v_wallet;

    insert into public.wallet_ledger(
      wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
      reference_type,reference_id,idempotency_key,description,created_by
    ) values (
      v_wallet.id,v_user,'DZD','game_payout',v_payout,v_wallet.available_balance,
      v_wallet.reserved_balance,'game_round',v_round.id,
      (md5(p_idempotency_key::text||':payout'))::uuid,'Crash cash-out payout',v_user
    );

    update public.game_rounds
    set status='settled',settled_at=v_now,cashout_idempotency_key=p_idempotency_key,
        payout=v_payout,payout_multiplier=v_multiplier,
        outcome=jsonb_build_object('result',v_result,'cashout_multiplier',v_multiplier)
    where id=v_round.id returning * into v_round;
  end if;

  return jsonb_build_object(
    'round_id',v_round.id,'status',v_round.status,'stake',v_round.stake,
    'payout',v_round.payout,'multiplier',v_round.payout_multiplier,
    'net_result',v_round.payout-v_round.stake,'result',v_round.outcome->>'result',
    'server_multiplier',v_multiplier,'balance_after',v_wallet.available_balance,'replayed',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.betnova_resume_crash_round()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_wallet public.wallet_accounts%rowtype;
  v_round public.game_rounds%rowtype;
  v_crash_point numeric(12,2);
  v_now timestamptz := clock_timestamp();
  v_multiplier numeric(12,2);
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_wallet from public.wallet_accounts
  where user_id=v_user and currency='DZD' for update;
  if not found then
    return jsonb_build_object('status','none','balance_after',0,'server_now',v_now);
  end if;
  select * into v_round from public.game_rounds
  where user_id=v_user and game_id='crash' and status='active'
  order by started_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('status','none','balance_after',v_wallet.available_balance,'server_now',v_now);
  end if;
  select crash_point into v_crash_point from private.crash_round_secrets where round_id=v_round.id;
  if v_crash_point is null then raise exception 'Crash round integrity check failed'; end if;
  v_multiplier := floor(exp(greatest(0,extract(epoch from (v_now-v_round.started_at)))*coalesce((v_round.outcome->>'curve_rate')::numeric,0.06))*100)/100;
  if v_multiplier >= v_crash_point then
    update public.game_rounds
    set status='crashed',settled_at=v_now,
        outcome=jsonb_build_object('result','CRASHED','server_multiplier',v_multiplier)
    where id=v_round.id returning * into v_round;
    return jsonb_build_object(
      'status','crashed','round_id',v_round.id,'stake',v_round.stake,
      'multiplier',v_multiplier,'balance_after',v_wallet.available_balance,'server_now',v_now
    );
  end if;
  return jsonb_build_object(
    'status','active','round_id',v_round.id,'stake',v_round.stake,
    'started_at',v_round.started_at,'multiplier',v_multiplier,
    'balance_after',v_wallet.available_balance,'server_now',v_now
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.betnova_start_crash_round(p_stake numeric, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_wallet public.wallet_accounts%rowtype;
  v_existing public.game_rounds%rowtype;
  v_active public.game_rounds%rowtype;
  v_secret numeric(12,2);
  v_bytes bytea;
  v_roll bigint;
  v_round uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_stake numeric(18,2);
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  if p_stake is null or p_stake <= 0 or p_stake > 1000000 or p_stake <> round(p_stake,2) then
    raise exception 'Stake must be positive DZD with at most two decimals and no more than 1,000,000 DZD';
  end if;
  v_stake := round(p_stake,2);

  insert into public.wallet_accounts(user_id,currency)
  values(v_user,'DZD') on conflict(user_id,currency) do nothing;
  select * into v_wallet from public.wallet_accounts
  where user_id=v_user and currency='DZD' for update;

  select * into v_existing from public.game_rounds
  where user_id=v_user and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.game_id <> 'crash' or v_existing.stake <> v_stake then
      raise exception 'Idempotency key was already used for a different round';
    end if;
    return jsonb_build_object(
      'round_id',v_existing.id,'status',v_existing.status,'stake',v_existing.stake,
      'started_at',v_existing.started_at,'server_now',clock_timestamp(),
      'balance_after',v_wallet.available_balance,'replayed',true
    );
  end if;

  select * into v_active from public.game_rounds
  where user_id=v_user and game_id='crash' and status='active'
  for update;
  if found then
    select crash_point into v_secret from private.crash_round_secrets where round_id=v_active.id;
    if v_secret is null then raise exception 'Crash round integrity check failed'; end if;
    if floor(exp(greatest(0,extract(epoch from (v_now-v_active.started_at)))*coalesce((v_active.outcome->>'curve_rate')::numeric,0.06))*100)/100 >= v_secret then
      update public.game_rounds
      set status='crashed',settled_at=v_now,
          outcome=jsonb_build_object('result','CRASHED','crash_at',v_secret,'reason','round_expired')
      where id=v_active.id;
    else
      raise exception 'You already have an active Crash round';
    end if;
  end if;

  if v_wallet.available_balance < v_stake then raise exception 'Insufficient available DZD balance'; end if;

  v_bytes := extensions.gen_random_bytes(4);
  v_roll := mod(
    get_byte(v_bytes,0)::bigint*16777216 +
    get_byte(v_bytes,1)::bigint*65536 +
    get_byte(v_bytes,2)::bigint*256 +
    get_byte(v_bytes,3)::bigint,1000000
  );
  -- Crash survival curve: P(crash point >= x) is approximately 0.95/x.
  v_secret := least(100.00::numeric,floor(95000000::numeric/(1000000-v_roll))::numeric/100);

  insert into public.game_rounds(
    id,user_id,game_id,currency,stake,payout,payout_multiplier,outcome,
    idempotency_key,status,started_at
  ) values (
    v_round,v_user,'crash','DZD',v_stake,0,0,
    jsonb_build_object('result','ACTIVE','game','CRASH','multiplier_curve','exp(0.075*t)','curve_rate',0.075),
    p_idempotency_key,'active',v_now
  );

  insert into private.crash_round_secrets(round_id,crash_point)
  values(v_round,v_secret);

  update public.wallet_accounts
  set available_balance=available_balance-v_stake,updated_at=v_now
  where id=v_wallet.id returning * into v_wallet;

  insert into public.wallet_ledger(
    wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
    reference_type,reference_id,idempotency_key,description,created_by
  ) values (
    v_wallet.id,v_user,'DZD','game_stake',-v_stake,v_wallet.available_balance,
    v_wallet.reserved_balance,'game_round',v_round,
    (md5(p_idempotency_key::text||':stake'))::uuid,'Crash stake',v_user
  );

  return jsonb_build_object(
    'round_id',v_round,'status','active','stake',v_stake,
    'started_at',v_now,'server_now',clock_timestamp(),
    'balance_after',v_wallet.available_balance,'replayed',false
  );
end;
$function$
;

