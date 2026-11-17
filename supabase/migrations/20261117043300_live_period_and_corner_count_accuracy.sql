do $migration$
declare
  v_definition text;
  v_first_old text := $old$select count(*)::integer from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='goal' and e.period in ('first_half','1H')$old$;
  v_first_new text := $new$select count(*)::integer from public.fixture_events e where e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type='goal' and (e.period in ('first_half','1H') or (coalesce(e.period,'') not in ('second_half','2H') and e.minute between 0 and 45))$new$;
  v_corner_old text := $old$select count(*)::integer into v_event_count
         from public.fixture_events e
         where e.fixture_id=v_event.fixture_id
           and e.provider=v_event.provider
           and e.event_type='corner';$old$;
  v_corner_new text := $new$select coalesce(sum(greatest(coalesce((e.event_data->>'count')::integer,1),1)),0)::integer into v_event_count
         from public.fixture_events e
         where e.fixture_id=v_event.fixture_id
           and e.provider=v_event.provider
           and e.event_type='corner';$new$;
begin
  select pg_get_functiondef('public.betnova_process_live_event(uuid)'::regprocedure) into v_definition;
  if position(v_first_old in v_definition)=0 then raise exception 'First-half goal count expression not found'; end if;
  v_definition := replace(v_definition,v_first_old,v_first_new);
  if position(v_corner_old in v_definition)=0 then raise exception 'Total corner count expression not found'; end if;
  v_definition := replace(v_definition,v_corner_old,v_corner_new);
  execute v_definition;
end
$migration$;