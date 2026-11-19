create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  match_start boolean not null default false,
  goals boolean not null default false,
  red_cards boolean not null default false,
  half_time boolean not null default false,
  full_time boolean not null default false,
  bet_settlement boolean not null default false,
  account_activity boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'android' check (platform in ('android','ios')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists device_push_tokens_user_id_idx on public.device_push_tokens(user_id);

create table if not exists public.notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('fixture','team')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
create index if not exists notification_subscriptions_target_idx
  on public.notification_subscriptions(target_type, target_id);

alter table public.notification_preferences enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.notification_subscriptions enable row level security;

drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences"
  on public.notification_preferences for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own push tokens" on public.device_push_tokens;
create policy "Users manage own push tokens"
  on public.device_push_tokens for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own notification subscriptions" on public.notification_subscriptions;
create policy "Users manage own notification subscriptions"
  on public.notification_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.device_push_tokens to authenticated;
grant select, insert, update, delete on public.notification_subscriptions to authenticated;
