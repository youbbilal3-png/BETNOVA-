-- Keep bet placement available for fresh pre-match and live markets only.
-- A failed live feed must not affect unrelated fixtures or confirmed bets.
create or replace function public.betnova_place_bet(
  p_selections jsonb,
  p_stake numeric,
  p_currency text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_bet_id uuid := gen_random_uuid();
  v_wallet public.wallet_accounts%rowtype;
  v_item jsonb;
  v_selection_id uuid;
  v_fixture_id uuid;
  v_market_id uuid;
  v_odds numeric;
  v_combined numeric := 1;
  v_count integer := 0;
  v_market_label text;
  v_selection_label text;
  v_fixture_status text;
  v_starts_at timestamptz;
  v_market_live boolean;
  v_market_updated_at timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  if p_currency not in ('DZD','USD','EUR') or p_stake is null or p_stake <= 0 or p_stake > 100000000
     or p_stake <> round(p_stake,2) then
    raise exception 'Invalid stake or currency';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array'
     or jsonb_array_length(p_selections) < 1 or jsonb_array_length(p_selections) > 20 then
    raise exception 'Select between 1 and 20 outcomes';
  end if;
  if (select count(distinct value->>'selection_id') from jsonb_array_elements(p_selections))
     <> jsonb_array_length(p_selections) then
    raise exception 'Duplicate selections are not allowed';
  end if;

  select id into v_bet_id from public.bets
  where user_id = v_user and idempotency_key = p_idempotency_key;
  if found then return v_bet_id; end if;

  insert into public.wallet_accounts(user_id,currency)
  values(v_user,p_currency) on conflict(user_id,currency) do nothing;
  select * into v_wallet from public.wallet_accounts
  where user_id = v_user and currency = p_currency for update;

  select id into v_bet_id from public.bets
  where user_id = v_user and idempotency_key = p_idempotency_key;
  if found then return v_bet_id; end if;
  if v_wallet.available_balance < p_stake then raise exception 'Insufficient available balance'; end if;

  for v_item in select value from jsonb_array_elements(p_selections) loop
    if not (v_item ? 'selection_id') then raise exception 'Invalid selection payload'; end if;
    v_selection_id := (v_item->>'selection_id')::uuid;

    select ms.market_id,m.fixture_id,ms.odds,m.name,ms.name,f.status,f.starts_at,m.is_live,m.last_updated_at
      into v_market_id,v_fixture_id,v_odds,v_market_label,v_selection_label,
           v_fixture_status,v_starts_at,v_market_live,v_market_updated_at
    from public.market_selections ms
    join public.markets m on m.id = ms.market_id
    join public.fixtures f on f.id = m.fixture_id
    where ms.id = v_selection_id
      and ms.status = 'active' and ms.result_status = 'pending'
      and m.status = 'open' and m.is_active = true
      and f.status in ('scheduled','live')
    for update of ms,m,f;

    if not found then raise exception 'One of your selections is no longer available'; end if;
    if v_fixture_status = 'scheduled' and v_starts_at <= now() then
      raise exception 'This event has started; live markets are required';
    end if;
    if v_fixture_status = 'live' and not v_market_live then
      raise exception 'This market is not open for live betting';
    end if;
    if v_market_live and v_market_updated_at < now() - interval '3 minutes' then
      raise exception 'Live odds expired. Refresh the market and try again';
    end if;
    if not v_market_live and v_market_updated_at < now() - interval '24 hours' then
      raise exception 'Pre-match odds expired. Refresh the market and try again';
    end if;
    if v_odds <= 1 then raise exception 'Invalid odds'; end if;

    v_combined := v_combined * v_odds;
    v_count := v_count + 1;
  end loop;

  if v_count <> jsonb_array_length(p_selections) then
    raise exception 'Could not validate every selection';
  end if;

  insert into public.bets(id,user_id,currency,stake,combined_odds,potential_return,status,idempotency_key)
  values(v_bet_id,v_user,p_currency,round(p_stake,2),v_combined,
         round(p_stake*v_combined,2),'pending',p_idempotency_key);

  for v_item in select value from jsonb_array_elements(p_selections) loop
    v_selection_id := (v_item->>'selection_id')::uuid;
    insert into public.bet_legs(bet_id,fixture_id,market_id,selection_id,market_label,selection_label,odds_snapshot)
    select v_bet_id,m.fixture_id,m.id,ms.id,m.name,ms.name,ms.odds
    from public.market_selections ms
    join public.markets m on m.id = ms.market_id
    where ms.id = v_selection_id;
  end loop;

  update public.wallet_accounts
  set available_balance = available_balance - round(p_stake,2), updated_at = now()
  where id = v_wallet.id returning * into v_wallet;

  insert into public.wallet_ledger(
    wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
    reference_type,reference_id,idempotency_key,description
  )
  values(
    v_wallet.id,v_user,p_currency,'bet_stake',-round(p_stake,2),
    v_wallet.available_balance,v_wallet.reserved_balance,'bet',v_bet_id,
    p_idempotency_key,'Stake placed on validated selections'
  );
  return v_bet_id;
end;
$function$;

-- Four aggregate live-odds checks per day use one market and one region each.
-- With the existing 12-credit daily pre-match job this targets ~480 credits/month.
select cron.unschedule(jobid)
from cron.job
where jobname = 'betnova-the-odds-api-live-sync';

select cron.schedule(
  'betnova-the-odds-api-live-sync',
  '0 */6 * * *',
  $cron$
    select net.http_post(
      url := 'https://lvhuipkfsdughearjsvy.supabase.co/functions/v1/the-odds-api-sync',
      body := '{"mode":"live"}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-betnova-sync-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'betnova_sync_secret' limit 1)
      ),
      timeout_milliseconds := 120000
    )
    where exists (
      select 1 from vault.decrypted_secrets where name = 'the_odds_api_key'
    )
    and exists (
      select 1 from vault.decrypted_secrets where name = 'betnova_sync_secret'
    );
  $cron$
);
