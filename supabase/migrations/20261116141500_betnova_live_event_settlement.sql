CREATE OR REPLACE FUNCTION public.betnova_process_live_event(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_role text:=coalesce(current_setting('request.jwt.claims',true)::json->>'role','');
 v_event public.fixture_events%rowtype; v_fixture public.fixtures%rowtype; v_market public.markets%rowtype;
 v_selection_ids uuid[]; v_team_key text; v_first_goal boolean:=false;
 v_home integer; v_away integer; v_total integer; v_home_id uuid; v_away_id uuid;
 v_event_count integer; v_threshold numeric; v_key text; v_parts text[]; v_should boolean; v_void boolean;
 v_settled integer:=0; v_period text; v_player_key text;
begin
 if v_role<>'service_role' then raise exception 'Trusted event processor only'; end if;
 select * into v_event from public.fixture_events where id=p_event_id;
 if not found then raise exception 'Event not found'; end if;
 if v_event.event_type not in ('goal','full_time','corner','yellow_card','red_card','penalty_awarded') then return 0; end if;
 select * into v_fixture from public.fixtures where id=v_event.fixture_id for update;
 if not found then raise exception 'Fixture not found'; end if;
 v_home:=coalesce(v_fixture.home_score,0); v_away:=coalesce(v_fixture.away_score,0);
 v_home_id:=v_fixture.home_team_id; v_away_id:=v_fixture.away_team_id; v_total:=v_home+v_away;
 v_period:=coalesce(v_event.period,'');
 if v_event.event_type='goal' then
   v_team_key:=case when v_event.team_id=v_home_id then 'home' when v_event.team_id=v_away_id then 'away' else null end;
   if v_team_key is null then raise exception 'Goal event team does not match fixture teams'; end if;
   select not exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.event_type='goal' and e.id<>v_event.id and e.received_at<v_event.received_at) into v_first_goal;
 end if;
 for v_market in select * from public.markets where fixture_id=v_event.fixture_id and is_active=true and status='open' order by id
 loop
   v_selection_ids:=null; v_should:=false; v_void:=false;
   case v_market.market_key
     when 'first_team_to_score' then
       if v_event.event_type='goal' and v_first_goal then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_team_key and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'next_goal','team_to_score_next' then
       if v_event.event_type='goal' then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_team_key and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'first_goalscorer' then
       if v_event.event_type='goal' and v_first_goal and v_event.player_id is not null then
         v_player_key:='player:'||v_event.player_id;
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_player_key and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'total_goals','team_total_goals' then
       if v_event.event_type in ('goal','full_time') then
         for v_key in select selection_key from public.market_selections where market_id=v_market.id and status='active' and selection_key is not null
         loop
           v_parts:=regexp_match(v_key,'^(?:(home|away)_)?(over|under)_([0-9]+_[0-9]+)$');
           if v_parts is null then continue; end if;
           v_threshold:=replace(v_parts[3],'_','.')::numeric;
           v_event_count:=case when v_market.market_key='team_total_goals' and v_parts[1]='home' then v_home when v_market.market_key='team_total_goals' and v_parts[1]='away' then v_away else v_total end;
           if (v_parts[2]='over' and v_event_count>v_threshold) or (v_parts[2]='under' and v_event.event_type='full_time' and v_event_count<v_threshold) then
             select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_key and status='active';
             v_should:=coalesce(array_length(v_selection_ids,1),0)>0; exit when v_should;
           elsif v_event.event_type='full_time' and v_event_count=v_threshold then
             v_void:=true; v_should:=true; exit;
           end if;
         end loop;
       end if;
     when 'both_teams_score' then
       if v_event.event_type='goal' and v_home>0 and v_away>0 then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='yes' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       elsif v_event.event_type='full_time' and not (v_home>0 and v_away>0) then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='no' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'goal_in_both_halves' then
       if v_event.event_type='goal' and v_period in ('second_half','2H') and exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.event_type='goal' and e.period in ('first_half','1H')) then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='yes' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       elsif v_event.event_type='full_time' and not (
         exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.event_type='goal' and e.period in ('first_half','1H')) and
         exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.event_type='goal' and e.period in ('second_half','2H'))
       ) then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='no' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'match_result' then
       if v_event.event_type='full_time' then
         v_key:=case when v_home>v_away then 'home' when v_home<v_away then 'away' else 'draw' end;
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_key and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'double_chance' then
       if v_event.event_type='full_time' then
         v_key:=case when v_home>v_away then 'home_or_draw' when v_home<v_away then 'away_or_draw' else 'home_or_away' end;
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_key and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'draw_no_bet' then
       if v_event.event_type='full_time' then
         if v_home=v_away then v_void:=true; v_should:=true;
         else
           v_key:=case when v_home>v_away then 'home' else 'away' end;
           select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_key and status='active';
           v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
         end if;
       end if;
     when 'exact_goals' then
       if v_event.event_type='full_time' then
         v_key:='goals_'||v_total::text;
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_key and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'odd_even_goals' then
       if v_event.event_type='full_time' then
         v_key:=case when mod(v_total,2)=0 then 'even' else 'odd' end;
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_key and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'correct_score' then
       if v_event.event_type='full_time' then
         v_key:='score_'||v_home::text||'_'||v_away::text;
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_key and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'red_card' then
       if v_event.event_type='red_card' then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='yes' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       elsif v_event.event_type='full_time' and not exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.event_type='red_card') then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='no' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'penalty_awarded' then
       if v_event.event_type='penalty_awarded' then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='yes' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       elsif v_event.event_type='full_time' and not exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.event_type='penalty_awarded') then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='no' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'first_corner' then
       if v_event.event_type='corner' and not exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.event_type='corner' and e.id<>v_event.id and e.received_at<v_event.received_at) then
         v_key:=case when v_event.team_id=v_home_id then 'home' else 'away' end;
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_key and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     else null;
   end case;
   if v_should then
     perform public.betnova_settle_market(v_market.id,v_selection_ids,v_void);
     v_settled:=v_settled+1;
   end if;
 end loop;
 return v_settled;
