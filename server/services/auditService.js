import { query } from '../config/db.js';

export async function writeAudit({ userId, action, entityType, entityId, metadata = {}, ip }) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, ip)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [userId || null, action, entityType || null, entityId || null, JSON.stringify(metadata), ip || null]
    );
  } catch (err) {
    console.error('Audit log failed', err.message);
  }
}

export function auditMiddleware(action, entityType) {
  return (req, _res, next) => {
    req.audit = { action, entityType };
    next();
  };
}
