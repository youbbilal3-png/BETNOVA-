-- These policies must be created after profiles.role is added by
-- 20261116140000_profiles_auth_trigger_and_customer_role.sql.
-- Earlier migration files create the underlying tables and user policies first.

drop policy if exists "Admins can manage sports" on public.sports;
create policy "Admins can manage sports" on public.sports for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

drop policy if exists "Admins can manage competitions" on public.competitions;
create policy "Admins can manage competitions" on public.competitions for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

drop policy if exists "Admins can manage teams" on public.teams;
create policy "Admins can manage teams" on public.teams for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

drop policy if exists "Admins can manage fixtures" on public.fixtures;
create policy "Admins can manage fixtures" on public.fixtures for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

drop policy if exists "Admins can manage markets" on public.markets;
create policy "Admins can manage markets" on public.markets for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

drop policy if exists "Admins can manage market selections" on public.market_selections;
create policy "Admins can manage market selections" on public.market_selections for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

drop policy if exists "Admins manage wallet accounts" on public.wallet_accounts;
create policy "Admins manage wallet accounts" on public.wallet_accounts for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "Admins read wallet ledger" on public.wallet_ledger;
create policy "Admins read wallet ledger" on public.wallet_ledger for select to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "Admins manage deposit requests" on public.deposit_requests;
create policy "Admins manage deposit requests" on public.deposit_requests for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "Admins manage withdrawal requests" on public.withdrawal_requests;
create policy "Admins manage withdrawal requests" on public.withdrawal_requests for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "Admins manage payment methods" on public.payment_methods;
create policy "Admins manage payment methods" on public.payment_methods for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "Admins manage exchange rates" on public.exchange_rates;
create policy "Admins manage exchange rates" on public.exchange_rates for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "Admins manage reward campaigns" on public.reward_campaigns;
create policy "Admins manage reward campaigns" on public.reward_campaigns for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "Admins manage reward grants" on public.reward_grants;
create policy "Admins manage reward grants" on public.reward_grants for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
