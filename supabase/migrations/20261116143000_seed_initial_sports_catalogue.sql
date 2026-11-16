insert into public.sports (name, slug, icon)
values
  ('Football', 'football', '⚽'),
  ('Basketball', 'basketball', '🏀'),
  ('Tennis', 'tennis', '🎾'),
  ('Ice Hockey', 'ice-hockey', '🏒'),
  ('Volleyball', 'volleyball', '🏐')
on conflict (slug) do nothing;
