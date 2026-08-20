import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  formatDateShort,
  formatDuration,
  formatEffort,
  formatActivityPrimary,
  getActivityIcon,
} from '../utils/format';
import { PROGRAM_STATUS_LABEL, statusClass } from '../utils/training';

const FILTERS = [
  { id: 'all', label: 'Recent' },
  { id: 'pending', label: 'Needs review' },
  { id: 'reviewed', label: 'Reviewed' },
];

function trainedLabel(date) {
  if (!date) return { text: 'No sessions logged', quiet: true };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const n = Math.round((today - d) / 86400000);
  if (n <= 0) return { text: 'Trained today', quiet: false };
  if (n === 1) return { text: 'Last trained yesterday', quiet: false };
  if (n < 21) return { text: `Last trained ${n} days ago`, quiet: n >= 4 };
  return { text: `Last trained ${formatDateShort(date)}`, quiet: true };
}

function deltaText(comparison) {
  if (!comparison?.hasPrior) return 'No sessions in the prior 30 days';
  const pct = comparison.distancePct || 0;
  if (pct === 0) return 'Same volume as prior 30 days';
  return `${pct > 0 ? '+' : ''}${pct}% vs prior 30 days`;
}

function openActivity(navigate, athleteId, id) {
  navigate(`/activities/${id}`, { state: { fromAthlete: athleteId } });
}

