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
