import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/error.js';
import { startScheduler } from './jobs/scheduler.js';
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

dotenv.config();
await connectDB();

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (_req, res) => {
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

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Every Mile Counts API running on port ${PORT}`);
  startScheduler();
});
