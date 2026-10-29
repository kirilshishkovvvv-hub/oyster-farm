# Changelog

## 0.2.6 — 2026-10-29
- **Install the app**: a „Инсталирай приложението“ button on the home and login screens. Chrome/Edge open the install dialog (desktop shortcut on Windows/Mac, home-screen icon on Android); on iPhone it shows the Safari steps. Hidden once installed.
- App icons made from the company logo (`assets/logo.png`): `public/pwa-192.png`, `pwa-512.png`, `apple-touch-icon.png`, `favicon.png`. Regenerate with `powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1`.

## 0.2.5 — 2026-10-28
- Големи is yellow (was white). Buoys on the map are orange-and-black striped.

## 0.2.4 — 2026-10-28
- **Lines now show on the real map.** A global CSS rule had shrunk Leaflet's drawing layer to zero size. The map also re-measures when its container resizes.
- **Морски знаци removed** (checkbox, layer and cache rule).
- **Size colours** changed: Спат red, Малки green, Големи white, Търговски размер purple, Едри orange.

## 0.2.3 — 2026-10-28
- **Satki layout on the rope** now follows the owner's drawing: 2 satki on the west side and 2 on the east side of each section, one near each buoy. Slots are named Горна/Долна лява/дясна. The map draws each satka at its side of the rope.

## 0.2.2 — 2026-10-28
- The map page shows only the real map. The schematic view was removed.
- The Ukrainian flag that Leaflet adds to the attribution line is turned off.
- Line labels on the real map are short (Л1–Л6).

## 0.2.1 — 2026-10-28
- **Line GPS** set for all six lines (`src/config/gps.ts`, `supabase/seed.sql`). Л2 and Л5 come from the owner's measurements; the others are derived from the grid and need an on-site check.
- The real-world map (Карта → Карта) now shows the lines, buoys and satki.

## 0.2.0 — 2026-10-28
- **Map layout** now matches the farm. Land is on the west, and the lines sit in 3 columns × 2 rows: Л1/Л2 west, Л3/Л4 middle, Л5/Л6 east, odd numbers north. Buoy 1 is at the north end. The line buttons use the same arrangement.
- **Map colours** reduced to sea, land, and the size colours on real satki.
- **Bulk creation**: the new "Много наведнъж" option fills a line or a section range with one size, skipping occupied slots.
- **Demo mode** now starts with an empty farm; the old sample data is removed automatically.

## 0.1.0 — 2026-10-28
First version, built from zero. It replaces the single-file artifacts in `legacy/`.
- Supabase schema, write functions, row-level security, seed data and self-check script.
- Offline-first data layer: IndexedDB mirror, ordered outbox, idempotent sync, conflict list.
- Screens: login/approval, home, search, QR scan, satka record (processing, move/swap, archive, admin correction, QR, history), add, inventory, map (schematic + GPS map with seamarks), sync, admin (users, layout/GPS, backup export), printable labels.
- Demo mode (`npm run demo`).
- GitHub Pages deploy workflow and nightly encrypted backup workflow.
- Unit tests for geometry, rules, search, QR parsing and the outbox.
