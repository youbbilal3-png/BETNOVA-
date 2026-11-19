-- Store event-level notification choices on each followed match/team.
-- Defaults preserve notifications for existing subscriptions created before this migration.
alter table public.notification_subscriptions
  add column if not exists match_start boolean not null default true,
  add column if not exists goals boolean not null default true,
  add column if not exists red_cards boolean not null default true,
  add column if not exists half_time boolean not null default true,
  add column if not exists full_time boolean not null default true;
