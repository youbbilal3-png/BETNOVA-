-- BETNOVA core schema foundation
-- All public tables use RLS. No wallet, payment, or wager settlement operations
-- are enabled in this foundation migration.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  country_code char(2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id),
  name text not null,
  country text,
  season text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  country text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references public.competitions(id),
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  starts_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','live','finished','postponed','cancelled')),
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  is_featured boolean not null default false,
  source_provider text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixtures_distinct_teams check (home_team_id <> away_team_id),
  constraint fixtures_external_unique unique (source_provider, external_id)
);

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  market_type text not null,
  name text not null,
  status text not null default 'open'
    check (status in ('open','suspended','settled','void')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.market_selections (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  name text not null,
  odds numeric(10,3) not null check (odds > 1),
  status text not null default 'active'
    check (status in ('active','suspended','won','lost','void')),
  updated_at timestamptz not null default now()
);

create index competitions_sport_id_idx on public.competitions(sport_id);
create index fixtures_starts_at_idx on public.fixtures(starts_at);
create index fixtures_status_starts_at_idx on public.fixtures(status, starts_at);
create index fixtures_competition_id_idx on public.fixtures(competition_id);
create index fixtures_home_team_id_idx on public.fixtures(home_team_id);
create index fixtures_away_team_id_idx on public.fixtures(away_team_id);
create index markets_fixture_id_idx on public.markets(fixture_id);
create index market_selections_market_id_idx on public.market_selections(market_id);

alter table public.profiles enable row level security;
alter table public.sports enable row level security;
alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.fixtures enable row level security;
alter table public.markets enable row level security;
alter table public.market_selections enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "Authenticated users can read active sports"
  on public.sports for select to authenticated using (is_active = true);
create policy "Authenticated users can read active competitions"
  on public.competitions for select to authenticated using (is_active = true);
create policy "Authenticated users can read teams"
  on public.teams for select to authenticated using (true);
create policy "Authenticated users can read fixtures"
  on public.fixtures for select to authenticated using (true);
create policy "Authenticated users can read active markets"
  on public.markets for select to authenticated using (is_active = true);
create policy "Authenticated users can read selections"
  on public.market_selections for select to authenticated using (true);

grant select, insert on public.profiles to authenticated;
grant update (display_name, avatar_url, country_code) on public.profiles to authenticated;
grant select on public.sports, public.competitions, public.teams, public.fixtures,
  public.markets, public.market_selections to authenticated;
