-- Oyster farm: permissions.
-- Reads: any approved (active) user. Writes: only through the functions in
-- 0002_functions.sql. Nobody — not even admins — can edit or delete history.

alter table public.profiles      enable row level security;
alter table public.farm_settings enable row level security;
alter table public.lines         enable row level security;
alter table public.satki         enable row level security;
alter table public.satka_events  enable row level security;

create policy "own profile or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "active users read settings" on public.farm_settings
  for select to authenticated using (public.is_active_user());
create policy "active users read lines" on public.lines
  for select to authenticated using (public.is_active_user());
create policy "active users read satki" on public.satki
  for select to authenticated using (public.is_active_user());
create policy "active users read events" on public.satka_events
  for select to authenticated using (public.is_active_user());

-- Belt and braces: no direct table writes for client roles, even if a policy
-- is added by mistake later.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
revoke usage, select on sequence public.satka_code_seq from anon, authenticated;

-- Function access: nothing for anonymous visitors; signed-in users may call
-- the API (each function checks active/admin itself).
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_active_user(), public.is_admin(),
  public.create_satka(uuid, uuid, public.satka_size, public.satka_status, smallint, smallint, smallint, date, timestamptz, text),
  public.process_satka(uuid, uuid, public.satka_status, public.satka_size, date, timestamptz, text),
  public.move_satka(uuid, uuid, smallint, smallint, smallint, timestamptz, text, boolean),
  public.archive_satka(uuid, uuid, text, timestamptz, text),
  public.correct_satka(uuid, uuid, public.satka_size, public.satka_status, date, text),
  public.update_line(smallint, text, double precision, double precision, double precision, double precision),
  public.update_settings(numeric, numeric[], double precision, double precision),
  public.set_user(uuid, text, public.user_role, boolean)
to authenticated;

-- Live updates to other devices while online.
alter publication supabase_realtime add table public.satki, public.satka_events, public.lines, public.farm_settings;
