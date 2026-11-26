-- One signup bonus, displayed only in the currency selected at registration.
-- Bonus balances stay USD-denominated internally for compatibility with the
-- existing bonus betting/withdrawal engine; only the selected currency is shown.
-- A user's first cash wallet is created in their selected currency. Additional
-- wallets can only be opened for that same authenticated user and start at zero.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bonus_wallet uuid;
  v_currency text;
  v_bonus_usd numeric(18,6);
  v_bonus_label text;
begin
  v_currency := case upper(coalesce(new.raw_user_meta_data ->> 'preferred_currency', 'DZD'))
    when 'USD' then 'USD'
    when 'EUR' then 'EUR'
    else 'DZD'
  end;

  v_bonus_usd := case v_currency
    when 'DZD' then round(25000.00 / 260.0, 6)
    when 'EUR' then 100.00
    else 100.00
  end;
  v_bonus_label := case v_currency
    when 'DZD' then '25,000 DZD'
    when 'EUR' then '90 EUR'
    else '100 USD'
  end;

  insert into public.profiles (id, display_name, country_code, preferred_currency)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'country_code', ''),
    v_currency
  )
  on conflict (id) do update
    set preferred_currency = excluded.preferred_currency;

  -- Create only the selected real-money wallet; never pre-create the other currencies.
  insert into public.wallet_accounts(user_id, currency)
  values(new.id, v_currency)
  on conflict(user_id, currency) do nothing;

  -- Unique user_id + idempotency key ensure exactly one welcome bonus per user.
  insert into public.bonus_wallet_accounts(user_id, currency, available_balance)
  values(new.id, 'USD', v_bonus_usd)
  on conflict(user_id) do nothing
  returning id into v_bonus_wallet;

  if v_bonus_wallet is not null then
    insert into public.bonus_ledger(
      user_id, bonus_wallet_id, entry_type, amount_usd, balance_after, reserved_after,
      reference_type, reference_id, idempotency_key, description
    ) values (
      new.id, v_bonus_wallet, 'welcome_bonus', v_bonus_usd, v_bonus_usd, 0,
      'signup', new.id, new.id, 'BETNOVA welcome bonus of ' || v_bonus_label
    )
    on conflict(idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.betnova_open_currency_account(p_currency text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_wallet public.wallet_accounts%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if v_currency not in ('DZD','USD','EUR') then
    raise exception 'Unsupported currency';
  end if;

  insert into public.wallet_accounts(user_id, currency)
  values(v_user, v_currency)
  on conflict(user_id, currency) do nothing;

  select * into v_wallet
  from public.wallet_accounts
  where user_id = v_user and currency = v_currency;

  return jsonb_build_object(
    'ok', true,
    'currency', v_wallet.currency,
    'available_balance', v_wallet.available_balance,
    'reserved_balance', v_wallet.reserved_balance,
    'created', v_wallet.available_balance = 0 and v_wallet.reserved_balance = 0
  );
end;
$$;

revoke all on function public.betnova_open_currency_account(text) from public, anon;
grant execute on function public.betnova_open_currency_account(text) to authenticated;
