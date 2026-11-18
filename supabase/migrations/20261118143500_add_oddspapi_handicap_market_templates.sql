insert into public.market_templates
  (market_key,category,display_name,description,settlement_trigger,settlement_rule,requires_player_data,supports_live,is_enabled,sort_order)
select 'asian_handicap','Handicap','Asian Handicap','Asian handicap on the home or away team','final_whistle',
       '{"period":"full_time"}'::jsonb,false,false,true,200
where not exists(select 1 from public.market_templates where market_key='asian_handicap');

insert into public.market_templates
  (market_key,category,display_name,description,settlement_trigger,settlement_rule,requires_player_data,supports_live,is_enabled,sort_order)
select 'corner_asian','Corners','Asian Corner Handicap','Asian handicap on total match corners','final_whistle',
       '{"event":"corner","finalize_at":"full_time"}'::jsonb,false,false,true,250
where not exists(select 1 from public.market_templates where market_key='corner_asian');
