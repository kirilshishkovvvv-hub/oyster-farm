# Backups

The data lives in Supabase. Three layers of protection:

## 1. Nightly encrypted dump (automatic)
`.github/workflows/backup.yml` dumps the whole database every night. It encrypts the dump with your passphrase and keeps it for 90 days as a workflow artifact.

**Enable it:**
1. Repository **Settings → Secrets and variables → Actions → Secrets**:
   - `SUPABASE_DB_URL`: in Supabase, open **Connect → Session pooler → URI**. Put in your database password.
   - `BACKUP_PASSPHRASE`: a long passphrase. Store it in a password manager. Without it the backups cannot be opened.
2. Under **Variables**, add `BACKUP_ENABLED` = `true`.
3. Under **Actions → Backup → Run workflow**, run it once to test.

## 2. Weekly export from the app (manual, admin)
Go to **Админ → Резервно копие → Изтегли резервно копие**. It downloads:
- `oyster-farm-backup-YYYY-MM-DD.json`: everything, for restore
- `oyster-farm-satki-YYYY-MM-DD.csv`: a table of satki that opens in Excel

Keep these files off the phone, for example on a PC or a USB drive.

## 3. Phones
Each phone keeps a full copy of the current state (and the last 180 days of history) for offline use. This is not a backup, but it helps in an emergency.

## Restore from the nightly dump
1. Download the artifact from **Actions → Backup → (run) → db-backup**.
2. Decrypt the file. On Windows you can use Gpg4win.
   ```bash
   gpg --decrypt backup-YYYY-MM-DD.tar.gz.gpg > backup.tar.gz
   ```
   Then extract the archive:
   ```bash
   tar xzf backup.tar.gz
   ```
3. Restore into a **new** Supabase project. Never restore over the live one without a fresh dump first. Use `psql` with the new project's connection string:
   ```bash
   psql "<new project URI>" -f schema.sql
   ```
   ```bash
   psql "<new project URI>" -f data.sql
   ```
4. Point the app at the new project by updating the two repository variables, then re-run the Deploy workflow.
