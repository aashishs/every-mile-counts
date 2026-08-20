import nodemailer from 'nodemailer';

const DEFAULT_USER = 'Everymilecountsapp@gmail.com';
const DEFAULT_FROM = 'Every Mile Counts <Everymilecountsapp@gmail.com>';
const SITE_URL = 'https://www.everymilecounts.in';
const TAGLINE = 'Train. Race. Repeat.';

export function mailFrom() {
  return process.env.SMTP_FROM || DEFAULT_FROM;
}

export function mailUser() {
  return process.env.SMTP_USER || DEFAULT_USER;
}

export function smtpPass() {
  return String(process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
}

export function mailConfigured() {
  return Boolean(mailFrom() && smtpPass());
}

function siteUrl() {
  return String(process.env.PUBLIC_SITE_URL || SITE_URL).replace(/\/$/, '');
}

export function mailSignatureText() {
  return [
    '',
    '—',
    'Every Mile Counts',
    TAGLINE,
    siteUrl(),
    'Questions? Reply to this email.',
  ].join('\n');
}

export function wrapMailHtml(bodyHtml) {
  const site = siteUrl();
  const logo = `${site}/logo.png`;
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.5;color:#111827;max-width:560px">
${bodyHtml}
<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb">
  <img src="${logo}" width="40" height="40" alt="Every Mile Counts" style="display:block;border-radius:8px;margin-bottom:10px" />
  <p style="margin:0;font-weight:600;color:#0d9488">Every Mile Counts</p>
  <p style="margin:4px 0 0;color:#6b7280;font-size:13px">${TAGLINE}</p>
  <p style="margin:8px 0 0;font-size:13px"><a href="${site}" style="color:#0d9488;text-decoration:none">${site.replace(/^https?:\/\//, '')}</a></p>
  <p style="margin:8px 0 0;color:#6b7280;font-size:12px">Questions? Reply to this email.</p>
</div>
</div>`;
}

function transport() {
  const user = mailUser();
  const pass = smtpPass();
  const gmail = user.toLowerCase().endsWith('@gmail.com');
  const timeouts = {
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  };
  if (gmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      ...timeouts,
    });
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
    ...timeouts,
  });
}

export async function verifyMailer() {
  if (!mailConfigured()) {
    console.warn('SMTP not configured — set SMTP_PASS to a Gmail App Password. Signup emails will not send.');
    return false;
  }
  try {
    await transport().verify();
    console.log(`SMTP ready (${mailUser()})`);
    return true;
  } catch (err) {
    console.error('SMTP verify failed:', err.message);
    return false;
  }
}

export async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) {
    console.log(`[mail skipped] SMTP_PASS is empty. to=${to} subject=${subject}\n${text}`);
    return { sent: false, reason: 'not_configured' };
  }
  try {
    await transport().sendMail({
      from: mailFrom(),
      to,
      subject,
      text: text ? `${text}${mailSignatureText()}` : undefined,
      html: html ? wrapMailHtml(html) : undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error('[mail] send failed', err.message);
    throw Object.assign(new Error('Could not send email. Try again shortly.'), { status: 503 });
  }
}
