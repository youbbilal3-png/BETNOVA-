-- Remove broad default privileges from profile data.
-- Authenticated users may read their own profile and update only safe fields.
-- Profile creation and role assignment remain controlled by the Auth trigger.

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, country_code, phone)
  on table public.profiles to authenticated;
