import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { AthleteGoalsList } from '../components/GoalCard';
import RaceCountdown from '../components/RaceCountdown';
import Layout from '../components/Layout';
import MonthCalendar, { ymd } from '../components/MonthCalendar';
import { AvailabilityBanner, TrainingDayNote, TrainingDayWorkouts, TrainingWeekRecap } from '../components/TrainingPlanGlance';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime, getActivityIcon } from '../utils/format';
import { ViewOnStrava } from '../components/StravaBrand';
import { GOALS_ENABLED } from '../utils/features';
import { nextRaceGoal } from '../utils/goals';
import { calendarEvents, COMPLETION_LABEL, formatKm, notesOnDay, PROGRAM_STATUS_LABEL, statusClass, unavailableDays, unavailableOnDay, ymdToday } from '../utils/training';
import DeployTemplate from '../components/DeployTemplate';

export default function CoachAthleteTraining() {
  const { athleteId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(ymdToday());
  const [calendar, setCalendar] = useState([]);
  const [dayNotes, setDayNotes] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [goals, setGoals] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [deploy, setDeploy] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get(`/training/athletes/${athleteId}`).then((res) => setData(res.data)).catch((err) => {
      setError(err.response?.data?.message || 'Not authorized to view this athlete');
    });
    api.get('/training/templates').then((res) => setTemplates(res.data.templates || [])).catch(() => setTemplates([]));
    api.get('/training/groups').then((res) => setGroups(res.data.groups || [])).catch(() => setGroups([]));
  }, [athleteId]);

  useEffect(() => {
    if (!GOALS_ENABLED) {
      setGoals([]);
      return undefined;
    }
    let cancelled = false;
    api.get('/goals', { params: { athleteId } }).then((res) => {
      if (!cancelled) setGoals(res.data.goals || []);
    }).catch(() => {
      if (!cancelled) setGoals([]);
    });
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  useEffect(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    api.get('/training/calendar', { params: { athleteId, from: ymd(start), to: ymd(end) } }).then((res) => {
      setCalendar(res.data.workouts || []);
      setDayNotes(res.data.dayNotes || []);
      setUnavailable(res.data.unavailable || []);
    }).catch(() => {
      setCalendar([]);
      setDayNotes([]);
      setUnavailable([]);
    });
  }, [athleteId, month]);

  const events = useMemo(
    () => calendarEvents(calendar, dayNotes),
    [calendar, dayNotes]
  );
  const selectedWorkouts = calendar.filter((w) => String(w.scheduledDate).slice(0, 10) === selected);
  const selectedNotes = notesOnDay(dayNotes, selected);
  const selectedUnavailable = unavailableOnDay(unavailable, selected);
  const mutedDays = unavailableDays(unavailable);

  if (error) {
    return <Layout><div className="card text-rose-200">{error}</div></Layout>;
  }
  if (!data) return <Layout><p className="text-muted">Loading…</p></Layout>;

  const { athlete, current, programs, reviews, recentActivities, assignment } = data;
  const clubTemplates = templates.filter((t) => !assignment?.clubId || t.clubId === assignment.clubId);
  const progress = current?.progress;
  const programPath = (p) => (p?.owned ? `/coaches/programs/${p.id}` : `/training/programs/${p.id}`);
  const currentOwned = current && programs?.some((p) => p.id === current.id && p.owned);
  const raceGoal = nextRaceGoal(goals);

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
          <p className="page-sub mb-0">Prescribed vs what they actually ran, rode, or swam</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link to={`/coaches/activities/new?athleteId=${athleteId}`} className="btn-outline no-underline text-center">Assign activity</Link>
          {clubTemplates.length ? (
            <select
              aria-label="Use template"
              defaultValue=""
              onChange={(e) => {
                const t = clubTemplates.find((x) => x.id === e.target.value);
                if (t) setDeploy(t);
                e.target.value = '';
              }}
            >
              <option value="">Use template</option>
              {clubTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : null}
          <Link to="/coaches/programs/new" className="btn-outline no-underline text-center">New program</Link>
        </div>
      </div>
      {msg ? <div className="card mb-4 text-sm">{msg}</div> : null}

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

      {GOALS_ENABLED && (
        <section className="mb-6">
          <RaceCountdown goal={raceGoal} />
          <h3 className="section-title mb-3">Goals</h3>
          <AthleteGoalsList goals={goals} emptyText="This athlete has not shared any goals with you." />
        </section>
      )}

      <TrainingWeekRecap
        athleteId={athleteId}
        weekStartsOn={athlete.weekStartsOn}
        onOpen={(w) => navigate(`/training/workouts/${w.id}`)}
      />

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <MonthCalendar value={selected} onChange={setSelected} events={events} monthDate={month} onMonthChange={setMonth} mutedDays={mutedDays} />
        <TrainingDayWorkouts
          dateLabel={formatDate(selected)}
          workouts={selectedWorkouts}
          emptyText="No workout this day."
          onOpen={(w) => navigate(`/training/workouts/${w.id}`)}
          banner={<AvailabilityBanner row={selectedUnavailable} />}
          note={(
            <TrainingDayNote
              notes={selectedNotes}
              canEdit
              myCoachId={user?.id}
              date={selected}
              onSave={async (body) => {
                const { data: saved } = await api.put('/training/day-notes', {
                  athleteId,
                  date: selected,
                  body,
                });
                setDayNotes((prev) => {
                  const rest = prev.filter(
                    (n) => !(n.coachId === user?.id && String(n.noteDate).slice(0, 10) === selected)
                  );
                  return saved.note ? [...rest, saved.note] : rest;
                });
              }}
            />
          )}
        />
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
            <div key={a.id} className="card flex justify-between mb-2 items-center gap-3">
              <Link to={`/activities/${a.id}`} className="no-underline text-inherit min-w-0 truncate">
                {getActivityIcon(a.type)} {a.name || a.type}
              </Link>
              <span className="text-xs text-muted flex items-center gap-2 shrink-0">
                <ViewOnStrava activity={a} />
                {formatDateTime(a.startDate)}
              </span>
            </div>
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
      {deploy && (
        <DeployTemplate
          template={deploy}
          athletes={[{ athleteId, firstName: athlete.firstName, lastName: athlete.lastName, clubId: assignment?.clubId }]}
          groups={groups}
          defaultAthleteId={athleteId}
          onCancel={() => setDeploy(null)}
          onDone={(result) => {
            setDeploy(null);
            setMsg(`Assigned ${result.assigned} cop${result.assigned === 1 ? 'y' : 'ies'}.`);
            api.get(`/training/athletes/${athleteId}`).then((res) => setData(res.data)).catch(() => {});
          }}
        />
      )}
    </Layout>
  );
}
