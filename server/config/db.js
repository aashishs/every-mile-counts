import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres error', err);
});

export async function connectDB() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('Postgres connected');
  } finally {
    client.release();
  }
}

export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result;
}

export async function one(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

export async function many(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

function toCamelKey(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function camel(row) {
  if (row == null) return row;
  if (Array.isArray(row)) return row.map(camel);
  if (row instanceof Date) return row;
  if (typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[toCamelKey(k)] = v;
  }
  return out;
}

export function camelMany(rows) {
  return rows.map(camel);
}
