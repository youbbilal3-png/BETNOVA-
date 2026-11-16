create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
alter table public.wallet_ledger drop constraint if exists wallet_ledger_amount_check;
alter table public.wallet_ledger add column if not exists reserved_after numeric(20,2) not null default 0 check(reserved_after>=0);
alter table public.wallet_ledger drop constraint if exists wallet_ledger_entry_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_entry_type_check check(entry_type in ('deposit','withdrawal_reserve','withdrawal_release','withdrawal_paid','bet_stake','bet_return','bonus','adjustment','refund'));
revoke insert,update,delete on public.wallet_accounts from authenticated;
revoke update,delete on public.deposit_requests from authenticated;
revoke insert,update,delete on public.withdrawal_requests from authenticated;
alter function public.betnova_is_admin() security invoker;
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
revoke all on function public.betnova_review_deposit(uuid,boolean,text) from public,anon;
grant execute on function public.betnova_review_deposit(uuid,boolean,text) to authenticated;