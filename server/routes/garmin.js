import express from 'express';
import { protect, requireMembership } from '../middleware/auth.js';
import { completeGarminOAuth, getGarminConnection, startGarminOAuth, syncGarminActivities } from '../services/garminService.js';
import { asyncHandler } from '../middleware/error.js';
import { writeAudit } from '../services/auditService.js';
import { isAppAdminUser, isAthleteUser } from '../utils/membership.js';
import { clientUrl } from '../utils/urls.js';

const router = express.Router();

function rejectClubAccount(req, res, next) {
  if (isAppAdminUser(req.user)) {
    return res.status(400).json({ message: 'App admins do not connect activity apps.' });
  }
  if (!isAthleteUser(req.user)) {
    return res.status(400).json({ message: 'Only athletes connect activity apps.' });
  }
  next();
}

router.get(
  '/connect',
  protect,
  requireMembership,
  rejectClubAccount,
  asyncHandler(async (req, res) => {
    const url = await startGarminOAuth(req.user.id);
    res.json({ url });
  })
);

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const appUrl = clientUrl();
    const { oauth_token: token, oauth_verifier: verifier, error } = req.query;
    if (error || !token) return res.redirect(`${appUrl}/dashboard?garmin=error`);
    try {
      const userId = await completeGarminOAuth(token, verifier);
      try {
        await syncGarminActivities(userId);
      } catch (syncErr) {
        console.error('Garmin initial sync:', syncErr.message);
      }
      await writeAudit({ userId, action: 'garmin_connect', entityType: 'oauth' });
      res.redirect(`${appUrl}/dashboard?garmin=connected`);
    } catch (err) {
      console.error('Garmin callback error:', err.message);
      res.redirect(`${appUrl}/dashboard?garmin=error`);
    }
  })
);

router.post(
  '/sync',
  protect,
  requireMembership,
  rejectClubAccount,
  asyncHandler(async (req, res) => {
    const synced = await syncGarminActivities(req.user.id);
    res.json({ message: `Synced ${synced} activities`, synced });
  })
);

router.get(
  '/status',
  protect,
  asyncHandler(async (req, res) => {
    if (!isAthleteUser(req.user)) {
      return res.json({ connected: false, applicable: false });
    }
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
