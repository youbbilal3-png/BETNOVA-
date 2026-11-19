-- BETNOVA rewards and earn center.
-- Cash rewards are credited only by locked, idempotent server-side review/trigger functions.
-- Welcome bonus remains in the separate bonus wallet and is not changed here.

create table if not exists public.earn_post_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  platform text not null check (platform in ('facebook','instagram','tiktok','youtube')),
  post_url text not null check (length(trim(post_url)) between 12 and 2048),
  proof_path text not null check (length(trim(proof_path)) between 5 and 500),
  proof_sha256 text not null check (proof_sha256 ~ '^[a-f0-9]{64}  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reward_amount numeric(20,2) not null default 50 check (reward_amount = 50),
  currency text not null default 'DZD' check (currency = 'DZD'),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  wallet_ledger_id uuid unique references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index if not exists earn_post_submissions_url_unique
  on public.earn_post_submissions (lower(post_url));
create unique index if not exists earn_post_submissions_proof_hash_unique
  on public.earn_post_submissions (proof_sha256);
create index if not exists earn_post_submissions_status_created_idx
  on public.earn_post_submissions(status, created_at);

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-F0-9]{10}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  referred_user_id uuid primary key references auth.users(id) on delete restrict,
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reward_amount numeric(20,2) not null default 100 check (reward_amount = 100),
  currency text not null default 'DZD' check (currency = 'DZD'),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  wallet_ledger_id uuid unique references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint referrals_no_self_referral check (referrer_user_id <> referred_user_id)
);
create index if not exists referrals_referrer_created_idx
  on public.referrals(referrer_user_id, created_at desc);
create index if not exists referrals_status_created_idx
  on public.referrals(status, created_at);

create table if not exists public.deposit_streak_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  cycle_anchor_deposit_id uuid not null unique references public.deposit_requests(id) on delete restrict,
  currency text not null check (currency in ('DZD','USD','EUR')),
  deposit_count integer not null default 5 check (deposit_count = 5),
  total_deposited numeric(20,2) not null check (total_deposited > 0),
  reward_rate numeric(5,4) not null default 0.05 check (reward_rate = 0.05),
  reward_amount numeric(20,2) not null check (reward_amount > 0),
  wallet_ledger_id uuid unique references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists deposit_streak_claims_user_created_idx
  on public.deposit_streak_claims(user_id, created_at desc);

alter table public.earn_post_submissions enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.deposit_streak_claims enable row level security;

create policy "Users read own earn submissions" on public.earn_post_submissions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Admins read earn submissions" on public.earn_post_submissions
  for select to authenticated using (exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));
create policy "Users submit own earn posts" on public.earn_post_submissions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and reward_amount = 50
    and currency = 'DZD'
    and proof_path like ((select auth.uid())::text || '/%')
  );

create policy "Users read referrals they invited" on public.referrals
  for select to authenticated using (referrer_user_id = (select auth.uid()));
create policy "Admins read referrals" on public.referrals
  for select to authenticated using (exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));

create policy "Users read own deposit streak claims" on public.deposit_streak_claims
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Admins read deposit streak claims" on public.deposit_streak_claims
  for select to authenticated using (exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));

