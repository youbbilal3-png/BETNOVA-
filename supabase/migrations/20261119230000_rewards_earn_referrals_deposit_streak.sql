-- BETNOVA Rewards/Earn: review-gated cash credits with separate bonus wallet.
-- No user-facing operation can directly write reward claims or cash-wallet balances.

create table public.earn_post_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  platform text not null check(platform in ('facebook','instagram','tiktok','youtube')),
  post_url text not null check(length(trim(post_url)) between 12 and 2048),
  proof_path text not null check(length(trim(proof_path)) between 5 and 500),
  proof_sha256 text not null check(proof_sha256 ~ '^[a-f0-9]{64}$'),
  reward_amount numeric(20,2) not null default 50 check(reward_amount=50),
  currency text not null default 'DZD' check(currency='DZD'),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  wallet_ledger_id uuid unique references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint earn_post_platform_url_domain check(
    (platform='facebook' and post_url ~* '^https?://([a-z0-9-]+\.)*(facebook\.com|fb\.watch)(/|[?#]|$)') or
    (platform='instagram' and post_url ~* '^https?://([a-z0-9-]+\.)*instagram\.com(/|[?#]|$)') or
    (platform='tiktok' and post_url ~* '^https?://([a-z0-9-]+\.)*tiktok\.com(/|[?#]|$)') or
    (platform='youtube' and (post_url ~* '^https?://([a-z0-9-]+\.)*youtube\.com(/|[?#]|$)' or post_url ~* '^https?://youtu\.be(/|[?#]|$)'))
  ),
  constraint earn_post_review_state check(
    (status='pending' and reviewed_by is null and reviewed_at is null and wallet_ledger_id is null) or
    (status='approved' and reviewed_by is not null and reviewed_at is not null and wallet_ledger_id is not null) or
    (status='rejected' and reviewed_by is not null and reviewed_at is not null and wallet_ledger_id is null)
  )
);
create unique index earn_post_submissions_url_unique on public.earn_post_submissions(lower(post_url));
create unique index earn_post_submissions_proof_hash_unique on public.earn_post_submissions(proof_sha256);
create index earn_post_submissions_status_created_idx on public.earn_post_submissions(status,created_at);

create table public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check(code ~ '^[A-F0-9]{10}$'),
  created_at timestamptz not null default now()
);

create table public.referrals (
  referred_user_id uuid primary key references auth.users(id) on delete restrict,
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  referral_code text not null references public.referral_codes(code) on delete restrict,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reward_amount numeric(20,2) not null default 100 check(reward_amount=100),
  currency text not null default 'DZD' check(currency='DZD'),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  wallet_ledger_id uuid unique references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint referrals_no_self_referral check(referrer_user_id<>referred_user_id),
  constraint referral_review_state check(
    (status='pending' and reviewed_by is null and reviewed_at is null and wallet_ledger_id is null) or
    (status='approved' and reviewed_at is not null and wallet_ledger_id is not null) or
    (status='rejected' and reviewed_by is not null and reviewed_at is not null and wallet_ledger_id is null)
  )
);
create index referrals_referrer_created_idx on public.referrals(referrer_user_id,created_at desc);
create index referrals_status_created_idx on public.referrals(status,created_at);

create table public.deposit_streak_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  cycle_anchor_deposit_id uuid not null unique references public.deposit_requests(id) on delete restrict,
  currency text not null check(currency in ('DZD','USD','EUR')),
  deposit_count integer not null default 5 check(deposit_count=5),
  total_deposited numeric(20,2) not null check(total_deposited>0),
  reward_rate numeric(5,4) not null default 0.05 check(reward_rate=0.05),
  reward_amount numeric(20,2) not null check(reward_amount>0),
  wallet_ledger_id uuid unique references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index deposit_streak_claims_user_created_idx on public.deposit_streak_claims(user_id,created_at desc);


alter table public.earn_post_submissions enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.deposit_streak_claims enable row level security;

create policy "Users read own earn submissions" on public.earn_post_submissions
  for select to authenticated using(user_id=(select auth.uid()));
create policy "Admins read earn submissions" on public.earn_post_submissions
  for select to authenticated using(public.betnova_is_admin());
create policy "Users read referrals they invited" on public.referrals
  for select to authenticated using(referrer_user_id=(select auth.uid()));
create policy "Admins read referrals" on public.referrals
  for select to authenticated using(public.betnova_is_admin());
create policy "Users read own deposit streak claims" on public.deposit_streak_claims
  for select to authenticated using(user_id=(select auth.uid()));
create policy "Admins read deposit streak claims" on public.deposit_streak_claims
  for select to authenticated using(public.betnova_is_admin());

