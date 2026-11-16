create or replace function public.betnova_is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'); $$;
revoke all on function public.betnova_is_admin() from public,anon;
grant execute on function public.betnova_is_admin() to authenticated;
create or replace function public.betnova_request_withdrawal(p_payment_method text,p_amount numeric,p_currency text,p_destination_details text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_wallet public.wallet_accounts%rowtype; v_request_id uuid:=gen_random_uuid();
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_payment_method not in ('baridimob','binance','redotpay','paysera','bank_transfer','other') or p_currency not in ('DZD','USD','EUR') or p_amount is null or p_amount<=0 or p_destination_details is null or length(trim(p_destination_details))<4 or length(p_destination_details)>1000 then raise exception 'Invalid withdrawal details'; end if;
 select * into v_wallet from public.wallet_accounts where user_id=v_user and currency=p_currency for update;
 if not found or v_wallet.available_balance<p_amount then raise exception 'Insufficient available balance'; end if;
 update public.wallet_accounts set available_balance=available_balance-p_amount,reserved_balance=reserved_balance+p_amount,updated_at=now() where id=v_wallet.id returning * into v_wallet;
 insert into public.withdrawal_requests(id,user_id,payment_method,amount,currency,destination_details) values(v_request_id,v_user,p_payment_method,p_amount,p_currency,trim(p_destination_details));
 insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description)
 values(v_wallet.id,v_user,p_currency,'withdrawal_reserve',-p_amount,v_wallet.available_balance,v_wallet.reserved_balance,'withdrawal',v_request_id,v_request_id,'Withdrawal amount reserved pending review');
 return v_request_id;
end; $$;
create or replace function public.betnova_review_deposit(p_request_id uuid,p_approve boolean,p_admin_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare v_request public.deposit_requests%rowtype; v_wallet public.wallet_accounts%rowtype;
begin
 if auth.uid() is null or not public.betnova_is_admin() then raise exception 'Administrator access required'; end if;
 select * into v_request from public.deposit_requests where id=p_request_id for update;
 if not found or v_request.status<>'pending' then raise exception 'Deposit request is not pending'; end if;
 if p_approve then
  insert into public.wallet_accounts(user_id,currency) values(v_request.user_id,v_request.currency) on conflict(user_id,currency) do nothing;
  select * into v_wallet from public.wallet_accounts where user_id=v_request.user_id and currency=v_request.currency for update;
  update public.wallet_accounts set available_balance=available_balance+v_request.amount,updated_at=now() where id=v_wallet.id returning * into v_wallet;
  insert into public.wallet_ledger(id,wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description,created_by)
  values(v_request.id,v_wallet.id,v_request.user_id,v_request.currency,'deposit',v_request.amount,v_wallet.available_balance,v_wallet.reserved_balance,'deposit',v_request.id,v_request.id,'Admin-confirmed deposit',auth.uid());
  update public.deposit_requests set status='approved',admin_note=p_admin_note,reviewed_by=auth.uid(),reviewed_at=now(),wallet_ledger_id=v_request.id,updated_at=now() where id=v_request.id;
 else
  update public.deposit_requests set status='rejected',admin_note=p_admin_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=v_request.id;
 end if;
end; $$;
create or replace function public.betnova_review_withdrawal(p_request_id uuid,p_action text,p_admin_note text default null,p_payout_reference text default null) returns void language plpgsql security definer set search_path='' as $$
declare v_request public.withdrawal_requests%rowtype; v_wallet public.wallet_accounts%rowtype; v_key uuid:=gen_random_uuid();
begin
 if auth.uid() is null or not public.betnova_is_admin() then raise exception 'Administrator access required'; end if;
 if p_action not in ('paid','reject') then raise exception 'Invalid withdrawal action'; end if;
 select * into v_request from public.withdrawal_requests where id=p_request_id for update;
 if not found or v_request.status<>'pending' then raise exception 'Withdrawal request is not pending'; end if;
 select * into v_wallet from public.wallet_accounts where user_id=v_request.user_id and currency=v_request.currency for update;
 if not found or v_wallet.reserved_balance<v_request.amount then raise exception 'Reserved balance mismatch'; end if;
 if p_action='paid' then
  update public.wallet_accounts set reserved_balance=reserved_balance-v_request.amount,updated_at=now() where id=v_wallet.id returning * into v_wallet;
  update public.withdrawal_requests set status='paid',admin_note=p_admin_note,payout_reference=p_payout_reference,reviewed_by=auth.uid(),reviewed_at=now(),paid_at=now(),updated_at=now() where id=v_request.id;
  insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description,created_by)
  values(v_wallet.id,v_request.user_id,v_request.currency,'withdrawal_paid',0,v_wallet.available_balance,v_wallet.reserved_balance,'withdrawal',v_request.id,v_key,'Withdrawal paid externally by administrator',auth.uid());
 else
  update public.wallet_accounts set available_balance=available_balance+v_request.amount,reserved_balance=reserved_balance-v_request.amount,updated_at=now() where id=v_wallet.id returning * into v_wallet;
  update public.withdrawal_requests set status='rejected',admin_note=p_admin_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=v_request.id;
  insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description,created_by)
  values(v_wallet.id,v_request.user_id,v_request.currency,'withdrawal_release',v_request.amount,v_wallet.available_balance,v_wallet.reserved_balance,'withdrawal',v_request.id,v_key,'Reserved withdrawal released back to available balance',auth.uid());
 end if;
end; $$;
revoke all on function public.betnova_request_withdrawal(text,numeric,text,text) from public,anon;
revoke all on function public.betnova_review_deposit(uuid,boolean,text) from public,anon;
revoke all on function public.betnova_review_withdrawal(uuid,text,text,text) from public,anon;
grant execute on function public.betnova_request_withdrawal(text,numeric,text,text) to authenticated;
grant execute on function public.betnova_review_deposit(uuid,boolean,text) to authenticated;
grant execute on function public.betnova_review_withdrawal(uuid,text,text,text) to authenticated;