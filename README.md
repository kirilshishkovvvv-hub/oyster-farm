# Ферма за стриди — Oyster farm management

Phone-first web app for tracking mesh bags (*satki*) on a 6-line oyster farm in the Black Sea:
where each satka is, its oyster size category, its latest processing, and its full history.
Works offline at sea and syncs when signal returns.

- **Stack:** React + TypeScript + Vite (PWA) · Supabase (Postgres, Auth, RLS) · GitHub Pages
- **UI language:** Bulgarian

## Quick start

```bash
npm install
npm run demo      # try the app on an empty farm, no server needed → http://localhost:5173
npm test          # unit tests
npm run build     # production build (needs .env, see docs/SETUP.md)
```

## Documentation

| File | What |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Create the Supabase project, first admin, deploy to GitHub Pages |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the app is built: data model, offline sync, screens |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why things are the way they are |
| [docs/ISSUES.md](docs/ISSUES.md) | Known limitations, open questions, problems of the old app |
| [docs/BACKUP.md](docs/BACKUP.md) | Backups and restore |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Change history |
| [docs/РЪКОВОДСТВО.md](docs/РЪКОВОДСТВО.md) | Ръководство за работниците |
