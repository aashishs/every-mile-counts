# Every Mile Counts

A MERN stack application for recreational athletes to sync Strava activities, track events, get training analysis, and receive coach reviews.

## Features

- **Email & password authentication** — Register as athlete, coach, or both
- **Strava integration** — Connect with the same email to auto-sync runs, rides, swims, and more
- **Activity dashboard** — View all synced activities with filters and detail pages
- **Training analysis** — Distance, time, elevation, and breakdowns by activity type and week
- **Events** — Enroll in future races/training goals and map completed Strava activities to events
- **Coach system**
  - Athletes can assign up to 3 coaches
  - Coaches are also athletes (can connect Strava, have their own coaches)
  - Coaches review athlete activities with ratings and feedback

## Tech Stack

- **Frontend:** React 18, Vite, React Router
- **Backend:** Node.js, Express, MongoDB (Mongoose)
- **Auth:** JWT + bcrypt
- **Integration:** Strava OAuth 2.0 API

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- [Strava API application](https://www.strava.com/settings/api)

## Setup

### 1. Clone and install

```bash
cd every-mile-counts
npm run install:all
```

### 2. Configure environment

Copy the server env file and fill in your values:

```bash
cp server/.env.example server/.env
```

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for JWT tokens |
| `STRAVA_CLIENT_ID` | From Strava API settings |
| `STRAVA_CLIENT_SECRET` | From Strava API settings |
| `STRAVA_REDIRECT_URI` | `http://localhost:5000/api/strava/callback` |
| `CLIENT_URL` | `http://localhost:5173` |

### 3. Strava API setup

1. Go to [Strava API Settings](https://www.strava.com/settings/api)
2. Create an application
3. Set **Authorization Callback Domain** to `localhost`
4. Copy Client ID and Client Secret to `server/.env`

> **Important:** The Strava account email must match the app account email for sync to work.

### 4. Run the app

Terminal 1 — API server:

```bash
npm run dev:server
```

Terminal 2 — React client:

```bash
npm run dev:client
```

Open [http://localhost:5173](http://localhost:5173)

## User Roles

| Role | Capabilities |
|------|-------------|
| **Athlete** | Connect Strava, view activities, create events, assign coaches |
| **Coach** | All athlete features + view assigned athletes' activities and leave reviews |

Coaches can also be athletes and assign their own coaches (up to 3).

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login |
| GET | `/api/strava/connect` | Get Strava OAuth URL |
| POST | `/api/strava/sync` | Manual activity sync |
| GET | `/api/activities` | List activities |
| GET | `/api/activities/analysis` | Training analysis |
| POST | `/api/activities/:id/review` | Coach review |
| GET/POST | `/api/events` | Manage events |
| POST | `/api/events/:id/map-activities` | Map activities to event |
| GET/POST | `/api/coaches/*` | Coach assignments |

## Project Structure

```
every-mile-counts/
├── client/          # React frontend (Vite)
├── server/          # Express API
│   ├── models/      # Mongoose schemas
│   ├── routes/      # API routes
│   ├── services/    # Strava sync logic
│   └── middleware/  # Auth middleware
└── README.md
```

## License

MIT