end; $function$;


CREATE OR REPLACE FUNCTION public.betnova_settle_market(p_market_id uuid, p_winning_selection_ids uuid[], p_void boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid:=auth.uid(); v_role text:=coalesce(current_setting('request.jwt.claims',true)::json->>'role','');
 v_market public.markets%rowtype; v_bet public.bets%rowtype; v_bet_id uuid;
 v_wallet public.wallet_accounts%rowtype; v_result integer:=0;
 v_final_status text; v_payout numeric; v_key uuid;
begin
 if not ((v_user is not null and public.betnova_is_admin()) or v_role='service_role') then raise exception 'Administrator or trusted event processor required'; end if;
 select * into v_market from public.markets where id=p_market_id for update;
 if not found or v_market.status not in ('open','suspended') then raise exception 'Market is not available for settlement'; end if;
 if p_void is not true and (coalesce(array_length(p_winning_selection_ids,1),0)=0 or exists(
   select 1 from unnest(p_winning_selection_ids) x where not exists(select 1 from public.market_selections ms where ms.id=x and ms.market_id=p_market_id)
 )) then raise exception 'Winning selections must belong to this market'; end if;
 update public.market_selections ms set result_status=case when p_void then 'void' when ms.id=any(p_winning_selection_ids) then 'won' else 'lost' end,
   status=case when p_void then 'void' when ms.id=any(p_winning_selection_ids) then 'won' else 'lost' end,updated_at=now()
 where ms.market_id=p_market_id;
 update public.markets set status=case when p_void then 'void' else 'settled' end,settled_at=now(),last_updated_at=now() where id=p_market_id;
 update public.bet_legs bl set result_status=ms.result_status,settled_at=now()
 from public.market_selections ms where bl.selection_id=ms.id and bl.market_id=p_market_id;
 for v_bet_id in
   select b.id from public.bets b where b.status='pending'
   and exists(select 1 from public.bet_legs bl where bl.bet_id=b.id and bl.market_id=p_market_id)
   order by b.created_at
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
end; $function$;

revoke all on function public.betnova_settle_market(uuid,uuid[],boolean) from public,anon;
grant execute on function public.betnova_settle_market(uuid,uuid[],boolean) to authenticated,service_role;
revoke all on function public.betnova_process_live_event(uuid) from public,anon,authenticated;
grant execute on function public.betnova_process_live_event(uuid) to service_role;
