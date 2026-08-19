import express from 'express';
import axios from 'axios';
import { protect, requireMembership } from '../middleware/auth.js';
import {
  completeStravaOAuth,
  getStravaConnection,
  handleStravaWebhookEvent,
  stravaWebhookVerifyToken,
  syncStravaActivities,
} from '../services/stravaService.js';
import { asyncHandler } from '../middleware/error.js';
import { writeAudit } from '../services/auditService.js';
import { getUserRoles, isAppAdminUser, isAthleteUser } from '../utils/membership.js';
import { encryptionConfigured } from '../utils/crypto.js';
import { clientUrl, requestPublicUrl, stravaRedirectUri } from '../utils/urls.js';

const router = express.Router();

function rejectClubAccount(req, res, next) {
  if (isAppAdminUser(req.user)) {
    return res.status(400).json({ message: 'App admins do not connect to Strava.' });
  }
  if (!isAthleteUser(req.user)) {
    return res.status(400).json({ message: 'Only athletes connect to Strava.' });
  }
  next();
}

function env(name) {
  return String(process.env[name] || '').trim().replace(/^['"]|['"]$/g, '');
}

function stravaConfigured() {
  return Boolean(env('STRAVA_CLIENT_ID') && env('STRAVA_CLIENT_SECRET'));
}

function stravaMissing() {
  const missing = [];
  if (!env('STRAVA_CLIENT_ID')) missing.push('STRAVA_CLIENT_ID');
  if (!env('STRAVA_CLIENT_SECRET')) missing.push('STRAVA_CLIENT_SECRET');
  if (!encryptionConfigured()) missing.push('ENCRYPTION_KEY');
  return missing;
}

function oauthFailWhy(err) {
  const msg = String(err.message || '');
  if (msg.includes('ENCRYPTION_KEY')) return 'encryption';
  const status = err.response?.status;
  if (status === 400 || status === 401) return 'token';
  return 'save';
}

router.get(
  '/connect',
  protect,
  requireMembership,
  rejectClubAccount,
  (req, res) => {
    if (!stravaConfigured() || !encryptionConfigured()) {
      const missing = stravaMissing();
      return res.status(503).json({
        message: `Missing on the API service: ${missing.join(', ')}. Add them under Railway → api → Variables, then redeploy.`,
        missing,
      });
    }
    const redirectUri = stravaRedirectUri(req);
    const caller = [req.get('origin'), req.get('referer'), req.get('x-forwarded-host')].filter(Boolean).join(' ');
    const liveCaller = caller && !/localhost|127\.0\.0\.1/i.test(caller);
    if (!redirectUri || (liveCaller && /localhost|127\.0\.0\.1/i.test(redirectUri))) {
      return res.status(503).json({
        message:
          'Set CLIENT_URL on the API service to https://www.everymilecounts.in and remove any localhost STRAVA_REDIRECT_URI on Railway, then redeploy api.',
      });
    }
    const params = new URLSearchParams({
      client_id: env('STRAVA_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'force',
      scope: 'read,read_all,profile:read_all,activity:read,activity:read_all',
      state: req.user.id,
    });
    res.json({ url: `https://www.strava.com/oauth/authorize?${params.toString()}` });
  }
);

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;
    const appUrl = clientUrl() || requestPublicUrl(req);
    if (!appUrl) {
      return res.status(500).send('Set CLIENT_URL on the API to your public web URL.');
    }
    if (error) return res.redirect(`${appUrl}/dashboard?strava=error`);
    const roles = state ? await getUserRoles(state) : [];
    if (isAppAdminUser(roles)) {
      return res.redirect(`${appUrl}/admin`);
    }
    if (!isAthleteUser(roles)) {
      return res.redirect(`${appUrl}/clubs`);
    }
    try {
      const redirectUri = stravaRedirectUri(req);
      const tokenRes = await axios.post(
        'https://www.strava.com/oauth/token',
        new URLSearchParams({
          client_id: env('STRAVA_CLIENT_ID'),
          client_secret: env('STRAVA_CLIENT_SECRET'),
          code: String(code),
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      await completeStravaOAuth(state, tokenRes.data);
      await writeAudit({ userId: state, action: 'strava_connect', entityType: 'oauth' });
      res.redirect(302, `${appUrl}/dashboard?strava=connected`);
      syncStravaActivities(state, { full: true }).catch((err) => {
        console.error('Strava history sync error:', err.message);
      });
    } catch (err) {
      console.error('Strava callback error:', err.response?.data || err.message);
      const conn = state ? await getStravaConnection(state) : null;
      if (conn?.connected) {
        return res.redirect(302, `${appUrl}/dashboard?strava=connected`);
      }
      res.redirect(302, `${appUrl}/dashboard?strava=error&why=${oauthFailWhy(err)}`);
    }
  })
);

router.get(
  '/webhook',
  asyncHandler(async (req, res) => {
    const mode = String(req.query['hub.mode'] || '');
    const challenge = String(req.query['hub.challenge'] || '');
    const token = String(req.query['hub.verify_token'] || '');
    if (mode === 'subscribe' && challenge && token === stravaWebhookVerifyToken()) {
      return res.status(200).json({ 'hub.challenge': challenge });
    }
    return res.status(403).json({ message: 'Invalid Strava webhook verification' });
  })
);

router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    res.status(200).json({ ok: true });
    handleStravaWebhookEvent(req.body).catch((err) => {
      console.error('[strava] webhook event failed', err.response?.data || err.message);
    });
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
    if (isAppAdminUser(req.user) || !isAthleteUser(req.user)) {
      return res.json({ connected: false, applicable: false, configured: stravaConfigured() });
    }
    const conn = await getStravaConnection(req.user.id);
    const lastSyncError = conn?.lastSyncError || null;
    const needsReconnect = /401|unauthorized|status code 401|invalid[_\s-]*token|access expired/i.test(
      String(lastSyncError || '')
    );
    res.json({
      configured: stravaConfigured(),
      missing: stravaMissing(),
      connected: Boolean(conn?.connected),
      lastSyncAt: conn?.lastSyncAt,
      lastSyncStatus: conn?.lastSyncStatus,
      lastSyncError: needsReconnect
        ? 'Strava access expired. Try Reconnect to continue syncing.'
        : lastSyncError,
      needsReconnect,
      providerUserId: conn?.providerUserId,
    });
  })
);

export default router;
