import nodemailer from 'nodemailer';

const DEFAULT_USER = 'Everymilecountsapp@gmail.com';
const DEFAULT_FROM = 'Every Mile Counts <Everymilecountsapp@gmail.com>';

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
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error('[mail] send failed', err.message);
    throw Object.assign(new Error('Could not send email. Try again shortly.'), { status: 503 });
  }
}
