import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import MonthCalendar, { DurationPicker, TimePicker, secondsFromTime, timeFromSeconds, ymd } from '../components/MonthCalendar';
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
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selected, setSelected] = useState(() => ymd(new Date()));

  const load = async () => {
    const [{ data: e }, { data: a }] = await Promise.all([
      api.get('/events'),
      api.get('/activities?limit=200'),
    ]);
    setEvents(e.events);
    setActivities(a.activities || []);
  };

  useEffect(() => { load(); }, []);

  const dayEvents = useMemo(
    () => events.filter((ev) => String(ev.eventDate).slice(0, 10) === selected),
    [events, selected]
  );

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
  };

  const openAdd = (date = selected) => {
    setEditingId(null);
    setFormError('');
    setForm({ ...emptyForm, eventDate: date, eventTime: '07:00' });
    setOpen(true);
  };

  const openEdit = (event) => {
    setEditingId(event.id);
    setFormError('');
    setForm({
      name: event.name || '',
      eventDate: String(event.eventDate || '').slice(0, 10),
      eventTime: formatTime(event.eventTime) || '07:00',
      distance: event.distance ? String(Number(event.distance) / 1000) : '',
      category: event.category || 'run',
      goalFinish: timeFromSeconds(event.goalTime),
      notes: event.notes || '',
      location: event.location || '',
    });
    setOpen(true);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setFormError('');
    const payload = {
      name: form.name,
      eventDate: form.eventDate,
      eventTime: form.eventTime || null,
      category: form.category,
      location: form.location,
      notes: form.notes,
      distance: form.distance ? Number(form.distance) * 1000 : null,
      goalTime: secondsFromTime(form.goalFinish),
    };
    try {
      if (editingId) {
        await api.put(`/events/${editingId}`, payload);
      } else {
        await api.post('/events', payload);
      }
      closeForm();
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not save event');
    }
  };

  const deleteEvent = async (event) => {
    if (!window.confirm(`Delete “${event.name}”? This cannot be undone.`)) return;
    try {
      await api.delete(`/events/${event.id}`);
      load();
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not delete event');
    }
  };

  const mapActivity = async (event, activity) => {
    if (!activity?.id) return;
    if (!window.confirm(`Link “${activity.name}” to “${event.name}”? You won’t be able to edit this event after that.`)) {
      return;
    }
    try {
      await api.post(`/events/${event.id}/map-activities`, { activityIds: [activity.id] });
      load();
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not link activity');
    }
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
                onEdit={openEdit}
                onDelete={deleteEvent}
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
            onEdit={openEdit}
            onDelete={deleteEvent}
          />
        ))}
        {!events.length && <div className="card text-muted">No events yet.</div>}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center p-4 z-50 overflow-y-auto" onClick={closeForm}>
          <form className="card w-full max-w-md space-y-3 my-6" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h3 className="font-semibold text-lg">{editingId ? 'Edit event' : 'New event'}</h3>
            {formError && <p className="text-sm text-orange-300 mb-0">{formError}</p>}
            <div>
              <label htmlFor="eventName">Name</label>
              <input id="eventName" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="eventDate">Date</label>
                <input id="eventDate" type="date" required value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
              </div>
              <TimePicker
                value={form.eventTime}
                onChange={(eventTime) => setForm({ ...form, eventTime })}
                label="Start time"
              />
            </div>
            <DurationPicker
              value={form.goalFinish}
              onChange={(goalFinish) => setForm({ ...form, goalFinish })}
              label="Goal finish time"
            />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input placeholder="Distance (km)" type="number" value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} />
            <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={closeForm}>Cancel</button>
              <button className="btn-primary" type="submit">{editingId ? 'Save changes' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}

function activityDay(activity) {
  const raw = activity.startDateLocal || activity.startDate || '';
  const text = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return raw ? ymd(new Date(raw)) : '';
}

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

function EventCard({ event, when, activities, onMap, onEdit, onDelete }) {
  const eventDay = String(event.eventDate || '').slice(0, 10);
  const today = ymd(new Date());
  const upcoming = event.status === 'upcoming' && eventDay > today;
  const linked = event.mappedActivities || [];
  const locked = event.status === 'completed' || linked.length > 0;
  const linkedIds = new Set(linked.map((a) => a.id));
  const sportLabel = EVENT_TYPES.find((t) => t.value === event.category)?.label || event.category || 'matching';
  const candidates = activities.filter((a) => (
    !linkedIds.has(a.id)
    && activityDay(a) === eventDay
    && matchesEventCategory(a, event.category)
  ));

  return (
    <div className="card">
      <div className="flex justify-between gap-4">
        <div>
          <h3 className="font-semibold">{event.name}</h3>
          <p className="text-sm text-muted">{when} · {event.category} · {event.location || 'TBD'}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`badge ${locked ? 'bg-emerald-500/15 text-emerald-300' : 'bg-accent/15 text-accent'}`}>{event.status}</span>
          {!locked && (
            <div className="flex gap-2">
              <button type="button" className="btn-outline btn-sm" onClick={() => onEdit(event)}>Edit</button>
              <button type="button" className="btn-outline btn-sm" onClick={() => onDelete(event)}>Delete</button>
            </div>
          )}
        </div>
      </div>
      {event.comparison && (
        <div className="mt-3 text-sm grid grid-cols-2 gap-2">
          <div>Plan: {event.comparison.formatted.plannedDistance || '—'} / {event.comparison.formatted.plannedTime || '—'}</div>
          <div>Actual: {event.comparison.formatted.actualDistance} / {event.comparison.formatted.actualTime}</div>
        </div>
      )}
      {!!linked.length && (
        <div className="mt-3 text-sm text-muted">
          {linked.map((a) => (
            <div key={a.id}>{a.name} · {formatActivityPrimary(a)}</div>
          ))}
        </div>
      )}
      {!upcoming && !locked && (
        <div className="mt-3">
          <label className="text-xs">Link a {sportLabel.toLowerCase()} from {formatDate(event.eventDate)}</label>
          {candidates.length ? (
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const activity = activities.find((a) => a.id === id) || { id, name: 'this activity' };
                onMap(event, activity);
              }}
            >
              <option value="">Select activity…</option>
              {candidates.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {formatActivityPrimary(a)}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted mb-0">No {sportLabel.toLowerCase()} activities on this date.</p>
          )}
        </div>
      )}
    </div>
  );
}
