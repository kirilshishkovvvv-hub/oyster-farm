-- Oyster farm: initial layout. Safe to run more than once.
insert into public.farm_settings (id) values (1) on conflict (id) do nothing;

-- Line positions: start = buoy 1 (north end), end = buoy 26 (south end).
-- Fills in GPS only where it is still empty, so positions an admin has
-- corrected in the app are not overwritten when this file is run again.
insert into public.lines (no, label, start_lat, start_lng, end_lat, end_lng) values
  (1, 'Линия 1', 43.330025, 28.075487, 43.328713, 28.075487),
  (2, 'Линия 2', 43.327049, 28.075487, 43.325737, 28.075487),
  (3, 'Линия 3', 43.330025, 28.077356, 43.328713, 28.077356),
  (4, 'Линия 4', 43.327049, 28.077356, 43.325737, 28.077356),
  (5, 'Линия 5', 43.330025, 28.079225, 43.328713, 28.079225),
  (6, 'Линия 6', 43.327049, 28.079225, 43.325737, 28.079225)
on conflict (no) do update set
  start_lat = excluded.start_lat, start_lng = excluded.start_lng,
  end_lat = excluded.end_lat, end_lng = excluded.end_lng
  where public.lines.start_lat is null;

-- After creating your own account in the app, make it the first admin:
--   update public.profiles set role = 'admin', active = true
--   where email = 'you@example.com';
