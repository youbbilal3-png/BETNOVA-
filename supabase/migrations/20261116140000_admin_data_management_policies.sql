-- Secure administrator-only management policies for sports data.
-- Admin role is assigned out-of-band by the project owner; clients cannot self-promote.
create or replace function public.is_betnova_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_betnova_admin() from public;
grant execute on function public.is_betnova_admin() to authenticated;

grant insert, update, delete on public.sports to authenticated;
grant insert, update, delete on public.competitions to authenticated;
grant insert, update, delete on public.teams to authenticated;
grant insert, update, delete on public.fixtures to authenticated;
grant insert, update, delete on public.markets to authenticated;
grant insert, update, delete on public.market_selections to authenticated;

drop policy if exists "Admins can manage sports" on public.sports;
create policy "Admins can manage sports" on public.sports
for all to authenticated
using ((select public.is_betnova_admin()))
with check ((select public.is_betnova_admin()));

drop policy if exists "Admins can manage competitions" on public.competitions;
create policy "Admins can manage competitions" on public.competitions
for all to authenticated
using ((select public.is_betnova_admin()))
with check ((select public.is_betnova_admin()));

drop policy if exists "Admins can manage teams" on public.teams;
create policy "Admins can manage teams" on public.teams
for all to authenticated
using ((select public.is_betnova_admin()))
with check ((select public.is_betnova_admin()));

drop policy if exists "Admins can manage fixtures" on public.fixtures;
create policy "Admins can manage fixtures" on public.fixtures
for all to authenticated
using ((select public.is_betnova_admin()))
with check ((select public.is_betnova_admin()));

drop policy if exists "Admins can manage markets" on public.markets;
create policy "Admins can manage markets" on public.markets
for all to authenticated
using ((select public.is_betnova_admin()))
with check ((select public.is_betnova_admin()));

drop policy if exists "Admins can manage market selections" on public.market_selections;
create policy "Admins can manage market selections" on public.market_selections
for all to authenticated
using ((select public.is_betnova_admin()))
with check ((select public.is_betnova_admin()));
