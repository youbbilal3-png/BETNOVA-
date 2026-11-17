-- Preserve the generated UUID while checking whether an idempotent retry exists.
-- SELECT INTO assigns NULL to its target when no row is found; using a separate
-- variable prevents the lookup from erasing the new bet's identifier.
do $patch$
declare
  v_definition text;
  v_lookup text := 'select id into v_bet_id from public.bets';
  v_old_return text := 'if found then return v_bet_id; end if;';
begin
  select pg_get_functiondef('public.betnova_place_bet(jsonb,numeric,text,uuid)'::regprocedure)
    into v_definition;

  if position('v_bet_id uuid := gen_random_uuid();' in v_definition) = 0
     or (length(v_definition) - length(replace(v_definition, v_lookup, ''))) / length(v_lookup) <> 2
     or (length(v_definition) - length(replace(v_definition, v_old_return, ''))) / length(v_old_return) <> 2 then
    raise exception 'Unexpected bet placement function definition; refusing unsafe patch';
  end if;

  v_definition := replace(
    v_definition,
    'v_bet_id uuid := gen_random_uuid();',
    'v_bet_id uuid := gen_random_uuid();' || chr(10) || '  v_existing_bet_id uuid;'
  );
  v_definition := replace(v_definition, v_lookup, 'select id into v_existing_bet_id from public.bets');
  v_definition := replace(v_definition, v_old_return, 'if found then return v_existing_bet_id; end if;');

  execute v_definition;
end;
$patch$;
