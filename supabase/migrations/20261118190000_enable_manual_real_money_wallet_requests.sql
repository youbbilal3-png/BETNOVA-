-- Enable real-money manual deposit requests and secure wallet operations.
-- Payment account details remain administrator-managed in public.payment_methods.

create or replace function public.betnova_request_deposit(
  p_payment_method text,
  p_amount numeric,
  p_currency text,
  p_sender_reference text,
  p_proof_path text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_request_id uuid := gen_random_uuid();
  v_reference text := nullif(trim(p_sender_reference), '');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_payment_method not in ('baridimob','binance','redotpay','paysera')
     or p_currency not in ('DZD','USD','EUR')
     or p_amount is null or p_amount <= 0 or p_amount > 100000000
     or p_amount <> round(p_amount,2)
     or v_reference is null or length(v_reference) < 3 or length(v_reference) > 120
     or p_proof_path is null or length(p_proof_path) > 500
     or split_part(p_proof_path,'/',1) <> v_user::text
  then
    raise exception 'Invalid deposit details. A transfer reference and proof are required.';
  end if;

  if not exists (
    select 1 from public.payment_methods pm
    where pm.code = p_payment_method
      and pm.is_enabled = true
      and p_currency = any(pm.supported_currencies)
  ) then
    raise exception 'This payment method is not enabled for the selected currency';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'deposit-proofs'
      and o.name = p_proof_path
  ) then
    raise exception 'Payment proof upload was not found';
  end if;

  if exists (
    select 1 from public.deposit_requests d
    where d.payment_method = p_payment_method
      and lower(d.sender_reference) = lower(v_reference)
  ) then
    raise exception 'This transfer reference has already been submitted';
  end if;

  insert into public.deposit_requests(
    id,user_id,payment_method,amount,currency,sender_reference,proof_path,status
  ) values (
    v_request_id,v_user,p_payment_method,p_amount,p_currency,v_reference,p_proof_path,'pending'
  );

  return v_request_id;
end;
$function$;

revoke all on function public.betnova_request_deposit(text,numeric,text,text,text) from public, anon;
grant execute on function public.betnova_request_deposit(text,numeric,text,text,text) to authenticated;

-- All balance changes must go through privileged, atomic database functions.
revoke insert, update, delete on public.deposit_requests from anon, authenticated;
grant select on public.deposit_requests to authenticated;

revoke insert, update, delete on public.withdrawal_requests from anon, authenticated;
grant select on public.withdrawal_requests to authenticated;

revoke insert, update, delete on public.wallet_accounts from anon, authenticated;
grant select on public.wallet_accounts to authenticated;

revoke insert, update, delete on public.wallet_ledger from anon, authenticated;
grant select on public.wallet_ledger to authenticated;

-- Authenticated users may place bets only through the validated wallet transaction.
revoke all on function public.betnova_place_bet(jsonb,numeric,text,uuid) from public, anon, authenticated;
grant execute on function public.betnova_place_bet(jsonb,numeric,text,uuid) to authenticated;

-- Market settlement remains server-side only.
revoke all on function public.betnova_settle_market(uuid,uuid[],boolean) from public, anon, authenticated;

-- Prevent unsupported same-fixture combinations from being multiplied as independent odds.
create unique index if not exists bet_legs_one_selection_per_fixture_idx
  on public.bet_legs(bet_id,fixture_id);