function SessionRow({ activity, athleteId, navigate }) {
  return (
    <button
      type="button"
      className="card w-full text-left hover:border-brand py-3"
      onClick={() => openActivity(navigate, athleteId, activity.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate">
            {getActivityIcon(activity.type)} {activity.name || activity.type || 'Session'}
          </div>
          <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-2">
            <span>{formatDateShort(activity.startDate)}</span>
            <span>{formatActivityPrimary(activity)}</span>
            <span>{formatDuration(activity.movingTime || activity.elapsedTime)}</span>
            {formatEffort(activity) ? <span>{formatEffort(activity)}</span> : null}
            {activity.avgHeartrate ? <span>{Math.round(activity.avgHeartrate)} bpm</span> : null}
          </div>
        </div>
        {activity.reviewedByMe ? (
          <span className="text-[11px] font-semibold text-brand shrink-0">Reviewed</span>
        ) : (
          <span className="text-[11px] font-semibold text-orange-200 shrink-0">Review</span>
        )}
      </div>
    </button>
  );
}

export default function CoachAthleteActivities() {
  const { athleteId } = useParams();
  const { isCoach } = useAuth();
  const navigate = useNavigate();
  const [athlete, setAthlete] = useState(null);
  const [activities, setActivities] = useState([]);
  const [glance, setGlance] = useState(null);
  const [training, setTraining] = useState(null);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const assigned = Boolean(athlete);

  useEffect(() => {
    if (!isCoach) navigate('/coaches', { replace: true });
  }, [isCoach, navigate]);

  useEffect(() => {
    if (!isCoach) return undefined;
    let cancelled = false;
    setError('');
    setAthlete(null);
    setGlance(null);
    setTraining(null);
    setActivities([]);
    api.get('/coaches/my-athletes', { params: { athleteId } }).then((res) => {
      if (cancelled) return;
      const found = (res.data.athletes || []).find(
        (a) => String(a.athleteId || a.id) === String(athleteId)
      );
      if (!found) {
        setError('This athlete is not assigned to you.');
        setLoading(false);
        return;
      }
      setAthlete(found);
    }).catch((err) => {
      if (!cancelled) {
        setError(err.response?.data?.message || 'Could not load athlete');
        setLoading(false);
      }
    });
    api.get(`/training/athletes/${athleteId}`).then((res) => {
      if (!cancelled) setTraining(res.data);
    }).catch(() => {
      if (!cancelled) setTraining(null);
    });
    return () => {
      cancelled = true;
    };
  }, [athleteId, isCoach]);

  useEffect(() => {
    if (!isCoach || !assigned) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/activities/athlete/${athleteId}`, {
          params: { page, limit, review: filter, sort: 'date', dir: 'desc' },
        });
        if (cancelled) return;
        setActivities(data.activities || []);
        setGlance(data.glance || null);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
        setPendingTotal(data.pendingTotal || 0);
        if (data.page && data.page !== page) setPage(data.page);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Could not load activities');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [athleteId, isCoach, assigned, page, limit, filter]);

  const changeFilter = (next) => {
    setFilter(next);
    setPage(1);
  };

  const name = athlete ? `${athlete.firstName} ${athlete.lastName}` : 'Athlete';
  const lastDate = glance?.lastActivity?.startDate || athlete?.lastActivityAt;
  const trained = trainedLabel(lastDate);
  const plan = training?.current;
  const nextWorkout = training?.toPrepare?.[0];
  const week = glance?.thisWeek;
  const month = glance?.last30;

  return (
    <Layout>
      <p className="text-xs text-muted mb-2">
        <Link to="/coaches" className="text-brand no-underline">Coaching</Link>
        {' · '}
        <Link to={`/coaches/athletes/${athleteId}/training`} className="text-brand no-underline">Training</Link>
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h2 className="page-title mb-1">{name}</h2>
          <p className={`page-sub mb-0 ${trained.quiet ? 'text-orange-200' : ''}`}>
            {trained.text}
            {athlete?.mafHeartRate ? ` · MAF ${athlete.mafHeartRate}` : ''}
            {athlete?.age ? ` · age ${athlete.age}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link to={`/coaches/activities/new?athleteId=${athleteId}`} className="btn-outline btn-sm no-underline">
            Schedule session
          </Link>
          <Link to={`/coaches/athletes/${athleteId}/training`} className="btn-primary btn-sm no-underline">
            Training
          </Link>
        </div>
      </div>

      {error && <div className="card mb-4 text-sm text-orange-300">{error}</div>}

      {!error && glance && (
        <>
          <div className="hero-week">
            <div className="stat-label text-teal-100/70">This week</div>
            <div className="font-display text-5xl md:text-6xl font-bold tracking-tight mt-2 text-white">
              {week?.count ? week.formatted.distance : '—'}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">
                {week?.count || 0} session{(week?.count || 0) === 1 ? '' : 's'}
              </span>
              <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">
                {week?.count ? week.formatted.time : '0m'}
              </span>
              <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">
                {glance.consistency || 0}% consistent · 30d
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-5">
            <button type="button" className="stat-card text-left" onClick={() => changeFilter('all')}>
              <div className="stat-label">Last 30 days</div>
              <div className="stat-value text-lg md:text-2xl">{month?.formatted.distance || '—'}</div>
              <div className="text-[11px] text-muted mt-1">{month?.count || 0} sessions · {deltaText(glance.comparison)}</div>
            </button>
            <button
              type="button"
              className={`stat-card text-left ${filter === 'pending' ? 'ring-1 ring-brand' : ''}`}
              onClick={() => changeFilter(pendingTotal ? 'pending' : 'all')}
            >
              <div className="stat-label">Needs review</div>
              <div className={`stat-value text-lg md:text-2xl ${pendingTotal ? 'text-orange-200' : ''}`}>{pendingTotal}</div>
              <div className="text-[11px] text-muted mt-1">{pendingTotal ? 'Tap to see them' : 'You are up to date'}</div>
            </button>
            <div className="stat-card">
              <div className="stat-label">All sessions</div>
              <div className="stat-value text-lg md:text-2xl">{athlete?.activityCount ?? total}</div>
              <div className="text-[11px] text-muted mt-1">Open any row for maps, splits, review</div>
            </div>
          </div>

          {!!glance.byType?.length && (
            <div className="flex flex-wrap gap-2 mb-5">
              {glance.byType.slice(0, 4).map((row) => (
                <span key={row.type} className="badge">
                  {getActivityIcon(row.type)} {row.type} · {row.count} · {row.formatted.distance}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {!error && plan && (
        <Link
          to={`/coaches/athletes/${athleteId}/training`}
          className="card mb-5 flex items-center justify-between gap-3 text-inherit no-underline hover:border-brand"
        >
          <div className="min-w-0">
            <div className="stat-label">{plan.status === 'active' ? 'Current plan' : 'Latest plan'}</div>
            <div className="font-semibold truncate mt-1">{plan.name}</div>
            <div className="text-xs text-muted mt-1">
              {plan.progress ? `${plan.progress.adherencePct || 0}% adherence · ${plan.progress.completedWorkouts || 0}/${plan.progress.totalWorkouts || 0} done` : PROGRAM_STATUS_LABEL[plan.status]}
              {nextWorkout ? ` · Next ${nextWorkout.name || nextWorkout.workoutType}` : ''}
            </div>
          </div>
          <span className={`badge shrink-0 ${statusClass(plan.status)}`}>{PROGRAM_STATUS_LABEL[plan.status]}</span>
        </Link>
      )}

      {!error && glance?.lastActivity && filter === 'all' && page === 1 && (
        <button
          type="button"
          className="card w-full text-left mb-5 hover:border-brand"
          onClick={() => openActivity(navigate, athleteId, glance.lastActivity.id)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="stat-label">Last session</div>
              <div className="font-display text-2xl font-bold tracking-tight mt-1">
                {getActivityIcon(glance.lastActivity.type)} {glance.lastActivity.name || glance.lastActivity.type}
              </div>
              <div className="text-sm text-muted mt-2 flex flex-wrap gap-x-3 gap-y-1">
                <span>{formatDateShort(glance.lastActivity.startDate)}</span>
                <span>{formatActivityPrimary(glance.lastActivity)}</span>
                <span>{formatDuration(glance.lastActivity.movingTime || glance.lastActivity.elapsedTime)}</span>
                {formatEffort(glance.lastActivity) ? <span>{formatEffort(glance.lastActivity)}</span> : null}
                {glance.lastActivity.avgHeartrate ? <span>{Math.round(glance.lastActivity.avgHeartrate)} bpm</span> : null}
              </div>
            </div>
            <span className="text-sm font-semibold shrink-0">
              {glance.lastActivity.reviewedByMe ? (
                <span className="text-brand">Reviewed</span>
              ) : (
                <span className="text-orange-200">Review</span>
              )}
            </span>
          </div>
        </button>
      )}

      {!error && filter === 'all' && glance?.needsReview?.some((a) => a.id !== glance.lastActivity?.id) && (
        <section className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="section-title mb-0">Needs your review</h3>
            {pendingTotal > glance.needsReview.length ? (
              <button type="button" className="text-sm text-brand bg-transparent border-0 p-0" onClick={() => changeFilter('pending')}>
                All {pendingTotal}
              </button>
            ) : null}
          </div>
          <div className="space-y-2">
            {glance.needsReview.filter((act) => act.id !== glance.lastActivity?.id).map((act) => (
              <SessionRow key={act.id} activity={act} athleteId={athleteId} navigate={navigate} />
            ))}
          </div>
        </section>
      )}

      {!error && (
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <h3 className="section-title mb-0">Sessions</h3>
            <div className="chip-row mb-0">
              {FILTERS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`btn-sm ${filter === opt.id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => changeFilter(opt.id)}
                >
                  {opt.label}{opt.id === 'pending' && pendingTotal ? ` ${pendingTotal}` : ''}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-muted">Loading…</p>
          ) : !activities.length ? (
            <div className="card text-muted text-sm">
              {total === 0 && filter === 'all'
                ? 'No activities yet for this athlete.'
                : filter === 'pending'
                  ? 'Nothing waiting for your review.'
                  : 'No reviewed sessions yet.'}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {activities.map((act) => (
                  <SessionRow key={act.id} activity={act} athleteId={athleteId} navigate={navigate} />
                ))}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
                <p className="text-xs text-muted mb-0">
                  {total} session{total === 1 ? '' : 's'} · Page {page} of {pages}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button className="btn-outline btn-sm" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </button>
                  <button className="btn-outline btn-sm" type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </Layout>
  );
}
