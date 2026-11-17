revoke all privileges on table public.fixture_statistics from anon, authenticated;
grant select on table public.fixture_statistics to anon, authenticated;
grant all privileges on table public.fixture_statistics to service_role;