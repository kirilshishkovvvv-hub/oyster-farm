# Outstanding issues and open questions

## To confirm with the farm
- [x] **Line layout and orientation.** Confirmed: 3 columns × 2 rows (1/2 west, 3/4 middle, 5/6 east), buoy 1 at the north end, land to the west.
- [ ] **Satki positions on the rope.** Built from the owner's drawing: 2 satki on the west side and 2 on the east side of each section, one near each buoy (see DECISIONS 19). Confirm on site: sides, and whether they sit at 25 % / 75 % of the section.
- [ ] **"На суша".** Should the satka keep its position while on land? The current answer is yes.
- [ ] **GPS check on site.** The owner gave Л2 (buoy 26) and Л5 (buoy 1). Lines 1, 3, 4 and 6 are derived from a regular 3 × 2 grid (`src/config/gps.ts`). Check all six on the real-world map, and correct any that are off under Админ → Ферма и линии.
- [ ] **Old app data.** The previous app stored data in Claude artifact storage, so it cannot be read from here. If it holds real data, export it and an importer can be written.

## Not verified yet
- **Camera scanning on real phones**, which needs the HTTPS deploy. Check this on Android/Chrome and iPhone/Safari:
  - It opens the rear camera.
  - The permission prompt works, and so does the message shown after "Deny".
  - Scanning a printed label opens the record.
- **Database scripts.** These have not been run against a real Supabase project yet. Run `supabase/tests/checks.sql` after setup.
- **Sync between two real devices** (Realtime updates and the conflict flow) against Supabase. In demo mode the conflict flow was tested with a simulated second device.

## Known limitations
- **Free-tier Supabase pauses a project after 7 days without any requests.** Daily use prevents this. If it happens, press "Restore" in the dashboard.
- **Free tier has no point-in-time recovery.** Use the nightly encrypted backup workflow plus the weekly export (see BACKUP.md).
- **Archive is permanent**, and there is no "restore". This is by design: codes are never reused. A satka found again gets a new satka/code.
- **History older than 180 days is not stored on the phone.** "Покажи цялата история" loads it when online.
- **Map tiles are cached only for areas already viewed online.** Offline, the map shows only areas that were loaded before.
- **Admin actions need a connection.** These are users, lines, settings and export; corrections can be queued offline.
- **Git for Windows is not installed on the development PC.** The installer needs an administrator prompt, which was cancelled. Install it, or use GitHub Desktop, before publishing.

## Problems in the old app (`legacy/`), fixed by this build
1. All data was one JSON blob in artifact storage, so two devices saving at once overwrote each other. There was no real database, authentication, backups or offline sync.
2. The QR scanner used `cams[0]`, often the front camera, and showed generic errors.
3. The map was blank until GPS was entered.
4. There were 12 operation types instead of the 3 required statuses.
5. Notes were inserted with `innerHTML` (XSS risk).
6. There were no roles, and anyone could open "reset ALL data".
7. There was no way to correct a size.
8. Lines were split into groups A/B.
9. Search needed an exact ID, and the size order was wrong.
10. The Admin button sat next to the compass, and the seamark toggle shared the admin toolbar.
11. Dates used UTC, so the date was wrong after midnight local time.
