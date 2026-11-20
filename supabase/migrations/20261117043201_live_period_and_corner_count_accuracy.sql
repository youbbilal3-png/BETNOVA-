do $migration$
declare
  v_definition text;
  v_first_old text := 'select count(*)::integer from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type=''goal'' and e.period in (''first_half'',''1H'')';
  v_first_new text := 'select count(*)::integer from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type=''goal'' and (e.period in (''first_half'',''1H'') or (coalesce(e.period,'''') not in (''second_half'',''2H'') and e.minute between 0 and 45))';
begin
  select pg_get_functiondef('public.betnova_process_live_event(uuid)'::regprocedure) into v_definition;
  if position(v_first_old in v_definition)=0 then raise exception 'First-half goal count expression not found'; end if;
  v_definition:=replace(v_definition,v_first_old,v_first_new);
  -- The total-corners event_data count is already corrected by the preceding migration.
  if position('e.event_data->''source_event''->>''count''' in v_definition)=0 then
    raise exception 'Source event corner count expression not found';
  end if;
  execute v_definition;
end
$migration$;
