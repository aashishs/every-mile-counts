import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function rawEncryptionKey() {
  return String(process.env.ENCRYPTION_KEY || '').trim().replace(/^['"]|['"]$/g, '');
}

export function encryptionConfigured() {
  return rawEncryptionKey().length > 0;
}

function getKey() {
  const raw = rawEncryptionKey();
  if (!raw) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function encrypt(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload) {
  if (!payload) return null;
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

export function generateCode(prefix = 'EMC') {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${rand}`;
}

export function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
