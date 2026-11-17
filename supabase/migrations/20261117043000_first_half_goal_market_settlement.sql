do $migration$
declare
  v_definition text;
  v_old text := 'v_event_count:=case when v_market.market_key=''team_total_goals'' and v_parts[1]=''home'' then v_home when v_market.market_key=''team_total_goals'' and v_parts[1]=''away'' then v_away else v_total end;';
  v_new text := 'v_event_count:=case when v_market.settlement_rule->>''period''=''first_half'' then (select count(*)::integer from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type=''goal'' and e.period in (''first_half'',''1H'')) when v_market.market_key=''team_total_goals'' and v_parts[1]=''home'' then v_home when v_market.market_key=''team_total_goals'' and v_parts[1]=''away'' then v_away else v_total end;';
begin
  select pg_get_functiondef('public.betnova_process_live_event(uuid)'::regprocedure) into v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected total-goals settlement expression was not found';
  end if;
  execute replace(v_definition, v_old, v_new);
end
$migration$;