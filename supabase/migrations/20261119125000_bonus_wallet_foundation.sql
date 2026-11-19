-- Separate bonus-wallet foundation. Cash rewards must never be mixed into this wallet.
create table if not exists public.bonus_wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  currency text not null default 'USD' check(currency='USD'),
  available_balance numeric(18,6) not null default 0 check(available_balance>=0),
  reserved_balance numeric(18,6) not null default 0 check(reserved_balance>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bonus_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bonus_wallet_id uuid not null references public.bonus_wallet_accounts(id),
  entry_type text not null check(entry_type in ('welcome_bonus','withdrawal_reserve','withdrawal_release','withdrawal_refund','adjustment')),
  amount_usd numeric(18,6) not null,
  balance_after numeric(18,6) not null,
  reserved_after numeric(18,6) not null,
  reference_type text,
  reference_id uuid,
  idempotency_key uuid unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bonus_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_method text not null,
  amount numeric(20,2) not null check(amount>0),
  currency text not null check(currency in ('DZD','USD','EUR')),
  bonus_amount_usd numeric(18,6) not null check(bonus_amount_usd>0),
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
create index if not exists bonus_withdrawal_user_created_idx on public.bonus_withdrawal_requests(user_id,created_at desc);
create index if not exists bonus_withdrawal_status_created_idx on public.bonus_withdrawal_requests(status,created_at);

alter table public.bonus_wallet_accounts enable row level security;
alter table public.bonus_ledger enable row level security;
alter table public.bonus_withdrawal_requests enable row level security;

drop policy if exists "Users read own bonus wallet" on public.bonus_wallet_accounts;
create policy "Users read own bonus wallet" on public.bonus_wallet_accounts
  for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "Users read own bonus ledger" on public.bonus_ledger;
create policy "Users read own bonus ledger" on public.bonus_ledger
  for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "Users read own bonus withdrawal requests" on public.bonus_withdrawal_requests;
create policy "Users read own bonus withdrawal requests" on public.bonus_withdrawal_requests
  for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "Admins read all bonus withdrawal requests" on public.bonus_withdrawal_requests;
create policy "Admins read all bonus withdrawal requests" on public.bonus_withdrawal_requests
  for select to authenticated using(public.betnova_is_admin());

revoke all on public.bonus_wallet_accounts,public.bonus_ledger,public.bonus_withdrawal_requests from anon,authenticated;
grant select on public.bonus_wallet_accounts,public.bonus_ledger,public.bonus_withdrawal_requests to authenticated;
