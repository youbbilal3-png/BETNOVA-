-- Signup welcome bonus follows the currency selected in the registration form.
-- Bonus wallets remain USD-denominated internally; the display/withdrawal layer
-- converts at the established BETNOVA rates (260 DZD / USD and 0.90 EUR / USD).

alter table public.bonus_wallet_accounts
  alter column available_balance type numeric(18,6)
    using round(available_balance, 6),
  alter column reserved_balance type numeric(18,6)
    using round(reserved_balance, 6);

alter table public.bonus_ledger
  alter column amount_usd type numeric(18,6)
    using round(amount_usd, 6),
  alter column balance_after type numeric(18,6)
    using round(balance_after, 6),
  alter column reserved_after type numeric(18,6)
    using round(reserved_after, 6);

alter table public.bonus_withdrawal_requests
  alter column bonus_amount_usd type numeric(18,6)
    using round(bonus_amount_usd, 6);

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

  -- USD is the internal accounting unit for bonus balances.
  -- 25,000 DZD at 260 DZD/USD = 96.153846 USD (six decimal precision).
  -- 100 USD is displayed as 100 USD or 90 EUR using the current conversion.
  v_bonus_usd := case v_currency
    when 'DZD' then round(25000.00 / 260.0, 6)
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

create or replace function public.betnova_request_bonus_withdrawal(
  p_payment_method text,
  p_amount numeric,
  p_currency text,
  p_destination_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_wallet public.bonus_wallet_accounts%rowtype;
  v_request uuid := gen_random_uuid();
  v_usd numeric(18,6);
  v_qualifies boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_currency not in ('DZD','USD','EUR') or p_amount is null or p_amount <= 0
    or p_amount <> round(p_amount,2) or p_destination_details is null
    or length(trim(p_destination_details)) < 4 or length(p_destination_details) > 1000 then
    raise exception 'Invalid bonus withdrawal details';
  end if;
  if (p_currency='DZD' and (p_amount<1000 or p_amount>1500000))
    or (p_currency='USD' and (p_amount<1.5 or p_amount>50000))
    or (p_currency='EUR' and (p_amount<1.5 or p_amount>50000)) then
    raise exception 'Bonus withdrawal is outside the allowed limits';
  end if;
  if not exists(
    select 1 from public.payment_methods pm
    where pm.code=p_payment_method and pm.is_enabled=true
      and p_currency=any(pm.supported_currencies)
  ) then
    raise exception 'This withdrawal method is not enabled for the selected currency';
  end if;
  select exists(
    select 1 from public.deposit_requests d
    where d.user_id=v_user and d.status='approved'
    group by d.user_id
    having sum(case
      when d.currency='DZD' then d.amount/260.0
      when d.currency='USD' then d.amount
      when d.currency='EUR' then d.amount/0.9
      else 0 end) >= 10.0
  ) into v_qualifies;
  if not coalesce(v_qualifies,false) then
    raise exception 'A verified deposit totaling at least 10 USD equivalent is required (2600 DZD or 9 EUR). The deposit remains in your real-money wallet.';
  end if;

  v_usd := case p_currency
    when 'DZD' then round(p_amount/260.0,6)
    when 'EUR' then round(p_amount/0.9,6)
    else round(p_amount,6)
  end;

  select * into v_wallet
  from public.bonus_wallet_accounts
  where user_id=v_user
  for update;

  if not found or v_wallet.available_balance < v_usd then
    raise exception 'Insufficient bonus balance';
  end if;

  update public.bonus_wallet_accounts
  set available_balance=available_balance-v_usd,
      reserved_balance=reserved_balance+v_usd,
      updated_at=now()
  where id=v_wallet.id
  returning * into v_wallet;

  insert into public.bonus_withdrawal_requests(
    id,user_id,payment_method,amount,currency,bonus_amount_usd,destination_details
  ) values (
    v_request,v_user,p_payment_method,p_amount,p_currency,v_usd,trim(p_destination_details)
  );

  insert into public.bonus_ledger(
    user_id,bonus_wallet_id,entry_type,amount_usd,balance_after,reserved_after,
    reference_type,reference_id,idempotency_key,description
  ) values (
    v_user,v_wallet.id,'withdrawal_reserve',-v_usd,v_wallet.available_balance,
    v_wallet.reserved_balance,'bonus_withdrawal',v_request,v_request,
    'Bonus withdrawal request reserved pending admin review'
  );

  return v_request;
end;
$$;

create or replace function public.betnova_review_bonus_withdrawal(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null,
  p_payout_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.bonus_withdrawal_requests%rowtype;
  v_wallet public.bonus_wallet_accounts%rowtype;
  v_new_available numeric(18,6);
  v_new_reserved numeric(18,6);
begin
  if auth.uid() is null or not public.betnova_is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_action not in ('paid','reject') then raise exception 'Invalid review action'; end if;
  if p_action='paid' and length(trim(coalesce(p_payout_reference,'')))<4 then
    raise exception 'Payout reference is required';
  end if;

  select * into v_request
  from public.bonus_withdrawal_requests
  where id=p_request_id
  for update;

  if not found or v_request.status<>'pending' then
    raise exception 'Bonus withdrawal request is not pending';
  end if;

  select * into v_wallet
  from public.bonus_wallet_accounts
  where user_id=v_request.user_id
  for update;

  if not found or v_wallet.reserved_balance < v_request.bonus_amount_usd then
    raise exception 'Reserved bonus balance is inconsistent';
  end if;

  v_new_available := v_wallet.available_balance;
  v_new_reserved := v_wallet.reserved_balance-v_request.bonus_amount_usd;

  if p_action='reject' then
    v_new_available := v_new_available+v_request.bonus_amount_usd;
    insert into public.bonus_ledger(
      user_id,bonus_wallet_id,entry_type,amount_usd,balance_after,reserved_after,
      reference_type,reference_id,idempotency_key,description
    ) values (
      v_request.user_id,v_wallet.id,'withdrawal_refund',v_request.bonus_amount_usd,
      v_new_available,v_new_reserved,'bonus_withdrawal',v_request.id,
      gen_random_uuid(),'Rejected bonus withdrawal returned to bonus wallet'
    );
    update public.bonus_withdrawal_requests
    set status='rejected',admin_note=p_admin_note,reviewed_by=auth.uid(),
        reviewed_at=now(),updated_at=now()
    where id=v_request.id;
  else
    insert into public.bonus_ledger(
      user_id,bonus_wallet_id,entry_type,amount_usd,balance_after,reserved_after,
      reference_type,reference_id,idempotency_key,description
    ) values (
      v_request.user_id,v_wallet.id,'withdrawal_release',0,
      v_new_available,v_new_reserved,'bonus_withdrawal',v_request.id,
      gen_random_uuid(),'Bonus withdrawal paid'
    );
    update public.bonus_withdrawal_requests
    set status='paid',admin_note=p_admin_note,reviewed_by=auth.uid(),
        reviewed_at=now(),paid_at=now(),payout_reference=p_payout_reference,
        updated_at=now()
    where id=v_request.id;
  end if;

  update public.bonus_wallet_accounts
  set available_balance=v_new_available,
      reserved_balance=v_new_reserved,
      updated_at=now()
  where id=v_wallet.id;
end;
$$;
