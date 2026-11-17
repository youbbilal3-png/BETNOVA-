create index if not exists fixture_events_provider_timeline_idx
  on public.fixture_events(fixture_id, provider, event_type, occurred_at, received_at);
create index if not exists bet_legs_fixture_id_idx
  on public.bet_legs(fixture_id);
create index if not exists fixture_statistics_fixture_updated_idx
  on public.fixture_statistics(fixture_id, updated_at desc);