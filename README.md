# Every Mile Counts

Production-ready **MERN-style PWA** (Postgres, Express, React, Node) for endurance athletes, coaches, and clubs.

Athletes sync Garmin or Strava, analyze training, join clubs, work with up to three coaches, and prepare for races. Access is invitation-based so the beta can stay free while the data model is ready for paid subscriptions.

## Features

- **RBAC:** athlete, coach, club administrator, application administrator
- **Membership:** invitation codes, plans (1–24 months, lifetime, custom), expiry notices, club read-only mode
- **Activity sync:** Garmin (preferred) and Strava, manual + daily job, duplicate-safe upserts
- **Athlete dashboard:** weekly/monthly/yearly mileage, PRs, consistency, coaches, goals, events
- **Analysis:** pace, HR zones, cadence, elevation, training load, period comparison, charts
- **Clubs:** profiles, join/approve, coaches required before members, announcements, events, leaderboard
- **Coaching:** max 3 coaches, review requests, coach-only insights, structured feedback
- **Events & goals:** planned vs actual, progress tracking
- **Notifications:** in-app + Web Push (VAPID)
- **PWA:** installable, offline shell, Network-First API cache
- **Security:** JWT, bcrypt, encrypted OAuth tokens, Helmet, rate limits, audit log
- **Docker:** Postgres + API + nginx web

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, Recharts, vite-plugin-pwa |
| Backend | Node.js, Express |
| Database | PostgreSQL 16 |
| Auth | JWT + Garmin/Strava OAuth |
| Jobs | node-cron daily sync + membership refresh |

## Local setup

### Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres) **or** PostgreSQL 16 locally (`DATABASE_URL` in `server/.env`)

### 1. Start Postgres

```bash
docker compose up postgres -d
```

### 2. Install and configure

```bash
npm install
npm run install:all
cp server/.env.example server/.env
```

Edit `server/.env` if your database URL or OAuth apps differ. Generate a 64-character hex `ENCRYPTION_KEY` for production.

### 3. Schema + seed

```bash
npm run setup
```

Seeded admin:

- Email: `admin@everymilecounts.app`
- Password: `Admin123!`

Beta invitation codes: `WELCOME-EMC`, `ATHLETE-BETA`, `COACH-BETA`, `CLUB-BETA`

### 4. Run

```bash
npm run dev
```

- App: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:5000/api/health](http://localhost:5000/api/health)

## Deploy (free test, ~1 month)

Use **Neon** (Postgres) + **Render** (API + web). No credit card. The API sleeps after 15 minutes idle; the first request after that takes about a minute.

### 1. Neon

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the connection string (`?sslmode=require`).

### 2. Render

1. Push this repo to GitHub.
2. On [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint** → select the repo (`render.yaml`).
3. Fill the prompted env vars (see list below).
4. After deploy, copy the two URLs:
   - API: `https://emc-api.onrender.com`
   - Web: `https://emc-web.onrender.com`
5. On **emc-api** set `CLIENT_URL` to the web URL, then **Manual Deploy**.

### 3. Strava

In [Strava API settings](https://www.strava.com/settings/api):

- Authorization Callback Domain: `emc-api.onrender.com` (host only)
- Redirect: `https://emc-api.onrender.com/api/strava/callback`

### Env vars (API / emc-api)

| Name | Example |
| --- | --- |
| `DATABASE_URL` | Neon URL with `sslmode=require` |
| `CLIENT_URL` | `https://emc-web.onrender.com` |
| `JWT_SECRET` | auto-generated on Render is fine |
| `ENCRYPTION_KEY` | 64 hex chars (command below) |
| `STRAVA_CLIENT_ID` | from Strava |
| `STRAVA_CLIENT_SECRET` | from Strava |
| `ADMIN_EMAIL` | `admin@everymilecounts.app` |
| `ADMIN_PASSWORD` | choose a strong password |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Frontend `VITE_API_URL` is set from the API URL by `render.yaml`.

Seeded login after first boot: `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Invite codes: `WELCOME-EMC`, `ATHLETE-BETA`, `COACH-BETA`, `CLUB-BETA`.

**Vercel alternative for the web app:** import `client/`, set `VITE_API_URL` to the Render API URL, then put that Vercel URL in `CLIENT_URL`.

## Garmin & Strava

1. Create a [Strava API application](https://www.strava.com/settings/api). Callback domain: `localhost`. Redirect URI: `http://localhost:5000/api/strava/callback`.
2. Create a Garmin Connect Developer Program application (OAuth 1.0a). Redirect URI: `http://localhost:5000/api/garmin/callback`.
3. Put client/consumer credentials in `server/.env`.

Garmin is preferred; Strava is the fallback. Either or both can be connected. Historical import runs on first connect; a daily job at 04:00 syncs all connected athletes.

## Docker (full stack)

```bash
docker compose up --build
```

Web: [http://localhost:8080](http://localhost:8080) · API: [http://localhost:5000](http://localhost:5000)

## Roles

| Role | What they can do |
| --- | --- |
| Athlete | Profile, sync, activities, analysis, clubs, goals, events, review requests |
| Coach | Assigned athletes only, inbox, proactive reviews, coach-only insights |
| Club admin | Club profile, approve members, assign coaches (required on join), announcements, club events |
| App admin | Users, verify clubs, invitation codes, memberships, settings, audit, support |

A club cannot accept members until it has **at least one coach**. Each athlete can have **at most three** coaches.

## Membership

Registration requires an invitation code. Statuses: Active, Expiring soon (≤30 days), Expired, Suspended, Cancelled. Daily job notifies at 30 / 15 / 7 days. Expired club memberships switch the club to read-only. Plan rows are ready for future Stripe/auto-renew billing.

## Project layout

```
client/                 React PWA
server/
  db/schema.sql         Postgres schema
  db/migrate.js         Apply schema
  db/seed.js            Admin, plans, beta codes
  routes/               REST API
  services/             Sync, analysis, notifications
  jobs/scheduler.js     Daily sync + membership
docker-compose.yml
```

## License

MIT
