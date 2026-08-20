import { many, query } from '../config/db.js';
import {
  ageAndMafFromDob,
  isBirthdayOn,
  todayInTimeZone,
} from '../utils/maf.js';

export function appTimeZone() {
  return process.env.APP_TZ || 'Asia/Kolkata';
}

export async function refreshAthleteAges({ birthdaysOnly = true } = {}) {
  const today = todayInTimeZone(appTimeZone());
  const rows = await many(
    `SELECT id, date_of_birth FROM users
     WHERE date_of_birth IS NOT NULL AND status <> 'deleted'`
  );
  let updated = 0;
  for (const row of rows) {
    if (birthdaysOnly && !isBirthdayOn(row.date_of_birth, today)) continue;
    const { age, mafHeartRate } = ageAndMafFromDob(row.date_of_birth, today);
    await query(
      `UPDATE users SET age = $1, maf_heart_rate = $2, updated_at = NOW() WHERE id = $3`,
      [age, mafHeartRate, row.id]
    );
    updated += 1;
  }
  return { scanned: rows.length, updated, birthdaysOnly };
}
