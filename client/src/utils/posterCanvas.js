import { POSTER_SIZE } from './posterPayload';

const LOGO_SRC = '/logo.png';

const THEMES = {
  night: {
    bg: '#0b0b0c',
    text: '#ffffff',
    muted: '#a1a1aa',
    brand: '#2dd4bf',
    accent: '#fb923c',
    line: 'rgba(255,255,255,0.14)',
    washA: 'rgba(13, 148, 136, 0.18)',
    washB: 'rgba(249, 115, 22, 0.10)',
  },
  ember: {
    bg: '#120a06',
    text: '#fff7ed',
    muted: '#fdba74',
    brand: '#fb923c',
    accent: '#2dd4bf',
    line: 'rgba(251, 146, 60, 0.24)',
    washA: 'rgba(249, 115, 22, 0.24)',
    washB: 'rgba(13, 148, 136, 0.08)',
  },
  light: {
    bg: '#f4f4f5',
    text: '#111111',
    muted: '#6b7280',
    brand: '#0d9488',
    accent: '#ea580c',
    line: 'rgba(17,17,17,0.10)',
    washA: 'rgba(13, 148, 136, 0.10)',
    washB: 'rgba(249, 115, 22, 0.06)',
  },
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('logo'));
    img.src = src;
  });
}

function wrapLines(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/…$/, '')}…`;
  return kept;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.closePath();
}

function paintBackground(ctx, w, h, theme) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  const a = ctx.createRadialGradient(w * 0.5, h * 0.42, 20, w * 0.5, h * 0.42, w * 0.72);
  a.addColorStop(0, theme.washA);
  a.addColorStop(1, 'transparent');
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, w, h);
}

function strokeRoute(ctx, points, toX, toY) {
  ctx.beginPath();
  ctx.moveTo(toX(points[0]), toY(points[0]));
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(toX(points[i]), toY(points[i]));
}

function drawRoute(ctx, points, box, theme) {
  if (!points?.length) return;
  const { x, y, w, h } = box;
  const insetX = 72;
  const insetY = 48;
  const toX = (p) => x + insetX + p.x * (w - insetX * 2);
  const toY = (p) => y + insetY + p.y * (h - insetY * 2);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  strokeRoute(ctx, points, toX, toY);
  ctx.strokeStyle = `${theme.brand}2e`;
  ctx.lineWidth = 42;
  ctx.stroke();

  strokeRoute(ctx, points, toX, toY);
  ctx.strokeStyle = theme.brand;
  ctx.lineWidth = 16;
  ctx.stroke();

  strokeRoute(ctx, points, toX, toY);
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.88;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const start = points[0];
  const end = points[points.length - 1];
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(toX(start), toY(start), 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.brand;
  ctx.beginPath();
  ctx.arc(toX(start), toY(start), 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(toX(end), toY(end), 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(toX(end), toY(end), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMetrics(ctx, metrics, box, theme) {
  if (!metrics?.length) return;
  const n = Math.min(metrics.length, 5);
  const colW = box.w / n;
  const valueSize = n >= 5 ? 34 : n === 4 ? 40 : 48;
  ctx.textAlign = 'left';
  for (let i = 0; i < n; i += 1) {
    const m = metrics[i];
    const x = box.x + colW * i;
    ctx.fillStyle = theme.muted;
    ctx.font = '700 16px "DM Sans", Arial, sans-serif';
    ctx.fillText(String(m.label).toUpperCase(), x, box.y);
    ctx.fillStyle = theme.text;
    ctx.font = `700 ${valueSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.fillText(m.value, x, box.y + 48);
  }
}

