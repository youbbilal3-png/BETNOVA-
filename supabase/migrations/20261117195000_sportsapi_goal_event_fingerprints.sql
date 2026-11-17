-- Preserve the last reconciled confirmed-goal history.
-- If a previously processed goal is later corrected or removed (e.g. VAR),
-- the sync function pauses this fixture for manual review instead of paying
-- a second or contradictory settlement.
alter table public.sportsapi_fixture_links
  add column if not exists processed_goal_snapshot jsonb not null default '[]'::jsonb;

alter table public.sportsapi_fixture_links
  add constraint sportsapi_goal_snapshot_is_array
  check (jsonb_typeof(processed_goal_snapshot) = 'array');