revoke all on public.earn_post_submissions,public.referral_codes,public.referrals,public.deposit_streak_claims from anon,authenticated;
grant select on public.earn_post_submissions,public.referrals,public.deposit_streak_claims to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('earn-proofs','earn-proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy "Users upload own earn proof" on storage.objects
  for insert to authenticated with check(
    bucket_id='earn-proofs' and (storage.foldername(name))[1]=(select auth.uid())::text
  );
create policy "Users read own earn proof" on storage.objects
  for select to authenticated using(
    bucket_id='earn-proofs' and (storage.foldername(name))[1]=(select auth.uid())::text
  );
create policy "Admins read earn proofs" on storage.objects
  for select to authenticated using(bucket_id='earn-proofs' and public.betnova_is_admin());

create or replace function public.betnova_get_referral_code()
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_code text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  loop
    begin
      insert into public.referral_codes(user_id,code)
      values(v_user,upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)))
      on conflict(user_id) do nothing;
      exit;
    exception when unique_violation then
      if exists(select 1 from public.referral_codes where user_id=v_user) then exit; end if;
    end;
  end loop;
  select code into v_code from public.referral_codes where user_id=v_user;
  return v_code;
end;
$$;
revoke all on function public.betnova_get_referral_code() from public,anon;
grant execute on function public.betnova_get_referral_code() to authenticated;

create or replace function private.betnova_capture_referral_signup()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_code text;
  v_referrer uuid;
