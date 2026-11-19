alter table public.payment_methods
  add column if not exists is_withdrawal_enabled boolean not null default false;

update public.payment_methods
set is_withdrawal_enabled = true
where code in ('baridimob', 'binance', 'redotpay', 'paysera');
