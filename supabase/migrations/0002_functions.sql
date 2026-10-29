-- Oyster farm: write API. Clients never write tables directly; every change
-- goes through one of these functions, which validate input, record a
-- history event, and are idempotent on p_op_id (safe for offline retries).
--
-- Errors are raised with a stable code as the message (e.g. POSITION_TAKEN);
-- the app translates these codes into Bulgarian.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'admin');
$$;

create or replace function public.require_active()
returns text language plpgsql stable security definer set search_path = public as $$
declare v_name text;
begin
  select coalesce(nullif(name, ''), email) into v_name
    from profiles where id = auth.uid() and active;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  return v_name;
end $$;

create or replace function public.require_admin()
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return public.require_active();
end $$;

create or replace function public.satka_snapshot(s public.satki)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'size', s.size, 'status', s.status,
    'line_no', s.line_no, 'section', s.section, 'slot', s.slot,
    'last_processed_on', s.last_processed_on,
    'archived_at', s.archived_at, 'archive_reason', s.archive_reason);
$$;

create or replace function public.check_processed_on(p_date date)
returns void language plpgsql stable as $$
begin
  if p_date is null or p_date < date '2000-01-01' or p_date > current_date + 1 then
    raise exception 'INVALID_DATE';
  end if;
end $$;

create or replace function public.clamp_performed_at(p_ts timestamptz)
returns timestamptz language sql stable as $$
  -- Device clocks drift; never accept a time in the future.
  select least(coalesce(p_ts, now()), now());
$$;

create or replace function public.check_position(p_line smallint, p_section smallint, p_slot smallint)
returns void language plpgsql immutable as $$
begin
  if p_line is null or p_line not between 1 and 6
     or p_section is null or p_section not between 1 and 25
     or p_slot is null or p_slot not between 1 and 4 then
    raise exception 'INVALID_POSITION';
  end if;
end $$;

-- Returns the satka if p_op_id was already applied (idempotent replay).
create or replace function public.replayed(p_op_id uuid)
returns public.satki language sql stable security definer set search_path = public as $$
  select s.* from satki s join satka_events e on e.satka_id = s.id where e.id = p_op_id;
$$;

-- ---------------------------------------------------------------------------
-- create_satka: place a new (or replacement) satka in a free position.
-- ---------------------------------------------------------------------------
create or replace function public.create_satka(
  p_op_id uuid, p_satka_id uuid, p_size public.satka_size, p_status public.satka_status,
  p_line smallint, p_section smallint, p_slot smallint,
  p_processed_on date, p_performed_at timestamptz, p_note text default '')
returns public.satki language plpgsql security definer set search_path = public as $$
declare v_user text; v_row satki;
begin
  v_user := require_active();
  select * into v_row from satki where id = p_satka_id;
  if found then return v_row; end if;

  perform check_position(p_line, p_section, p_slot);
  perform check_processed_on(p_processed_on);

  begin
    insert into satki (id, size, status, line_no, section, slot, last_processed_on, created_by)
    values (p_satka_id, p_size, p_status, p_line, p_section, p_slot, p_processed_on, auth.uid())
    returning * into v_row;
  exception when unique_violation then
    raise exception 'POSITION_TAKEN';
  end;

  insert into satka_events (id, satka_id, kind, before, after, note, performed_at, user_id, user_name)
  values (p_op_id, v_row.id, 'created', null, satka_snapshot(v_row), left(coalesce(p_note, ''), 1000),
          clamp_performed_at(p_performed_at), auth.uid(), v_user);
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- process_satka: record a processing (status + optional new size + date).
-- If a newer processing date is already stored (another device synced
-- first), the event is kept in history but the current state is not rolled
-- back.
-- ---------------------------------------------------------------------------
create or replace function public.process_satka(
  p_op_id uuid, p_satka_id uuid, p_status public.satka_status, p_size public.satka_size,
  p_processed_on date, p_performed_at timestamptz, p_note text default '')
returns public.satki language plpgsql security definer set search_path = public as $$
declare v_user text; v_row satki; v_before jsonb;
begin
  v_user := require_active();
  select * into v_row from replayed(p_op_id);
  if v_row.id is not null then return v_row; end if;

  perform check_processed_on(p_processed_on);
  select * into v_row from satki where id = p_satka_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_row.archived_at is not null then raise exception 'ARCHIVED'; end if;

  v_before := satka_snapshot(v_row);
  if p_processed_on >= v_row.last_processed_on then
    update satki set status = p_status, size = coalesce(p_size, size), last_processed_on = p_processed_on
      where id = p_satka_id returning * into v_row;
  end if;

  insert into satka_events (id, satka_id, kind, before, after, note, performed_at, user_id, user_name)
  values (p_op_id, p_satka_id, 'processed', v_before,
          jsonb_build_object('status', p_status, 'size', coalesce(p_size, (v_before ->> 'size')::satka_size),
                             'last_processed_on', p_processed_on),
          left(coalesce(p_note, ''), 1000), clamp_performed_at(p_performed_at), auth.uid(), v_user);
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- move_satka: move to a free position, or swap with the satka there when
-- p_swap is true.
-- ---------------------------------------------------------------------------
create or replace function public.move_satka(
  p_op_id uuid, p_satka_id uuid, p_line smallint, p_section smallint, p_slot smallint,
  p_performed_at timestamptz, p_note text default '', p_swap boolean default false)
