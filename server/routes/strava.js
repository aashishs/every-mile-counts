import express from 'express';
import axios from 'axios';
import { protect, requireMembership } from '../middleware/auth.js';
import { completeStravaOAuth, getStravaConnection, syncStravaActivities } from '../services/stravaService.js';
import { asyncHandler } from '../middleware/error.js';
import { writeAudit } from '../services/auditService.js';

const router = express.Router();

router.get(
  '/connect',
  protect,
  requireMembership,
  (req, res) => {
    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      redirect_uri: process.env.STRAVA_REDIRECT_URI,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read_all,profile:read_all',
      state: req.user.id,
    });
    res.json({ url: `https://www.strava.com/oauth/authorize?${params.toString()}` });
  }
);

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;
    const clientUrl = process.env.CLIENT_URL;
    if (error) return res.redirect(`${clientUrl}/dashboard?strava=error`);
    try {
      const tokenRes = await axios.post('https://www.strava.com/oauth/token', {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      });
      await completeStravaOAuth(state, tokenRes.data);
      await syncStravaActivities(state);
      await writeAudit({ userId: state, action: 'strava_connect', entityType: 'oauth' });
      res.redirect(`${clientUrl}/dashboard?strava=connected`);
    } catch (err) {
      console.error('Strava callback error:', err.message);
      res.redirect(`${clientUrl}/dashboard?strava=error`);
    }
  })
);

router.post(
  '/sync',
  protect,
  requireMembership,
  asyncHandler(async (req, res) => {
    const synced = await syncStravaActivities(req.user.id);
    res.json({ message: `Synced ${synced} activities`, synced });
  })
);

router.get(
  '/status',
  protect,
  asyncHandler(async (req, res) => {
    const conn = await getStravaConnection(req.user.id);
    res.json({
      connected: Boolean(conn?.connected),
      lastSyncAt: conn?.lastSyncAt,
      lastSyncStatus: conn?.lastSyncStatus,
      lastSyncError: conn?.lastSyncError,
      providerUserId: conn?.providerUserId,
    });
  })
);

export default router;
