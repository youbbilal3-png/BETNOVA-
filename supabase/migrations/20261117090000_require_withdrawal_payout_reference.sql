-- A withdrawal cannot be marked paid without a traceable external transfer reference.
create or replace function public.betnova_review_withdrawal(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null,
  p_payout_reference text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.withdrawal_requests%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_key uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.betnova_is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_action not in ('paid','reject') then
    raise exception 'Invalid withdrawal action';
  end if;
  if p_action='paid' and (
    p_payout_reference is null
    or length(trim(p_payout_reference)) < 4
    or length(p_payout_reference) > 160
  ) then
    raise exception 'A valid external payout reference is required';
  end if;

  select * into v_request
  from public.withdrawal_requests
  where id=p_request_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'Withdrawal request is not pending';
  end if;

  select * into v_wallet
  from public.wallet_accounts
  where user_id=v_request.user_id and currency=v_request.currency
  for update;

  if not found or v_wallet.reserved_balance < v_request.amount then
    raise exception 'Reserved balance mismatch';
  end if;

  if p_action='paid' then
    update public.wallet_accounts
    set reserved_balance=reserved_balance-v_request.amount, updated_at=now()
    where id=v_wallet.id
    returning * into v_wallet;

    update public.withdrawal_requests
    set status='paid',
        admin_note=p_admin_note,
        payout_reference=trim(p_payout_reference),
        reviewed_by=auth.uid(),
        reviewed_at=now(),
        paid_at=now(),
        updated_at=now()
    where id=v_request.id;

    insert into public.wallet_ledger(
      wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
      reference_type,reference_id,idempotency_key,description,created_by
    ) values (
      v_wallet.id,v_request.user_id,v_request.currency,'withdrawal_paid',0,
      v_wallet.available_balance,v_wallet.reserved_balance,'withdrawal',v_request.id,v_key,
      'Withdrawal paid externally by administrator',auth.uid()
    );
  else
    update public.wallet_accounts
    set available_balance=available_balance+v_request.amount,
        reserved_balance=reserved_balance-v_request.amount,
        updated_at=now()
    where id=v_wallet.id
    returning * into v_wallet;

    update public.withdrawal_requests
    set status='rejected',
        admin_note=p_admin_note,
        reviewed_by=auth.uid(),
        reviewed_at=now(),
        updated_at=now()
    where id=v_request.id;

    insert into public.wallet_ledger(
      wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
      reference_type,reference_id,idempotency_key,description,created_by
    ) values (
      v_wallet.id,v_request.user_id,v_request.currency,'withdrawal_release',v_request.amount,
      v_wallet.available_balance,v_wallet.reserved_balance,'withdrawal',v_request.id,v_key,
      'Reserved withdrawal released back to available balance',auth.uid()
    );
  end if;
end;
$$;

revoke all on function public.betnova_review_withdrawal(uuid,text,text,text) from public,anon;
grant execute on function public.betnova_review_withdrawal(uuid,text,text,text) to authenticated,service_role;
