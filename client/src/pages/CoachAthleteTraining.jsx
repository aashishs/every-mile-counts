import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import MonthCalendar, { ymd } from '../components/MonthCalendar';
import { formatDate, formatDateShort, getActivityIcon } from '../utils/format';
import { calendarDot, COMPLETION_LABEL, formatKm, PROGRAM_STATUS_LABEL, statusClass, ymdToday } from '../utils/training';

export default function CoachAthleteTraining() {
  const { athleteId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(ymdToday());
  const [calendar, setCalendar] = useState([]);

  useEffect(() => {
    api.get(`/training/athletes/${athleteId}`).then((res) => setData(res.data)).catch((err) => {
      setError(err.response?.data?.message || 'Not authorized to view this athlete');
    });
  }, [athleteId]);

  useEffect(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    api.get('/training/calendar', { params: { athleteId, from: ymd(start), to: ymd(end) } }).then((res) => {
      setCalendar(res.data.workouts || []);
    }).catch(() => setCalendar([]));
  }, [athleteId, month]);

  const events = useMemo(
    () => calendar.map((w) => ({ id: w.id, eventDate: w.scheduledDate, dotClass: calendarDot(w) })),
    [calendar]
  );
  const selectedWorkouts = calendar.filter((w) => String(w.scheduledDate).slice(0, 10) === selected);

  if (error) {
    return <Layout><div className="card text-rose-200">{error}</div></Layout>;
  }
  if (!data) return <Layout><p className="text-muted">Loading…</p></Layout>;

  const { athlete, current, programs, reviews, recentActivities } = data;
  const progress = current?.progress;
  const programPath = (p) => (p?.owned ? `/coaches/programs/${p.id}` : `/training/programs/${p.id}`);
  const currentOwned = current && programs?.some((p) => p.id === current.id && p.owned);

  return (
    <Layout>
      <p className="text-xs text-muted mb-2">
        <Link to="/coaches/training" className="text-brand no-underline">Training</Link>
        {' · '}
        <Link to={`/coaches/athletes/${athleteId}`} className="text-brand no-underline">Activities</Link>
      </p>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="page-title mb-1">{athlete.firstName} {athlete.lastName}</h2>
          <p className="page-sub mb-0">All plans and activities this athlete still needs to prepare</p>
        </div>
          <Link to={`/coaches/activities/new?athleteId=${athleteId}`} className="btn-outline no-underline text-center">Assign activity</Link>
          <Link to="/coaches/programs/new" className="btn-outline no-underline text-center">New program</Link>
      </div>

      {current ? (
        <div className="card mb-6">
          <div className="flex justify-between gap-3">
            <div>
              <div className="stat-label">{current.status === 'active' ? 'Current plan' : 'Latest plan'}</div>
              <Link to={programPath({ id: current.id, owned: currentOwned })} className="font-display text-2xl font-bold no-underline text-inherit">{current.name}</Link>
              <p className="text-xs text-muted mb-0 mt-1">
                {current.currentPhase?.name || 'No phase'}
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
                <div>Completed {progress.completedWorkouts}/{progress.totalWorkouts}</div>
                <div>Adherence {progress.adherencePct}%</div>
                <div>Planned {formatKm(progress.plannedDistance)}</div>
                <div>Actual {formatKm(progress.actualDistance)}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card text-muted mb-6">No program assigned in your club context yet.</div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <MonthCalendar value={selected} onChange={setSelected} events={events} monthDate={month} onMonthChange={setMonth} />
        <div className="card">
          <h3 className="font-semibold mb-3">{formatDate(selected)}</h3>
          {!selectedWorkouts.length ? <p className="text-muted text-sm mb-0">No workout this day.</p> : selectedWorkouts.map((w) => (
            <button key={w.id} type="button" className="w-full text-left rounded-xl border border-line p-3 mb-2 hover:border-brand" onClick={() => navigate(`/training/workouts/${w.id}`)}>
              <div className="flex justify-between">
                <span>{getActivityIcon(w.sport)} {w.name || w.workoutType}</span>
                <span className={`badge ${statusClass(w.completionStatus)}`}>{COMPLETION_LABEL[w.completionStatus]}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {!!data.toPrepare?.length && (
        <section className="mb-6">
          <h3 className="section-title mb-3">To prepare</h3>
          {data.toPrepare.map((w) => (
            <button key={w.id} type="button" className="card w-full text-left mb-2 hover:border-brand" onClick={() => navigate(`/training/workouts/${w.id}`)}>
              <div className="flex justify-between gap-2">
                <span>{getActivityIcon(w.sport)} {w.name || w.workoutType}</span>
                <span className={`badge ${statusClass(w.completionStatus)}`}>{COMPLETION_LABEL[w.completionStatus]}</span>
              </div>
              <div className="text-xs text-muted mt-1">{formatDate(w.scheduledDate)} · {w.programName}{w.distance ? ` · ${formatKm(w.distance)}` : ''}</div>
            </button>
          ))}
        </section>
      )}

      <section className="mb-6">
        <h3 className="section-title mb-3">Plans</h3>
        {!programs?.length ? (
          <div className="card text-muted">No plans for this athlete yet.</div>
        ) : programs.map((p) => (
          <button key={p.id} type="button" className="card w-full text-left mb-2 hover:border-brand" onClick={() => navigate(programPath(p))}>
            <div className="flex justify-between">
              <span className="font-semibold">{p.name}</span>
              <span className={`badge ${statusClass(p.status)}`}>{PROGRAM_STATUS_LABEL[p.status]}</span>
            </div>
            <div className="text-xs text-muted mt-1">{p.clubName} · {p.sport}</div>
          </button>
        ))}
      </section>

      {!!recentActivities?.length && (
        <section className="mb-6">
          <h3 className="section-title mb-3">Recent activities</h3>
          {recentActivities.map((a) => (
            <Link key={a.id} to={`/activities/${a.id}`} className="card flex justify-between mb-2 no-underline text-inherit">
              <span>{getActivityIcon(a.type)} {a.name || a.type}</span>
              <span className="text-xs text-muted">{formatDateShort(a.startDate)}</span>
            </Link>
          ))}
        </section>
      )}

      {!!reviews?.length && (
        <section className="mb-6">
          <h3 className="section-title mb-3">Club reviews</h3>
          {reviews.map((r) => (
            <Link key={r.id} to={`/activities/${r.activityId}`} className="card mb-2 text-sm no-underline text-inherit hover:border-brand block">
              <div className="font-semibold">{r.coachFirstName} {r.coachLastName}{r.clubName ? ` · ${r.clubName}` : ''}</div>
              <p className="text-muted mb-0 mt-1">{r.performanceSummary || r.comments || r.recommendations}</p>
            </Link>
          ))}
        </section>
      )}
    </Layout>
  );
}
