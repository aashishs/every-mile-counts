import express from 'express';
import { protect, requireMembership } from '../middleware/auth.js';
import { completeGarminOAuth, getGarminConnection, startGarminOAuth, syncGarminActivities } from '../services/garminService.js';
import { asyncHandler } from '../middleware/error.js';
import { writeAudit } from '../services/auditService.js';

const router = express.Router();

router.get(
  '/connect',
  protect,
  requireMembership,
  asyncHandler(async (req, res) => {
    const url = await startGarminOAuth(req.user.id);
    res.json({ url });
  })
);

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const clientUrl = process.env.CLIENT_URL;
    const { oauth_token: token, oauth_verifier: verifier, error } = req.query;
    if (error || !token) return res.redirect(`${clientUrl}/dashboard?garmin=error`);
    try {
      const userId = await completeGarminOAuth(token, verifier);
      try {
        await syncGarminActivities(userId);
      } catch (syncErr) {
        console.error('Garmin initial sync:', syncErr.message);
      }
      await writeAudit({ userId, action: 'garmin_connect', entityType: 'oauth' });
      res.redirect(`${clientUrl}/dashboard?garmin=connected`);
    } catch (err) {
      console.error('Garmin callback error:', err.message);
      res.redirect(`${clientUrl}/dashboard?garmin=error`);
    }
  })
);

router.post(
  '/sync',
  protect,
  requireMembership,
  asyncHandler(async (req, res) => {
    const synced = await syncGarminActivities(req.user.id);
    res.json({ message: `Synced ${synced} activities`, synced });
  })
);

router.get(
  '/status',
  protect,
  asyncHandler(async (req, res) => {
    const conn = await getGarminConnection(req.user.id);
    res.json({
      connected: Boolean(conn?.connected),
      lastSyncAt: conn?.lastSyncAt,
      lastSyncStatus: conn?.lastSyncStatus,
      lastSyncError: conn?.lastSyncError,
    });
  })
);

export default router;
