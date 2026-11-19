-- BETNOVA arcade real-money rounds: server-side outcomes and atomic wallet settlement.
create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  game_id text not null check (game_id in ('crash','apple','plinko','lucky-fruits','pharaoh','space-spin','roulette','blackjack','baccarat')),
  currency text not null default 'DZD' check (currency = 'DZD'),
  stake numeric(18,2) not null check (stake > 0),
  payout numeric(18,2) not null default 0 check (payout >= 0),
  payout_multiplier numeric(12,4) not null default 0 check (payout_multiplier >= 0),
  outcome jsonb not null default '{}'::jsonb,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  constraint game_rounds_user_idempotency_key unique(user_id,idempotency_key)
);

alter table public.game_rounds enable row level security;
drop policy if exists "Users can view their own arcade rounds" on public.game_rounds;
create policy "Users can view their own arcade rounds"
  on public.game_rounds for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.game_rounds from anon, authenticated;
grant select on public.game_rounds to authenticated;

alter table public.wallet_ledger drop constraint if exists wallet_ledger_entry_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_entry_type_check
  check (entry_type = any (array[
    'deposit','withdrawal_reserve','withdrawal_release','withdrawal_paid',
    'bet_stake','bet_return','bonus','adjustment','refund','game_stake','game_payout'
  ]));

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
  elsif v_game in ('blackjack','baccarat') then
    raise exception 'Real-money table play is not enabled for this game yet';
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
