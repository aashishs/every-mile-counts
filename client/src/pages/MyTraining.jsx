import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import MonthCalendar, { ymd } from '../components/MonthCalendar';
import { TrainingDayAvailability, TrainingDayNote, TrainingDayWorkouts, TrainingWeekRecap, AvailabilityBanner } from '../components/TrainingPlanGlance';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDuration, getActivityIcon } from '../utils/format';
import { calendarEvents, COMPLETION_LABEL, formatKm, formatPaceSec, notesOnDay, PROGRAM_STATUS_LABEL, statusClass, unavailableDays, unavailableLabel, unavailableOnDay, ymdToday } from '../utils/training';

export default function MyTraining() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(ymdToday());
  const [calendar, setCalendar] = useState([]);
  const [dayNotes, setDayNotes] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [recapReload, setRecapReload] = useState(0);
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
      setDayNotes(res.data.dayNotes || []);
      setUnavailable(res.data.unavailable || []);
    }).catch(() => {
      setCalendar([]);
      setDayNotes([]);
      setUnavailable([]);
    });
  }, [month]);

  const events = useMemo(
    () => calendarEvents(calendar, dayNotes),
    [calendar, dayNotes]
  );
  const selectedWorkouts = calendar.filter((w) => String(w.scheduledDate).slice(0, 10) === selected);
  const selectedNotes = notesOnDay(dayNotes, selected);
  const selectedUnavailable = unavailableOnDay(unavailable, selected);
  const todayNotes = notesOnDay(dayNotes, ymdToday());
  const todayUnavailable = unavailableOnDay(unavailable, ymdToday());
  const mutedDays = unavailableDays(unavailable);
  const current = data?.current;
  const today = (data?.today || []).length ? data.today : (current?.todayWorkout ? [current.todayWorkout] : []);
  const progress = current?.progress;

  return (
    <Layout>
      <h2 className="page-title">My Training</h2>
      <p className="page-sub">What was prescribed, and what you actually did</p>
      {error && <div className="card text-rose-200 mb-4">{error}</div>}

      {!current && !data?.upcoming?.length && !data?.today?.length ? (
        <div className="card text-muted mb-6">No training assigned yet. Your coach can give you a plan or a single activity.</div>
      ) : !current ? (
        <section className="mb-6">
          <h3 className="section-title mb-3">Today</h3>
          {!today.length ? (
            <div className="card text-muted text-sm">No workout scheduled today.</div>
          ) : (
            <div className="space-y-2">
              {today.map((w) => (
                <WorkoutRow key={w.id} workout={w} onOpen={() => navigate(`/training/workouts/${w.id}`)} />
              ))}
            </div>
          )}
        </section>
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

      {!!todayUnavailable && (
        <div className="card text-sm mb-5">
          <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Can’t train · today</div>
          <p className="mb-0">{unavailableLabel(todayUnavailable)}</p>
        </div>
      )}

      {!!todayNotes.length && (
        <div className="card text-sm mb-5">
          <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Coach note · today</div>
          {todayNotes.map((n) => (
            <p key={n.id} className="mb-0">
              <span className="text-muted">{n.coachFirstName} {n.coachLastName}. </span>
              {n.body}
            </p>
          ))}
        </div>
      )}

      <TrainingWeekRecap
        weekStartsOn={user?.weekStartsOn}
        reload={recapReload}
        onOpen={(w) => navigate(`/training/workouts/${w.id}`)}
      />

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <MonthCalendar
          value={selected}
          onChange={setSelected}
          events={events}
          monthDate={month}
          onMonthChange={setMonth}
          mutedDays={mutedDays}
        />
        <TrainingDayWorkouts
          dateLabel={formatDate(selected)}
          workouts={selectedWorkouts}
          emptyText="No planned workout on this day."
          onOpen={(w) => navigate(`/training/workouts/${w.id}`)}
          banner={<AvailabilityBanner row={selectedUnavailable} />}
          note={(
            <>
              <TrainingDayAvailability
                date={selected}
                current={selectedUnavailable}
                onSave={async ({ unavailable: marked, reason, note }) => {
                  await api.put('/training/availability', {
                    date: selected,
                    unavailable: marked,
                    reason,
                    note,
                  });
                  const start = new Date(month.getFullYear(), month.getMonth(), 1);
                  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
                  const { data: fresh } = await api.get('/training/calendar', {
                    params: { from: ymd(start), to: ymd(end) },
                  });
                  setCalendar(fresh.workouts || []);
                  setDayNotes(fresh.dayNotes || []);
                  setUnavailable(fresh.unavailable || []);
                  setRecapReload((n) => n + 1);
                  load();
                }}
              />
              <TrainingDayNote notes={selectedNotes} date={selected} />
            </>
          )}
        />
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
