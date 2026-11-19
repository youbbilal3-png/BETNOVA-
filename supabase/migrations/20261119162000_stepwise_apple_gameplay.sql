-- Step-by-step Apple game with server-side trap positions and wallet settlement.
create table if not exists private.apple_round_secrets (
  round_id uuid primary key references public.game_rounds(id) on delete cascade,
  trap_columns integer[] not null,
  current_row integer not null default 0,
  last_pick_key uuid,
  last_pick_result jsonb,
  created_at timestamptz not null default now(),
  constraint apple_trap_columns_count check (array_length(trap_columns,1)=5),
  constraint apple_current_row_range check (current_row between 0 and 5),
  constraint apple_trap_columns_range check (trap_columns <@ array[0,1,2,3,4]::integer[])
);
revoke all on table private.apple_round_secrets from public, anon, authenticated;

create or replace function public.betnova_start_apple_round(p_stake numeric,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_user uuid:=auth.uid(); v_wallet public.wallet_accounts%rowtype; v_existing public.game_rounds%rowtype;
  v_active public.game_rounds%rowtype; v_round uuid:=gen_random_uuid(); v_now timestamptz:=clock_timestamp();
  v_stake numeric(18,2); v_traps integer[]:=array[]::integer[]; v_bytes bytea; v_roll bigint; v_i integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  if p_stake is null or p_stake<=0 or p_stake>1000000 or p_stake<>round(p_stake,2) then raise exception 'Invalid DZD stake'; end if;
  v_stake:=round(p_stake,2);
  insert into public.wallet_accounts(user_id,currency) values(v_user,'DZD') on conflict(user_id,currency) do nothing;
  select * into v_wallet from public.wallet_accounts where user_id=v_user and currency='DZD' for update;
  select * into v_existing from public.game_rounds where user_id=v_user and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.game_id<>'apple' or v_existing.stake<>v_stake then raise exception 'Idempotency key already used'; end if;
    return jsonb_build_object('round_id',v_existing.id,'status',v_existing.status,'stake',v_existing.stake,
      'current_row',coalesce((v_existing.outcome->>'current_row')::integer,0),'multiplier',coalesce(v_existing.payout_multiplier,0),
      'payout',v_existing.payout,'balance_after',v_wallet.available_balance,'replayed',true);
  end if;
  select * into v_active from public.game_rounds where user_id=v_user and game_id='apple' and status='active'
    order by started_at desc limit 1 for update;
  if found then raise exception 'You already have an active Apple round'; end if;
  if v_wallet.available_balance<v_stake then raise exception 'Insufficient available DZD balance'; end if;
  for v_i in 1..5 loop
    v_bytes:=extensions.gen_random_bytes(4);
    v_roll:=get_byte(v_bytes,0)::bigint*16777216+get_byte(v_bytes,1)::bigint*65536+get_byte(v_bytes,2)::bigint*256+get_byte(v_bytes,3)::bigint;
    v_traps:=array_append(v_traps,mod(v_roll,5)::integer);
  end loop;
  insert into public.game_rounds(id,user_id,game_id,currency,stake,payout,payout_multiplier,outcome,idempotency_key,status,started_at)
  values(v_round,v_user,'apple','DZD',v_stake,0,0,jsonb_build_object('result','ACTIVE','current_row',0,'multiplier',0),p_idempotency_key,'active',v_now);
  insert into private.apple_round_secrets(round_id,trap_columns) values(v_round,v_traps);
  update public.wallet_accounts set available_balance=available_balance-v_stake,updated_at=v_now where id=v_wallet.id returning * into v_wallet;
  insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description,created_by)
  values(v_wallet.id,v_user,'DZD','game_stake',-v_stake,v_wallet.available_balance,v_wallet.reserved_balance,'game_round',v_round,
    (md5(p_idempotency_key::text||':stake'))::uuid,'Apple game stake',v_user);
  return jsonb_build_object('round_id',v_round,'status','active','stake',v_stake,'current_row',0,'multiplier',0,'balance_after',v_wallet.available_balance,'replayed',false);
end;
$function$;

