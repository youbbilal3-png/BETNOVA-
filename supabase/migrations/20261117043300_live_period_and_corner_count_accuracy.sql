-- The preceding migration already normalizes first-half goal counting.
-- This migration only corrects the total-corners aggregate when its older
-- count(*) expression is still present; the following migration nests count.
do $migration$
declare
  v_definition text;
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
  if position(v_corner_old in v_definition)>0 then
    v_definition:=replace(v_definition,v_corner_old,v_corner_new);
  end if;
  execute v_definition;
end
$migration$;
