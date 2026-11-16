alter table public.markets
 add column if not exists market_key text,
 add column if not exists settlement_rule jsonb not null default '{}'::jsonb,
 add column if not exists is_live boolean not null default false,
 add column if not exists source_provider text,
 add column if not exists external_id text,
 add column if not exists suspended_at timestamptz,
 add column if not exists settled_at timestamptz,
 add column if not exists last_updated_at timestamptz not null default now();
alter table public.market_selections
 add column if not exists selection_key text,
 add column if not exists result_status text not null default 'pending' check(result_status in ('pending','won','lost','void'));
create table if not exists public.market_templates (
 id uuid primary key default gen_random_uuid(), market_key text not null unique, category text not null,
 display_name text not null, description text, settlement_trigger text not null,
 settlement_rule jsonb not null default '{}'::jsonb, requires_player_data boolean not null default false,
 supports_live boolean not null default false, is_enabled boolean not null default true,
 sort_order integer not null default 0, created_at timestamptz not null default now());
create table if not exists public.fixture_events (
 id uuid primary key default gen_random_uuid(), fixture_id uuid not null references public.fixtures(id) on delete cascade,
 provider text not null, provider_event_id text not null, event_type text not null, period text, minute integer,
 added_time integer, team_id uuid references public.teams(id), player_id text, player_name text,
 assist_player_name text, event_data jsonb not null default '{}'::jsonb, occurred_at timestamptz,
 received_at timestamptz not null default now(), unique(provider,provider_event_id));
create index if not exists fixture_events_fixture_time_idx on public.fixture_events(fixture_id,occurred_at,received_at);
create index if not exists markets_fixture_live_idx on public.markets(fixture_id,is_live,status);
alter table public.market_templates enable row level security;
alter table public.fixture_events enable row level security;
drop policy if exists "Users read enabled market templates" on public.market_templates;
create policy "Users read enabled market templates" on public.market_templates for select to authenticated using(is_enabled=true);
drop policy if exists "Admins manage market templates" on public.market_templates;
create policy "Admins manage market templates" on public.market_templates for all to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
drop policy if exists "Users read fixture events" on public.fixture_events;
create policy "Users read fixture events" on public.fixture_events for select to authenticated using(true);
drop policy if exists "Admins read fixture events" on public.fixture_events;
create policy "Admins read fixture events" on public.fixture_events for select to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
grant select on public.market_templates,public.fixture_events to authenticated;
grant insert,update,delete on public.market_templates to authenticated;
revoke insert,update,delete on public.fixture_events from anon,authenticated;
insert into public.market_templates(market_key,category,display_name,description,settlement_trigger,settlement_rule,requires_player_data,supports_live,sort_order) values
('match_result','Match','Match Winner','Home win, draw or away win','final_whistle','{"period":"full_time"}',false,false,10),
('double_chance','Match','Double Chance','Home or draw, away or draw, home or away','final_whistle','{"period":"full_time"}',false,false,20),
('draw_no_bet','Match','Draw No Bet','Stake returned on a draw','final_whistle','{"period":"full_time"}',false,false,30),
('half_time_result','Match','Half-Time Result','Home, draw or away at half-time','half_time_whistle','{"period":"first_half"}',false,false,40),
('second_half_result','Match','Second-Half Result','Result of second half only','final_whistle','{"period":"second_half"}',false,false,50),
('half_time_full_time','Match','Half-Time / Full-Time','Combined half-time and full-time result','final_whistle','{"periods":["first_half","full_time"]}',false,false,60),
('total_goals','Goals','Total Goals Over/Under','Over or under selected goal lines','goal_event_or_final_whistle','{"event":"goal","finalize_at":"full_time"}',false,true,100),
('team_total_goals','Goals','Team Total Goals','Home or away team goal totals','goal_event_or_final_whistle','{"event":"goal","finalize_at":"full_time"}',false,true,110),
('both_teams_score','Goals','Both Teams To Score','Whether both teams score','second_team_goal_or_final_whistle','{"event":"goal","win_when":"both_teams_scored"}',false,true,120),
('first_team_to_score','Goals','First Team To Score','Which team scores first','first_confirmed_goal','{"event":"goal","first_only":true}',false,true,130),
('next_goal','Goals','Next Goal','Which team scores the next goal','next_confirmed_goal','{"event":"goal","next_only":true}',false,true,140),
('last_team_to_score','Goals','Last Team To Score','Which team scores the final goal','final_whistle','{"event":"goal","period":"full_time"}',false,false,150),
('exact_goals','Goals','Exact Total Goals','Exact number of goals','final_whistle','{"period":"full_time"}',false,false,160),
('odd_even_goals','Goals','Goals Odd/Even','Total goals odd or even','final_whistle','{"period":"full_time"}',false,false,170),
('correct_score','Goals','Correct Score','Predict the final score','final_whistle','{"period":"full_time"}',false,false,180),
('goal_in_both_halves','Goals','Goal In Both Halves','At least one goal in each half','second_half_goal_or_final_whistle','{"event":"goal","periods":["first_half","second_half"]}',false,true,190),
('total_corners','Corners','Total Corners Over/Under','Total match corners','corner_event_or_final_whistle','{"event":"corner","finalize_at":"full_time"}',false,true,220),
('team_corners','Corners','Team Corners','Home or away team corners','corner_event_or_final_whistle','{"event":"corner","finalize_at":"full_time"}',false,true,230),
('first_corner','Corners','First Corner','Which team gets the first corner','first_confirmed_corner','{"event":"corner","first_only":true}',false,true,240),
('total_cards','Cards','Total Cards Over/Under','Total match cards','card_event_or_final_whistle','{"events":["yellow_card","red_card"],"finalize_at":"full_time"}',false,true,260),
('red_card','Cards','Red Card In Match','Whether a red card is shown','red_card_event_or_final_whistle','{"event":"red_card"}',false,true,270),
('penalty_awarded','Match Events','Penalty Awarded','Whether a penalty is awarded','penalty_event_or_final_whistle','{"event":"penalty_awarded"}',false,true,300),
('team_to_score_next','Goals','Team To Score Next','Next goal by either team','next_confirmed_goal','{"event":"goal","next_only":true}',false,true,310),
('anytime_goalscorer','Player','Anytime Goalscorer','Selected player to score at any time','player_goal_event_or_final_whistle','{"event":"goal","requires_player":true}',true,true,400),
('first_goalscorer','Player','First Goalscorer','Selected player to score first','first_player_goal_event','{"event":"goal","first_player_only":true}',true,true,410),
('last_goalscorer','Player','Last Goalscorer','Selected player to score last','final_whistle','{"event":"goal","requires_player":true}',true,false,420),
('player_shots','Player','Player Shots','Selected player shots total','final_whistle','{"stat":"shots","requires_player":true}',true,false,430),
('player_shots_on_target','Player','Player Shots On Target','Selected player shots on target','final_whistle','{"stat":"shots_on_target","requires_player":true}',true,false,440),
('offsides_total','Match Stats','Total Offsides','Total match offsides','final_whistle','{"stat":"offsides"}',false,false,500),
('total_shots','Match Stats','Total Shots','Total match shots','final_whistle','{"stat":"shots"}',false,false,510),
('shots_on_target','Match Stats','Shots On Target','Total shots on target','final_whistle','{"stat":"shots_on_target"}',false,false,520)
on conflict(market_key) do nothing;