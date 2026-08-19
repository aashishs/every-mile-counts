import express from 'express';
import axios from 'axios';
import { protect, requireMembership } from '../middleware/auth.js';
import { completeStravaOAuth, getStravaConnection, syncStravaActivities } from '../services/stravaService.js';
import { asyncHandler } from '../middleware/error.js';
import { writeAudit } from '../services/auditService.js';
import { getUserRoles, isClubOnlyUser } from '../utils/membership.js';
import { clientUrl, stravaRedirectUri } from '../utils/urls.js';

const router = express.Router();

function rejectClubAccount(req, res, next) {
  if (isClubOnlyUser(req.user)) {
    return res.status(400).json({ message: 'Clubs do not connect to Strava. Athletes sync their own activities.' });
  }
  next();
}

function stravaConfigured() {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

router.get(
  '/connect',
  protect,
  requireMembership,
  rejectClubAccount,
  (req, res) => {
    if (!stravaConfigured()) {
      return res.status(503).json({
        message: 'Strava is not configured. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET on the API service.',
      });
    }
    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      redirect_uri: stravaRedirectUri(),
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
    const appUrl = clientUrl();
    if (error) return res.redirect(`${appUrl}/dashboard?strava=error`);
    const roles = state ? await getUserRoles(state) : [];
    if (isClubOnlyUser(roles)) {
      return res.redirect(`${appUrl}/clubs`);
    }
    try {
      const tokenRes = await axios.post('https://www.strava.com/oauth/token', {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      });
      await completeStravaOAuth(state, tokenRes.data);
      await writeAudit({ userId: state, action: 'strava_connect', entityType: 'oauth' });
      res.redirect(`${appUrl}/dashboard?strava=connected`);
      syncStravaActivities(state, { full: true }).catch((err) => {
        console.error('Strava history sync error:', err.message);
      });
    } catch (err) {
      console.error('Strava callback error:', err.message);
      res.redirect(`${appUrl}/dashboard?strava=error`);
    }
  })
);

router.post(
  '/sync',
  protect,
  requireMembership,
  rejectClubAccount,
  asyncHandler(async (req, res) => {
    const synced = await syncStravaActivities(req.user.id, { full: true });
    res.json({ message: `Synced ${synced} activities`, synced });
  })
);

router.get(
  '/status',
  protect,
  asyncHandler(async (req, res) => {
    if (isClubOnlyUser(req.user)) {
      return res.json({ connected: false, applicable: false, configured: stravaConfigured() });
    }
    const conn = await getStravaConnection(req.user.id);
    res.json({
      configured: stravaConfigured(),
      connected: Boolean(conn?.connected),
      lastSyncAt: conn?.lastSyncAt,
      lastSyncStatus: conn?.lastSyncStatus,
      lastSyncError: conn?.lastSyncError,
      providerUserId: conn?.providerUserId,
    });
  })
);

export default router;
