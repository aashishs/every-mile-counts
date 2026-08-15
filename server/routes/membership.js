import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, requireRole } from '../middleware/auth.js';
import { getClubMembership, getUserMembership, planExpiryDate } from '../utils/membership.js';
import { generateCode } from '../utils/crypto.js';
import { writeAudit } from '../services/auditService.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();
router.use(protect);

router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const plans = camelMany(await many(`SELECT * FROM membership_plans WHERE is_active = TRUE ORDER BY duration_months NULLS LAST`));
    res.json({ plans });
  })
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const membership = await getUserMembership(req.user.id);
    res.json({ membership });
  })
);

router.get(
  '/codes',
  requireRole('app_admin'),
  asyncHandler(async (req, res) => {
    const codes = camelMany(
      await many(
        `SELECT ic.*, p.name AS plan_name, u.email AS created_by_email
         FROM invitation_codes ic
         LEFT JOIN membership_plans p ON p.id = ic.plan_id
         LEFT JOIN users u ON u.id = ic.created_by
         ORDER BY ic.created_at DESC`
      )
    );
    res.json({ codes });
  })
);

router.post(
  '/codes',
  requireRole('app_admin'),
  asyncHandler(async (req, res) => {
    const {
      type = 'universal',
      planId,
      maxActivations = 1,
      count = 1,
      validFrom,
      expiresAt,
      notes,
      prefix,
    } = req.body;
    if (!['athlete', 'club', 'coach', 'universal'].includes(type)) {
      return res.status(400).json({ message: 'Invalid code type' });
    }
    const created = [];
    const n = Math.min(Number(count) || 1, 200);
    for (let i = 0; i < n; i += 1) {
      const code = generateCode((prefix || type.slice(0, 3)).toUpperCase());
      const row = await one(
        `INSERT INTO invitation_codes
          (code, type, plan_id, max_activations, valid_from, expires_at, created_by, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [code, type, planId || null, maxActivations, validFrom || new Date(), expiresAt || null, req.user.id, notes || null]
      );
      created.push(camel(row));
    }
    await writeAudit({
      userId: req.user.id,
      action: 'generate_invitation_codes',
      entityType: 'invitation_code',
      metadata: { count: n, type },
    });
    res.status(201).json({ codes: created });
  })
);

router.patch(
  '/codes/:id',
  requireRole('app_admin'),
  asyncHandler(async (req, res) => {
    const { isDisabled, expiresAt, maxActivations, notes } = req.body;
    const row = await one(
      `UPDATE invitation_codes SET
         is_disabled = COALESCE($1, is_disabled),
         expires_at = COALESCE($2, expires_at),
         max_activations = COALESCE($3, max_activations),
         notes = COALESCE($4, notes)
       WHERE id = $5 RETURNING *`,
      [isDisabled ?? null, expiresAt ?? null, maxActivations ?? null, notes ?? null, req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'Code not found' });
    res.json({ code: camel(row) });
  })
);

router.get(
  '/codes/:id/redemptions',
  requireRole('app_admin'),
  asyncHandler(async (req, res) => {
    const redemptions = camelMany(
      await many(
        `SELECT r.*, u.email, u.first_name, u.last_name, c.name AS club_name
         FROM invitation_redemptions r
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN clubs c ON c.id = r.club_id
         WHERE r.code_id = $1
         ORDER BY r.redeemed_at DESC`,
        [req.params.id]
      )
    );
    res.json({ redemptions });
  })
);

router.post(
  '/activate',
  asyncHandler(async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Invitation code required' });
    const invite = camel(
      await one(
        `SELECT ic.*, p.duration_months, p.is_lifetime
         FROM invitation_codes ic
         LEFT JOIN membership_plans p ON p.id = ic.plan_id
         WHERE UPPER(ic.code) = UPPER($1)`,
        [code]
      )
    );
    if (!invite || invite.isDisabled) {
      return res.status(400).json({ message: 'Invalid or disabled invitation code' });
    }
    if (invite.activationsUsed >= invite.maxActivations) {
      return res.status(400).json({ message: 'Code has no remaining activations' });
    }
    await query(`UPDATE invitation_codes SET activations_used = activations_used + 1 WHERE id = $1`, [invite.id]);
    await query(`INSERT INTO invitation_redemptions (code_id, user_id) VALUES ($1, $2)`, [invite.id, req.user.id]);
    const expiresAt = planExpiryDate({
      duration_months: invite.durationMonths,
      is_lifetime: invite.isLifetime,
    });
    const membership = camel(
      await one(
        `INSERT INTO memberships (user_id, plan_id, invitation_code_id, status, starts_at, expires_at)
         VALUES ($1,$2,$3,'active',NOW(),$4) RETURNING *`,
        [req.user.id, invite.planId, invite.id, expiresAt]
      )
    );
    res.json({ membership });
  })
);

router.get(
  '/club/:clubId',
  requireMembership,
  asyncHandler(async (req, res) => {
    const membership = await getClubMembership(req.params.clubId);
    res.json({ membership });
  })
);

export default router;