grant select, insert on public.earn_post_submissions to authenticated;
grant select on public.referrals, public.deposit_streak_claims to authenticated;
revoke update, delete on public.earn_post_submissions, public.referrals, public.deposit_streak_claims from anon, authenticated;
revoke all on public.referral_codes from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('earn-proofs','earn-proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy "Users upload own earn proof" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'earn-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users read own earn proof" on storage.objects
  for select to authenticated using (
    bucket_id = 'earn-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Admins read earn proofs" on storage.objects
  for select to authenticated using (
    bucket_id = 'earn-proofs' and exists (
      select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

create or replace function public.betnova_get_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.referral_codes(user_id, code)
  values (v_user, upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)))
  on conflict (user_id) do nothing;
  select code into v_code from public.referral_codes where user_id = v_user;
  return v_code;
end;
$$;
revoke all on function public.betnova_get_referral_code() from public, anon;
grant execute on function public.betnova_get_referral_code() to authenticated;

create or replace function private.betnova_capture_referral_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_referrer uuid;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code','')));
  if v_code = '' then return new; end if;
  select user_id into v_referrer from public.referral_codes where code = v_code;
  if v_referrer is null or v_referrer = new.id then return new; end if;
  insert into public.referrals(referred_user_id,referrer_user_id,referral_code)
  values(new.id,v_referrer,v_code)
  on conflict(referred_user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.betnova_capture_referral_signup() from public, anon, authenticated;
drop trigger if exists betnova_capture_referral_signup on auth.users;
create trigger betnova_capture_referral_signup
  after insert on auth.users
  for each row execute function private.betnova_capture_referral_signup();

create or replace function private.betnova_credit_cash_reward(
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_reference_type text,
  p_reference_id uuid,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallet_accounts%rowtype;
  v_ledger_id uuid := gen_random_uuid();
begin
  if p_user_id is null or p_amount is null or p_amount <= 0
    or p_currency not in ('DZD','USD','EUR') or p_reference_id is null then
    raise exception 'Invalid cash reward credit';
  end if;
  insert into public.wallet_accounts(user_id,currency)
  values(p_user_id,p_currency)
  on conflict(user_id,currency) do nothing;
  select * into v_wallet from public.wallet_accounts
  where user_id=p_user_id and currency=p_currency for update;
  update public.wallet_accounts
    set available_balance=available_balance+p_amount, updated_at=now()
    where id=v_wallet.id returning * into v_wallet;
  insert into public.wallet_ledger(
    id,wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
    reference_type,reference_id,idempotency_key,description
  ) values (
    v_ledger_id,v_wallet.id,p_user_id,p_currency,'bonus',p_amount,
    v_wallet.available_balance,v_wallet.reserved_balance,
    p_reference_type,p_reference_id,p_reference_id,p_description
  );
  return v_ledger_id;
end;
$$;
revoke all on function private.betnova_credit_cash_reward(uuid,numeric,text,text,uuid,text) from public, anon, authenticated;

create or replace function public.betnova_review_earn_submission(
  p_submission_id uuid,
  p_action text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.earn_post_submissions%rowtype;
  v_ledger_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
  ) then raise exception 'Administrator access required'; end if;
  if p_action is null or p_action not in ('approve','reject') then raise exception 'Invalid review action'; end if;
  select * into v_item from public.earn_post_submissions where id=p_submission_id for update;
  if not found or v_item.status <> 'pending' then raise exception 'Submission is not pending'; end if;
  if p_action='approve' then
    v_ledger_id := private.betnova_credit_cash_reward(
      v_item.user_id,50,'DZD','earn_post',v_item.id,'Approved social post reward · 50 DZD'
    );
    update public.earn_post_submissions set status='approved',wallet_ledger_id=v_ledger_id,
      review_note=p_review_note,reviewed_by=auth.uid(),reviewed_at=now() where id=v_item.id;
  else
    update public.earn_post_submissions set status='rejected',
      review_note=p_review_note,reviewed_by=auth.uid(),reviewed_at=now() where id=v_item.id;
  end if;
end;
$$;
revoke all on function public.betnova_review_earn_submission(uuid,text,text) from public, anon;
grant execute on function public.betnova_review_earn_submission(uuid,text,text) to authenticated;

create or replace function public.betnova_review_referral(
  p_referred_user_id uuid,
  p_action text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.referrals%rowtype;
  v_email_confirmed timestamptz;
  v_ledger_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
  ) then raise exception 'Administrator access required'; end if;
  if p_action not in ('approve','reject') then raise exception 'Invalid review action'; end if;
  select * into v_item from public.referrals where referred_user_id=p_referred_user_id for update;
  if not found or v_item.status <> 'pending' then raise exception 'Referral is not pending'; end if;
  if p_action='approve' then
    select email_confirmed_at into v_email_confirmed from auth.users where id=v_item.referred_user_id;
    if v_email_confirmed is null then raise exception 'Referred account email must be verified first'; end if;
    v_ledger_id := private.betnova_credit_cash_reward(
      v_item.referrer_user_id,100,'DZD','referral',v_item.referred_user_id,
      'Approved referral reward · 100 DZD'
    );
    update public.referrals set status='approved',wallet_ledger_id=v_ledger_id,
      review_note=p_review_note,reviewed_by=auth.uid(),reviewed_at=now()
      where referred_user_id=v_item.referred_user_id;
  else
    update public.referrals set status='rejected',
      review_note=p_review_note,reviewed_by=auth.uid(),reviewed_at=now()
      where referred_user_id=v_item.referred_user_id;
  end if;
end;
$$;
revoke all on function public.betnova_review_referral(uuid,text,text) from public, anon;
grant execute on function public.betnova_review_referral(uuid,text,text) to authenticated;

create or replace function private.betnova_process_deposit_streak()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_count integer;
  v_cycle integer;
  v_recent_count integer;
  v_currency text;
  v_total numeric(20,2);
  v_reward numeric(20,2);
  v_anchor uuid;
  v_claim uuid;
  v_ledger uuid;
  v_anchor_rank integer;
begin
  if old.status <> 'pending' or new.status <> 'approved' then return new; end if;

  with ordered as (
    select d.id,d.status,d.currency,d.amount,
      row_number() over(order by d.created_at desc,d.id desc) as rn
    from public.deposit_requests d
    where d.user_id=new.user_id
  ), boundary as (
    select coalesce(min(rn) filter(where status <> 'approved'), (select count(*)+1 from ordered)) as first_bad
    from ordered
  )
  select greatest(first_bad-1,0) into v_run_count from boundary;

  if v_run_count < 5 then return new; end if;

  -- Pay once for each completed block of five consecutive approved deposits.
  -- This also catches a block if a later pending deposit existed before the fifth
  -- deposit was approved and delayed the trigger's first opportunity to process it.
  for v_cycle in 1..floor(v_run_count::numeric / 5)::integer loop
    v_anchor_rank := v_run_count - ((v_cycle - 1) * 5) - 4;
    with ordered as (
      select d.id,d.currency,d.amount,
        row_number() over(order by d.created_at desc,d.id desc) as rn
      from public.deposit_requests d
      where d.user_id=new.user_id
    ), block as (
      select * from ordered
      where rn between v_anchor_rank and v_anchor_rank + 4
    )
    select count(*),min(currency),round(sum(amount),2)
      into v_recent_count,v_currency,v_total
    from block;

    if v_recent_count <> 5 or (
      select count(distinct currency) from (
        select d.currency
        from public.deposit_requests d
        where d.user_id=new.user_id
        order by d.created_at desc,d.id desc
        offset v_anchor_rank - 1 limit 5
      ) currencies
    ) <> 1 then
      continue;
    end if;

    select id into v_anchor
    from (
      select d.id,row_number() over(order by d.created_at desc,d.id desc) as rn
      from public.deposit_requests d where d.user_id=new.user_id
    ) ordered
    where rn=v_anchor_rank;

    v_reward := round(v_total * 0.05, 2);
    if v_reward <= 0 then continue; end if;

    v_claim := gen_random_uuid();
    insert into public.deposit_streak_claims(
      id,user_id,cycle_anchor_deposit_id,currency,total_deposited,reward_amount
    ) values (v_claim,new.user_id,v_anchor,v_currency,v_total,v_reward)
    on conflict(cycle_anchor_deposit_id) do nothing;
    if not found then continue; end if;

    v_ledger := private.betnova_credit_cash_reward(
      new.user_id,v_reward,v_currency,'deposit_streak',v_anchor,
      'Five consecutive approved deposits · 5% reward'
    );
    update public.deposit_streak_claims set wallet_ledger_id=v_ledger where id=v_claim;
  end loop;

  return new;
end;
$$;
revoke all on function private.betnova_process_deposit_streak() from public, anon, authenticated;
drop trigger if exists betnova_process_deposit_streak on public.deposit_requests;
create trigger betnova_process_deposit_streak
  after update of status on public.deposit_requests
  for each row execute function private.betnova_process_deposit_streak();
),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reward_amount numeric(20,2) not null default 50 check (reward_amount = 50),
  currency text not null default 'DZD' check (currency = 'DZD'),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  wallet_ledger_id uuid unique references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index if not exists earn_post_submissions_url_unique
  on public.earn_post_submissions (lower(post_url));
create index if not exists earn_post_submissions_status_created_idx
  on public.earn_post_submissions(status, created_at);

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-F0-9]{10}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  referred_user_id uuid primary key references auth.users(id) on delete restrict,
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reward_amount numeric(20,2) not null default 100 check (reward_amount = 100),
  currency text not null default 'DZD' check (currency = 'DZD'),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  wallet_ledger_id uuid unique references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint referrals_no_self_referral check (referrer_user_id <> referred_user_id)
);
create index if not exists referrals_referrer_created_idx
  on public.referrals(referrer_user_id, created_at desc);
create index if not exists referrals_status_created_idx
  on public.referrals(status, created_at);

create table if not exists public.deposit_streak_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  cycle_anchor_deposit_id uuid not null unique references public.deposit_requests(id) on delete restrict,
  currency text not null check (currency in ('DZD','USD','EUR')),
  deposit_count integer not null default 5 check (deposit_count = 5),
  total_deposited numeric(20,2) not null check (total_deposited > 0),
  reward_rate numeric(5,4) not null default 0.05 check (reward_rate = 0.05),
  reward_amount numeric(20,2) not null check (reward_amount > 0),
  wallet_ledger_id uuid unique references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists deposit_streak_claims_user_created_idx
  on public.deposit_streak_claims(user_id, created_at desc);

alter table public.earn_post_submissions enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.deposit_streak_claims enable row level security;

create policy "Users read own earn submissions" on public.earn_post_submissions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Admins read earn submissions" on public.earn_post_submissions
  for select to authenticated using (exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));
