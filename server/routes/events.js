import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, rejectAppAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { formatDistance, formatDuration } from '../utils/format.js';

const router = express.Router();
router.use(protect, requireMembership, rejectAppAdmin);

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
    const { name, eventDate, eventTime, distance, category = 'run', goalTime, goalPace, notes, location } = req.body;
    if (!name || !eventDate) {
      return res.status(400).json({ message: 'Name and date are required' });
    }
    const event = camel(
      await one(
        `INSERT INTO events (owner_type, owner_id, name, event_date, event_time, distance, category, goal_time, goal_pace, notes, location, status)
         VALUES ('athlete', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [req.user.id, name, eventDate, eventTime || null, distance || null, category, goalTime || null, goalPace || null, notes || null, location || null, 'upcoming']
      )
    );
    res.status(201).json({ event });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = camel(
      await one(`SELECT * FROM events WHERE id = $1 AND owner_type = 'athlete' AND owner_id = $2`, [
        req.params.id,
        req.user.id,
      ])
    );
    if (!existing) return res.status(404).json({ message: 'Event not found' });
    if (existing.status === 'completed') {
      return res.status(400).json({ message: 'Completed events cannot be edited' });
    }
    const { name, eventDate, eventTime, distance, category, goalTime, goalPace, notes, location } = req.body;
    const event = camel(
      await one(
        `UPDATE events SET
           name = COALESCE($1, name),
           event_date = COALESCE($2, event_date),
           event_time = COALESCE($3, event_time),
           distance = COALESCE($4, distance),
           category = COALESCE($5, category),
           goal_time = COALESCE($6, goal_time),
           goal_pace = COALESCE($7, goal_pace),
           notes = COALESCE($8, notes),
           location = COALESCE($9, location),
           updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [name, eventDate, eventTime, distance, category, goalTime, goalPace, notes, location, req.params.id]
      )
    );
    res.json({ event });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = camel(
      await one(`SELECT id, status FROM events WHERE id = $1 AND owner_type = 'athlete' AND owner_id = $2`, [
        req.params.id,
        req.user.id,
      ])
    );
    if (!existing) return res.status(404).json({ message: 'Event not found' });
    if (existing.status === 'completed') {
      return res.status(400).json({ message: 'Completed events cannot be deleted' });
    }
    await query(`UPDATE activities SET event_id = NULL WHERE event_id = $1`, [req.params.id]);
    await query(`DELETE FROM events WHERE id = $1`, [req.params.id]);
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
    if (event.status === 'completed') {
      return res.status(400).json({ message: 'This event already has a linked activity and cannot be changed' });
    }
    const alreadyLinked = await one(`SELECT 1 FROM event_activities WHERE event_id = $1 LIMIT 1`, [event.id]);
    if (alreadyLinked) {
      return res.status(400).json({ message: 'This event already has a linked activity and cannot be changed' });
    }
    const eventDay = new Date(event.eventDate);
    eventDay.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (eventDay > today) {
      return res.status(400).json({ message: 'Link an activity after the event has taken place' });
    }
    for (const activityId of activityIds) {
      const act = camel(
        await one(
          `SELECT id, type, sport_type,
                  ((COALESCE(start_date_local, start_date)::date) = $3::date) AS same_day
           FROM activities WHERE id = $1 AND athlete_id = $2`,
          [activityId, req.user.id, event.eventDate]
        )
      );
      if (!act) return res.status(400).json({ message: 'Some activities not found or not owned by you' });
      if (!act.sameDay) {
        return res.status(400).json({ message: 'Link an activity from the event date' });
      }
      if (!matchesEventCategory(act, event.category)) {
        return res.status(400).json({ message: `Link a ${event.category || 'matching'} activity to this event` });
      }
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

function matchesEventCategory(activity, category) {
  const blob = `${activity.type || ''} ${activity.sportType || ''}`.toLowerCase();
  const cat = String(category || '').toLowerCase();
  if (cat === 'run') return blob.includes('run') || blob.includes('trail');
  if (cat === 'bike') return blob.includes('ride') || blob.includes('cycle') || blob.includes('bike');
  if (cat === 'swim') return blob.includes('swim');
  if (cat === 'walk') return blob.includes('walk');
  if (cat === 'triathlon') {
    return blob.includes('run') || blob.includes('trail') || blob.includes('ride')
      || blob.includes('cycle') || blob.includes('bike') || blob.includes('swim');
  }
  return true;
}

export default router;
