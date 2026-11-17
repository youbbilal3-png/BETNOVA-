create or replace function public.betnova_block_bets_during_fixture_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.fixture_settlement_holds h
    where h.fixture_id = new.fixture_id
  ) or exists (
    select 1 from public.sportsapi_fixture_links s
    where s.fixture_id = new.fixture_id and s.settlement_hold = true
  ) then
    raise exception 'This match is temporarily paused while its live result is being verified';
  end if;
  return new;
end;
$$;
revoke all on function public.betnova_block_bets_during_fixture_hold() from public, anon, authenticated;