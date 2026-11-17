-- Live fixture statistics, settlement holds, and provider-scoped automatic VAR replay.

create table if not exists public.fixture_statistics (
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  provider text not null,
  statistics jsonb not null check (jsonb_typeof(statistics) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (fixture_id, provider)
);
create index if not exists fixture_statistics_updated_idx
  on public.fixture_statistics(updated_at desc);
alter table public.fixture_statistics enable row level security;
revoke all on public.fixture_statistics from public;
grant select on public.fixture_statistics to anon, authenticated;
grant all on public.fixture_statistics to service_role;
drop policy if exists "Public can read fixture statistics" on public.fixture_statistics;
create policy "Public can read fixture statistics"
  on public.fixture_statistics for select to anon, authenticated using (true);

create table if not exists public.fivedollar_fixture_links (
  provider_fixture_id text primary key,
  fixture_id uuid not null unique references public.fixtures(id) on delete cascade,
  processed_goal_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(processed_goal_snapshot) = 'array'),
  pending_retraction_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pending_retraction_ids) = 'array'),
  pending_retraction_observations integer not null default 0
    check (pending_retraction_observations >= 0),
  last_event_sync_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.fivedollar_fixture_links enable row level security;
revoke all on public.fivedollar_fixture_links from public, anon, authenticated;
grant all on public.fivedollar_fixture_links to service_role;

create table if not exists public.fixture_settlement_holds (
  fixture_id uuid primary key references public.fixtures(id) on delete cascade,
  provider text not null,
  reason text not null check (length(trim(reason)) between 4 and 300),
  held_at timestamptz not null default now()
);
alter table public.fixture_settlement_holds enable row level security;
revoke all on public.fixture_settlement_holds from public, anon, authenticated;
grant all on public.fixture_settlement_holds to service_role;

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
  ) then
    raise exception 'This match is temporarily paused while its live result is being verified';
  end if;
  return new;
end;
$$;
revoke all on function public.betnova_block_bets_during_fixture_hold() from public, anon, authenticated;
drop trigger if exists betnova_fixture_settlement_hold_guard on public.bet_legs;
create trigger betnova_fixture_settlement_hold_guard
before insert on public.bet_legs
for each row execute function public.betnova_block_bets_during_fixture_hold();

create or replace function public.betnova_set_fixture_settlement_hold(
  p_fixture_id uuid,
  p_provider text,
  p_reason text,
  p_hold boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  if v_role <> 'service_role' then raise exception 'Trusted provider only'; end if;
  if p_fixture_id is null or p_provider not in ('sportsapi','fivedollarfootballapi')
     or p_hold is null then raise exception 'Invalid settlement hold request'; end if;
  if p_hold then
    if p_reason is null or length(trim(p_reason)) not between 4 and 300 then
      raise exception 'A correction reason is required';
    end if;
    insert into public.fixture_settlement_holds(fixture_id,provider,reason,held_at)
    values(p_fixture_id,p_provider,trim(p_reason),now())
    on conflict(fixture_id) do update
      set provider=excluded.provider, reason=excluded.reason, held_at=excluded.held_at;
  else
    delete from public.fixture_settlement_holds
    where fixture_id=p_fixture_id and provider=p_provider;
  end if;
end;
$$;
revoke all on function public.betnova_set_fixture_settlement_hold(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.betnova_set_fixture_settlement_hold(uuid,text,text,boolean) to service_role;

-- The existing event processor is retained, but its timeline lookups are scoped
-- to the same provider as the event being processed. This prevents duplicate
-- cross-provider events from changing first-goal / first-corner outcomes.
do $$
declare
  v_definition text;
  v_before integer;
  v_after integer;
begin
  v_definition := pg_get_functiondef('public.betnova_process_live_event(uuid)'::regprocedure);
  v_before := (length(v_definition) - length(replace(
    v_definition,
    'e.fixture_id=v_event.fixture_id and e.event_type',
    ''
  ))) / length('e.fixture_id=v_event.fixture_id and e.event_type');
  if v_before < 5 then
    raise exception 'Unexpected live event processor definition; refusing provider-scope rewrite';
  end if;
  v_definition := replace(
    v_definition,
    'e.fixture_id=v_event.fixture_id and e.event_type',
    'e.fixture_id=v_event.fixture_id and e.provider=v_event.provider and e.event_type'
  );
  v_after := (length(v_definition) - length(replace(
    v_definition,
    'e.provider=v_event.provider and e.event_type',
    ''
  ))) / length('e.provider=v_event.provider and e.event_type');
  if v_after <> v_before then
    raise exception 'Provider-scope rewrite did not cover every event lookup';
  end if;
  execute v_definition;
end;
$$;

create or replace function public.betnova_replay_fixture_events(
  p_fixture_id uuid,
  p_provider text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_event record;
  v_fixture public.fixtures%rowtype;
  v_events integer := 0;
  v_markets integer := 0;
  v_processed integer := 0;
begin
  if v_role <> 'service_role' then raise exception 'Trusted provider only'; end if;
  if p_fixture_id is null
     or p_provider not in ('sportsapi','fivedollarfootballapi')
     or p_reason is null or length(trim(p_reason)) not between 4 and 300 then
    raise exception 'Invalid fixture replay request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_fixture_id::text, 0));
  select * into v_fixture from public.fixtures where id=p_fixture_id for update;
  if not found then raise exception 'Fixture not found'; end if;

  select count(*) into v_events
  from public.fixture_events
  where fixture_id=p_fixture_id and provider=p_provider
    and event_type in ('goal','corner','yellow_card','red_card','penalty_awarded','full_time');
  if v_events = 0 then
    raise exception 'No confirmed events are available for automatic replay';
  end if;

  perform public.betnova_reopen_fixture_for_correction(p_fixture_id);

  for v_event in
    select id
    from public.fixture_events
    where fixture_id=p_fixture_id and provider=p_provider
      and event_type in ('goal','corner','yellow_card','red_card','penalty_awarded','full_time')
    order by case when event_type='full_time' then 1 else 0 end,
             coalesce(occurred_at,received_at), received_at, id
  loop
    v_markets := public.betnova_process_live_event(v_event.id);
    v_processed := v_processed + v_markets;
  end loop;

  delete from public.fixture_settlement_holds
  where fixture_id=p_fixture_id and provider=p_provider;

  return jsonb_build_object(
    'ok',true,'fixture_id',p_fixture_id,'provider',p_provider,
    'events_replayed',v_events,'market_settlement_actions',v_processed,
    'reason',trim(p_reason),'replayed_at',now()
  );
end;
$$;
revoke all on function public.betnova_replay_fixture_events(uuid,text,text) from public, anon, authenticated;
grant execute on function public.betnova_replay_fixture_events(uuid,text,text) to service_role;

comment on table public.fixture_statistics is
  'Provider-supplied live match statistics snapshots; public read only.';
comment on table public.fixture_settlement_holds is
  'Private short-lived provider correction holds; blocks new bet legs until automatic replay completes.';
