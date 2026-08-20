import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dns.setDefaultResultOrder('verbatim');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
};

function parseOrigin(value) {
  let raw = String(value || '').trim();
  if (!raw || raw.includes('${')) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  raw = raw.replace(/\/$/, '');
  try {
    const url = new URL(raw);
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function apiBase() {
  const fromUrl = parseOrigin(process.env.API_URL);
  if (fromUrl) return fromUrl;
  const host = (process.env.API_HOST || process.env.API_PRIVATE_DOMAIN || '').trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const port = (process.env.API_PORT || '').trim();
  if (host && port) return parseOrigin(`http://${host}:${port}`);
  if (process.env.RAILWAY_ENVIRONMENT) {
    return parseOrigin(`http://api.railway.internal:${port || '8080'}`);
  }
  return null;
}

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const name = path.basename(file);
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
  if (name === 'sw.js' || name === 'workbox-window.js' || ext === '.webmanifest') {
    headers['cache-control'] = 'no-cache';
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

function serveSpa(req, res) {
  const index = path.join(dist, 'index.html');
  if (!fs.existsSync(index)) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Web build missing (dist/index.html). Check the Railway build log for npm run build.');
    return;
  }
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(dist, safe);
  if (!file.startsWith(dist)) file = index;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    sendFile(res, file);
    return;
  }
  sendFile(res, index);
}

function publicHost(value) {
  return String(value || '')
    .split(',')[0]
    .trim()
    .replace(/^https?:\/\//, '');
}

function rewriteLocation(location, forwardedHost, forwardedProto) {
  const host = publicHost(forwardedHost);
  if (!host || host.endsWith('.railway.internal')) return location;
  try {
    const proto = forwardedProto === 'http' ? 'https' : forwardedProto || 'https';
    const url = new URL(location, `${proto}://${host}`);
    if (url.hostname.endsWith('.railway.internal') || url.hostname === 'localhost') {
      url.protocol = 'https:';
      url.host = host;
    }
    return url.toString();
  } catch {
    return location;
  }
}

function proxyHeaders(up) {
  const headers = {};
  for (const [key, value] of Object.entries(up.headers || {})) {
    if (['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) continue;
    headers[key] = value;
  }
  return headers;
}

function proxyApi(req, res) {
  const base = apiBase();
  if (!base) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('API_URL is missing or invalid. Set web variable API_URL to http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}');
    return;
  }
  const dest = new URL(req.url, `${base}/`);
  const lib = dest.protocol === 'https:' ? https : http;
  const incomingHost = req.headers['x-forwarded-host'] || req.headers.host;
  const incomingProto = req.headers['x-forwarded-proto'] || 'https';
  const headers = { ...req.headers, host: dest.host };
  headers['x-forwarded-host'] = incomingHost;
  headers['x-forwarded-proto'] = incomingProto;
  delete headers.connection;
  delete headers['keep-alive'];
  delete headers['transfer-encoding'];
  const upstream = lib.request(
    dest,
    { method: req.method, headers },
    (up) => {
      const status = up.statusCode || 502;
      if (status >= 300 && status < 400) {
        const location = rewriteLocation(up.headers.location, incomingHost, incomingProto);
        res.writeHead(status, {
          location,
          'cache-control': 'no-store',
        });
        up.resume();
        res.end();
        return;
      }
      const outHeaders = proxyHeaders(up);
      res.writeHead(status, outHeaders);
      up.pipe(res);
    }
  );
  upstream.on('error', (err) => {
    console.error('API proxy failed', dest.href, err.message);
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Cannot reach API at ${base}`);
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    if (req.method === 'HEAD' || req.method === 'OPTIONS') {
      res.end();
      return;
    }
    res.end(JSON.stringify({ ok: true, api: Boolean(apiBase()), apiUrl: apiBase() }));
    return;
  }
  if (urlPath.startsWith('/api')) {
    proxyApi(req, res);
    return;
  }
  serveSpa(req, res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Web listening on 0.0.0.0:${port}`);
  console.log(`API_URL=${apiBase() || '(not set)'}`);
});