create or replace function public.betnova_pick_apple(p_round_id uuid,p_column integer,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_user uuid:=auth.uid(); v_wallet public.wallet_accounts%rowtype; v_round public.game_rounds%rowtype;
  v_secret private.apple_round_secrets%rowtype; v_row integer; v_multiplier numeric(12,4);
  v_payout numeric(18,2):=0; v_safe boolean; v_now timestamptz:=clock_timestamp(); v_response jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_round_id is null or p_idempotency_key is null then raise exception 'Round and request key are required'; end if;
  if p_column is null or p_column not between 0 and 4 then raise exception 'Choose one of the five apples'; end if;
  select * into v_wallet from public.wallet_accounts where user_id=v_user and currency='DZD' for update;
  if not found then raise exception 'Wallet not found'; end if;
  select * into v_round from public.game_rounds where id=p_round_id and user_id=v_user and game_id='apple' for update;
  if not found then raise exception 'Apple round not found'; end if;
  select * into v_secret from private.apple_round_secrets where round_id=p_round_id for update;
  if not found then raise exception 'Apple round integrity check failed'; end if;
  if v_secret.last_pick_key=p_idempotency_key and v_secret.last_pick_result is not null then return v_secret.last_pick_result; end if;
  if v_round.status<>'active' then raise exception 'Apple round is no longer active'; end if;
  if v_secret.current_row>=5 then raise exception 'All apple rows have already been cleared'; end if;
  v_row:=v_secret.current_row+1; v_safe:=v_secret.trap_columns[v_row]<>p_column;
  if not v_safe then
    update public.game_rounds set status='settled',settled_at=v_now,
      outcome=jsonb_build_object('result','TRAP_FOUND','safe',false,'current_row',v_row,'selected_column',p_column)
      where id=p_round_id returning * into v_round;
    v_response:=jsonb_build_object('round_id',p_round_id,'status','settled','safe',false,'won',false,'current_row',v_row,
      'stake',v_round.stake,'payout',0,'multiplier',0,'net_result',-v_round.stake,'result','TRAP_FOUND','balance_after',v_wallet.available_balance);
  else
    v_multiplier:=round(0.95/power(0.8::numeric,v_row),4);
    if v_row=5 then
      v_payout:=round(v_round.stake*v_multiplier,2);
      update public.wallet_accounts set available_balance=available_balance+v_payout,updated_at=v_now where id=v_wallet.id returning * into v_wallet;
      insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description,created_by)
      values(v_wallet.id,v_user,'DZD','game_payout',v_payout,v_wallet.available_balance,v_wallet.reserved_balance,'game_round',p_round_id,
        (md5(p_idempotency_key::text||':payout'))::uuid,'Apple game payout',v_user);
      update public.game_rounds set status='settled',settled_at=v_now,payout=v_payout,payout_multiplier=v_multiplier,
        outcome=jsonb_build_object('result','APPLE_COMPLETE','safe',true,'current_row',v_row,'multiplier',v_multiplier)
        where id=p_round_id returning * into v_round;
    else
      update public.game_rounds set outcome=jsonb_build_object('result','SAFE_PICK','safe',true,'current_row',v_row,'multiplier',v_multiplier,'selected_column',p_column)
        where id=p_round_id returning * into v_round;
    end if;
    v_response:=jsonb_build_object('round_id',p_round_id,'status',v_round.status,'safe',true,'won',v_row=5,'current_row',v_row,
      'stake',v_round.stake,'payout',v_round.payout,'multiplier',v_multiplier,'potential_payout',round(v_round.stake*v_multiplier,2),
      'net_result',v_round.payout-v_round.stake,'result',case when v_row=5 then 'APPLE_COMPLETE' else 'SAFE_PICK' end,'balance_after',v_wallet.available_balance);
  end if;
  update private.apple_round_secrets set current_row=v_row,last_pick_key=p_idempotency_key,last_pick_result=v_response where round_id=p_round_id;
  return v_response;
end;
$function$;

create or replace function public.betnova_cashout_apple_round(p_round_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_user uuid:=auth.uid(); v_wallet public.wallet_accounts%rowtype; v_round public.game_rounds%rowtype;
  v_secret private.apple_round_secrets%rowtype; v_multiplier numeric(12,4); v_payout numeric(18,2); v_now timestamptz:=clock_timestamp();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_round_id is null or p_idempotency_key is null then raise exception 'Round and request key are required'; end if;
  select * into v_wallet from public.wallet_accounts where user_id=v_user and currency='DZD' for update;
  if not found then raise exception 'Wallet not found'; end if;
  select * into v_round from public.game_rounds where id=p_round_id and user_id=v_user and game_id='apple' for update;
  if not found then raise exception 'Apple round not found'; end if;
  if v_round.cashout_idempotency_key=p_idempotency_key then
    return jsonb_build_object('round_id',p_round_id,'status',v_round.status,'stake',v_round.stake,'payout',v_round.payout,
      'multiplier',v_round.payout_multiplier,'net_result',v_round.payout-v_round.stake,'result','CASHED_OUT','balance_after',v_wallet.available_balance,'replayed',true);
  end if;
  if v_round.status<>'active' then raise exception 'Apple round is no longer active'; end if;
  select * into v_secret from private.apple_round_secrets where round_id=p_round_id for update;
  if not found or v_secret.current_row<1 then raise exception 'Clear at least one row before cashing out'; end if;
  v_multiplier:=round(0.95/power(0.8::numeric,v_secret.current_row),4);v_payout:=round(v_round.stake*v_multiplier,2);
  update public.wallet_accounts set available_balance=available_balance+v_payout,updated_at=v_now where id=v_wallet.id returning * into v_wallet;
  update public.game_rounds set status='settled',settled_at=v_now,payout=v_payout,payout_multiplier=v_multiplier,cashout_idempotency_key=p_idempotency_key,
    outcome=jsonb_build_object('result','CASHED_OUT','safe',true,'current_row',v_secret.current_row,'multiplier',v_multiplier)
    where id=p_round_id returning * into v_round;
  insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description,created_by)
  values(v_wallet.id,v_user,'DZD','game_payout',v_payout,v_wallet.available_balance,v_wallet.reserved_balance,'game_round',p_round_id,
    (md5(p_idempotency_key::text||':payout'))::uuid,'Apple game cash-out',v_user);
  return jsonb_build_object('round_id',p_round_id,'status','settled','stake',v_round.stake,'payout',v_payout,'multiplier',v_multiplier,
    'net_result',v_payout-v_round.stake,'result','CASHED_OUT','current_row',v_secret.current_row,'balance_after',v_wallet.available_balance,'replayed',false);
end;
$function$;

revoke all on function public.betnova_start_apple_round(numeric,uuid) from public,anon;
revoke all on function public.betnova_pick_apple(uuid,integer,uuid) from public,anon;
revoke all on function public.betnova_cashout_apple_round(uuid,uuid) from public,anon;
grant execute on function public.betnova_start_apple_round(numeric,uuid) to authenticated;
grant execute on function public.betnova_pick_apple(uuid,integer,uuid) to authenticated;
grant execute on function public.betnova_cashout_apple_round(uuid,uuid) to authenticated;
