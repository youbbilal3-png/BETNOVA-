create table if not exists public.fivedollar_live_odds_state (
 id integer primary key default 1 check (id=1),
 fixture_cursor integer not null default 0,
 last_run_at timestamptz,
 last_selected integer not null default 0
);
alter table public.fivedollar_live_odds_state enable row level security;
revoke all on public.fivedollar_live_odds_state from anon,authenticated;
insert into public.fivedollar_live_odds_state(id) values(1) on conflict(id) do nothing;
do $$
declare v_job integer;
begin
 select jobid into v_job from cron.job where jobname='betnova-api-football-live-odds-sync';
 if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;