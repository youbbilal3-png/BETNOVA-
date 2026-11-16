drop policy if exists "Public can read fixture events" on public.fixture_events;
create policy "Public can read fixture events" on public.fixture_events for select to anon,authenticated using(true);
grant select on public.fixture_events to anon,authenticated;
alter publication supabase_realtime add table public.fixtures;
alter publication supabase_realtime add table public.markets;
alter publication supabase_realtime add table public.market_selections;
alter publication supabase_realtime add table public.fixture_events;

alter publication supabase_realtime add table public.bets;
alter publication supabase_realtime add table public.bet_legs;
alter publication supabase_realtime add table public.wallet_accounts;
