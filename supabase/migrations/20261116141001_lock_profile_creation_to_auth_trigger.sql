-- Profile rows are created only by the trusted auth.users trigger.
-- This prevents clients from inserting a profile with a privileged role.

drop policy if exists "Users can create their own profile" on public.profiles;
revoke insert on public.profiles from authenticated;