begin
  v_code:=upper(trim(coalesce(new.raw_user_meta_data->>'referral_code','')));
  if v_code='' then return new; end if;
  select user_id into v_referrer from public.referral_codes where code=v_code;
  if v_referrer is null or v_referrer=new.id then return new; end if;
  insert into public.referrals(referred_user_id,referrer_user_id,referral_code)
  values(new.id,v_referrer,v_code)
  on conflict(referred_user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.betnova_capture_referral_signup() from public,anon,authenticated;
drop trigger if exists betnova_capture_referral_signup on auth.users;
create trigger betnova_capture_referral_signup after insert on auth.users
  for each row execute function private.betnova_capture_referral_signup();

create or replace function private.betnova_credit_cash_reward(
  p_user_id uuid,p_amount numeric,p_currency text,p_reference_type text,p_reference_id uuid,p_description text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_wallet public.wallet_accounts%rowtype;
  v_ledger_id uuid:=gen_random_uuid();
begin
  if p_user_id is null or p_amount is null or p_amount<=0
    or p_currency not in ('DZD','USD','EUR') or p_reference_id is null
    or p_reference_type not in ('earn_post','referral','deposit_streak')
    or length(coalesce(p_description,''))>300 then
    raise exception 'Invalid cash reward credit';
  end if;
  insert into public.wallet_accounts(user_id,currency) values(p_user_id,p_currency)
    on conflict(user_id,currency) do nothing;
  select * into v_wallet from public.wallet_accounts
    where user_id=p_user_id and currency=p_currency for update;
  update public.wallet_accounts set available_balance=available_balance+round(p_amount,2),updated_at=now()
    where id=v_wallet.id returning * into v_wallet;
  insert into public.wallet_ledger(
    id,wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
    reference_type,reference_id,idempotency_key,description
  ) values(
    v_ledger_id,v_wallet.id,p_user_id,p_currency,'bonus',round(p_amount,2),
    v_wallet.available_balance,v_wallet.reserved_balance,p_reference_type,p_reference_id,
    v_ledger_id,p_description
  );
  return v_ledger_id;
end;
$$;
revoke all on function private.betnova_credit_cash_reward(uuid,numeric,text,text,uuid,text) from public,anon,authenticated;

create or replace function public.betnova_review_earn_submission(
  p_submission_id uuid,p_action text,p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item public.earn_post_submissions%rowtype;
  v_ledger_id uuid;
begin
  if auth.uid() is null or not public.betnova_is_admin() then raise exception 'Administrator access required'; end if;
  if p_action not in ('approve','reject') then raise exception 'Invalid review action'; end if;
  if length(coalesce(p_review_note,''))>1000 then raise exception 'Review note is too long'; end if;
  select * into v_item from public.earn_post_submissions where id=p_submission_id for update;
  if not found or v_item.status<>'pending' then raise exception 'Submission is not pending'; end if;
  if p_action='approve' then
    v_ledger_id:=private.betnova_credit_cash_reward(
      v_item.user_id,50,'DZD','earn_post',v_item.id,'Approved social post reward · 50 DZD'
    );
    update public.earn_post_submissions set status='approved',wallet_ledger_id=v_ledger_id,
      review_note=p_review_note,reviewed_by=auth.uid(),reviewed_at=now() where id=v_item.id;
  else
    update public.earn_post_submissions set status='rejected',review_note=p_review_note,
      reviewed_by=auth.uid(),reviewed_at=now() where id=v_item.id;
  end if;
end;
$$;
revoke all on function public.betnova_review_earn_submission(uuid,text,text) from public,anon;
grant execute on function public.betnova_review_earn_submission(uuid,text,text) to authenticated;

create or replace function public.betnova_review_referral(
  p_referred_user_id uuid,p_action text,p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item public.referrals%rowtype;
  v_email_confirmed timestamptz;
  v_ledger_id uuid;
begin
  if auth.uid() is null or not public.betnova_is_admin() then raise exception 'Administrator access required'; end if;
  if p_action not in ('approve','reject') then raise exception 'Invalid review action'; end if;
  if length(coalesce(p_review_note,''))>1000 then raise exception 'Review note is too long'; end if;
  select * into v_item from public.referrals where referred_user_id=p_referred_user_id for update;
  if not found or v_item.status<>'pending' then raise exception 'Referral is not pending'; end if;
  if p_action='approve' then
    select email_confirmed_at into v_email_confirmed from auth.users where id=v_item.referred_user_id;
    if v_email_confirmed is null then raise exception 'Referred account email must be verified first'; end if;
    v_ledger_id:=private.betnova_credit_cash_reward(
      v_item.referrer_user_id,100,'DZD','referral',v_item.referred_user_id,'Approved referral reward · 100 DZD'
    );
    update public.referrals set status='approved',wallet_ledger_id=v_ledger_id,
      review_note=p_review_note,reviewed_by=auth.uid(),reviewed_at=now()
      where referred_user_id=v_item.referred_user_id;
  else
    update public.referrals set status='rejected',review_note=p_review_note,
      reviewed_by=auth.uid(),reviewed_at=now() where referred_user_id=v_item.referred_user_id;
  end if;
end;
$$;
revoke all on function public.betnova_review_referral(uuid,text,text) from public,anon;
grant execute on function public.betnova_review_referral(uuid,text,text) to authenticated;

create or replace function private.betnova_process_deposit_streak()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_block record;
  v_claim_id uuid;
  v_ledger_id uuid;
  v_reward numeric(20,2);
begin
  if old.status<>'pending' or new.status<>'approved' then return new; end if;

  -- Serialize a user's approval transitions. Claims are additionally unique by
  -- the fifth deposit in each chronological block, so retries cannot double-pay.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));

  for v_block in
    with ordered as (
      select d.id,d.currency,d.amount,d.status,d.created_at,
        lag(d.currency) over(order by d.created_at,d.id) as previous_currency
      from public.deposit_requests d
      where d.user_id=new.user_id
    ), segmented as (
      select o.*,
        sum(case when status<>'approved' or previous_currency is distinct from currency then 1 else 0 end)
          over(order by created_at,id rows between unbounded preceding and current row) as run_key
      from ordered o
    ), approved_runs as (
      select s.*,
        row_number() over(partition by run_key order by created_at,id) as run_position
      from segmented s
      where status='approved'
    ), complete_blocks as (
      select run_key,((run_position-1)/5)::integer as block_number,
        count(*) as block_count,count(distinct currency) as currency_count,
        min(currency) as currency,round(sum(amount),2) as total_deposited,
        (array_agg(id order by run_position))[5] as anchor_id
      from approved_runs
      group by run_key,((run_position-1)/5)::integer
      having count(*)=5
    )
    select * from complete_blocks where currency_count=1
  loop
    v_reward:=round(v_block.total_deposited*0.05,2);
    if v_reward<=0 then continue; end if;
    v_claim_id:=gen_random_uuid();
    insert into public.deposit_streak_claims(
      id,user_id,cycle_anchor_deposit_id,currency,total_deposited,reward_amount
    ) values(
      v_claim_id,new.user_id,v_block.anchor_id,v_block.currency,v_block.total_deposited,v_reward
    )
    on conflict(cycle_anchor_deposit_id) do nothing
    returning id into v_claim_id;
    if v_claim_id is null then continue; end if;

    v_ledger_id:=private.betnova_credit_cash_reward(
      new.user_id,v_reward,v_block.currency,'deposit_streak',v_block.anchor_id,
      'Five consecutive approved deposits · 5% reward'
    );
    update public.deposit_streak_claims set wallet_ledger_id=v_ledger_id where id=v_claim_id;
  end loop;
  return new;
end;
$$;
revoke all on function private.betnova_process_deposit_streak() from public,anon,authenticated;
drop trigger if exists betnova_process_deposit_streak on public.deposit_requests;
create trigger betnova_process_deposit_streak after update of status on public.deposit_requests
  for each row execute function private.betnova_process_deposit_streak();

-- Referral credits are automatic once the referred new account confirms its email.
create or replace function private.betnova_process_referral_verification()
returns trigger
language plpgsql
security definer
set search_path=''
as $referral$
declare
  v_item public.referrals%rowtype;
  v_ledger_id uuid;
begin
  if new.email_confirmed_at is null then return new; end if;
  if tg_op='UPDATE' and old.email_confirmed_at is not null then return new; end if;

  select * into v_item
  from public.referrals
  where referred_user_id=new.id
  for update;

  if not found or v_item.status<>'pending' then return new; end if;
  if v_item.referrer_user_id=new.id then return new; end if;

  v_ledger_id:=private.betnova_credit_cash_reward(
    v_item.referrer_user_id,100,'DZD','referral',new.id,
    'Verified referral reward · 100 DZD'
  );

  update public.referrals
  set status='approved',
      wallet_ledger_id=v_ledger_id,
      review_note='Automatically credited after email verification',
      reviewed_by=null,
      reviewed_at=now()
  where referred_user_id=new.id;

  return new;
end;
$referral$;
revoke all on function private.betnova_process_referral_verification() from public,anon,authenticated;
drop trigger if exists betnova_process_referral_verification on auth.users;
create trigger betnova_process_referral_verification
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.betnova_process_referral_verification();
