import { useEffect, useState } from 'react';
import api from '../api/client';
import ConfirmDialog from './ConfirmDialog';
import { TimePicker } from './MonthCalendar';
import { formatDate, formatTime, getActivityIcon, GROUP_SESSION_SPORTS } from '../utils/format';

const emptyForm = {
  name: '',
  sessionDate: '',
  sessionTime: '06:00',
  sport: 'run',
  meetupPoint: '',
  notes: '',
};

function names(list) {
  return (list || [])
    .map((p) => `${p.firstName || ''} ${p.lastName || ''}`.trim())
    .filter(Boolean);
}

function sportIcon(sport) {
  const map = { run: 'Run', ride: 'Ride', swim: 'Swim', walk: 'Walk' };
  return getActivityIcon(map[sport] || 'Workout');
}

function RsvpButtons({ session, busy, onRsvp }) {
  const options = [
    { id: 'going', label: "I'm in" },
    { id: 'maybe', label: 'Maybe' },
    { id: 'not_going', label: "Can't" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={session.myRsvp === opt.id ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
          disabled={busy}
          onClick={() => onRsvp(session.id, opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SessionCard({ session, showClub, busy, onRsvp, onCancel }) {
  const going = names(session.going);
  const maybe = names(session.maybe);
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">
            {sportIcon(session.sport)} {session.name}
          </div>
          <div className="text-xs text-muted mt-1">
            {session.sportLabel || session.sport}
            {showClub && session.clubName ? ` · ${session.clubName}` : ''}
          </div>
          <div className="text-sm mt-2">
            {formatDate(session.sessionDate)}
            {session.sessionTime ? ` · ${formatTime(session.sessionTime)}` : ''}
          </div>
          <div className="text-sm mt-1">{session.meetupPoint}</div>
          {session.notes ? <p className="text-xs text-muted mt-2 mb-0">{session.notes}</p> : null}
        </div>
        {session.canPost && onCancel ? (
          <button type="button" className="btn-outline btn-sm shrink-0" onClick={() => onCancel(session)}>
            Cancel session
          </button>
        ) : null}
      </div>
      <div className="text-xs text-muted mt-3">
        {session.counts?.going || 0} in
        {session.counts?.maybe ? ` · ${session.counts.maybe} maybe` : ''}
        {session.counts?.notGoing ? ` · ${session.counts.notGoing} can't` : ''}
      </div>
      {going.length ? (
        <p className="text-sm mt-1 mb-0">In: {going.join(', ')}</p>
      ) : (
        <p className="text-sm text-muted mt-1 mb-0">Nobody has said they're in yet.</p>
      )}
      {maybe.length ? <p className="text-sm text-muted mt-1 mb-0">Maybe: {maybe.join(', ')}</p> : null}
      <div className="mt-3">
        <RsvpButtons session={session} busy={busy} onRsvp={onRsvp} />
      </div>
    </div>
  );
}

export default function GroupSessions({ clubId, clubName, canPost = false, compact = false }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(null);
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    sessionDate: new Date().toISOString().slice(0, 10),
  }));

  const load = async () => {
    const params = clubId ? { clubId, limit: 20 } : { limit: 5 };
    const { data } = await api.get('/group-sessions', { params });
    setSessions(data.sessions || []);
  };

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || 'Could not load group sessions'));
  }, [clubId]);

  const rsvp = async (id, status) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.put(`/group-sessions/${id}/rsvp`, { status });
      setSessions((prev) => prev.map((s) => (s.id === id ? data.session : s)));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save RSVP');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (session) => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/group-sessions/${session.id}`, { status: 'cancelled' });
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setPendingCancel(null);
      setMsg('Session cancelled');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not cancel');
    } finally {
      setBusy(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const { data } = await api.post('/group-sessions', { ...form, clubId });
      setSessions((prev) => [...prev, data.session].sort((a, b) => {
        const ad = `${a.sessionDate} ${a.sessionTime || ''}`;
        const bd = `${b.sessionDate} ${b.sessionTime || ''}`;
        return ad.localeCompare(bd);
      }));
      setOpen(false);
      setForm({ ...emptyForm, sessionDate: form.sessionDate, sessionTime: form.sessionTime, sport: form.sport });
      setMsg('Group session posted. Members can RSVP.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not post session');
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    if (!sessions.length) return null;
    return (
      <section className="mb-6">
        <h3 className="section-title mb-3">Group sessions</h3>
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              showClub={!clubId}
              busy={busy}
              onRsvp={rsvp}
              onCancel={compact ? undefined : cancel}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="section-title mb-0">Group sessions</h3>
        {canPost && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : 'Post session'}
          </button>
        )}
      </div>
      <p className="text-sm text-muted mb-3">
        Time, meetup point, sport, and who is in
        {clubName ? ` for ${clubName}` : ''}.
      </p>
      {error && <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 p-3 text-sm">{error}</div>}
      {msg && <div className="mb-3 rounded-xl border border-brand/40 bg-brand/10 p-3 text-sm">{msg}</div>}
      {open && canPost && (
        <form className="card grid md:grid-cols-2 gap-3 mb-4" onSubmit={create}>
          <div className="md:col-span-2">
            <label htmlFor="gs-name">Name</label>
            <input
              id="gs-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Sunday long run"
              required
            />
          </div>
          <div>
            <label htmlFor="gs-date">Date</label>
            <input
              id="gs-date"
              type="date"
              value={form.sessionDate}
              onChange={(e) => setForm({ ...form, sessionDate: e.target.value })}
              required
            />
          </div>
          <TimePicker
            label="Start time"
            value={form.sessionTime}
            onChange={(sessionTime) => setForm({ ...form, sessionTime })}
          />
          <div>
            <label htmlFor="gs-sport">Sport</label>
            <select
              id="gs-sport"
              value={form.sport}
              onChange={(e) => setForm({ ...form, sport: e.target.value })}
            >
              {GROUP_SESSION_SPORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="gs-meet">Meetup point</label>
            <input
              id="gs-meet"
              value={form.meetupPoint}
              onChange={(e) => setForm({ ...form, meetupPoint: e.target.value })}
              placeholder="Boat club gate"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="gs-notes">Notes (optional)</label>
            <input
              id="gs-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Easy pace, bring water"
            />
          </div>
          <button className="btn-primary md:col-span-2" type="submit" disabled={busy}>
            {busy ? 'Posting…' : 'Post group session'}
          </button>
        </form>
      )}
      {!sessions.length ? (
        <div className="card text-sm text-muted">
          {canPost ? 'No upcoming group sessions. Post one so members can RSVP.' : 'No upcoming group sessions yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              showClub={!clubId}
              busy={busy}
              onRsvp={rsvp}
              onCancel={() => setPendingCancel(session)}
            />
          ))}
        </div>
      )}
      {pendingCancel && (
        <ConfirmDialog
          title="Cancel this session?"
          confirmLabel="Cancel session"
          cancelLabel="Keep it"
          danger
          busy={busy}
          onCancel={() => setPendingCancel(null)}
          onConfirm={() => cancel(pendingCancel)}
        >
          <p className="mb-0">
            Cancel <span className="text-slate-100 font-medium">{pendingCancel.name}</span>? Members who RSVP’d will no longer see it.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
