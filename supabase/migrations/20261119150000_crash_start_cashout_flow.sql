-- Real-time Crash: stake at launch, server-timed multiplier, cash out before crash.
alter table public.game_rounds
  add column if not exists status text not null default 'settled',
  add column if not exists started_at timestamptz,
  add column if not exists settled_at timestamptz,
  add column if not exists cashout_idempotency_key uuid;

alter table public.game_rounds
  add constraint game_rounds_status_check check (status in ('active','settled','crashed'));

create unique index if not exists game_rounds_one_active_crash_per_user
  on public.game_rounds(user_id)
  where game_id='crash' and status='active';

create unique index if not exists game_rounds_cashout_idempotency
  on public.game_rounds(user_id,cashout_idempotency_key)
  where cashout_idempotency_key is not null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.crash_round_secrets (
  round_id uuid primary key references public.game_rounds(id) on delete cascade,
  crash_point numeric(12,2) not null check (crash_point > 0),
  created_at timestamptz not null default now()
);
revoke all on table private.crash_round_secrets from public, anon, authenticated;
alter table private.crash_round_secrets enable row level security;

create or replace function public.betnova_start_crash_round(
  p_stake numeric,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
    if floor(exp(greatest(0,extract(epoch from (v_now-v_active.started_at)))*0.06)*100)/100 >= v_secret then
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
  v_secret := floor(95000000::numeric/(1000000-v_roll))::numeric/100;

  insert into public.game_rounds(
    id,user_id,game_id,currency,stake,payout,payout_multiplier,outcome,
    idempotency_key,status,started_at
  ) values (
    v_round,v_user,'crash','DZD',v_stake,0,0,
    jsonb_build_object('result','ACTIVE','game','CRASH','multiplier_curve','exp(0.06*t)'),
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
$function$;

create or replace function public.betnova_cashout_crash_round(
  p_round_id uuid,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  v_multiplier := floor(exp(v_elapsed*0.06)*100)/100;

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
$function$;

create or replace function public.betnova_resume_crash_round()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  v_multiplier := floor(exp(greatest(0,extract(epoch from (v_now-v_round.started_at)))*0.06)*100)/100;
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
$function$;

create or replace function public.betnova_play_arcade_round(
  p_game_id text,
  p_stake numeric,
  p_choice text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_wallet public.wallet_accounts%rowtype;
  v_existing public.game_rounds%rowtype;
  v_round_id uuid := gen_random_uuid();
  v_bytes bytea;
  v_roll bigint;
  v_game text := lower(coalesce(p_game_id,''));
  v_choice text := lower(coalesce(p_choice,'standard'));
  v_stake numeric(18,2);
  v_probability numeric;
  v_threshold bigint;
  v_multiplier numeric(12,4) := 0;
  v_payout numeric(18,2) := 0;
  v_is_win boolean := false;
  v_result text := 'LOSS';
  v_details jsonb := '{}'::jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  if v_game not in ('crash','apple','plinko','lucky-fruits','pharaoh','space-spin','roulette','blackjack','baccarat') then
    raise exception 'Unsupported arcade game';
  end if;
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
    if v_existing.game_id <> v_game or v_existing.stake <> v_stake then
      raise exception 'Idempotency key was already used for a different arcade round';
    end if;
    return jsonb_build_object(
      'round_id',v_existing.id,'game_id',v_existing.game_id,'stake',v_existing.stake,
      'payout',v_existing.payout,'multiplier',v_existing.payout_multiplier,
      'outcome',v_existing.outcome,'balance_after',v_wallet.available_balance,
      'replayed',true
    );
  end if;
  if v_wallet.available_balance < v_stake then raise exception 'Insufficient available DZD balance'; end if;

  v_bytes := extensions.gen_random_bytes(4);
  v_roll := mod(
    get_byte(v_bytes,0)::bigint*16777216 +
    get_byte(v_bytes,1)::bigint*65536 +
    get_byte(v_bytes,2)::bigint*256 +
    get_byte(v_bytes,3)::bigint,
    1000000
  );

  -- Each game's published paytable is fixed. No player-specific odds or post-bet changes.
  if v_game='crash' then
    raise exception 'Use the dedicated start and cash-out Crash round flow';
  elsif v_game='apple' then
    if v_choice not in ('1','2','3','4','5') then raise exception 'Choose between one and five safe rows'; end if;
    v_probability := power(0.8,v_choice::integer);
    v_multiplier := round(0.95/v_probability,4);
    v_threshold := floor(1000000*v_probability)::bigint;
    v_is_win := v_roll < v_threshold;
    v_result := case when v_is_win then 'SAFE_PATH' else 'TRAP_FOUND' end;
    v_details := jsonb_build_object('safe_rows',v_choice::integer,'win_probability',round(v_probability*100,2));
  elsif v_game='plinko' then
    if v_choice not in ('low','medium','high') then raise exception 'Choose low, medium, or high risk'; end if;
    v_probability := case v_choice when 'low' then 0.8 when 'medium' then 0.5 else 0.25 end;
    v_multiplier := round(0.95/v_probability,4);
    v_threshold := floor(1000000*v_probability)::bigint;
    v_is_win := v_roll < v_threshold;
    v_result := case when v_is_win then 'WINNING_SLOT' else 'EMPTY_SLOT' end;
    v_details := jsonb_build_object('risk',v_choice,'win_probability',round(v_probability*100,2));
  elsif v_game='lucky-fruits' then
    if v_roll < 550000 then v_multiplier:=0; v_result:='NO_MATCH';
    elsif v_roll < 800000 then v_multiplier:=1.5; v_result:='FRUIT_PAIR';
    elsif v_roll < 950000 then v_multiplier:=2; v_result:='FRUIT_TRIPLE';
    else v_multiplier:=5.5; v_result:='JACKPOT'; end if;
    v_is_win := v_multiplier>0;
    v_details := jsonb_build_object('tier',v_result,'published_rtp',95);
  elsif v_game='pharaoh' then
    if v_roll < 700000 then v_multiplier:=0; v_result:='NO_PRIZE';
    elsif v_roll < 900000 then v_multiplier:=1.5; v_result:='SCARAB';
    elsif v_roll < 980000 then v_multiplier:=3; v_result:='ROYAL_TREASURE';
    else v_multiplier:=20.5; v_result:='PHARAOH_JACKPOT'; end if;
    v_is_win := v_multiplier>0;
    v_details := jsonb_build_object('tier',v_result,'published_rtp',95);
  elsif v_game='space-spin' then
    if v_roll < 600000 then v_multiplier:=0; v_result:='EMPTY_SPACE';
    elsif v_roll < 900000 then v_multiplier:=1.5; v_result:='STAR_PAIR';
    elsif v_roll < 990000 then v_multiplier:=3; v_result:='PLANET_TRIPLE';
    else v_multiplier:=23; v_result:='COSMIC_JACKPOT'; end if;
    v_is_win := v_multiplier>0;
    v_details := jsonb_build_object('tier',v_result,'published_rtp',95);
  elsif v_game='roulette' then
    if v_choice not in ('red','black') then raise exception 'Choose red or black'; end if;
    v_bytes := extensions.gen_random_bytes(4);
    v_roll := mod(get_byte(v_bytes,0)::bigint*16777216 + get_byte(v_bytes,1)::bigint*65536 + get_byte(v_bytes,2)::bigint*256 + get_byte(v_bytes,3)::bigint,37);
    v_is_win := (v_choice='red' and v_roll in (1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36))
      or (v_choice='black' and v_roll in (2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35));
    v_multiplier := case when v_is_win then 1.95 else 0 end;
    v_result := case when v_roll=0 then 'ZERO' when v_is_win then 'WIN' else 'LOSE' end;
    v_details := jsonb_build_object('number',v_roll,'color',case when v_roll=0 then 'green' when v_roll in (1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36) then 'red' else 'black' end,'selection',v_choice,'published_rtp',round((18::numeric/37)*1.95*100,2));
  elsif v_game='baccarat' then
    if v_choice not in ('player','banker','tie') then raise exception 'Choose player, banker, or tie'; end if;
    declare
      v_player_cards integer[] := array[]::integer[];
      v_banker_cards integer[] := array[]::integer[];
      v_player_total integer := 0;
      v_banker_total integer := 0;
      v_player_third integer := null;
      v_card_value integer;
      v_draw_banker boolean := false;
      v_i integer;
      v_winner text;
    begin
      for v_i in 1..2 loop
        v_bytes:=extensions.gen_random_bytes(4);
        v_roll:=mod(get_byte(v_bytes,0)::bigint*16777216+get_byte(v_bytes,1)::bigint*65536+get_byte(v_bytes,2)::bigint*256+get_byte(v_bytes,3)::bigint,13);
        v_card_value:=case when v_roll>=9 then 0 else v_roll::integer+1 end;
        v_player_cards:=array_append(v_player_cards,v_card_value);
        v_bytes:=extensions.gen_random_bytes(4);
        v_roll:=mod(get_byte(v_bytes,0)::bigint*16777216+get_byte(v_bytes,1)::bigint*65536+get_byte(v_bytes,2)::bigint*256+get_byte(v_bytes,3)::bigint,13);
        v_card_value:=case when v_roll>=9 then 0 else v_roll::integer+1 end;
        v_banker_cards:=array_append(v_banker_cards,v_card_value);
      end loop;
      select mod(coalesce(sum(x),0),10) into v_player_total from unnest(v_player_cards) x;
      select mod(coalesce(sum(x),0),10) into v_banker_total from unnest(v_banker_cards) x;
      if v_player_total<8 and v_banker_total<8 then
        if v_player_total<=5 then
          v_bytes:=extensions.gen_random_bytes(4);
          v_roll:=mod(get_byte(v_bytes,0)::bigint*16777216+get_byte(v_bytes,1)::bigint*65536+get_byte(v_bytes,2)::bigint*256+get_byte(v_bytes,3)::bigint,13);
          v_player_third:=case when v_roll>=9 then 0 else v_roll::integer+1 end;
          v_player_cards:=array_append(v_player_cards,v_player_third);
          v_player_total:=mod(v_player_total+v_player_third,10);
          v_draw_banker:=v_banker_total<=2
            or (v_banker_total=3 and v_player_third<>8)
            or (v_banker_total=4 and v_player_third between 2 and 7)
            or (v_banker_total=5 and v_player_third between 4 and 7)
            or (v_banker_total=6 and v_player_third between 6 and 7);
        else
          v_draw_banker:=v_banker_total<=5;
        end if;
        if v_draw_banker then
          v_bytes:=extensions.gen_random_bytes(4);
          v_roll:=mod(get_byte(v_bytes,0)::bigint*16777216+get_byte(v_bytes,1)::bigint*65536+get_byte(v_bytes,2)::bigint*256+get_byte(v_bytes,3)::bigint,13);
          v_card_value:=case when v_roll>=9 then 0 else v_roll::integer+1 end;
          v_banker_cards:=array_append(v_banker_cards,v_card_value);
          v_banker_total:=mod(v_banker_total+v_card_value,10);
        end if;
      end if;
      v_winner:=case when v_player_total>v_banker_total then 'player' when v_banker_total>v_player_total then 'banker' else 'tie' end;
      v_is_win:=v_choice=v_winner;
      v_multiplier:=case when not v_is_win then 0 when v_choice='player' then 2.1293 when v_choice='banker' then 2.0723 else 9.9554 end;
      v_result:=upper(v_winner)||'_WIN';
      v_details:=jsonb_build_object('player_cards',to_jsonb(v_player_cards),'banker_cards',to_jsonb(v_banker_cards),'player_total',v_player_total,'banker_total',v_banker_total,'selection',v_choice,'winner',v_winner,'published_rtp',95,'round_type','standard_baccarat');
    end;
  elsif v_game='blackjack' then
    if v_choice not in ('hit','stand') then raise exception 'Choose hit once or stand'; end if;
    declare
      v_player_cards integer[] := array[]::integer[];
      v_dealer_cards integer[] := array[]::integer[];
      v_player_total integer := 0;
      v_dealer_total integer := 0;
      v_player_aces integer := 0;
      v_dealer_aces integer := 0;
      v_card_rank integer;
      v_card_value integer;
      v_player_natural boolean := false;
      v_dealer_natural boolean := false;
      v_winner text;
      v_i integer;
    begin
      for v_i in 1..2 loop
        v_bytes:=extensions.gen_random_bytes(4);
        v_roll:=mod(get_byte(v_bytes,0)::bigint*16777216+get_byte(v_bytes,1)::bigint*65536+get_byte(v_bytes,2)::bigint*256+get_byte(v_bytes,3)::bigint,13);
        v_card_rank:=v_roll::integer+1;
        v_card_value:=case when v_card_rank=1 then 11 when v_card_rank>=10 then 10 else v_card_rank end;
        v_player_cards:=array_append(v_player_cards,v_card_value);
        v_bytes:=extensions.gen_random_bytes(4);
        v_roll:=mod(get_byte(v_bytes,0)::bigint*16777216+get_byte(v_bytes,1)::bigint*65536+get_byte(v_bytes,2)::bigint*256+get_byte(v_bytes,3)::bigint,13);
        v_card_rank:=v_roll::integer+1;
        v_card_value:=case when v_card_rank=1 then 11 when v_card_rank>=10 then 10 else v_card_rank end;
        v_dealer_cards:=array_append(v_dealer_cards,v_card_value);
      end loop;
      select coalesce(sum(x),0),count(*) filter(where x=11) into v_player_total,v_player_aces from unnest(v_player_cards) x;
      select coalesce(sum(x),0),count(*) filter(where x=11) into v_dealer_total,v_dealer_aces from unnest(v_dealer_cards) x;
      while v_player_total>21 and v_player_aces>0 loop v_player_total:=v_player_total-10;v_player_aces:=v_player_aces-1;end loop;
      while v_dealer_total>21 and v_dealer_aces>0 loop v_dealer_total:=v_dealer_total-10;v_dealer_aces:=v_dealer_aces-1;end loop;
      v_player_natural:=v_player_total=21;
      v_dealer_natural:=v_dealer_total=21;
      if v_choice='hit' and not v_player_natural then
        v_bytes:=extensions.gen_random_bytes(4);
        v_roll:=mod(get_byte(v_bytes,0)::bigint*16777216+get_byte(v_bytes,1)::bigint*65536+get_byte(v_bytes,2)::bigint*256+get_byte(v_bytes,3)::bigint,13);
        v_card_rank:=v_roll::integer+1;
        v_card_value:=case when v_card_rank=1 then 11 when v_card_rank>=10 then 10 else v_card_rank end;
        v_player_cards:=array_append(v_player_cards,v_card_value);
        v_player_total:=v_player_total+v_card_value;
        if v_card_value=11 then v_player_aces:=v_player_aces+1;end if;
        while v_player_total>21 and v_player_aces>0 loop v_player_total:=v_player_total-10;v_player_aces:=v_player_aces-1;end loop;
      end if;
      while v_dealer_total<17 loop
        v_bytes:=extensions.gen_random_bytes(4);
        v_roll:=mod(get_byte(v_bytes,0)::bigint*16777216+get_byte(v_bytes,1)::bigint*65536+get_byte(v_bytes,2)::bigint*256+get_byte(v_bytes,3)::bigint,13);
        v_card_rank:=v_roll::integer+1;
        v_card_value:=case when v_card_rank=1 then 11 when v_card_rank>=10 then 10 else v_card_rank end;
        v_dealer_cards:=array_append(v_dealer_cards,v_card_value);
        v_dealer_total:=v_dealer_total+v_card_value;
        if v_card_value=11 then v_dealer_aces:=v_dealer_aces+1;end if;
        while v_dealer_total>21 and v_dealer_aces>0 loop v_dealer_total:=v_dealer_total-10;v_dealer_aces:=v_dealer_aces-1;end loop;
      end loop;
      if v_player_natural and v_dealer_natural then
        v_is_win:=true;v_multiplier:=1;v_result:='PUSH';
      elsif v_player_natural then
        v_is_win:=true;v_multiplier:=2.5;v_result:='BLACKJACK';
      elsif v_player_total>21 then
        v_is_win:=false;v_multiplier:=0;v_result:='BUST';
      elsif v_dealer_total>21 or v_player_total>v_dealer_total then
        v_is_win:=true;v_multiplier:=case when v_choice='stand' then 2.3407 else 2.9957 end;v_result:='PLAYER_WIN';
      elsif v_player_total=v_dealer_total then
        v_is_win:=true;v_multiplier:=1;v_result:='PUSH';
      else
        v_is_win:=false;v_multiplier:=0;v_result:='DEALER_WIN';
      end if;
      v_details:=jsonb_build_object('player_cards',to_jsonb(v_player_cards),'dealer_cards',to_jsonb(v_dealer_cards),'player_total',v_player_total,'dealer_total',v_dealer_total,'action',v_choice,'rule','single_hit_blackjack','published_rtp',95,'natural_payout',2.5,'push_payout',1);
    end;
  end if;

  if v_is_win then v_payout:=round(v_stake*v_multiplier,2); else v_payout:=0; end if;
  insert into public.game_rounds(id,user_id,game_id,currency,stake,payout,payout_multiplier,outcome,idempotency_key)
  values(v_round_id,v_user,v_game,'DZD',v_stake,v_payout,case when v_is_win then v_multiplier else 0 end,
    jsonb_build_object('result',v_result,'won',v_is_win,'choice',v_choice,'details',v_details),p_idempotency_key);

  update public.wallet_accounts set available_balance=available_balance-v_stake,updated_at=now()
  where id=v_wallet.id returning * into v_wallet;
  insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description,created_by)
  values(v_wallet.id,v_user,'DZD','game_stake',-v_stake,v_wallet.available_balance,v_wallet.reserved_balance,'game_round',v_round_id,
    (md5(p_idempotency_key::text||':stake'))::uuid,'Arcade stake · '||v_game,v_user);

  if v_payout>0 then
    update public.wallet_accounts set available_balance=available_balance+v_payout,updated_at=now()
    where id=v_wallet.id returning * into v_wallet;
    insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description,created_by)
    values(v_wallet.id,v_user,'DZD','game_payout',v_payout,v_wallet.available_balance,v_wallet.reserved_balance,'game_round',v_round_id,
      (md5(p_idempotency_key::text||':payout'))::uuid,'Arcade payout · '||v_game,v_user);
  end if;

  return jsonb_build_object(
    'round_id',v_round_id,'game_id',v_game,'stake',v_stake,'payout',v_payout,
    'multiplier',case when v_is_win then v_multiplier else 0 end,'net_result',v_payout-v_stake,
    'won',v_is_win,'result',v_result,'details',v_details,
    'balance_after',v_wallet.available_balance,'replayed',false
  );
end;
$function$;

revoke all on function public.betnova_play_arcade_round(text,numeric,text,uuid) from public,anon;
grant execute on function public.betnova_play_arcade_round(text,numeric,text,uuid) to authenticated;
