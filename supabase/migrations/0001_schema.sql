-- Oyster farm: core schema.
-- Run in Supabase → SQL Editor, in file order (0001, 0002, 0003, then seed.sql).

create extension if not exists pgcrypto;

create type public.user_role    as enum ('worker', 'admin');
create type public.satka_size   as enum ('spat', 'small', 'large', 'market', 'xl');
create type public.satka_status as enum ('on_land', 'newly_sorted', 'sorted');
create type public.event_kind   as enum ('created', 'processed', 'moved', 'corrected', 'archived');

-- ---------------------------------------------------------------------------
-- Users: one profile per auth user. New sign-ups start inactive until an
-- admin approves them in the app.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null default '',
  name       text not null default '' check (length(name) <= 80),
  role       public.user_role not null default 'worker',
  active     boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'name', ''), 80));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Farm layout. Fixed at 6 lines × 26 buoys × 25 sections × 4 slots; the
-- distances and orientation are editable by admins.
-- ---------------------------------------------------------------------------
create table public.farm_settings (
  id          smallint primary key default 1 check (id = 1),
  -- Compass bearing from buoy 1 towards buoy 26. 180 = buoy 1 at the north end.
  heading_deg numeric not null default 180 check (heading_deg >= 0 and heading_deg < 360),
  -- 25 gaps between 26 buoys, metres. First and last are 4 m, the rest 6 m.
  gaps_m      numeric[] not null default array[4,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,4]::numeric[]
              check (array_length(gaps_m, 1) = 25 and 0 < all (gaps_m) and 100 > all (gaps_m)),
  center_lat  double precision not null default 43.3253309 check (center_lat between -90 and 90),
  center_lng  double precision not null default 28.0747198 check (center_lng between -180 and 180),
  updated_at  timestamptz not null default now()
);

create table public.lines (
  no         smallint primary key check (no between 1 and 6),
  label      text not null check (length(label) between 1 and 40),
  start_lat  double precision check (start_lat between -90 and 90),
  start_lng  double precision check (start_lng between -180 and 180),
  end_lat    double precision check (end_lat between -90 and 90),
  end_lng    double precision check (end_lng between -180 and 180),
  updated_at timestamptz not null default now(),
  constraint gps_all_or_nothing check (
    (start_lat is null) = (start_lng is null) and
    (start_lat is null) = (end_lat is null) and
    (start_lat is null) = (end_lng is null))
);

-- ---------------------------------------------------------------------------
-- Satki. `id` is generated on the device (so offline-created satki can be
-- referenced before sync); `code` is the human ID, issued by the server from
-- a sequence and never reused — archived rows are kept forever.
-- ---------------------------------------------------------------------------
create sequence public.satka_code_seq;

create table public.satki (
  id                uuid primary key,
  code              text not null unique
                    default ('SAT-' || lpad(nextval('public.satka_code_seq')::text, 5, '0')),
  size              public.satka_size not null,
  status            public.satka_status not null,
  line_no           smallint references public.lines (no),
  section           smallint check (section between 1 and 25),
  slot              smallint check (slot between 1 and 4),
  last_processed_on date not null,
  archived_at       timestamptz,
  archive_reason    text check (length(archive_reason) <= 200),
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  constraint position_complete check (
    (line_no is null) = (section is null) and (section is null) = (slot is null)),
  constraint archived_has_reason check (archived_at is null or archive_reason is not null)
);

-- The core rule: at most one active satka per position. Archived satki keep
-- their last position for reference but no longer occupy it.
create unique index satki_one_per_position
  on public.satki (line_no, section, slot) where archived_at is null;
create index satki_updated_at on public.satki (updated_at);

create or replace function public.touch_satka()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

create trigger satki_touch before update on public.satki
  for each row execute function public.touch_satka();

-- ---------------------------------------------------------------------------
-- History. Append-only; the id is the client-generated operation id, which
-- makes every write RPC idempotent when the offline outbox retries.
-- ---------------------------------------------------------------------------
create table public.satka_events (
  id           uuid primary key,
  satka_id     uuid not null references public.satki (id),
  kind         public.event_kind not null,
  before       jsonb,
  after        jsonb,
  note         text not null default '' check (length(note) <= 1000),
  performed_at timestamptz not null,
  recorded_at  timestamptz not null default now(),
  user_id      uuid references auth.users (id),
  user_name    text not null default ''
);

create index satka_events_by_satka on public.satka_events (satka_id, performed_at desc);
create index satka_events_recorded on public.satka_events (recorded_at);
