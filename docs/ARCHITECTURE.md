# Architecture

```
Phone / PC browser (PWA, works offline)
  React UI ──► data/actions.perform(op)
                 │  1. domain/satka.applyOp  (validate + apply instantly)
                 │  2. IndexedDB: satki, events (pending), outbox
                 ▼
             data/sync.syncNow()  ── on start, every 60 s, when back online, on Realtime change
                 │  flush outbox in order ──► Supabase RPC (create_satka, process_satka, …)
                 │  pull changes since cursor ◄── satki, satka_events, lines, farm_settings
                 ▼
             data/outbox.recompute(): satki = remote + pending ops
```

## Farm model
- The land is to the west. The 6 lines sit in 3 columns × 2 rows (`lineGridPosition` in `src/config/farm.ts`):

  ```
  СУША |  sea   west  middle  east
       |  north  Л1     Л3     Л5
       |  south  Л2     Л4     Л6
  ```

- Every line runs north → south with buoy 1 at the north end. Each line has 26 buoys (Ш1–Ш26) and 25 sections (С1–С25; section N lies between buoys N and N+1).
- Each section has 4 satki on the rope between its two buoys (600 positions in total). They are numbered as slots 1–4:
  - 1 Горна лява: west side, near the upper (north) buoy
  - 2 Долна лява: west side, near the lower (south) buoy
  - 3 Горна дясна: east side, near the upper buoy
  - 4 Долна дясна: east side, near the lower buoy

  On the map each satka sits 1.3 m to its side of the rope (`SLOT_LAYOUT`, `CAGE_OFFSET_M` in `src/config/farm.ts`).
- Buoy gaps are `[4, 6 × 23, 4]` m, so each line is 146 m long. Admins can edit the gaps (`farm_settings.gaps_m`).
- `heading_deg` is the bearing from buoy 1 towards buoy 26 (default 180, so buoy 1 is at the north end). The map is north-up, so the compass is not rotated.

## Database (`supabase/migrations`)
| Table | Purpose |
|---|---|
| `profiles` | One row per user. Roles: `worker` / `admin`. New users start with `active=false` until an admin approves them. |
| `lines`, `farm_settings` | Farm layout and optional GPS. |
| `satki` | Current state of each satka. `id` is a uuid made on the device; `code` (`SAT-00001`) comes from a server sequence and is never reused. |
| `satka_events` | Append-only history. `id` is the client operation id. |

- **Rules enforced by the database:**
  - A partial unique index allows only one active satka per position.
  - Check constraints validate ranges.
  - Archived rows are kept forever.
- **Writes go only through `SECURITY DEFINER` functions.** Each one validates input, writes an event, and is idempotent on `p_op_id`.
  - On a business failure it raises a stable code, such as `POSITION_TAKEN`.
  - The UI translates these codes in `src/i18n/bg.ts`.
- **RLS:** active users can read. Nobody can write tables directly, and nobody can change or delete history.

## Offline sync (`src/data`)
- `localDb.ts` uses Dexie (IndexedDB) and has these tables:
  - `remote`: the last server state
  - `satki`: what the UI shows
  - `events`: history
  - `outbox`: changes waiting to be sent
  - `meta`
- `outbox.ts`:
  - `enqueue` validates a change and applies it locally.
  - `flush` sends queued changes in order. A network error stops the flush and it retries later. A business error marks the change `failed`.
  - `recompute` rebuilds `satki` from `remote` plus the pending changes, so failed changes disappear from the screen until fixed.
  - `retry` and `discard` handle the user's choice from the sync-problems screen.
- `sync.ts` handles pulling (by `updated_at` / `recorded_at` cursor, with a 2-minute overlap), Realtime, timers and the status store.
- **Conflict policy:**
  - **Position clashes** are rejected by the server and shown to the user with a fix ("choose another position"). Nothing is ever silently overwritten.
  - **Processing of the same satka from two phones:** the newer *processing date* wins for the current state. Both entries stay in the history.
- The device keeps 180 days of history. The record screen can load the full history when online.

## Screens (`src/pages`)
- **Home** shows big buttons and the last actions.
- **Search** matches partial numbers ("12" finds SAT-00012).
- **Scan** handles QR codes and has a manual entry field.
- **Satka record** has inline Обработка / Архивирай / Корекция (admin), a link to Премести, a QR code, and the history.
- **Add** has two modes. "Една сатка" picks a position and a size. "Много наведнъж" picks a line, a section range, slots and a size, then creates one satka per free position; occupied positions are skipped, and each satka gets its own number.
- **Inventory**: filters plus counts per size.
- **Map**:
  - The map is the real map (Leaflet, OpenStreetMap). The Leaflet drawing layer must not be restyled by global CSS, or the lines collapse to zero size. It needs each line's GPS, which is set by default in `src/config/gps.ts`. The Leaflet attribution flag is turned off.
  - The compass sits alone in the top-left corner. The layer control is bottom-left and holds only layers.
- **Sync**: status and the problems list.
- **Admin**: users, farm layout, backup export, labels.

## Demo mode
`npm run demo` sets `VITE_DEMO=1`. It starts with an empty farm, like the real launch, and a fake server inside the browser (`src/data/demo.ts`) stands in for Supabase. The Sync screen has a button that simulates losing signal.
