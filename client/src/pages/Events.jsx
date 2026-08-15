import { useEffect, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import { EVENT_TYPES, formatDate, formatDistance } from '../utils/format';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', eventDate: '', distance: '', category: 'run', goalTime: '', notes: '', location: '' });

  const load = async () => {
    const [{ data: e }, { data: a }] = await Promise.all([
      api.get('/events'),
      api.get('/activities?limit=50'),
    ]);
    setEvents(e.events);
    setActivities(a.activities || []);
  };

  useEffect(() => { load(); }, []);

  const submit = async (ev) => {
    ev.preventDefault();
    await api.post('/events', {
      ...form,
      distance: form.distance ? Number(form.distance) * 1000 : null,
      goalTime: form.goalTime ? Number(form.goalTime) * 60 : null,
    });
    setOpen(false);
    setForm({ name: '', eventDate: '', distance: '', category: 'run', goalTime: '', notes: '', location: '' });
    load();
  };

  const mapActivity = async (eventId, activityId) => {
    await api.post(`/events/${eventId}/map-activities`, { activityIds: [activityId] });
    load();
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="page-title">Events</h2>
          <p className="text-muted">Future races, past results, planned vs actual</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}>Add event</button>
      </div>

      <div className="space-y-4">
        {events.map((event) => (
          <div key={event.id} className="card">
            <div className="flex justify-between gap-4">
              <div>
                <h3 className="font-semibold">{event.name}</h3>
                <p className="text-sm text-muted">{formatDate(event.eventDate)} · {event.category} · {event.location || 'TBD'}</p>
              </div>
              <span className={`badge ${event.status === 'upcoming' ? 'bg-accent/15 text-accent' : 'bg-emerald-500/15 text-emerald-300'}`}>{event.status}</span>
            </div>
            {event.comparison && (
              <div className="mt-3 text-sm grid grid-cols-2 gap-2">
                <div>Plan: {event.comparison.formatted.plannedDistance || '—'} / {event.comparison.formatted.plannedTime || '—'}</div>
                <div>Actual: {event.comparison.formatted.actualDistance} / {event.comparison.formatted.actualTime}</div>
              </div>
            )}
            <div className="mt-3">
              <label className="text-xs">Link an activity</label>
              <select onChange={(e) => e.target.value && mapActivity(event.id, e.target.value)} defaultValue="">
                <option value="">Select activity…</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · {formatDistance(a.distance)}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {!events.length && <div className="card text-muted">No events yet.</div>}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center p-4 z-50" onClick={() => setOpen(false)}>
          <form className="card w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h3 className="font-semibold text-lg">New event</h3>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} required />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input placeholder="Distance (km)" type="number" value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} />
            <input placeholder="Goal time (minutes)" type="number" value={form.goalTime} onChange={(e) => setForm({ ...form, goalTime: e.target.value })} />
            <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" type="submit">Save</button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}
