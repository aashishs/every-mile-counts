export function publicApiUrl() {
  const raw =
    process.env.PUBLIC_API_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
    `http://localhost:${process.env.PORT || 5000}`;
  return String(raw).replace(/\/$/, '');
}

export function clientUrl() {
  return String(process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
}

export function allowedOrigins() {
  const extras = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...new Set([clientUrl(), ...extras])];
}

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins().includes(normalized)) return true;
  try {
    const host = new URL(origin).hostname;
    if (
      host.endsWith('.onrender.com') ||
      host.endsWith('.vercel.app') ||
      host.endsWith('.up.railway.app') ||
      host.endsWith('.railway.app')
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function stravaRedirectUri() {
  return process.env.STRAVA_REDIRECT_URI || `${publicApiUrl()}/api/strava/callback`;
}

export function garminRedirectUri() {
  return process.env.GARMIN_REDIRECT_URI || `${publicApiUrl()}/api/garmin/callback`;
}
