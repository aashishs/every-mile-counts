import { many, query } from '../config/db.js';
import {
  ageFromDob,
  clampMafOffset,
  isBirthdayOn,
  mafHeartRate,
  todayInTimeZone,
} from '../utils/maf.js';

export function appTimeZone() {
  return process.env.APP_TZ || 'Asia/Kolkata';
}

export async function refreshAthleteAges({ birthdaysOnly = true } = {}) {
  const today = todayInTimeZone(appTimeZone());
  const rows = await many(
    `SELECT id, date_of_birth, maf_offset FROM users
     WHERE date_of_birth IS NOT NULL AND status <> 'deleted'`
  );
  let updated = 0;
  for (const row of rows) {
    if (birthdaysOnly && !isBirthdayOn(row.date_of_birth, today)) continue;
    const age = ageFromDob(row.date_of_birth, today);
    const offset = clampMafOffset(row.maf_offset);
    await query(
      `UPDATE users SET age = $1, maf_heart_rate = $2, maf_offset = $3, updated_at = NOW() WHERE id = $4`,
      [age, mafHeartRate(age, offset), offset, row.id]
    );
    updated += 1;
  }
  return { scanned: rows.length, updated, birthdaysOnly };
}
