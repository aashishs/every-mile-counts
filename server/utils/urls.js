function isDeployed() {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.RAILWAY_ENVIRONMENT_ID)
  );
}

function isLocalHostname(host) {
  const h = String(host || '').split(':')[0].toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.railway.internal');
}

function stripKnownCallbackPath(value) {
  return String(value || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\/api\/strava\/(callback|webhook)$/i, '')
    .replace(/\/api\/garmin\/callback$/i, '');
}

function normalizePublicUrl(value, { allowLocal = false } = {}) {
  let raw = stripKnownCallbackPath(value);
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    const host = url.hostname;
    if (host.endsWith('.railway.internal')) return '';
    if (isLocalHostname(host)) {
      return allowLocal ? `${url.protocol}//${url.host}` : '';
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

function requestCallerBase(req) {
  if (!req) return '';
  const xfHost = String(req.get('x-forwarded-host') || '')
    .split(',')[0]
    .trim();
  const xfProto = String(req.get('x-forwarded-proto') || '')
    .split(',')[0]
    .trim();
  let refererOrigin = '';
  try {
    refererOrigin = req.get('referer') ? new URL(req.get('referer')).origin : '';
  } catch {
    refererOrigin = '';
  }
  return (
    normalizePublicUrl(req.get('origin'), { allowLocal: false }) ||
    normalizePublicUrl(refererOrigin, { allowLocal: false }) ||
    normalizePublicUrl(xfHost ? `${xfProto || 'https'}://${xfHost}` : '', { allowLocal: false })
  );
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
      host.endsWith('.railway.app') ||
      host === 'everymilecounts.in' ||
      host.endsWith('.everymilecounts.in')
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function publicAppBase(req) {
  const fromRequest = requestCallerBase(req) || normalizePublicUrl(requestPublicUrl(req), { allowLocal: false });
  if (fromRequest) return fromRequest;
  const fromEnv =
    normalizePublicUrl(process.env.CLIENT_URL, { allowLocal: false }) ||
    normalizePublicUrl(process.env.STRAVA_REDIRECT_URI, { allowLocal: false }) ||
    normalizePublicUrl(process.env.STRAVA_WEBHOOK_URL, { allowLocal: false });
  if (fromEnv) return fromEnv;
  if (isDeployed()) return '';
  return (
    normalizePublicUrl(process.env.STRAVA_REDIRECT_URI, { allowLocal: true }) ||
    normalizePublicUrl(process.env.CLIENT_URL, { allowLocal: true }) ||
    'http://localhost:5173'
  );
}

export function stravaRedirectUri(req) {
  const base = publicAppBase(req);
  return base ? `${base}/api/strava/callback` : '';
}

export function stravaWebhookUri(req) {
  const base = publicAppBase(req);
  return base ? `${base}/api/strava/webhook` : '';
}

export function garminRedirectUri(req) {
  const base = publicAppBase(req) || requestPublicUrl(req);
  return base ? `${base}/api/garmin/callback` : '';
}
