drop policy if exists "Users submit deposit requests" on public.deposit_requests;
create policy "Users submit deposit requests" on public.deposit_requests for insert to authenticated
with check (
 user_id=(select auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null and wallet_ledger_id is null
 and (proof_path is null or split_part(proof_path,'/',1)=(select auth.uid())::text)
 and exists(select 1 from public.payment_methods pm where pm.code=deposit_requests.payment_method and pm.is_enabled=true and deposit_requests.currency=any(pm.supported_currencies))
);
create or replace function public.betnova_request_withdrawal(p_payment_method text,p_amount numeric,p_currency text,p_destination_details text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_wallet public.wallet_accounts%rowtype; v_request_id uuid:=gen_random_uuid();
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_payment_method not in ('baridimob','binance','redotpay','paysera','bank_transfer','other') or p_currency not in ('DZD','USD','EUR')
 or p_amount is null or p_amount<=0 or p_destination_details is null or length(trim(p_destination_details))<4 or length(p_destination_details)>1000 then raise exception 'Invalid withdrawal details'; end if;
 if not exists(select 1 from public.payment_methods pm where pm.code=p_payment_method and pm.is_enabled=true and p_currency=any(pm.supported_currencies)) then raise exception 'This withdrawal method is not currently available for the selected currency'; end if;
 select * into v_wallet from public.wallet_accounts where user_id=v_user and currency=p_currency for update;
 if not found or v_wallet.available_balance<p_amount then raise exception 'Insufficient available balance'; end if;
 update public.wallet_accounts set available_balance=available_balance-p_amount,reserved_balance=reserved_balance+p_amount,updated_at=now() where id=v_wallet.id returning * into v_wallet;
 insert into public.withdrawal_requests(id,user_id,payment_method,amount,currency,destination_details) values(v_request_id,v_user,p_payment_method,p_amount,p_currency,trim(p_destination_details));
 insert into public.wallet_ledger(wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,reference_type,reference_id,idempotency_key,description)
 values(v_wallet.id,v_user,p_currency,'withdrawal_reserve',-p_amount,v_wallet.available_balance,v_wallet.reserved_balance,'withdrawal',v_request_id,v_request_id,'Withdrawal amount reserved pending review');
 return v_request_id;
end; $$;
revoke all on function public.betnova_request_withdrawal(text,numeric,text,text) from public,anon;
grant execute on function public.betnova_request_withdrawal(text,numeric,text,text) to authenticated;