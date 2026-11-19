-- BETNOVA Help & Support center: public intake, admin-only inbox and public contact address.
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text,
  email text not null,
  category text not null default 'Other',
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_requests_email_length check (char_length(trim(email)) between 5 and 254),
  constraint support_requests_subject_length check (char_length(trim(subject)) between 3 and 140),
  constraint support_requests_message_length check (char_length(trim(message)) between 12 and 4000),
  constraint support_requests_category_length check (char_length(trim(category)) between 2 and 80)
);

create index if not exists support_requests_created_at_idx on public.support_requests (created_at desc);
create index if not exists support_requests_status_created_at_idx on public.support_requests (status, created_at desc);

alter table public.support_requests enable row level security;
grant insert on public.support_requests to anon, authenticated;
grant select, update on public.support_requests to authenticated;

drop policy if exists "Visitors can submit support requests" on public.support_requests;
create policy "Visitors can submit support requests"
on public.support_requests for insert to anon, authenticated
with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists "Admins can read support requests" on public.support_requests;
create policy "Admins can read support requests"
on public.support_requests for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin'
));

drop policy if exists "Admins can update support requests" on public.support_requests;
create policy "Admins can update support requests"
on public.support_requests for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin'
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin'
));

create table if not exists public.support_settings (
  id boolean primary key default true check (id = true),
  support_email text,
  updated_at timestamptz not null default now(),
  constraint support_settings_email_length check (support_email is null or char_length(trim(support_email)) <= 254)
);
insert into public.support_settings (id, support_email)
values (true, null)
on conflict (id) do nothing;

alter table public.support_settings enable row level security;
grant select on public.support_settings to anon, authenticated;
grant update on public.support_settings to authenticated;

drop policy if exists "Public can read support contact email" on public.support_settings;
create policy "Public can read support contact email"
on public.support_settings for select to anon, authenticated
using (true);

drop policy if exists "Admins can update support contact email" on public.support_settings;
create policy "Admins can update support contact email"
on public.support_settings for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin'
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin'
));
