import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import MonthCalendar, { ymd } from '../components/MonthCalendar';
import { formatDate, formatDuration, getActivityIcon } from '../utils/format';
import { calendarDot, COMPLETION_LABEL, formatKm, formatPaceSec, PROGRAM_STATUS_LABEL, statusClass, ymdToday } from '../utils/training';

export default function MyTraining() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(ymdToday());
  const [calendar, setCalendar] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data: payload } = await api.get('/training/me');
      setData(payload);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load training');
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    api.get('/training/calendar', { params: { from: ymd(start), to: ymd(end) } }).then((res) => {
      setCalendar(res.data.workouts || []);
    }).catch(() => setCalendar([]));
  }, [month]);

  const events = useMemo(
    () => calendar.map((w) => ({ id: w.id, eventDate: w.scheduledDate, dotClass: calendarDot(w) })),
    [calendar]
  );
  const selectedWorkouts = calendar.filter((w) => String(w.scheduledDate).slice(0, 10) === selected);
  const current = data?.current;
  const today = (data?.today || []).length ? data.today : (current?.todayWorkout ? [current.todayWorkout] : []);
  const progress = current?.progress;

  return (
    <Layout>
      <h2 className="page-title">My Training</h2>
      <p className="page-sub">What to prepare today, and how each plan is going</p>
      {error && <div className="card text-rose-200 mb-4">{error}</div>}

      {!current ? (
        <div className="card text-muted">No active training plan yet. Your coach can assign one from Coaching.</div>
      ) : (
        <>
          <div className="card mb-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="stat-label">Current program</div>
                <Link to={`/training/programs/${current.id}`} className="font-display text-2xl font-bold no-underline text-inherit">
                  {current.name}
                </Link>
                <p className="text-xs text-muted mt-1 mb-0">
                  {current.coach?.firstName} {current.coach?.lastName}
                  {current.club?.name ? ` · ${current.club.name}` : ''}
                  {current.currentPhase ? ` · ${current.currentPhase.name}` : ''}
                  {current.currentWeek ? ` · Week ${current.currentWeek.weekNumber}` : ''}
                </p>
              </div>
              <span className={`badge ${statusClass(current.status)}`}>{PROGRAM_STATUS_LABEL[current.status]}</span>
            </div>
            {progress && (
              <div className="mt-4">
                <div className="h-2 bg-ink rounded-full overflow-hidden">
                  <div className="h-full bg-brand" style={{ width: `${progress.completionPct || 0}%` }} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                  <Stat label="Completed" value={`${progress.completedWorkouts} / ${progress.totalWorkouts}`} />
                  <Stat label="Adherence" value={`${progress.adherencePct}%`} />
                  <Stat label="Planned" value={formatKm(progress.plannedDistance)} />
                  <Stat label="Actual" value={formatKm(progress.actualDistance)} />
                </div>
              </div>
            )}
          </div>

          <section className="mb-6">
            <h3 className="section-title mb-3">Today</h3>
            {!today.length ? (
              <div className="card text-muted text-sm">No workout scheduled today. Rest or check upcoming sessions.</div>
            ) : (
              <div className="space-y-2">
                {today.map((w) => (
                  <WorkoutRow key={w.id} workout={w} onOpen={() => navigate(`/training/workouts/${w.id}`)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {!!data?.programs?.length && (
        <section className="mb-6">
          <h3 className="section-title mb-3">My plans</h3>
          {data.programs.map((p) => (
            <Link key={p.id} to={`/training/programs/${p.id}`} className="card flex justify-between mb-2 no-underline text-inherit">
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-muted">{p.clubName} · {p.coachFirstName} {p.coachLastName} · {p.sport}</div>
              </div>
              <span className={`badge h-fit ${statusClass(p.status)}`}>{PROGRAM_STATUS_LABEL[p.status]}</span>
            </Link>
          ))}
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <MonthCalendar
          value={selected}
          onChange={setSelected}
          events={events}
          monthDate={month}
          onMonthChange={setMonth}
        />
        <div className="card">
          <h3 className="font-semibold mb-3">{formatDate(selected)}</h3>
          {!selectedWorkouts.length ? (
            <p className="text-muted text-sm mb-0">No planned workout on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedWorkouts.map((w) => (
                <button key={w.id} type="button" className="w-full text-left rounded-xl border border-line p-3 hover:border-brand" onClick={() => navigate(`/training/workouts/${w.id}`)}>
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{getActivityIcon(w.sport)} {w.name || w.workoutType}</span>
                    <span className={`badge ${statusClass(w.completionStatus)}`}>{COMPLETION_LABEL[w.completionStatus]}</span>
                  </div>
                  <div className="text-xs text-muted mt-1">{w.workoutType} · {formatKm(w.distance)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!!data?.upcoming?.length && (
        <section className="mb-6">
          <h3 className="section-title mb-3">To prepare</h3>
          <div className="space-y-2">
            {data.upcoming.map((w) => (
              <WorkoutRow key={w.id} workout={w} onOpen={() => navigate(`/training/workouts/${w.id}`)} />
            ))}
          </div>
        </section>
      )}

      {!!current?.reviews?.length && (
        <section className="mb-6">
          <h3 className="section-title mb-3">Coach feedback</h3>
          {current.reviews.map((r) => (
            <div key={r.id} className="card mb-2 text-sm">
              <div className="font-semibold">{r.coachFirstName} {r.coachLastName}{r.clubName ? ` · ${r.clubName}` : ''}</div>
              <p className="text-muted mb-0 mt-1">{r.performanceSummary || r.comments || r.recommendations}</p>
            </div>
          ))}
        </section>
      )}
    </Layout>
  );
}

function WorkoutRow({ workout, onOpen }) {
  return (
    <button type="button" className="card w-full text-left hover:border-brand" onClick={onOpen}>
      <div className="flex justify-between gap-3">
        <div>
          <div className="font-semibold">{getActivityIcon(workout.sport)} {workout.name || workout.workoutType}</div>
          <div className="text-xs text-muted mt-1">
            {formatDate(workout.scheduledDate)} · {workout.workoutType}
            {workout.distance ? ` · ${formatKm(workout.distance)}` : ''}
            {workout.duration ? ` · ${formatDuration(workout.duration)}` : ''}
            {workout.targetPace ? ` · ${formatPaceSec(workout.targetPace)}` : ''}
          </div>
        </div>
        <span className={`badge h-fit ${statusClass(workout.completionStatus)}`}>{COMPLETION_LABEL[workout.completionStatus]}</span>
      </div>
    </button>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
