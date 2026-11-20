-- Admin-only write access to sports catalogue and match data.
-- Admin roles are assigned out-of-band by the project owner.
-- Profiles RLS limits each authenticated user to their own profile row;
-- the policies below therefore never trust client-provided role metadata.
grant insert, update, delete on public.sports to authenticated;
grant insert, update, delete on public.competitions to authenticated;
grant insert, update, delete on public.teams to authenticated;
grant insert, update, delete on public.fixtures to authenticated;
grant insert, update, delete on public.markets to authenticated;
grant insert, update, delete on public.market_selections to authenticated;

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