returns public.satki language plpgsql security definer set search_path = public as $$
declare v_user text; v_row satki; v_other satki; v_before jsonb; v_other_before jsonb; v_at timestamptz;
begin
  v_user := require_active();
  select * into v_row from replayed(p_op_id);
  if v_row.id is not null then return v_row; end if;

  perform check_position(p_line, p_section, p_slot);
  select * into v_row from satki where id = p_satka_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_row.archived_at is not null then raise exception 'ARCHIVED'; end if;
  if (v_row.line_no, v_row.section, v_row.slot) = (p_line, p_section, p_slot) then
    raise exception 'SAME_POSITION';
  end if;

  v_at := clamp_performed_at(p_performed_at);
  v_before := satka_snapshot(v_row);
  select * into v_other from satki
    where line_no = p_line and section = p_section and slot = p_slot and archived_at is null
    for update;

  if v_other.id is not null then
    if not p_swap then raise exception 'POSITION_TAKEN'; end if;
    v_other_before := satka_snapshot(v_other);
    -- Free the source slot first so the unique index is never violated mid-swap.
    update satki set line_no = null, section = null, slot = null where id = v_row.id;
    update satki set line_no = v_row.line_no, section = v_row.section, slot = v_row.slot
      where id = v_other.id returning * into v_other;
    insert into satka_events (id, satka_id, kind, before, after, note, performed_at, user_id, user_name)
    values (gen_random_uuid(), v_other.id, 'moved', v_other_before, satka_snapshot(v_other),
            'Размяна с ' || v_row.code, v_at, auth.uid(), v_user);
  end if;

  update satki set line_no = p_line, section = p_section, slot = p_slot
    where id = p_satka_id returning * into v_row;
  insert into satka_events (id, satka_id, kind, before, after, note, performed_at, user_id, user_name)
  values (p_op_id, p_satka_id, 'moved', v_before, satka_snapshot(v_row),
          left(coalesce(p_note, ''), 1000), v_at, auth.uid(), v_user);
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- archive_satka: permanently retire a satka (lost / damaged / out of use).
-- Its position is freed; its code is never issued again.
-- ---------------------------------------------------------------------------
create or replace function public.archive_satka(
  p_op_id uuid, p_satka_id uuid, p_reason text, p_performed_at timestamptz, p_note text default '')
returns public.satki language plpgsql security definer set search_path = public as $$
declare v_user text; v_row satki; v_before jsonb;
begin
  v_user := require_active();
  select * into v_row from replayed(p_op_id);
  if v_row.id is not null then return v_row; end if;

  if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  select * into v_row from satki where id = p_satka_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_row.archived_at is not null then return v_row; end if;

  v_before := satka_snapshot(v_row);
  update satki set archived_at = now(), archive_reason = left(trim(p_reason), 200)
    where id = p_satka_id returning * into v_row;
  insert into satka_events (id, satka_id, kind, before, after, note, performed_at, user_id, user_name)
  values (p_op_id, p_satka_id, 'archived', v_before, satka_snapshot(v_row),
          left(coalesce(p_note, ''), 1000), clamp_performed_at(p_performed_at), auth.uid(), v_user);
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Admin: correct a record's size / status / processing date (e.g. a wrong
-- entry). Logged as a correction with a mandatory reason.
-- ---------------------------------------------------------------------------
create or replace function public.correct_satka(
  p_op_id uuid, p_satka_id uuid, p_size public.satka_size, p_status public.satka_status,
  p_processed_on date, p_reason text)
returns public.satki language plpgsql security definer set search_path = public as $$
declare v_user text; v_row satki; v_before jsonb;
begin
  v_user := require_admin();
  select * into v_row from replayed(p_op_id);
  if v_row.id is not null then return v_row; end if;

  if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  perform check_processed_on(p_processed_on);
  select * into v_row from satki where id = p_satka_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  v_before := satka_snapshot(v_row);
  update satki set size = p_size, status = p_status, last_processed_on = p_processed_on
    where id = p_satka_id returning * into v_row;
  insert into satka_events (id, satka_id, kind, before, after, note, performed_at, user_id, user_name)
  values (p_op_id, p_satka_id, 'corrected', v_before, satka_snapshot(v_row),
          left(trim(p_reason), 1000), now(), auth.uid(), v_user);
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Admin: farm layout and users.
-- ---------------------------------------------------------------------------
create or replace function public.update_line(
  p_no smallint, p_label text,
  p_start_lat double precision, p_start_lng double precision,
  p_end_lat double precision, p_end_lng double precision)
returns public.lines language plpgsql security definer set search_path = public as $$
declare v_row lines;
begin
  perform require_admin();
  update lines set label = trim(p_label), start_lat = p_start_lat, start_lng = p_start_lng,
                   end_lat = p_end_lat, end_lng = p_end_lng, updated_at = now()
    where no = p_no returning * into v_row;
  if not found then raise exception 'NOT_FOUND'; end if;
  return v_row;
end $$;

create or replace function public.update_settings(
  p_heading_deg numeric, p_gaps_m numeric[], p_center_lat double precision, p_center_lng double precision)
returns public.farm_settings language plpgsql security definer set search_path = public as $$
declare v_row farm_settings;
begin
  perform require_admin();
  update farm_settings set heading_deg = p_heading_deg, gaps_m = p_gaps_m,
                           center_lat = p_center_lat, center_lng = p_center_lng, updated_at = now()
    where id = 1 returning * into v_row;
  return v_row;
end $$;

create or replace function public.set_user(
  p_user_id uuid, p_name text, p_role public.user_role, p_active boolean)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare v_row profiles;
begin
  perform require_admin();
  -- Never allow the farm to end up without an active admin.
  if (p_role <> 'admin' or not p_active)
     and not exists (select 1 from profiles where role = 'admin' and active and id <> p_user_id) then
    raise exception 'LAST_ADMIN';
  end if;
  update profiles set name = left(trim(p_name), 80), role = p_role, active = p_active
    where id = p_user_id returning * into v_row;
  if not found then raise exception 'NOT_FOUND'; end if;
  return v_row;
end $$;
