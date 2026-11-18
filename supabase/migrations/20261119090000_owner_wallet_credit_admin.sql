create or replace function public.betnova_admin_credit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_description text,
  p_idempotency_key uuid
) returns numeric
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_wallet public.wallet_accounts%rowtype;
  v_reference_id uuid := gen_random_uuid();
begin
  if auth.uid() is null
     or not public.betnova_is_admin()
     or lower(coalesce(auth.jwt()->>'email','')) <> 'bilalsiempreking@gmail.com' then
    raise exception 'Owner administrator access required';
  end if;

  if p_user_id is null
     or p_currency not in ('DZD','USD','EUR')
     or p_amount is null or p_amount <= 0 or p_amount > 100000000
     or p_amount <> round(p_amount,2)
     or p_idempotency_key is null
     or length(coalesce(p_description,'')) < 4
     or length(p_description) > 240 then
    raise exception 'Invalid wallet credit details';
  end if;

  if not exists (select 1 from auth.users u where u.id=p_user_id) then
    raise exception 'Wallet owner not found';
  end if;

  if exists (select 1 from public.wallet_ledger l where l.idempotency_key=p_idempotency_key) then
    raise exception 'This wallet credit was already processed';
  end if;

  insert into public.wallet_accounts(user_id,currency)
  values(p_user_id,p_currency)
  on conflict(user_id,currency) do nothing;

  select * into v_wallet
  from public.wallet_accounts
  where user_id=p_user_id and currency=p_currency
  for update;

  update public.wallet_accounts
  set available_balance=available_balance+p_amount, updated_at=now()
  where id=v_wallet.id
  returning * into v_wallet;

  insert into public.wallet_ledger(
    wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
    reference_type,reference_id,idempotency_key,description,created_by
  ) values (
    v_wallet.id,p_user_id,p_currency,'adjustment',p_amount,
    v_wallet.available_balance,v_wallet.reserved_balance,
    'admin_credit',v_reference_id,p_idempotency_key,p_description,auth.uid()
  );

  return v_wallet.available_balance;
end;
$function$;

revoke all on function public.betnova_admin_credit_wallet(uuid,numeric,text,text,uuid) from public,anon;
grant execute on function public.betnova_admin_credit_wallet(uuid,numeric,text,text,uuid) to authenticated;
