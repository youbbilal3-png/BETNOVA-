do $migration$
declare
  v_definition text;
  v_old text := 'e.event_data->>''count''';
  v_new text := 'e.event_data->''source_event''->>''count''';
begin
  select pg_get_functiondef('public.betnova_process_live_event(uuid)'::regprocedure) into v_definition;
  if position(v_old in v_definition)=0 then raise exception 'Corner event count expression not found'; end if;
  execute replace(v_definition,v_old,v_new);
end
$migration$;