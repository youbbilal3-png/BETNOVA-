do $migration$
declare
  v_definition text;
  v_old text := '     when ''both_teams_score'' then';
  v_new text := $case$
     when 'total_corners' then
       if v_event.event_type in ('corner','full_time') then
         for v_key in select selection_key from public.market_selections where market_id=v_market.id and status='active' and selection_key is not null
         loop
           v_parts:=regexp_match(v_key,'^(over|under)_([0-9]+_[0-9]+)$');
           if v_parts is null then continue; end if;
           v_threshold:=replace(v_parts[2],'_','.')::numeric;
           select coalesce(sum(case when e.event_data->>'count' ~ '^[0-9]+$' then (e.event_data->>'count')::integer else 1 end),0)::integer
             into v_event_count
           from public.fixture_events e
           where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='corner';
           if (v_parts[1]='over' and v_event_count>v_threshold) or (v_parts[1]='under' and v_event.event_type='full_time' and v_event_count<v_threshold) then
             select array_agg(id) into v_selection_ids from public.market_selections where market_id=v_market.id and selection_key=v_key and status='active';
             v_should:=coalesce(array_length(v_selection_ids,1),0)>0; exit when v_should;
           elsif v_event.event_type='full_time' and v_event_count=v_threshold then
             v_void:=true; v_should:=true; exit;
           end if;
         end loop;
       end if;
     when 'both_teams_score' then
$case$;
begin
  select pg_get_functiondef('public.betnova_process_live_event(uuid)'::regprocedure) into v_definition;
  if position(v_old in v_definition)=0 then raise exception 'Could not locate live event settlement switch'; end if;
  execute replace(v_definition,v_old,v_new);
end
$migration$;