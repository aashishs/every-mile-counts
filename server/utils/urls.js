const PRODUCTION_SITE = 'https://www.everymilecounts.in';

function isDeployed() {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.RAILWAY_ENVIRONMENT_ID)
  );
}

function normalizePublicUrl(value, { allowLocal = false } = {}) {
  let raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    const host = url.hostname;
    if (host.endsWith('.railway.internal')) return '';
    if (host === 'localhost' || host === '127.0.0.1') {
      return allowLocal ? raw : '';
    }
    return raw;
  } catch {
    return '';
  }
}

export function publicApiUrl() {
  const raw =
    normalizePublicUrl(process.env.PUBLIC_API_URL) ||
    normalizePublicUrl(process.env.RENDER_EXTERNAL_URL) ||
    normalizePublicUrl(process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
    clientUrl();
  return raw;
}

export function clientUrl() {
  const allowLocal = !isDeployed();
  return (
    normalizePublicUrl(process.env.CLIENT_URL, { allowLocal }) ||
    (isDeployed() ? PRODUCTION_SITE : 'http://localhost:5173')
  );
}

export function allowedOrigins() {
  const extras = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...new Set([clientUrl(), PRODUCTION_SITE, 'https://everymilecounts.in', ...extras])];
}

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins().includes(normalized)) return true;
  try {
    const host = new URL(origin).hostname;
    if (
      host === 'everymilecounts.in' ||
      host === 'www.everymilecounts.in' ||
      host.endsWith('.everymilecounts.in') ||
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
  const explicit = normalizePublicUrl(process.env.STRAVA_REDIRECT_URI, { allowLocal: !isDeployed() });
  if (explicit) {
    return explicit.includes('/api/strava/callback') ? explicit : `${explicit}/api/strava/callback`;
  }
  return `${clientUrl()}/api/strava/callback`;
}

export function garminRedirectUri() {
  const explicit = normalizePublicUrl(process.env.GARMIN_REDIRECT_URI);
  if (explicit) {
    return explicit.includes('/api/garmin/callback') ? explicit : `${explicit}/api/garmin/callback`;
  }
  return `${clientUrl()}/api/garmin/callback`;
}
