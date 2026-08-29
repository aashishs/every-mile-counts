import './config/loadEnv.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';
import { ensureSchemaPatches } from './db/ensureSchema.js';
import { errorHandler } from './middleware/error.js';
import { startScheduler } from './jobs/scheduler.js';
import { isAllowedOrigin } from './utils/urls.js';
import { verifyMailer } from './services/mailer.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import membershipRoutes from './routes/membership.js';
import stravaRoutes from './routes/strava.js';
import garminRoutes from './routes/garmin.js';
import activityRoutes from './routes/activities.js';
import reviewRoutes from './routes/reviews.js';
import eventRoutes from './routes/events.js';
import goalRoutes from './routes/goals.js';
import clubRoutes from './routes/clubs.js';
import coachRoutes from './routes/coaches.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import supportRoutes from './routes/support.js';
import pushRoutes from './routes/push.js';
import trainingRoutes from './routes/training.js';
import groupSessionRoutes from './routes/groupSessions.js';

await connectDB();
await ensureSchemaPatches();

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '12mb' }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/strava/webhook' || req.path === '/api/health' || req.path === '/health',
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Every Mile Counts' });
});
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Every Mile Counts' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/membership', membershipRoutes);
app.use('/api/strava', stravaRoutes);
app.use('/api/garmin', garminRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/coaches', coachRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/group-sessions', groupSessionRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Every Mile Counts API running on 0.0.0.0:${PORT}`);
  startScheduler();
  verifyMailer().catch((err) => console.error('SMTP verify failed:', err.message));
});
