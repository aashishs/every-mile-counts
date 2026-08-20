# Every Mile Counts

Production-ready **MERN-style PWA** (Postgres, Express, React, Node) for endurance athletes, coaches, and clubs.

Athletes sync Garmin or Strava, analyze training, join clubs, work with up to three coaches, and prepare for races. Access is invitation-based so the beta can stay free while the data model is ready for paid subscriptions.

## Features

- **RBAC:** athlete, coach, club administrator, application administrator
- **Membership:** invitation codes, plans (1–24 months, lifetime, custom), expiry notices, club read-only mode
- **Activity sync:** Strava OAuth (history + webhooks + periodic backup), Garmin, manual GPX/TCX, duplicate-safe upserts
- **Athlete dashboard:** weekly/monthly/yearly mileage, PRs, consistency vs weekly training-day target, streaks, coaches, goals, events
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

Signup is invitation-only. Create codes in Admin → Invite codes.

### 4. Run

```bash
npm run dev
```

- App: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:5000/api/health](http://localhost:5000/api/health)

## Deploy on Railway

This repo is a **monorepo**: Postgres + Express API (`server/`) + Vite web app (`client/`). Railway needs **three services** in one project.

GitHub remote: `https://github.com/aashishs/every-mile-counts`

### 0. Push this code

Railway builds from GitHub. Commit and push `main` first (including `server/railway.toml` and `client/Caddyfile`).

In [Railway](https://railway.com/dashboard) connect GitHub if you have not already: **Account → GitHub → Install Railway**.

### 1. Create the project

1. **New project** → **Empty project**. Rename it `every-mile-counts`.
2. **+ Create** → **Database** → **PostgreSQL**.
3. **+ Create** → **Empty service** twice. Rename them `api` and `web`.

### 2. Wire GitHub

For **api**:

- **Settings → Root Directory:** `server`
- **Settings → Source:** connect `aashishs/every-mile-counts`, branch `main`
- Leave **api** private (no public domain). The browser cannot use `RAILWAY_PRIVATE_DOMAIN`.

For **web**:

- **Settings → Root Directory:** `client`
- **Settings → Source:** same repo / `main`
- **Settings → Networking → Public Networking → Generate domain**

`RAILWAY_PUBLIC_DOMAIN` only appears **after** you generate that public domain. It will show on **web**, not on **api**.

### 3. API variables

On **api** → **Variables**, add:

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `CLIENT_URL` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` |
| `JWT_SECRET` | a long random string |
| `ENCRYPTION_KEY` | 64 hex chars (command below) |
| `ADMIN_EMAIL` | your admin email |
| `ADMIN_PASSWORD` | a strong password |
| `STRAVA_CLIENT_ID` | from Strava (optional) |
| `STRAVA_CLIENT_SECRET` | from Strava (optional) |

If your Postgres service is not named `Postgres`, use that service’s name in `${{...}}`.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Custom domain (`www.everymilecounts.in`)

Attach the domain to **web** only (api stays private).

1. **web** → **Settings → Networking → Custom Domain** → add `www.everymilecounts.in`.
2. In your DNS (GoDaddy, Cloudflare, Namecheap, etc.) create **both** records Railway shows:
   - **CNAME** `www` → the Railway target (looks like `xxxx.up.railway.app`)
   - **TXT** (verification) — required; without it the domain stays 404
3. Optional: also add `everymilecounts.in` (apex). That needs CNAME flattening / ALIAS / ANAME, not a normal A record. Then point `www` at `@` or add both hostnames on the same Railway service.
4. Wait until Railway shows the domain as verified (SSL is automatic).

You can still generate a Railway `*.up.railway.app` domain for testing; production traffic should use `https://www.everymilecounts.in`.

### 5. Web variables

On **web** → **Variables**:

| Name | Value |
| --- | --- |
| `API_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` |

Do **not** set `VITE_API_URL`. The web app calls `/api` on its own public URL; Node proxies that to the private API.

If the Railway web URL returns **502**, the process was not listening. Redeploy **web** after this Node start command is on `main`. On **web** do not set a health check of `/api/health` — use `/health`. If `${{api.PORT}}` is empty, set `PORT=8080` on **api** and use that port in `API_URL`.

### 6. Deploy and log in

Click **Deploy**. Wait until api health is green (`/api/health`). Open [https://www.everymilecounts.in](https://www.everymilecounts.in).

Login: `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Create invitation codes in Admin → Invite codes.

### 7. Strava data sync (optional)

Strava OAuth is **not** app login. Athletes sign in with email, then authorize Strava so EMC can read activities.

In [Strava API settings](https://www.strava.com/settings/api):

- Authorization Callback Domain: the **web** host only (e.g. `www.everymilecounts.in`), no `https://`
- Redirect URI: `{CLIENT_URL}/api/strava/callback` (Caddy proxies `/api` to the private API)
- Webhook callback: `{CLIENT_URL}/api/strava/webhook` (subscribed automatically on API startup)

### Railway notes

- Trial credit is limited; Hobby is billed after that. Private Postgres (`DATABASE_URL`) stays inside Railway — do not use `DATABASE_PUBLIC_URL` for the API.
- The API start command runs migrate + seed, then `node index.js`. Seed does not overwrite an existing admin user.
- SMTP uses Gmail (`Everymilecountsapp@gmail.com`). Set `SMTP_PASS` to a Gmail **App Password** (Google Account → Security → 2-Step Verification → App passwords). Signup OTP and forgot-password emails will not send until that is set.

## Deploy (Render + Neon, free test)

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

- Authorization Callback Domain: `emc-web.onrender.com` (web host only)
- Redirect: `{CLIENT_URL}/api/strava/callback`

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

Seeded login after first boot: `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Create invitation codes in Admin → Invite codes.

**Vercel alternative for the web app:** import `client/`, set `VITE_API_URL` to the Render API URL, then put that Vercel URL in `CLIENT_URL`.

## Garmin & Strava

1. Create a [Strava API application](https://www.strava.com/settings/api). Callback domain: `localhost`. Redirect URI: `http://localhost:5173/api/strava/callback` (Vite proxies `/api` to the API).
2. Create a Garmin Connect Developer Program application (OAuth 1.0a). Redirect URI: `http://localhost:5000/api/garmin/callback`.
3. Put client/consumer credentials in `server/.env`.

Athletes connect Strava from Dashboard or Profile after they are already logged in. First connect imports history; new/updated/deleted activities arrive via webhook, with an incremental backup sync every 3 hours. Garmin can still be connected separately.

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
