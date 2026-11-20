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
 v_event_count integer; v_home_count integer; v_away_count integer; v_threshold numeric; v_key text; v_parts text[]; v_should boolean; v_void boolean;
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
   select not exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='goal' and e.id<>v_event.id and coalesce(e.occurred_at,e.received_at)<coalesce(v_event.occurred_at,v_event.received_at)) into v_first_goal;
 end if;
 for v_market in select * from public.markets where fixture_id=v_event.fixture_id and is_active=true and (status='open' or (v_event.event_type='full_time' and status='suspended')) order by id
 loop
   v_selection_ids:=null; v_should:=false; v_void:=false;
   case v_market.market_key
     when 'first_team_to_score' then
       if v_event.event_type='goal' and v_first_goal then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_team_key and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       elsif v_event.event_type='full_time' and not exists (
         select 1 from public.fixture_events e
         where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='goal'
       ) then
         select array_agg(id) into v_selection_ids from public.market_selections
         where market_id=v_market.id and selection_key='no_goal' and status='active';
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
     when 'asian_handicap' then
       if v_event.event_type='full_time' then
         if v_market.settlement_rule->>'period'='first_half' then
           select count(*) filter (where e.team_id=v_home_id)::integer,
                  count(*) filter (where e.team_id=v_away_id)::integer
             into v_home_count,v_away_count
           from public.fixture_events e
           where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider
             and e.event_type='goal'
             and (e.period in ('first_half','1H') or (coalesce(e.period,'') not in ('second_half','2H') and e.minute between 0 and 45));
         else
           v_home_count:=v_home; v_away_count:=v_away;
         end if;
         v_threshold := coalesce((v_market.settlement_rule->>'line')::numeric,0);
         if v_home_count + v_threshold > v_away_count then
           select array_agg(id) into v_selection_ids from public.market_selections
           where market_id=v_market.id and selection_key='home' and status='active';
           v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
         elsif v_home_count + v_threshold < v_away_count then
           select array_agg(id) into v_selection_ids from public.market_selections
           where market_id=v_market.id and selection_key='away' and status='active';
           v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
         else
           v_void:=true; v_should:=true;
         end if;
       end if;
     when 'corner_asian' then
       if v_event.provider<>'sportsapi' and v_event.event_type='full_time' then
         select count(*) filter (where e.team_id=v_home_id)::integer,
                count(*) filter (where e.team_id=v_away_id)::integer
           into v_home_count,v_away_count
         from public.fixture_events e
         where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='corner';
         v_threshold:=coalesce((v_market.settlement_rule->>'line')::numeric,0);
         if v_home_count + v_threshold > v_away_count then
           select array_agg(id) into v_selection_ids from public.market_selections
           where market_id=v_market.id and selection_key='home' and status='active';
           v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
         elsif v_home_count + v_threshold < v_away_count then
           select array_agg(id) into v_selection_ids from public.market_selections
           where market_id=v_market.id and selection_key='away' and status='active';
           v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
         else
           v_void:=true; v_should:=true;
         end if;
       end if;
     when 'total_corners' then
       if v_event.provider<>'sportsapi' and v_event.event_type in ('corner','full_time') then
         select count(*)::integer into v_event_count
         from public.fixture_events e
         where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='corner'
           and (
             v_market.settlement_rule->>'period' is null
             or e.period in ('first_half','1H')
             or (coalesce(e.period,'') not in ('second_half','2H') and e.minute between 0 and 45)
           );
         for v_key in select selection_key from public.market_selections
           where market_id=v_market.id and status='active' and selection_key is not null
         loop
           v_parts:=regexp_match(v_key,'^(over|under)_([0-9]+_[0-9]+)$');
           if v_parts is null then continue; end if;
           v_threshold:=replace(v_parts[2],'_','.')::numeric;
           if (v_parts[1]='over' and v_event_count>v_threshold)
              or (v_parts[1]='under' and v_event.event_type='full_time' and v_event_count<v_threshold) then
             select array_agg(id) into v_selection_ids from public.market_selections
             where market_id=v_market.id and selection_key=v_key and status='active';
             v_should:=coalesce(array_length(v_selection_ids,1),0)>0; exit;
           elsif v_event.event_type='full_time' and v_event_count=v_threshold then
             v_void:=true; v_should:=true; exit;
           end if;
         end loop;
       end if;
     when 'total_goals','team_total_goals' then
       if v_event.event_type in ('goal','full_time') then
         for v_key in select selection_key from public.market_selections where market_id=v_market.id and status='active' and selection_key is not null
         loop
           v_parts:=regexp_match(v_key,'^(?:(home|away)_)?(over|under)_([0-9]+_[0-9]+)$');
           if v_parts is null then continue; end if;
           v_threshold:=replace(v_parts[3],'_','.')::numeric;
           v_event_count:=case when v_market.settlement_rule->>'period'='first_half' then (select count(*)::integer from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='goal' and (e.period in ('first_half','1H') or (coalesce(e.period,'') not in ('second_half','2H') and e.minute between 0 and 45))) when v_market.market_key='team_total_goals' and v_parts[1]='home' then v_home when v_market.market_key='team_total_goals' and v_parts[1]='away' then v_away else v_total end;
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
       if v_event.event_type='goal' and v_period in ('second_half','2H') and exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='goal' and e.period in ('first_half','1H')) then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='yes' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       elsif v_event.event_type='full_time' and not (
         exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='goal' and e.period in ('first_half','1H')) and
         exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='goal' and e.period in ('second_half','2H'))
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
       if v_event.provider<>'sportsapi' and v_event.event_type='red_card' then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='yes' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       elsif v_event.provider<>'sportsapi' and v_event.event_type='full_time' and not exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='red_card') then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='no' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'penalty_awarded' then
       if v_event.provider<>'sportsapi' and v_event.event_type='penalty_awarded' then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='yes' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       elsif v_event.provider<>'sportsapi' and v_event.event_type='full_time' and not exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='penalty_awarded') then
         select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key='no' and status='active';
         v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
       end if;
     when 'first_corner' then
       if v_event.provider<>'sportsapi' and v_event.event_type='corner' and not exists(select 1 from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='corner' and e.id<>v_event.id and coalesce(e.occurred_at,e.received_at)<coalesce(v_event.occurred_at,v_event.received_at)) then
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
end; $function$
;

select cron.schedule(
  'betnova-fivedollar-finalize-pending',
  '5,15,25,35,45,55 * * * *',
  $job$
    select net.http_post(
      'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/fivedollar-football-sync',
      '{"mode":"finalize"}'::jsonb,
      '{}'::jsonb,
      jsonb_build_object(
        'Content-Type','application/json',
        'x-betnova-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='betnova_sync_secret' limit 1)
      ),
      120000
    )
    where exists(select 1 from vault.decrypted_secrets where name='fivedollarfootball_api_key')
      and exists(select 1 from vault.decrypted_secrets where name='betnova_sync_secret');
  $job$
);
