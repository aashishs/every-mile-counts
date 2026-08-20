import crypto from 'crypto';
import { camel, one, query } from '../config/db.js';
import { sendMail } from './mailer.js';

const OTP_MINUTES = 10;
const MAX_ATTEMPTS = 5;

let loginOtpsReady = false;

export async function ensureLoginOtpsTable() {
  if (loginOtpsReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS login_otps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      attempts INTEGER NOT NULL DEFAULT 0,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_login_otps_user ON login_otps (user_id, created_at DESC)`);
  loginOtpsReady = true;
}

export async function isSignupOtpPaused() {
  const row = await one(`SELECT value FROM app_settings WHERE key = 'signup_otp_paused'`);
  if (!row) return true;
  return row.value === true || row.value === 'true';
}

export function hashOtp(userId, code) {
  return crypto.createHash('sha256').update(`${userId}:${String(code).trim()}`).digest('hex');
}

export function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function issueLoginOtp(user, { ip } = {}) {
  await ensureLoginOtpsTable();
  await query(`UPDATE login_otps SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [user.id]);
  const code = generateOtp();
  const row = await one(
    `INSERT INTO login_otps (user_id, code_hash, expires_at, ip)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [user.id, hashOtp(user.id, code), new Date(Date.now() + OTP_MINUTES * 60 * 1000), ip || null]
  );

  const { sent } = await sendMail({
    to: user.email,
    subject: 'Your Every Mile Counts verification code',
    text: `Your Every Mile Counts verification code is ${code}. It expires in ${OTP_MINUTES} minutes.\n\nIf you did not try to sign up, you can ignore this email.`,
    html: `<p>Your Every Mile Counts verification code is <strong style="font-size:1.25rem;letter-spacing:0.2em">${code}</strong>.</p><p>It expires in ${OTP_MINUTES} minutes.</p><p>If you did not try to sign up, you can ignore this email.</p>`,
  });

  if (!sent && process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('Could not send the verification email. Try again shortly.'), { status: 503 });
  }

  const payload = {
    requiresOtp: true,
    challengeId: row.id,
    email: user.email,
    sent: Boolean(sent),
    message: sent
      ? `We sent a 6-digit code to ${user.email}`
      : `Email is not configured on this server, so nothing was sent to ${user.email}. Set SMTP_PASS to a Gmail App Password.`,
  };
  if (!sent && process.env.NODE_ENV !== 'production') {
    payload.debugCode = code;
  }
  return payload;
}

export async function verifyLoginOtp({ challengeId, code }) {
  await ensureLoginOtpsTable();
  if (!challengeId || !code) {
    throw Object.assign(new Error('Enter the 6-digit code from your email'), { status: 400 });
  }
  const row = camel(
    await one(
      `SELECT t.*, u.email, u.first_name, u.status
       FROM login_otps t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [challengeId]
    )
  );
  if (!row || row.usedAt || row.status !== 'active') {
    throw Object.assign(new Error('This code is invalid or has expired'), { status: 400 });
  }
  if (new Date(row.expiresAt) < new Date()) {
    throw Object.assign(new Error('This code has expired. Request a new one.'), { status: 400 });
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    throw Object.assign(new Error('Too many attempts. Request a new code.'), { status: 400 });
  }

  const ok = row.codeHash === hashOtp(row.userId, code);
  await query(`UPDATE login_otps SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
  if (!ok) {
    throw Object.assign(new Error('Incorrect code'), { status: 400 });
  }

  await query(`UPDATE login_otps SET used_at = NOW() WHERE id = $1`, [row.id]);
  await query(`UPDATE login_otps SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [row.userId]);
  await query(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), last_login_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [row.userId]
  );
  return row.userId;
}
