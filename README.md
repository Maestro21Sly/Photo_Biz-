# SnapCampus

A campus photography marketplace — discover photographers, compare styles & pricing, book shoots, chat in real time, and leave reviews. One codebase ships to **iOS, Android, and web**.

This repo is the productizable V1 of the prototype documented in [`docs/`](docs/). The original static PWA is preserved under [`legacy-pwa/`](legacy-pwa/).

> **Portfolio note:** this is the real V1 of the "Duke creative marketplace" idea. Its business/product planning graduated here from the `Unexplored/` incubator and lives in [`incubator-planning/`](incubator-planning/) (the `Unexplored/duke-creative-marketplace/` folder is now a stub pointing back here).

---

## Architecture

| Layer | Tech | Location |
| --- | --- | --- |
| App (iOS / Android / Web) | Expo (React Native) + Expo Router + React Query | [`apps/mobile`](apps/mobile) |
| API | Node + Express + Socket.IO | [`apps/api`](apps/api) |
| Database | PostgreSQL + Prisma ORM | [`apps/api/prisma`](apps/api/prisma) |
| Realtime chat | Socket.IO (per-user rooms) | API + app |
| Auth | JWT access + rotating refresh tokens (hashed at rest) | API |
| Media | Local disk uploads served at `/uploads` (swap for S3/R2 in prod) | API |
| Push | Expo Push (best-effort, fired from notifications) | API |

### Feature coverage (V1)
- ✅ Accounts (student / photographer) with secure auth
- ✅ Photographer onboarding: editable profile, pricing, specialties, **portfolio photo uploads**
- ✅ Discovery feed with **search, specialty filters, sort**, infinite scroll, pull-to-refresh
- ✅ Rich photographer profiles (swipeable gallery, stats, pricing, reviews)
- ✅ **Favorites / saves**
- ✅ **Booking requests** + status flow (accept / decline / complete / cancel)
- ✅ **In-app realtime chat**
- ✅ **Reviews & ratings** + verification badges
- ✅ **Push notifications** (bookings, messages, reviews)
- 🔌 Payment-ready schema (`Payment` table) — charging is intentionally deferred (free V1)

---

## Quick start

Prerequisites: **Node 20+**, and a PostgreSQL database (Docker, or a hosted one like Neon/Supabase/RDS).

```bash
# 1. Install everything
npm install

# 2. Start Postgres (Docker) — or set DATABASE_URL to a hosted DB
npm run db:up

# 3. Configure the API
cp apps/api/.env.example apps/api/.env      # edit secrets for production

# 4. Create the schema + seed demo data
npm run db:migrate        # first run: name the migration e.g. "init"
npm run db:seed

# 5. Run the API (terminal 1)
npm run api               # http://localhost:4000

# 6. Run the app (terminal 2)
npm run mobile            # press w (web), i (iOS sim), a (Android emulator)
```

### Demo logins (after seeding)
Password for all: **`password12345`**
- Student: `student@snapcampus.app`
- Photographer: `maya@snapcampus.app` (also `cam@`, `ade@`, `jin@`, `noor@`, `theo@`)

### Connecting a physical phone
`localhost` on a phone means the phone itself. Point the app at your Mac's LAN IP:
```bash
EXPO_PUBLIC_API_URL=http://192.168.x.x:4000 npm run mobile
```
(Android emulator reaches the host at `10.0.2.2` — handled automatically.)

---

## Useful scripts (run from repo root)

