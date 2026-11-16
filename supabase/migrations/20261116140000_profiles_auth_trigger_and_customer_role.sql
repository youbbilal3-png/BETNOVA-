-- Create the customer profile automatically after Supabase Auth signup.
-- The role is server-controlled; the browser cannot assign or change it.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists role text not null default 'customer'
    check (role in ('customer','merchant','admin'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, country_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'country_code', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update safe profile fields"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant update (display_name, avatar_url, country_code, phone) on public.profiles to authenticated;
