import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import MonthCalendar, { DurationPicker, TimePicker, secondsFromTime, ymd } from '../components/MonthCalendar';
import { EVENT_TYPES, formatDate, formatActivityPrimary, formatTime } from '../utils/format';

const emptyForm = {
  name: '',
  eventDate: '',
  eventTime: '07:00',
  distance: '',
  category: 'run',
  goalFinish: '',
  notes: '',
  location: '',
};

export default function Events() {
  const [events, setEvents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selected, setSelected] = useState(() => ymd(new Date()));

  const load = async () => {
    const [{ data: e }, { data: a }] = await Promise.all([
      api.get('/events'),
      api.get('/activities?limit=50'),
    ]);
    setEvents(e.events);
    setActivities(a.activities || []);
  };

  useEffect(() => { load(); }, []);

  const dayEvents = useMemo(
    () => events.filter((ev) => String(ev.eventDate).slice(0, 10) === selected),
    [events, selected]
  );

  const openAdd = (date = selected) => {
    setForm({ ...emptyForm, eventDate: date, eventTime: '07:00' });
    setOpen(true);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const goalTime = secondsFromTime(form.goalFinish);
    await api.post('/events', {
      name: form.name,
      eventDate: form.eventDate,
      eventTime: form.eventTime || null,
      category: form.category,
      location: form.location,
      notes: form.notes,
      distance: form.distance ? Number(form.distance) * 1000 : null,
      goalTime,
    });
    setOpen(false);
    setForm(emptyForm);
    load();
  };

  const mapActivity = async (eventId, activityId) => {
    await api.post(`/events/${eventId}/map-activities`, { activityIds: [activityId] });
    load();
  };

  const when = (event) => {
    const date = formatDate(event.eventDate);
    const time = formatTime(event.eventTime);
    return time ? `${date} · ${time}` : date;
  };

  return (
    <Layout>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div>
          <h2 className="page-title">Events</h2>
          <p className="text-muted text-sm">Select a date on the calendar, then add the event</p>
        </div>
        <button className="btn-primary w-full sm:w-auto" onClick={() => openAdd(selected)}>Add event</button>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 mb-8">
        <MonthCalendar
          value={selected}
          monthDate={monthDate}
          events={events}
          onMonthChange={setMonthDate}
          onChange={(day) => {
            setSelected(day);
            setMonthDate(new Date(`${day}T00:00:00`));
          }}
        />
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{formatDate(selected)}</h3>
            <button className="btn-outline btn-sm" onClick={() => openAdd(selected)}>Add on this day</button>
          </div>
          <div className="space-y-3">
            {dayEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                when={when(event)}
                activities={activities}
                onMap={mapActivity}
              />
            ))}
            {!dayEvents.length && (
              <div className="card text-muted text-sm">No events this day. Add one with the calendar date and a start time.</div>
            )}
          </div>
        </div>
      </div>

      <h3 className="font-semibold mb-3">All events</h3>
      <div className="space-y-4">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            when={when(event)}
            activities={activities}
            onMap={mapActivity}
          />
        ))}
        {!events.length && <div className="card text-muted">No events yet.</div>}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center p-4 z-50 overflow-y-auto" onClick={() => setOpen(false)}>
          <form className="card w-full max-w-md space-y-3 my-6" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h3 className="font-semibold text-lg">New event</h3>
            <p className="text-sm text-muted">{formatDate(form.eventDate)} · date from the calendar</p>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div className="grid md:grid-cols-2 gap-3">
              <TimePicker
                value={form.eventTime}
                onChange={(eventTime) => setForm({ ...form, eventTime })}
                label="Start time"
              />
              <DurationPicker
                value={form.goalFinish}
                onChange={(goalFinish) => setForm({ ...form, goalFinish })}
                label="Goal finish time"
              />
            </div>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input placeholder="Distance (km)" type="number" value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} />
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

function EventCard({ event, when, activities, onMap }) {
  return (
    <div className="card">
      <div className="flex justify-between gap-4">
        <div>
          <h3 className="font-semibold">{event.name}</h3>
          <p className="text-sm text-muted">{when} · {event.category} · {event.location || 'TBD'}</p>
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
        <select onChange={(e) => e.target.value && onMap(event.id, e.target.value)} defaultValue="">
          <option value="">Select activity…</option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>{a.name} · {formatActivityPrimary(a)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
