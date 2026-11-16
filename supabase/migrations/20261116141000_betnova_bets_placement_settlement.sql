create table if not exists public.bets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete restrict,
 currency text not null check(currency in ('DZD','USD','EUR')),
 stake numeric(18,2) not null check(stake>0),
 combined_odds numeric(18,6) not null check(combined_odds>1),
 potential_return numeric(18,2) not null check(potential_return>0),
 status text not null default 'pending' check(status in ('pending','won','lost','void')),
 idempotency_key uuid not null unique,
 settled_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.bet_legs (
 id uuid primary key default gen_random_uuid(),
 bet_id uuid not null references public.bets(id) on delete restrict,
 fixture_id uuid not null references public.fixtures(id) on delete restrict,
 market_id uuid not null references public.markets(id) on delete restrict,
 selection_id uuid not null references public.market_selections(id) on delete restrict,
 market_label text not null,
 selection_label text not null,
 odds_snapshot numeric(18,6) not null check(odds_snapshot>1),
 result_status text not null default 'pending' check(result_status in ('pending','won','lost','void')),
 settled_at timestamptz,
 created_at timestamptz not null default now(),
 unique(bet_id,selection_id)
);
create index if not exists bets_user_created_idx on public.bets(user_id,created_at desc);
create index if not exists bet_legs_market_status_idx on public.bet_legs(market_id,result_status);
create index if not exists bet_legs_bet_status_idx on public.bet_legs(bet_id,result_status);
alter table public.bets enable row level security;
alter table public.bet_legs enable row level security;
drop policy if exists "Users read own bets" on public.bets;
create policy "Users read own bets" on public.bets for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "Users read own bet legs" on public.bet_legs;
create policy "Users read own bet legs" on public.bet_legs for select to authenticated
using(exists(select 1 from public.bets b where b.id=bet_legs.bet_id and b.user_id=(select auth.uid())));
grant select on public.bets,public.bet_legs to authenticated;
revoke insert,update,delete on public.bets,public.bet_legs from anon,authenticated;

create or replace function public.betnova_place_bet(p_selections jsonb,p_stake numeric,p_currency text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid(); v_bet_id uuid:=gen_random_uuid(); v_wallet public.wallet_accounts%rowtype;
 v_item jsonb; v_selection_id uuid; v_fixture_id uuid; v_market_id uuid;
 v_odds numeric; v_combined numeric:=1; v_count integer:=0;
 v_market_label text; v_selection_label text; v_fixture_status text; v_starts_at timestamptz; v_market_live boolean;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
 if p_currency not in ('DZD','USD','EUR') or p_stake is null or p_stake<=0 or p_stake>100000000 then raise exception 'Invalid stake or currency'; end if;
 if p_selections is null or jsonb_typeof(p_selections)<>'array' or jsonb_array_length(p_selections)<1 or jsonb_array_length(p_selections)>20 then raise exception 'Select between 1 and 20 outcomes'; end if;
 select id into v_bet_id from public.bets where user_id=v_user and idempotency_key=p_idempotency_key;
 if found then return v_bet_id; end if;
 insert into public.wallet_accounts(user_id,currency) values(v_user,p_currency) on conflict(user_id,currency) do nothing;
 select * into v_wallet from public.wallet_accounts where user_id=v_user and currency=p_currency for update;
 if v_wallet.available_balance<p_stake then raise exception 'Insufficient available balance'; end if;
 for v_item in select value from jsonb_array_elements(p_selections) loop
   if not (v_item ? 'selection_id') then raise exception 'Invalid selection payload'; end if;
   v_selection_id:=(v_item->>'selection_id')::uuid;
   select ms.market_id,m.fixture_id,ms.odds,m.name,ms.name,f.status,f.starts_at,m.is_live
    into v_market_id,v_fixture_id,v_odds,v_market_label,v_selection_label,v_fixture_status,v_starts_at,v_market_live
   from public.market_selections ms join public.markets m on m.id=ms.market_id join public.fixtures f on f.id=m.fixture_id
   where ms.id=v_selection_id and ms.status='active' and ms.result_status='pending'
     and m.status='open' and m.is_active=true and f.status in ('scheduled','live')
   for update of ms,m,f;
   if not found then raise exception 'One of your selections is no longer available'; end if;
   if v_fixture_status='scheduled' and v_starts_at<=now() then raise exception 'This event has started; live markets are required'; end if;
   if v_fixture_status='live' and not v_market_live then raise exception 'This market is not open for live betting'; end if;
   if v_odds<=1 then raise exception 'Invalid odds'; end if;
   v_combined:=v_combined*v_odds; v_count:=v_count+1;
 end loop;
 if v_count<>jsonb_array_length(p_selections) then raise exception 'Could not validate every selection'; end if;
 insert into public.bets(id,user_id,currency,stake,combined_odds,potential_return,status,idempotency_key)
 values(v_bet_id,v_user,p_currency,round(p_stake,2),v_combined,round(p_stake*v_combined,2),'pending',p_idempotency_key);
 for v_item in select value from jsonb_array_elements(p_selections) loop
   v_selection_id:=(v_item->>'selection_id')::uuid;
   insert into public.bet_legs(bet_id,fixture_id,market_id,selection_id,market_label,selection_label,odds_snapshot)
   select v_bet_id,m.fixture_id,m.id,ms.id,m.name,ms.name,ms.odds
   from public.market_selections ms join public.markets m on m.id=ms.market_id where ms.id=v_selection_id;
 end loop;
 update public.wallet_accounts set available_balance=available_balance-round(p_stake,2),updated_at=now()
 where id=v_wallet.id returning * into v_wallet;
 insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description)
 values(v_wallet.id,v_user,p_currency,'bet_stake',-round(p_stake,2),v_wallet.available_balance,v_wallet.reserved_balance,'bet',v_bet_id,p_idempotency_key,'Stake placed on validated selections');
 return v_bet_id;
