# Setup

You need: a GitHub account (you have it), a free Supabase account, and Node.js 24 (installed).

## 1. Create the database (Supabase)

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. **New project**:
   - Name: `oyster-farm`
   - Database password: generate one and **save it in a password manager**
   - Region: **Central EU (Frankfurt)**, which is closest to Bulgaria
3. When the project is ready, open **SQL Editor** → **New query** and run these files **in this order**. For each file: paste its whole content, then press **Run**.
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_functions.sql`
   3. `supabase/migrations/0003_rls.sql`
   4. `supabase/seed.sql`
4. Optional self-check: run `supabase/tests/checks.sql`. It should end with the notice `ALL CHECKS PASSED`. It leaves no data behind.
5. **Authentication → Sign In / Providers → Email**:
   - Keep **Email** enabled.
   - If your workers don't check email, turn **Confirm email** off. New accounts still need your approval in the app, so this is safe.
6. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

## 2. Run locally

```bash
copy .env.example .env
```

Put the URL and the anon key into `.env`, then:

```bash
npm run dev
```

## 3. Create the first admin

1. In the app, tap **„Нямате профил? Създайте нов“** and register with your own email.
2. In Supabase **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set role = 'admin', active = true where email = 'you@example.com';
   ```
3. In the app, tap **„Провери отново“**. You are now admin.

Everyone else registers in the app the same way. You approve them under **Админ → Потребители**. Nobody can see farm data until approved.

## 4. Publish on GitHub Pages (HTTPS — required for the phone camera)

1. Create a new **public** repository on GitHub, e.g. `oyster-farm`. Pages is free only for public repos. The code holds no secrets: the anon key is meant to be public, and the database protects the data.
2. Push this folder to it. Git must be installed: Git for Windows needs an administrator prompt, or use GitHub Desktop.
3. Repository **Settings → Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. **Settings → Pages → Source: GitHub Actions**.
5. Every push to `main` now tests, builds and deploys. The address is `https://<your-user>.github.io/oyster-farm/`.
6. In Supabase **Authentication → URL Configuration**, set **Site URL** to that address.
7. On each phone or computer, open the address and tap **„Инсталирай приложението“**. This adds a desktop shortcut (Windows/Mac, in Chrome or Edge) or a home-screen icon (Android), so the app opens on its own and works offline. On iPhone, use Safari → Share → **Add to Home Screen**.

## 5. Line orientation and GPS

The layout is built in: lines 1/2 in the west column, 3/4 in the middle, 5/6 in the east (odd numbers north, even numbers south). Buoy 1 is at the **north** end of every line (heading 180°).

The database starts with **no satki**. Create them in the app with **Добави сатка**, one at a time or **Много наведнъж** for a whole line.

Once you have GPS positions of buoy 1 and buoy 26 for each line, enter them under **Админ → Ферма и линии**.

## 6. Backups

See [BACKUP.md](BACKUP.md).
