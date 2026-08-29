import { useEffect, useState } from 'react';
import api from '../api/client';
import { formatDuration, getActivityIcon } from '../utils/format';
import {
  buildWeekRecap,
  COMPLETION_LABEL,
  formatKm,
  plannedActualLine,
  statusClass,
  UNAVAILABLE_REASONS,
  unavailableLabel,
  weekRange,
  weekSpanText,
  ymdToday,
} from '../utils/training';

export function TrainingWeekRecap({ athleteId, weekStartsOn = 1, reload = 0, onOpen }) {
  const [workouts, setWorkouts] = useState([]);
  const [unavailable, setUnavailable] = useState([]);

  useEffect(() => {
    const { from, to } = weekRange(ymdToday(), weekStartsOn);
    const params = { from, to };
    if (athleteId) params.athleteId = athleteId;
    let cancelled = false;
    api.get('/training/calendar', { params }).then((res) => {
      if (cancelled) return;
      setWorkouts(res.data.workouts || []);
      setUnavailable(res.data.unavailable || []);
    }).catch(() => {
      if (cancelled) return;
      setWorkouts([]);
      setUnavailable([]);
    });
    return () => { cancelled = true; };
  }, [athleteId, weekStartsOn, reload]);

  const week = buildWeekRecap(workouts, unavailable, ymdToday(), weekStartsOn);
  if (!week.hasAnything) return null;
  const pct = week.plannedDistance
    ? Math.min(100, Math.round((week.actualDistance / week.plannedDistance) * 100))
    : week.total
      ? Math.round((week.done / week.total) * 100)
      : 0;
  const openPreview = week.open.slice(0, 3).map((w) => {
    const day = new Date(`${String(w.scheduledDate).slice(0, 10)}T00:00:00`)
      .toLocaleDateString('en-US', { weekday: 'short' });
    return `${day} ${w.name || w.workoutType}`;
  });
  const extraOpen = week.open.length - openPreview.length;
  const offPreview = week.daysOff.map((row) => unavailableLabel(row)).filter(Boolean);

  return (
    <div className="card mb-5">
      <div className="stat-label">{week.isWeekEnd ? 'Week recap' : 'This week'} · {weekSpanText(week.from, week.to)}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Planned</div>
          <div className="font-semibold">{formatKm(week.plannedDistance)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Done</div>
          <div className="font-semibold">{formatKm(week.actualDistance)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Sessions</div>
          <div className="font-semibold">{week.done}/{week.total}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Volume</div>
          <div className="font-semibold">{pct}%</div>
        </div>
      </div>
      <div className="h-2 bg-ink rounded-full overflow-hidden mt-3">
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      {!!week.daysOff.length && (
        <p className="text-sm text-muted mt-3 mb-0">
          Can’t train: {offPreview.join(' · ')}
        </p>
      )}
      {!!week.missed && (
        <p className="text-sm text-muted mt-2 mb-0">
          Missed {week.missed} session{week.missed === 1 ? '' : 's'}
        </p>
      )}
      {!!week.open.length && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Still open</div>
          {onOpen ? (
            <div className="flex flex-wrap gap-2">
              {week.open.slice(0, 4).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="btn-outline btn-sm"
                  onClick={() => onOpen(w)}
                >
                  {new Date(`${String(w.scheduledDate).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}
                  {' '}
                  {w.name || w.workoutType}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm mb-0">
              {openPreview.join(' · ')}
              {extraOpen > 0 ? ` · +${extraOpen} more` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function TrainingDayWorkouts({ dateLabel, workouts, emptyText, onOpen, banner, note }) {
  return (
    <div className="card">
      <h3 className="font-semibold mb-3">{dateLabel}</h3>
      {banner}
      {!workouts.length ? (
        <p className="text-muted text-sm mb-0">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {workouts.map((w) => {
            const line = plannedActualLine(w);
            const timeLine = w.activityId && w.actualDuration != null
              ? (w.duration != null
                ? `${formatDuration(w.duration)} planned → ${formatDuration(w.actualDuration)}`
                : formatDuration(w.actualDuration))
              : (w.duration != null ? formatDuration(w.duration) : null);
            return (
              <button
                key={w.id}
                type="button"
                className="w-full text-left rounded-xl border border-line p-3 hover:border-brand"
                onClick={() => onOpen(w)}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{getActivityIcon(w.sport)} {w.name || w.workoutType}</span>
                  <span className={`badge ${statusClass(w.completionStatus)}`}>{COMPLETION_LABEL[w.completionStatus]}</span>
                </div>
                <div className="text-xs text-muted mt-1">
                  {w.workoutType}
                  {line ? ` · ${line}` : ''}
                  {timeLine ? ` · ${timeLine}` : ''}
                </div>
                {w.activityName ? (
                  <div className="text-xs text-brand mt-1">Matched: {w.activityName}</div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      {note}
    </div>
  );
}

export function AvailabilityBanner({ row }) {
  if (!row) return null;
  return (
    <div className="rounded-xl border border-line bg-white/5 px-3 py-2 text-sm mb-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">Can’t train</div>
      <p className="mb-0 mt-0.5">{unavailableLabel(row)}</p>
    </div>
  );
}

export function TrainingDayAvailability({ date, current, onSave }) {
  const [reason, setReason] = useState(current?.reason || 'rest');
  const [note, setNote] = useState(current?.note || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setReason(current?.reason || 'rest');
    setNote(current?.note || '');
    setMessage('');
  }, [date, current?.id, current?.reason, current?.note]);

  const save = async (unavailable) => {
    setBusy(true);
    setMessage('');
    try {
      await onSave?.({ unavailable, reason, note });
      setMessage(unavailable ? 'Saved' : 'Cleared');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-line">
      <div className="text-[11px] uppercase tracking-wide text-muted mb-2">Availability</div>
      <label htmlFor={`unavail-reason-${date}`}>Can’t train</label>
      <select
        id={`unavail-reason-${date}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="max-w-xs"
      >
        {UNAVAILABLE_REASONS.map((r) => (
          <option key={r.id} value={r.id}>{r.label}</option>
        ))}
      </select>
      <label htmlFor={`unavail-note-${date}`} className="mt-2">Optional note</label>
      <textarea
        id={`unavail-note-${date}`}
        rows={2}
        maxLength={280}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Travel day, back in Friday"
      />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => save(true)}>
          {busy ? 'Saving…' : current ? 'Update' : 'Can’t train this day'}
        </button>
        {current && (
          <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => save(false)}>
            Clear
          </button>
        )}
        {message && (
          <span className={`text-xs ${/saved|cleared/i.test(message) ? 'text-emerald-200' : 'text-orange-200'}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

function NoteLines({ notes }) {
  if (!notes?.length) return null;
  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <p key={n.id} className="text-sm mb-0">
          <span className="text-muted">{n.coachFirstName} {n.coachLastName}. </span>
          {n.body}
        </p>
      ))}
    </div>
  );
}

export function TrainingDayNote({ notes = [], canEdit, myCoachId, date, onSave }) {
  const mine = notes.find((n) => n.coachId === myCoachId);
  const others = notes.filter((n) => n.coachId !== myCoachId);
  const [text, setText] = useState(mine?.body || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setText(mine?.body || '');
    setMessage('');
  }, [date, mine?.id, mine?.body]);

  if (!canEdit) {
    if (!notes.length) return null;
    return (
      <div className="mt-3 pt-3 border-t border-line">
        <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Coach note</div>
        <NoteLines notes={notes} />
      </div>
    );
  }

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      await onSave?.(text);
      setMessage(text.trim() ? 'Saved' : 'Note removed');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not save note');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-line">
      {!!others.length && (
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Other coaches</div>
          <NoteLines notes={others} />
        </div>
      )}
      <label htmlFor={`day-note-${date}`}>Note for this day</label>
      <textarea
        id={`day-note-${date}`}
        rows={2}
        maxLength={280}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Cut the long run to 12 km, heat"
      />
      <div className="flex items-center gap-3 mt-2">
        <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : text.trim() ? 'Save note' : mine ? 'Remove note' : 'Save note'}
        </button>
        {message && (
          <span className={`text-xs ${/saved|removed/i.test(message) ? 'text-emerald-200' : 'text-orange-200'}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
