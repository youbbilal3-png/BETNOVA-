drop policy if exists "Public can read fixture events" on public.fixture_events;
create policy "Public can read fixture events" on public.fixture_events for select to anon,authenticated using(true);
grant select on public.fixture_events to anon,authenticated;
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fixtures') then alter publication supabase_realtime add table public.fixtures; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='markets') then alter publication supabase_realtime add table public.markets; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='market_selections') then alter publication supabase_realtime add table public.market_selections; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fixture_events') then alter publication supabase_realtime add table public.fixture_events; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bets') then alter publication supabase_realtime add table public.bets; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bet_legs') then alter publication supabase_realtime add table public.bet_legs; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wallet_accounts') then alter publication supabase_realtime add table public.wallet_accounts; end if;
end $$;