| Command | What it does |
| --- | --- |
| `npm run api` | Start the API in watch mode |
| `npm run mobile` | Start Expo (web / iOS / Android) |
| `npm run db:up` / `db:down` | Start / stop the Postgres container |
| `npm run db:migrate` | Apply Prisma migrations (dev) |
| `npm run db:seed` | Seed demo photographers + student |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run lint` | ESLint over the API |
| `npm run typecheck` | `tsc --noEmit` over `src/` and `tests/` |
| `npm run test` | Jest + supertest integration suite |
| `npm run test:cov` | Same, with a coverage report |
| `npm run build` | Generate the Prisma client and compile the API |

---

## Tests

The suite runs against a **real PostgreSQL database** — Prisma is never mocked, so a
broken migration, a missing constraint, or a transaction that doesn't roll back
fails here rather than in production. `tests/setup/globalSetup.cjs` applies
`prisma migrate deploy` before the first suite, and every test starts from a
truncated database.

```bash
createdb snapcampus_test                  # once; connection string in apps/api/.env.test
npm run test
```

Configuration lives in [`apps/api/.env.test`](apps/api/.env.test) and is committed
on purpose (throwaway values, throwaway database). Anything already exported in
the environment wins, which is how CI points the suite at its own Postgres service.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint → typecheck →
test → build against a Postgres 16 service container on every push and PR.

---

## Design

The app's interface — theme tokens, dark mode, image presentation, and the
enforced WCAG contrast gate — is documented in
[`docs/DESIGN.md`](docs/DESIGN.md), including an explicit list of what could
**not** be verified without iOS/Android simulators.

```bash
cd apps/mobile && node scripts/check-contrast.mjs   # 104 pairs, exits non-zero on failure
```

---

## Security

The API had a security pass covering configuration, authentication,
authorization, uploads and stored injection. The findings and the controls now
in place — including what is deliberately **not** defended — are written up in
[`docs/SECURITY.md`](docs/SECURITY.md).

Two worth knowing before deploying:

- Config **fails closed**. Placeholder or short JWT secrets, wildcard CORS,
  console email and local storage are all refused in production, so a
  misconfigured deploy exits at boot instead of running insecurely.
- `npm audit` still reports findings in the **Expo/Metro dev toolchain**.
  Production API dependencies are clean; CI audits with `--omit=dev`.

---

## Deploy to production

Two things ship: the **API + database**, and the **app** (stores + optional web). Everything is config/env-driven — no code changes needed to go live.

### 1. Database (managed Postgres)
Create a DB on Neon / Supabase / Railway / RDS and grab its connection string.

### 2. API server
Deploy `apps/api` — a `Dockerfile` is included (applies migrations on boot, then starts). Works on Render / Railway / Fly.io / any Docker host.

```bash
docker build -f apps/api/Dockerfile -t snapcampus-api .
# or point Render/Railway at the repo; build context = repo root, dockerfile = apps/api/Dockerfile
```

Required env (see [`apps/api/.env.example`](apps/api/.env.example)). The API
**validates its whole configuration at boot and refuses to start** if anything is
missing, weak, or dev-only — there are no silent fallbacks:
- `DATABASE_URL`, `NODE_ENV=production`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — at least 32 chars and not a
  placeholder. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `CORS_ORIGIN` = your web origin(s); a wildcard is rejected in production
- `PUBLIC_BASE_URL` = the API's public URL; `APP_URL` = where the app/web lives (for email links)
- `TRUST_PROXY` = number of reverse proxies in front of the API (e.g. `1`). Rate
  limiting keys on the client IP, so this has to match your topology
- In production, `STORAGE_DRIVER` must be `s3` and `EMAIL_DRIVER` must not be
  `console` (it would print password-reset links into the logs)

### 3. Object storage (so uploads survive deploys)
Set `STORAGE_DRIVER=s3` and the `S3_*` vars (works with **Cloudflare R2**, AWS S3, Backblaze, MinIO). Uploaded photos are re-encoded (EXIF/GPS stripped) and a thumbnail is generated automatically. Leave `STORAGE_DRIVER=local` only for dev.

### 4. Email (password reset / verification)
Set `EMAIL_DRIVER=resend` + `RESEND_API_KEY` + `EMAIL_FROM`. In dev (`console`) emails are logged to the server so the flows are testable without a provider.

### 5. Legal pages
Served by the API at `/legal/terms` and `/legal/privacy` (the app links to them; the App Store requires a reachable privacy URL).

### 6. Mobile app → stores (EAS)
```bash
npm i -g eas-cli && eas login
cd apps/mobile
eas init                      # fills extra.eas.projectId in app.json
eas build -p ios              # needs Apple Developer account ($99/yr)
eas build -p android          # needs Google Play account ($25 once)
eas submit -p ios && eas submit -p android
```
- Production API URL is set in [`eas.json`](apps/mobile/eas.json) (`EXPO_PUBLIC_API_URL`) — point it at your deployed API.
- Replace placeholder art in `apps/mobile/assets/` with final icon/splash.
- For push: run `eas init` (projectId) and add FCM (Android) / APNs (iOS) credentials via `eas credentials`.

### 7. Web (optional)
`npx expo export -p web` produces a static SPA in `apps/mobile/dist/` — deploy to Vercel / Netlify / Cloudflare Pages.

---

## Roadmap (post-V1, not blockers)
- Payments & deposits via Stripe Connect (schema already in place)
- Calendar / availability + double-booking prevention
- Map marker clustering + "results below the map" split view
- Photographer earnings/stats dashboard, portfolio drag-reorder
- Full accessibility contrast/dynamic-type pass
