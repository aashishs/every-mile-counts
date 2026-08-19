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
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

export function publicApiUrl() {
  return (
    normalizePublicUrl(process.env.PUBLIC_API_URL) ||
    normalizePublicUrl(process.env.RENDER_EXTERNAL_URL) ||
    normalizePublicUrl(process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
    clientUrl()
  );
}

export function clientUrl() {
  const allowLocal = !isDeployed();
  return (
    normalizePublicUrl(process.env.CLIENT_URL, { allowLocal }) ||
    (allowLocal ? 'http://localhost:5173' : '')
  );
}

export function requestPublicUrl(req) {
  if (req) {
    const xfHost = String(req.get('x-forwarded-host') || '')
      .split(',')[0]
      .trim();
    let originHost = '';
    try {
      originHost = req.get('origin') ? new URL(req.get('origin')).host : '';
    } catch {
      originHost = '';
    }
    const host = xfHost || originHost || String(req.get('host') || '').split(',')[0].trim();
    if (host && !host.endsWith('.railway.internal') && host !== 'localhost' && host !== '127.0.0.1') {
      const xfProto = String(req.get('x-forwarded-proto') || '')
        .split(',')[0]
        .trim();
      const proto = host.endsWith('.railway.app') || xfProto === 'https' || isDeployed() ? 'https' : xfProto || 'https';
      const url = normalizePublicUrl(`${proto}://${host}`);
      if (url) return url;
    }
  }
  return clientUrl();
}

export function allowedOrigins() {
  const extras = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...new Set([clientUrl(), ...extras].filter(Boolean))];
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

export function stravaRedirectUri(req) {
  const explicit = normalizePublicUrl(process.env.STRAVA_REDIRECT_URI, { allowLocal: !isDeployed() });
  if (explicit) {
    return explicit.includes('/api/strava/callback') ? explicit : `${explicit}/api/strava/callback`;
  }
  const base = requestPublicUrl(req);
  return base ? `${base}/api/strava/callback` : '';
}

export function garminRedirectUri(req) {
  const explicit = normalizePublicUrl(process.env.GARMIN_REDIRECT_URI, { allowLocal: !isDeployed() });
  if (explicit) {
    return explicit.includes('/api/garmin/callback') ? explicit : `${explicit}/api/garmin/callback`;
  }
  const base = requestPublicUrl(req);
  return base ? `${base}/api/garmin/callback` : '';
}