create policy "Users submit own earn posts" on public.earn_post_submissions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and reward_amount = 50
    and currency = 'DZD'
    and proof_path like ((select auth.uid())::text || '/%')
  );

create policy "Users read referrals they invited" on public.referrals
  for select to authenticated using (referrer_user_id = (select auth.uid()));
create policy "Admins read referrals" on public.referrals
  for select to authenticated using (exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));

create policy "Users read own deposit streak claims" on public.deposit_streak_claims
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Admins read deposit streak claims" on public.deposit_streak_claims
  for select to authenticated using (exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));

grant select, insert on public.earn_post_submissions to authenticated;
grant select on public.referrals, public.deposit_streak_claims to authenticated;
revoke update, delete on public.earn_post_submissions, public.referrals, public.deposit_streak_claims from anon, authenticated;
revoke all on public.referral_codes from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('earn-proofs','earn-proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy "Users upload own earn proof" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'earn-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users read own earn proof" on storage.objects
  for select to authenticated using (
    bucket_id = 'earn-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Admins read earn proofs" on storage.objects
  for select to authenticated using (
    bucket_id = 'earn-proofs' and exists (
      select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

create or replace function public.betnova_get_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.referral_codes(user_id, code)
  values (v_user, upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)))
  on conflict (user_id) do nothing;
  select code into v_code from public.referral_codes where user_id = v_user;
  return v_code;
end;
$$;
revoke all on function public.betnova_get_referral_code() from public, anon;
grant execute on function public.betnova_get_referral_code() to authenticated;

create or replace function private.betnova_capture_referral_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_referrer uuid;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code','')));
  if v_code = '' then return new; end if;
  select user_id into v_referrer from public.referral_codes where code = v_code;
  if v_referrer is null or v_referrer = new.id then return new; end if;
  insert into public.referrals(referred_user_id,referrer_user_id,referral_code)
  values(new.id,v_referrer,v_code)
  on conflict(referred_user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.betnova_capture_referral_signup() from public, anon, authenticated;
drop trigger if exists betnova_capture_referral_signup on auth.users;
create trigger betnova_capture_referral_signup
  after insert on auth.users
  for each row execute function private.betnova_capture_referral_signup();

create or replace function private.betnova_credit_cash_reward(
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_reference_type text,
  p_reference_id uuid,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallet_accounts%rowtype;
  v_ledger_id uuid := gen_random_uuid();
begin
  if p_user_id is null or p_amount is null or p_amount <= 0
    or p_currency not in ('DZD','USD','EUR') or p_reference_id is null then
    raise exception 'Invalid cash reward credit';
  end if;
  insert into public.wallet_accounts(user_id,currency)
  values(p_user_id,p_currency)
  on conflict(user_id,currency) do nothing;
  select * into v_wallet from public.wallet_accounts
  where user_id=p_user_id and currency=p_currency for update;
  update public.wallet_accounts
    set available_balance=available_balance+p_amount, updated_at=now()
    where id=v_wallet.id returning * into v_wallet;
  insert into public.wallet_ledger(
    id,wallet_account_id,user_id,currency,entry_type,amount,balance_after,reserved_after,
    reference_type,reference_id,idempotency_key,description
  ) values (
    v_ledger_id,v_wallet.id,p_user_id,p_currency,'bonus',p_amount,
    v_wallet.available_balance,v_wallet.reserved_balance,
    p_reference_type,p_reference_id,p_reference_id,p_description
  );
  return v_ledger_id;
end;
$$;
revoke all on function private.betnova_credit_cash_reward(uuid,numeric,text,text,uuid,text) from public, anon, authenticated;

create or replace function public.betnova_review_earn_submission(
  p_submission_id uuid,
  p_action text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.earn_post_submissions%rowtype;
  v_ledger_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
  ) then raise exception 'Administrator access required'; end if;
  if p_action not in ('approve','reject') then raise exception 'Invalid review action'; end if;
  select * into v_item from public.earn_post_submissions where id=p_submission_id for update;
  if not found or v_item.status <> 'pending' then raise exception 'Submission is not pending'; end if;
  if p_action='approve' then
    v_ledger_id := private.betnova_credit_cash_reward(
      v_item.user_id,50,'DZD','earn_post',v_item.id,'Approved social post reward · 50 DZD'
    );
    update public.earn_post_submissions set status='approved',wallet_ledger_id=v_ledger_id,
      review_note=p_review_note,reviewed_by=auth.uid(),reviewed_at=now() where id=v_item.id;
  else
    update public.earn_post_submissions set status='rejected',
      review_note=p_review_note,reviewed_by=auth.uid(),reviewed_at=now() where id=v_item.id;
  end if;
end;
$$;
revoke all on function public.betnova_review_earn_submission(uuid,text,text) from public, anon;
grant execute on function public.betnova_review_earn_submission(uuid,text,text) to authenticated;

create or replace function public.betnova_review_referral(
  p_referred_user_id uuid,
  p_action text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.referrals%rowtype;
  v_email_confirmed timestamptz;
  v_ledger_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
  ) then raise exception 'Administrator access required'; end if;
  if p_action not in ('approve','reject') then raise exception 'Invalid review action'; end if;
  select * into v_item from public.referrals where referred_user_id=p_referred_user_id for update;
  if not found or v_item.status <> 'pending' then raise exception 'Referral is not pending'; end if;
  if p_action='approve' then
    select email_confirmed_at into v_email_confirmed from auth.users where id=v_item.referred_user_id;
    if v_email_confirmed is null then raise exception 'Referred account email must be verified first'; end if;
    v_ledger_id := private.betnova_credit_cash_reward(
      v_item.referrer_user_id,100,'DZD','referral',v_item.referred_user_id,
      'Approved referral reward · 100 DZD'
    );
    update public.referrals set status='approved',wallet_ledger_id=v_ledger_id,
      review_note=p_review_note,reviewed_by=auth.uid(),reviewed_at=now()
      where referred_user_id=v_item.referred_user_id;
  else
    update public.referrals set status='rejected',
      review_note=p_review_note,reviewed_by=auth.uid(),reviewed_at=now()
      where referred_user_id=v_item.referred_user_id;
  end if;
end;
$$;
revoke all on function public.betnova_review_referral(uuid,text,text) from public, anon;
grant execute on function public.betnova_review_referral(uuid,text,text) to authenticated;

create or replace function private.betnova_process_deposit_streak()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_count integer;
  v_cycle integer;
  v_recent_count integer;
  v_currency text;
  v_total numeric(20,2);
  v_reward numeric(20,2);
  v_anchor uuid;
  v_claim uuid;
  v_ledger uuid;
  v_anchor_rank integer;
begin
  if old.status <> 'pending' or new.status <> 'approved' then return new; end if;

  with ordered as (
    select d.id,d.status,d.currency,d.amount,
      row_number() over(order by d.created_at desc,d.id desc) as rn
    from public.deposit_requests d
    where d.user_id=new.user_id
  ), boundary as (
    select coalesce(min(rn) filter(where status <> 'approved'), (select count(*)+1 from ordered)) as first_bad
    from ordered
  )
  select greatest(first_bad-1,0) into v_run_count from boundary;

  if v_run_count < 5 then return new; end if;

  -- Pay once for each completed block of five consecutive approved deposits.
  -- This also catches a block if a later pending deposit existed before the fifth
  -- deposit was approved and delayed the trigger's first opportunity to process it.
  for v_cycle in 1..floor(v_run_count::numeric / 5)::integer loop
    v_anchor_rank := v_run_count - ((v_cycle - 1) * 5) - 4;
    with ordered as (
      select d.id,d.currency,d.amount,
        row_number() over(order by d.created_at desc,d.id desc) as rn
      from public.deposit_requests d
      where d.user_id=new.user_id
    ), block as (
      select * from ordered
      where rn between v_anchor_rank and v_anchor_rank + 4
    )
    select count(*),min(currency),round(sum(amount),2)
      into v_recent_count,v_currency,v_total
    from block;

    if v_recent_count <> 5 or (
      select count(distinct currency) from (
        select d.currency
        from public.deposit_requests d
        where d.user_id=new.user_id
        order by d.created_at desc,d.id desc
        offset v_anchor_rank - 1 limit 5
      ) currencies
    ) <> 1 then
      continue;
    end if;

    select id into v_anchor
    from (
      select d.id,row_number() over(order by d.created_at desc,d.id desc) as rn
      from public.deposit_requests d where d.user_id=new.user_id
    ) ordered
    where rn=v_anchor_rank;

    v_reward := round(v_total * 0.05, 2);
    if v_reward <= 0 then continue; end if;

    v_claim := gen_random_uuid();
    insert into public.deposit_streak_claims(
      id,user_id,cycle_anchor_deposit_id,currency,total_deposited,reward_amount
    ) values (v_claim,new.user_id,v_anchor,v_currency,v_total,v_reward)
    on conflict(cycle_anchor_deposit_id) do nothing;
    if not found then continue; end if;

    v_ledger := private.betnova_credit_cash_reward(
      new.user_id,v_reward,v_currency,'deposit_streak',v_anchor,
      'Five consecutive approved deposits · 5% reward'
    );
    update public.deposit_streak_claims set wallet_ledger_id=v_ledger where id=v_claim;
  end loop;

  return new;
end;
$$;
revoke all on function private.betnova_process_deposit_streak() from public, anon, authenticated;
drop trigger if exists betnova_process_deposit_streak on public.deposit_requests;
create trigger betnova_process_deposit_streak
  after update of status on public.deposit_requests
  for each row execute function private.betnova_process_deposit_streak();
