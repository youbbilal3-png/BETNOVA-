alter table public.fixture_settlement_holds
  drop constraint if exists fixture_settlement_holds_pkey;
alter table public.fixture_settlement_holds
  add constraint fixture_settlement_holds_pkey primary key (fixture_id, provider);

create or replace function public.betnova_set_fixture_settlement_hold(
  p_fixture_id uuid,
  p_provider text,
  p_reason text,
  p_hold boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  if v_role <> 'service_role' then raise exception 'Trusted provider only'; end if;
  if p_fixture_id is null or p_provider not in ('sportsapi','fivedollarfootballapi')
     or p_hold is null then raise exception 'Invalid settlement hold request'; end if;
  if p_hold then
    if p_reason is null or length(trim(p_reason)) not between 4 and 300 then
      raise exception 'A correction reason is required';
    end if;
    insert into public.fixture_settlement_holds(fixture_id,provider,reason,held_at)
    values(p_fixture_id,p_provider,trim(p_reason),now())
    on conflict(fixture_id,provider) do update
      set reason=excluded.reason, held_at=excluded.held_at;
  else
    delete from public.fixture_settlement_holds
    where fixture_id=p_fixture_id and provider=p_provider;
  end if;
end;
$$;
revoke all on function public.betnova_set_fixture_settlement_hold(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.betnova_set_fixture_settlement_hold(uuid,text,text,boolean) to service_role;