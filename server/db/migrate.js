import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { pool } from '../config/db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  let lastErr;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await pool.query(sql);
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

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
