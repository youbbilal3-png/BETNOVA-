alter function public.betnova_is_admin() security invoker;
insert into public.payment_methods(code,display_name,supported_currencies,instructions,is_enabled,sort_order) values
('baridimob','BaridiMob',array['DZD']::text[],'{}'::jsonb,false,1),
('binance','Binance',array['DZD','USD','EUR']::text[],'{}'::jsonb,false,2),
('redotpay','RedotPay',array['USD','EUR']::text[],'{}'::jsonb,false,3),
('paysera','Paysera',array['EUR','USD']::text[],'{}'::jsonb,false,4)
on conflict(code) do nothing;