end; $$;
revoke all on function public.betnova_place_bet(jsonb,numeric,text,uuid) from public,anon;
grant execute on function public.betnova_place_bet(jsonb,numeric,text,uuid) to authenticated;

create or replace function public.betnova_settle_market(p_market_id uuid,p_winning_selection_ids uuid[],p_void boolean default false)
returns integer language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid(); v_market public.markets%rowtype; v_bet public.bets%rowtype;
 v_bet_id uuid; v_wallet public.wallet_accounts%rowtype; v_result integer:=0;
 v_final_status text; v_payout numeric; v_key uuid;
begin
 if v_user is null or not public.betnova_is_admin() then raise exception 'Administrator access required'; end if;
 select * into v_market from public.markets where id=p_market_id for update;
 if not found or v_market.status not in ('open','suspended') then raise exception 'Market is not available for settlement'; end if;
 if p_void is not true and (coalesce(array_length(p_winning_selection_ids,1),0)=0 or exists(
   select 1 from unnest(p_winning_selection_ids) x where not exists(select 1 from public.market_selections ms where ms.id=x and ms.market_id=p_market_id)
 )) then raise exception 'Winning selections must belong to this market'; end if;
 update public.market_selections ms set result_status=case when p_void then 'void' when ms.id=any(p_winning_selection_ids) then 'won' else 'lost' end,
 status=case when p_void then 'void' when ms.id=any(p_winning_selection_ids) then 'won' else 'lost' end,updated_at=now() where ms.market_id=p_market_id;
 update public.markets set status=case when p_void then 'void' else 'settled' end,settled_at=now(),last_updated_at=now() where id=p_market_id;
 update public.bet_legs bl set result_status=ms.result_status,settled_at=now() from public.market_selections ms where bl.selection_id=ms.id and bl.market_id=p_market_id;
 for v_bet_id in select b.id from public.bets b where b.status='pending'
   and exists(select 1 from public.bet_legs bl where bl.bet_id=b.id and bl.market_id=p_market_id) order by b.created_at
 loop
   select * into v_bet from public.bets where id=v_bet_id for update;
   if not found or v_bet.status<>'pending' then continue; end if;
   if exists(select 1 from public.bet_legs where bet_id=v_bet.id and result_status='lost') then v_final_status:='lost';
   elsif not exists(select 1 from public.bet_legs where bet_id=v_bet.id and result_status='pending') then
     if exists(select 1 from public.bet_legs where bet_id=v_bet.id and result_status='won') then v_final_status:='won'; else v_final_status:='void'; end if;
   else continue; end if;
   update public.bets set status=v_final_status,settled_at=now() where id=v_bet.id;
   if v_final_status in ('won','void') then
     select round(v_bet.stake*exp(coalesce(sum(ln(case when result_status='won' then odds_snapshot else 1 end)),0)),2)
     into v_payout from public.bet_legs where bet_id=v_bet.id;
     select * into v_wallet from public.wallet_accounts where user_id=v_bet.user_id and currency=v_bet.currency for update;
     if not found then raise exception 'Wallet account missing during settlement'; end if;
     update public.wallet_accounts set available_balance=available_balance+v_payout,updated_at=now() where id=v_wallet.id returning * into v_wallet;
     v_key:=v_bet.id;
     insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description)
     values(v_wallet.id,v_bet.user_id,v_bet.currency,'bet_return',v_payout,v_wallet.available_balance,v_wallet.reserved_balance,'bet',v_bet.id,v_key,
       case when v_final_status='void' then 'Void bet stake returned' else 'Winning bet payout' end);
   end if;
   v_result:=v_result+1;
 end loop;
 return v_result;
end; $$;
revoke all on function public.betnova_settle_market(uuid,uuid[],boolean) from public,anon;
grant execute on function public.betnova_settle_market(uuid,uuid[],boolean) to authenticated;
