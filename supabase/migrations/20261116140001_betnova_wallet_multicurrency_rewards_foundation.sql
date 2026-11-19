alter table public.profiles add column if not exists preferred_currency text not null default 'DZD' check (preferred_currency in ('DZD','USD','EUR'));
create table if not exists public.wallet_accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 currency text not null check(currency in ('DZD','USD','EUR')), available_balance numeric(20,2) not null default 0 check(available_balance>=0),
 reserved_balance numeric(20,2) not null default 0 check(reserved_balance>=0), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(user_id,currency));
create table if not exists public.wallet_ledger (
 id uuid primary key default gen_random_uuid(), wallet_account_id uuid not null references public.wallet_accounts(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict, currency text not null check(currency in ('DZD','USD','EUR')),
 entry_type text not null check(entry_type in ('deposit','withdrawal_reserve','withdrawal_release','bet_stake','bet_return','bonus','adjustment','refund')),
 amount numeric(20,2) not null, balance_after numeric(20,2) not null check(balance_after>=0), reserved_after numeric(20,2) not null default 0 check(reserved_after>=0),
 reference_type text not null, reference_id uuid, idempotency_key uuid not null unique, description text,
 created_by uuid references auth.users(id), created_at timestamptz not null default now());
-- The bonus wallet is separate from the real-money wallet and remains USD-denominated.
create table if not exists public.bonus_wallet_accounts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 currency text not null default 'USD' check(currency='USD'),
 available_balance numeric(20,2) not null default 0 check(available_balance>=0),
 reserved_balance numeric(20,2) not null default 0 check(reserved_balance>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.bonus_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 bonus_wallet_id uuid not null references public.bonus_wallet_accounts(id),
 entry_type text not null check(entry_type in ('welcome_bonus','withdrawal_reserve','withdrawal_release','withdrawal_refund','adjustment')),
 amount_usd numeric(20,2) not null,
 balance_after numeric(20,2) not null,
 reserved_after numeric(20,2) not null,
 reference_type text not null,
 reference_id uuid,
 idempotency_key uuid not null unique,
 description text,
 created_at timestamptz not null default now()
);
create table if not exists public.bonus_withdrawal_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 payment_method text not null,
 amount numeric(20,2) not null check(amount>0),
 currency text not null check(currency in ('DZD','USD','EUR')),
 bonus_amount_usd numeric(20,2) not null check(bonus_amount_usd>0),
 destination_details text not null,
 status text not null default 'pending' check(status in ('pending','paid','rejected')),
 admin_note text,
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 paid_at timestamptz,
 payout_reference text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists bonus_ledger_user_created_idx on public.bonus_ledger(user_id,created_at desc);
create index if not exists bonus_withdrawal_requests_user_created_idx on public.bonus_withdrawal_requests(user_id,created_at desc);
create index if not exists bonus_withdrawal_requests_status_created_idx on public.bonus_withdrawal_requests(status,created_at);
create index if not exists bonus_withdrawal_requests_reviewed_by_idx on public.bonus_withdrawal_requests(reviewed_by);

create table if not exists public.deposit_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 payment_method text not null check(payment_method in ('baridimob','binance','redotpay','paysera','bank_transfer','other')),
 amount numeric(20,2) not null check(amount>0), currency text not null check(currency in ('DZD','USD','EUR')),
 sender_reference text, proof_path text, status text not null default 'pending' check(status in ('pending','approved','rejected')),
 admin_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz, wallet_ledger_id uuid references public.wallet_ledger(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.withdrawal_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 payment_method text not null check(payment_method in ('baridimob','binance','redotpay','paysera','bank_transfer','other')),
 amount numeric(20,2) not null check(amount>0), currency text not null check(currency in ('DZD','USD','EUR')),
 destination_details text not null, status text not null default 'pending' check(status in ('pending','approved','paid','rejected')),
 admin_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz, paid_at timestamptz,
 payout_reference text, wallet_ledger_id uuid references public.wallet_ledger(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now());
create table if not exists public.payment_methods (
 id uuid primary key default gen_random_uuid(), code text not null unique check(code in ('baridimob','binance','redotpay','paysera','bank_transfer','other')),
 display_name text not null, supported_currencies text[] not null default array['DZD']::text[], instructions jsonb not null default '{}'::jsonb,
 is_enabled boolean not null default false, sort_order integer not null default 0, updated_by uuid references auth.users(id), updated_at timestamptz not null default now());
create table if not exists public.exchange_rates (
 id uuid primary key default gen_random_uuid(), base_currency text not null check(base_currency in ('DZD','USD','EUR')),
 quote_currency text not null check(quote_currency in ('DZD','USD','EUR')), rate numeric(24,10) not null check(rate>0),
 source text not null, effective_at timestamptz not null, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 check(base_currency<>quote_currency));
create table if not exists public.reward_campaigns (
 id uuid primary key default gen_random_uuid(), name text not null, description text,
 reward_type text not null check(reward_type in ('fixed_credit','percentage_credit','free_bet','loyalty')),
 reward_value numeric(20,4) not null check(reward_value>0), currency text check(currency in ('DZD','USD','EUR')),
 terms jsonb not null default '{}'::jsonb, starts_at timestamptz, ends_at timestamptz, is_active boolean not null default false,
 created_by uuid references auth.users(id), created_at timestamptz not null default now());
create table if not exists public.reward_grants (
 id uuid primary key default gen_random_uuid(), campaign_id uuid references public.reward_campaigns(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict, currency text not null check(currency in ('DZD','USD','EUR')),
 amount numeric(20,2) not null check(amount>0), status text not null default 'granted' check(status in ('granted','used','expired','cancelled')),
 wallet_ledger_id uuid references public.wallet_ledger(id), idempotency_key uuid not null unique, granted_by uuid references auth.users(id),
 granted_at timestamptz not null default now(), expires_at timestamptz);
create index if not exists wallet_ledger_user_created_idx on public.wallet_ledger(user_id,created_at desc);
create index if not exists deposit_requests_user_created_idx on public.deposit_requests(user_id,created_at desc);
create index if not exists deposit_requests_status_created_idx on public.deposit_requests(status,created_at);
create index if not exists withdrawal_requests_user_created_idx on public.withdrawal_requests(user_id,created_at desc);
create index if not exists withdrawal_requests_status_created_idx on public.withdrawal_requests(status,created_at);
create index if not exists exchange_rates_pair_effective_idx on public.exchange_rates(base_currency,quote_currency,effective_at desc);
do $$ declare t text; begin foreach t in array array['wallet_accounts','wallet_ledger','bonus_wallet_accounts','bonus_ledger','bonus_withdrawal_requests','deposit_requests','withdrawal_requests','payment_methods','exchange_rates','reward_campaigns','reward_grants'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy "Users read own bonus wallet" on public.bonus_wallet_accounts
 for select to authenticated using(user_id=(select auth.uid()));
create policy "Users read own bonus ledger" on public.bonus_ledger
 for select to authenticated using(user_id=(select auth.uid()));
create policy "Users and admins read bonus withdrawal requests" on public.bonus_withdrawal_requests
 for select to authenticated using(user_id=(select auth.uid()) or (select public.betnova_is_admin()));
create policy "Users read own wallet accounts" on public.wallet_accounts for select to authenticated using(user_id=(select auth.uid()));
create policy "Admins manage wallet accounts" on public.wallet_accounts for all to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create policy "Users read own wallet ledger" on public.wallet_ledger for select to authenticated using(user_id=(select auth.uid()));
create policy "Admins read wallet ledger" on public.wallet_ledger for select to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create policy "Users read own deposit requests" on public.deposit_requests for select to authenticated using(user_id=(select auth.uid()));
create policy "Users submit deposit requests" on public.deposit_requests for insert to authenticated with check(user_id=(select auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null and wallet_ledger_id is null);
create policy "Admins manage deposit requests" on public.deposit_requests for all to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create policy "Users read own withdrawal requests" on public.withdrawal_requests for select to authenticated using(user_id=(select auth.uid()));
create policy "Admins manage withdrawal requests" on public.withdrawal_requests for all to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create policy "Users read enabled payment methods" on public.payment_methods for select to authenticated using(is_enabled=true);
create policy "Admins manage payment methods" on public.payment_methods for all to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create policy "Users read exchange rates" on public.exchange_rates for select to authenticated using(true);
create policy "Admins manage exchange rates" on public.exchange_rates for all to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create policy "Users read active reward campaigns" on public.reward_campaigns for select to authenticated using(is_active=true);
create policy "Admins manage reward campaigns" on public.reward_campaigns for all to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create policy "Users read own reward grants" on public.reward_grants for select to authenticated using(user_id=(select auth.uid()));
create policy "Admins manage reward grants" on public.reward_grants for all to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
grant select on public.wallet_accounts,public.wallet_ledger,public.bonus_wallet_accounts,public.bonus_ledger,public.bonus_withdrawal_requests,public.deposit_requests,public.withdrawal_requests,public.payment_methods,public.exchange_rates,public.reward_campaigns,public.reward_grants to authenticated;
grant insert on public.deposit_requests to authenticated;
grant insert,update,delete on public.wallet_accounts,public.deposit_requests,public.withdrawal_requests,public.payment_methods,public.exchange_rates,public.reward_campaigns,public.reward_grants to authenticated;
revoke insert,update,delete on public.wallet_ledger from anon,authenticated;
revoke all on public.bonus_wallet_accounts,public.bonus_ledger,public.bonus_withdrawal_requests from anon,authenticated;
grant select on public.bonus_wallet_accounts,public.bonus_ledger,public.bonus_withdrawal_requests to authenticated;