export async function generatePoster(model, size = POSTER_SIZE) {
  const width = size.width || POSTER_SIZE.width;
  const height = size.height || POSTER_SIZE.height;
  const theme = THEMES[model.style] || THEMES.night;
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* ignore */ }
  }
  let logo = null;
  try { logo = await loadImage(LOGO_SRC); } catch { logo = null; }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  paintBackground(ctx, width, height, theme);
  ctx.textBaseline = 'alphabetic';

  const pad = 64;
  const maxW = width - pad * 2;
  const metrics = (model.metrics || []).slice(0, 5);
  const statsH = metrics.length ? 120 : 36;
  const footerH = 56;
  const overlayBottom = statsH + footerH + 48;

  if (model.route?.length) {
    drawRoute(ctx, model.route, {
      x: 0,
      y: 210,
      w: width,
      h: height - 210 - overlayBottom + 80,
    }, theme);
  } else if (model.primary) {
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.text;
    ctx.font = '700 148px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(model.primary, width / 2, height * 0.46);
    if (model.secondary) {
      ctx.fillStyle = theme.brand;
      ctx.font = '700 56px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText(model.secondary, width / 2, height * 0.46 + 84);
    }
    ctx.textAlign = 'left';
  }

  const topFade = ctx.createLinearGradient(0, 0, 0, 340);
  topFade.addColorStop(0, theme.bg);
  topFade.addColorStop(0.55, theme.bg);
  topFade.addColorStop(1, 'transparent');
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, width, 340);

  const bottomFade = ctx.createLinearGradient(0, height - overlayBottom - 160, 0, height);
  bottomFade.addColorStop(0, 'transparent');
  bottomFade.addColorStop(0.35, theme.bg);
  bottomFade.addColorStop(1, theme.bg);
  ctx.fillStyle = bottomFade;
  ctx.fillRect(0, height - overlayBottom - 160, width, overlayBottom + 160);

  let y = 64;
  ctx.textAlign = 'left';
  if (logo) {
    const logoSize = 48;
    ctx.save();
    roundRect(ctx, pad, y, logoSize, logoSize, 12);
    ctx.clip();
    ctx.drawImage(logo, pad, y, logoSize, logoSize);
    ctx.restore();
    ctx.fillStyle = theme.brand;
    ctx.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(model.brand, pad + logoSize + 14, y + 32);
  } else {
    ctx.fillStyle = theme.brand;
    ctx.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(model.brand, pad, y + 32);
  }
  if (model.footerDate) {
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    ctx.font = '600 20px "DM Sans", Arial, sans-serif';
    ctx.fillText(model.footerDate, width - pad, y + 32);
    ctx.textAlign = 'left';
  }
  y += 78;

  if (model.kicker) {
    ctx.fillStyle = theme.accent;
    ctx.font = '700 20px "DM Sans", Arial, sans-serif';
    ctx.fillText(String(model.kicker).toUpperCase(), pad, y);
    y += 36;
  }

  if (model.athleteName) {
    ctx.fillStyle = theme.muted;
    ctx.font = '700 22px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(model.athleteName, pad, y);
    y += 32;
  }

  ctx.fillStyle = theme.text;
  ctx.font = '700 54px "Barlow Condensed", "Arial Narrow", sans-serif';
  const titleLines = wrapLines(ctx, model.title, maxW, 2);
  for (const line of titleLines) {
    ctx.fillText(line, pad, y);
    y += 56;
  }
  if (model.subtitle) {
    ctx.fillStyle = theme.muted;
    ctx.font = '600 22px "DM Sans", Arial, sans-serif';
    ctx.fillText(model.subtitle, pad, y + 2);
  }

  const statsY = height - footerH - statsH + 8;
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, statsY - 28);
  ctx.lineTo(width - pad, statsY - 28);
  ctx.stroke();
  drawMetrics(ctx, metrics, { x: pad, y: statsY, w: maxW }, theme);

  ctx.textAlign = 'left';
  ctx.fillStyle = theme.muted;
  ctx.font = '600 18px "DM Sans", Arial, sans-serif';
  ctx.fillText(model.site, pad, height - 24);
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.brand;
  ctx.font = '700 20px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.fillText(model.brand, width - pad, height - 24);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((file) => (file ? resolve(file) : reject(new Error('Could not create poster image'))), 'image/png');
  });
  return blob;
}
