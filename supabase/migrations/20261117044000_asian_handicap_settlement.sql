do $migration$
declare
  v_definition text;
  v_old text := $old$     when 'total_corners' then$old$;
  v_new text := $new$     when 'asian_handicap' then
       if v_event.event_type='full_time' then
         v_threshold := coalesce((v_market.settlement_rule->>'line')::numeric,0);
         if v_home + v_threshold > v_away then
           select array_agg(id) into v_selection_ids
           from public.market_selections
           where market_id=v_market.id and selection_key='home' and status='active';
           v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
         elsif v_home + v_threshold < v_away then
           select array_agg(id) into v_selection_ids
           from public.market_selections
           where market_id=v_market.id and selection_key='away' and status='active';
           v_should:=coalesce(array_length(v_selection_ids,1),0)>0;
         else
           v_void:=true; v_should:=true;
         end if;
       end if;
     when 'total_corners' then$new$;
begin
  select pg_get_functiondef('public.betnova_process_live_event(uuid)'::regprocedure) into v_definition;
  if position(v_old in v_definition)=0 then raise exception 'Asian handicap insertion point not found'; end if;
  if position('when ''asian_handicap'' then' in v_definition)>0 then
    raise exception 'Asian handicap settlement already exists';
  end if;
  execute replace(v_definition,v_old,v_new);
end
$migration$;