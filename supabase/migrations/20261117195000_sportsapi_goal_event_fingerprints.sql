-- Preserve the last reconciled authoritative goal history for automatic VAR correction.
alter table public.sportsapi_fixture_links
  add column if not exists processed_goal_snapshot jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sportsapi_goal_snapshot_is_array'
      and conrelid = 'public.sportsapi_fixture_links'::regclass
  ) then
    alter table public.sportsapi_fixture_links
      add constraint sportsapi_goal_snapshot_is_array
      check (jsonb_typeof(processed_goal_snapshot) = 'array');
  end if;
end;
$$;
