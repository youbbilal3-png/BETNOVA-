-- Final idempotent verification of the live-period and corner-event fixes.
-- The prior migration performs the replacement. PostgreSQL may normalize the
-- function definition after CREATE OR REPLACE, so this migration verifies
-- semantic markers instead of trying to replace the same source text again.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.betnova_process_live_event(uuid)'::regprocedure)
    into v_definition;
  if position('between 0 and 45' in v_definition)=0 then
    raise exception 'First-half live-period fallback is missing';
  end if;
  if position('source_event' in v_definition)=0 then
    raise exception 'Source-event corner count path is missing';
  end if;
end
$migration$;
