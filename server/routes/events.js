import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { formatDistance, formatDuration } from '../utils/format.js';

const router = express.Router();
router.use(protect, requireMembership);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, scope = 'mine' } = req.query;
    let sql = `SELECT * FROM events WHERE owner_type = 'athlete' AND owner_id = $1`;
    const params = [req.user.id];
    if (status) {
      sql += ` AND status = $2`;
      params.push(status);
    }
    sql += ' ORDER BY event_date DESC';
    const events = camelMany(await many(sql, params));

    const withActivities = await Promise.all(
      events.map(async (event) => {
        const activities = camelMany(
          await many(
            `SELECT a.id, a.name, a.type, a.distance, a.moving_time, a.start_date, a.avg_speed
             FROM event_activities ea
             JOIN activities a ON a.id = ea.activity_id
             WHERE ea.event_id = $1`,
            [event.id]
          )
        );
        return { ...event, mappedActivities: activities, comparison: compare(event, activities) };
      })
    );
    res.json({ events: withActivities, scope });
  })
);

function compare(event, activities) {
  if (!activities.length) return null;
  const actualDistance = activities.reduce((a, b) => a + Number(b.distance || 0), 0);
  const actualTime = activities.reduce((a, b) => a + Number(b.movingTime || 0), 0);
  return {
    plannedDistance: event.distance,
    actualDistance,
    plannedTime: event.goalTime,
    actualTime,
    distanceDelta: event.distance ? actualDistance - Number(event.distance) : null,
    timeDelta: event.goalTime ? actualTime - Number(event.goalTime) : null,
    formatted: {
      plannedDistance: event.distance ? formatDistance(event.distance) : null,
      actualDistance: formatDistance(actualDistance),
      plannedTime: event.goalTime ? formatDuration(event.goalTime) : null,
      actualTime: formatDuration(actualTime),
    },
  };
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, eventDate, distance, category = 'run', goalTime, goalPace, notes, location } = req.body;
    if (!name || !eventDate) {
      return res.status(400).json({ message: 'Name and date are required' });
    }
    const status = new Date(eventDate) < new Date() ? 'completed' : 'upcoming';
    const event = camel(
      await one(
        `INSERT INTO events (owner_type, owner_id, name, event_date, distance, category, goal_time, goal_pace, notes, location, status)
         VALUES ('athlete', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [req.user.id, name, eventDate, distance || null, category, goalTime || null, goalPace || null, notes || null, location || null, status]
      )
    );
    res.status(201).json({ event });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await one(`SELECT * FROM events WHERE id = $1 AND owner_type = 'athlete' AND owner_id = $2`, [
      req.params.id,
      req.user.id,
    ]);
    if (!existing) return res.status(404).json({ message: 'Event not found' });
    const { name, eventDate, distance, category, goalTime, goalPace, notes, location, status } = req.body;
    const event = camel(
      await one(
        `UPDATE events SET
           name = COALESCE($1, name),
           event_date = COALESCE($2, event_date),
           distance = COALESCE($3, distance),
           category = COALESCE($4, category),
           goal_time = COALESCE($5, goal_time),
           goal_pace = COALESCE($6, goal_pace),
           notes = COALESCE($7, notes),
           location = COALESCE($8, location),
           status = COALESCE($9, status),
           updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [name, eventDate, distance, category, goalTime, goalPace, notes, location, status, req.params.id]
      )
    );
    res.json({ event });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const event = await one(`DELETE FROM events WHERE id = $1 AND owner_type = 'athlete' AND owner_id = $2 RETURNING id`, [
      req.params.id,
      req.user.id,
    ]);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    await query(`UPDATE activities SET event_id = NULL WHERE event_id = $1`, [req.params.id]);
    res.json({ message: 'Event deleted' });
  })
);

router.post(
  '/:id/map-activities',
  asyncHandler(async (req, res) => {
    const { activityIds } = req.body;
    if (!Array.isArray(activityIds) || !activityIds.length) {
      return res.status(400).json({ message: 'activityIds array required' });
    }
    const event = camel(
      await one(`SELECT * FROM events WHERE id = $1 AND owner_type = 'athlete' AND owner_id = $2`, [
        req.params.id,
        req.user.id,
      ])
    );
    if (!event) return res.status(404).json({ message: 'Event not found' });
    for (const activityId of activityIds) {
      const act = await one(`SELECT id FROM activities WHERE id = $1 AND athlete_id = $2`, [activityId, req.user.id]);
      if (!act) return res.status(400).json({ message: 'Some activities not found or not owned by you' });
      await query(
        `INSERT INTO event_activities (event_id, activity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [event.id, activityId]
      );
      await query(`UPDATE activities SET event_id = $1 WHERE id = $2`, [event.id, activityId]);
    }
    await query(`UPDATE events SET status = 'completed', updated_at = NOW() WHERE id = $1`, [event.id]);
    res.json({ message: 'Activities mapped' });
  })
);

export default router;
