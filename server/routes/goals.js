import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { createNotification } from '../services/notificationService.js';

const router = express.Router();
router.use(protect, requireMembership);

async function refreshGoalProgress(goal) {
  if (goal.type === 'weekly_mileage' || goal.type === 'distance') {
    const row = await one(
      `SELECT COALESCE(SUM(distance),0) AS total FROM activities
       WHERE athlete_id = $1 AND start_date >= COALESCE($2, '1970-01-01')`,
      [goal.athleteId, goal.createdAt]
    );
    const current = Number(row.total);
    const status = goal.targetValue && current >= Number(goal.targetValue) ? 'completed' : goal.status;
    await query(`UPDATE goals SET current_value = $1, status = $2, updated_at = NOW() WHERE id = $3`, [
      current,
      status,
      goal.id,
    ]);
    if (status === 'completed' && goal.status !== 'completed') {
      await createNotification({
        userId: goal.athleteId,
        type: 'goal',
        title: 'Goal completed',
        body: `You reached your goal: ${goal.title}`,
        data: { goalId: goal.id },
      });
    }
    return { ...goal, currentValue: current, status };
  }
  return goal;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const goals = camelMany(
      await many(`SELECT * FROM goals WHERE athlete_id = $1 ORDER BY created_at DESC`, [req.user.id])
    );
    const updated = await Promise.all(goals.map((g) => refreshGoalProgress(g)));
    res.json({
      goals: updated.map((g) => ({
        ...g,
        completionPct: g.targetValue ? Math.min(100, Math.round((Number(g.currentValue || 0) / Number(g.targetValue)) * 100)) : 0,
      })),
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, type = 'other', targetValue, targetUnit, targetDate, notes } = req.body;
    if (!title) return res.status(400).json({ message: 'Title required' });
    const goal = camel(
      await one(
        `INSERT INTO goals (athlete_id, title, type, target_value, target_unit, target_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.user.id, title, type, targetValue || null, targetUnit || null, targetDate || null, notes || null]
      )
    );
    res.status(201).json({ goal });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { title, type, targetValue, targetUnit, targetDate, notes, status, currentValue } = req.body;
    const goal = camel(
      await one(
        `UPDATE goals SET
           title = COALESCE($1, title),
           type = COALESCE($2, type),
           target_value = COALESCE($3, target_value),
           target_unit = COALESCE($4, target_unit),
           target_date = COALESCE($5, target_date),
           notes = COALESCE($6, notes),
           status = COALESCE($7, status),
           current_value = COALESCE($8, current_value),
           updated_at = NOW()
         WHERE id = $9 AND athlete_id = $10 RETURNING *`,
        [title, type, targetValue, targetUnit, targetDate, notes, status, currentValue, req.params.id, req.user.id]
      )
    );
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    res.json({ goal });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const goal = await one(`DELETE FROM goals WHERE id = $1 AND athlete_id = $2 RETURNING id`, [
      req.params.id,
      req.user.id,
    ]);
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    res.json({ message: 'Goal deleted' });
  })
);

export default router;
