create unique index if not exists markets_fixture_market_name_uidx
  on public.markets(fixture_id, market_key, name);
create unique index if not exists market_selections_market_selection_key_uidx
  on public.market_selections(market_id, selection_key)
  where selection_key is not null;