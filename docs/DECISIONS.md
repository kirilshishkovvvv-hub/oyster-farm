# Decisions

| # | Decision | Why |
|---|---|---|
| 1 | New build from zero. The old `legacy/*.html` files are kept for reference only. | The owner asked for it. The old app stored everything in one artifact-storage blob that every device overwrote. |
| 2 | Supabase (Postgres + Auth + RLS) | Gives a real shared database, database-level rules (one satka per position), authentication and SQL, all on a free tier. |
| 3 | React + TypeScript + Vite PWA, hosted on GitHub Pages | Widely known stack. Pages gives free HTTPS, which the phone camera needs. Hash routes (`#/s/SAT-00012`) work on Pages without server config. |
| 4 | Bulgarian UI. All strings are in `src/i18n/bg.ts`. | These are the workers' language and terms. Compass letters stay N/S/E/W (marine convention). |
| 5 | The server issues `SAT-NNNNN` codes from a sequence. Satki created offline are shown as `НОВА-xxxx` until they sync. | IDs are unique and never reused. A device-generated uuid lets later offline changes refer to the new satka. |
| 6 | Statuses are only **На суша / Новосортирана / Сортирана**. **Archive** is a separate, permanent action with a reason (Изгубена / Повредена / Изведена от употреба / other). | The spec asks for simple operations. An archived satka frees its position, and its code is never reissued. |
| 7 | A satka marked "На суша" **keeps** its position. | It is taken out for processing and returns to the same place. If it does not return, move or archive it. *(Confirm with the farm.)* |
| 8 | Admin "Корекция" changes size, status or date and requires a reason. | Fixes wrong entries without pretending a processing happened. It is visible in the history. |
| 9 | ~~The 4 slots in a section are numbered 1–4 from the lower-numbered buoy.~~ Superseded by 19. | |
| 19 | The 4 satki of a section hang on the rope between its two buoys: slot 1 Горна лява, 2 Долна лява (west), 3 Горна дясна, 4 Долна дясна (east). Upper = near the north buoy. "West" = left side of the line on a north-up chart. | Owner's close-up drawing (2026-10-28). Left/right and the 25 %/75 % placement along the section are read from the drawing and should be checked on site. |
| 10 | ~~Size colours: Спат purple, Малки blue, Големи orange, Търговски yellow, Едри dark red. No green.~~ Superseded by 20. | High contrast, as specified. The letter keeps the colours distinguishable for colour-blind users. The name is always shown next to the colour. |
| 11 | Offline-first: every change is applied locally, queued, and synced in order. The server rejects conflicts, and the user resolves them. | Signal at sea is unreliable. No data is lost and nothing is silently overwritten. |
| 12 | New users register themselves and an admin approves them in the app. | Creating Supabase auth users from the browser would need the service key, which must never ship to phones. |
| 13 | ~~Schematic SVG map by default; the GPS map is optional.~~ Superseded by 18. | |
| 18 | The map page shows only the real map (OpenStreetMap). The schematic was removed. Leaflet's default Ukrainian flag in the attribution is turned off. | Owner request. Only one map view, so there is nothing to choose. |
| 14 | Line layout: 3 columns × 2 rows. West column Л1 (north) / Л2 (south), middle Л3 / Л4, east Л5 / Л6. Buoy 1 is at the north end of every line. The land (суша) is to the west. | Confirmed by the owner with a sketch (2026-10-28). Replaces the earlier "6 lines in one row" assumption. |
| 15 | No satki exist at launch. They are created in the app, one at a time or in bulk ("Много наведнъж"). | The owner's request. Bulk creation makes filling a new line fast, and each satka still gets its own permanent number. |
| 17 | Default GPS for the six lines comes from the owner's two measured points (Л2 buoy 26, Л5 buoy 1). The other four are derived from a regular grid (columns 151 m apart, north row 331 m north of the south row). They are stored in `src/config/gps.ts` and in `supabase/seed.sql`. | The owner asked for the lines on the real map and sent only two points. Derived values must be checked on site. |
| 16 | Map colours: the only colours are the sea (light blue), the land (brown), and the size categories on real satki. Empty slots are white. | The owner wants no unnecessary colours. |
| 20 | Size colours: Спат red, Малки green, Големи yellow, Търговски размер purple, Едри orange. Buoys are orange-and-black striped. Each keeps its letter (С/М/Г/Т/Е) and name. | Owner's choice (2026-10-28). This uses green, which the first brief had ruled out. Re-check that the white (Големи) satki stand out from empty slots on the map. Empty slots are white with a dashed outline. |
| 21 | No sea-marks (OpenSeaMap) layer. | The owner does not need it. |
