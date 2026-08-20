import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { ensureSchemaPatches } from './ensureSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  let lastErr;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      try {
        await pool.query(sql);
      } catch (err) {
        console.error('Full schema.sql apply failed:', err.message);
      }
      await ensureSchemaPatches();
      await grandfatherExistingEmails();
      console.log('Schema applied');
      await pool.end();
      return;
    } catch (err) {
      lastErr = err;
      console.error(`Migration attempt ${attempt} failed:`, err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastErr;
}

async function grandfatherExistingEmails() {
  const flag = await pool.query(`SELECT 1 FROM app_settings WHERE key = 'email_otp_grandfather'`);
  if (flag.rowCount) return;
  await pool.query(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at) WHERE email_verified_at IS NULL`
  );
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('email_otp_grandfather', 'true'::jsonb)
     ON CONFLICT (key) DO NOTHING`
  );
  console.log('Existing accounts kept and marked email-verified');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
