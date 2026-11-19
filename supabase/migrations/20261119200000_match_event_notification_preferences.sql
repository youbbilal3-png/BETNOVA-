-- Store event-level notification choices on each followed match/team.
-- Defaults preserve notifications for existing subscriptions created before this migration.
alter table public.notification_subscriptions
  add column if not exists match_start boolean not null default true,
  add column if not exists goals boolean not null default true,
  add column if not exists red_cards boolean not null default true,
  add column if not exists half_time boolean not null default true,
  add column if not exists full_time boolean not null default true;

-- Keep the existing account-level opt-in as the master switch while moving
-- individual event categories into each followed match/team.
update public.notification_subscriptions s
set match_start = coalesce(p.match_start, true),
    goals = coalesce(p.goals, true),
    red_cards = coalesce(p.red_cards, true),
    half_time = coalesce(p.half_time, true),
    full_time = coalesce(p.full_time, true)
from public.notification_preferences p
where p.user_id = s.user_id;
