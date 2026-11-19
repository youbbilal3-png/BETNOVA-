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
    if v_choice not in ('1.20','1.50','2.00','3.00','5.00','10.00') then raise exception 'Choose a supported crash cash-out target'; end if;
    v_multiplier := v_choice::numeric;
    v_probability := 0.95 / v_multiplier;
    v_threshold := floor(1000000*v_probability)::bigint;
    v_is_win := v_roll < v_threshold;
    v_result := case when v_is_win then 'CASHED_OUT' else 'CRASHED' end;
    v_details := jsonb_build_object('target',v_multiplier,'win_probability',round(v_probability*100,2));
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
    raise exception 'Real-money blackjack is not enabled until hit/stand round settlement is implemented';
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

revoke all on function public.betnova_play_arcade_round(text,numeric,text,uuid) from public, anon;
grant execute on function public.betnova_play_arcade_round(text,numeric,text,uuid) to authenticated;
