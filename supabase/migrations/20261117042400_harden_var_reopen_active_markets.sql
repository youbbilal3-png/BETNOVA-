-- Reopen only active markets that were actually settled/voided.
-- Never reset legs for inactive or permanently suspended markets during VAR replay.
create or replace function public.betnova_reopen_fixture_for_correction(p_fixture_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_market_ids uuid[];
  v_count integer := 0;
begin
  if v_role <> 'service_role' then
    raise exception 'Trusted settlement processor only';
  end if;
  if p_fixture_id is null then raise exception 'Fixture is required'; end if;

  perform 1 from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found'; end if;

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_market_ids
  from public.markets
  where fixture_id = p_fixture_id
    and is_active = true
    and status in ('settled','void');

  if cardinality(v_market_ids) > 0 then
    update public.market_selections
    set status = 'active', result_status = 'pending', updated_at = now()
    where market_id = any(v_market_ids)
      and result_status in ('won','lost','void');

    update public.markets
    set status = 'open', settled_at = null, last_updated_at = now()
    where id = any(v_market_ids);
    get diagnostics v_count = row_count;

    update public.bet_legs
    set result_status = 'pending', settled_at = null
    where market_id = any(v_market_ids)
      and result_status in ('won','lost','void');

    update public.bets b
    set status = case
          when exists (select 1 from public.bet_legs x where x.bet_id = b.id and x.result_status = 'lost')
            then 'lost'
          else 'pending'
        end,
        settled_at = case
          when exists (select 1 from public.bet_legs x where x.bet_id = b.id and x.result_status = 'lost')
            then now()
          else null
        end
    where b.status in ('won','lost','void')
      and exists (
        select 1 from public.bet_legs bl
        where bl.bet_id = b.id
          and bl.market_id = any(v_market_ids)
          and bl.result_status = 'pending'
      );
  end if;

  return v_count;
end;
$$;

revoke all on function public.betnova_reopen_fixture_for_correction(uuid) from public, anon, authenticated;
grant execute on function public.betnova_reopen_fixture_for_correction(uuid) to service_role;