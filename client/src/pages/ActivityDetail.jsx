import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import Badge from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import {
  activityMetric,
  effortStat,
  formatActivityPrimary,
  formatDate,
  formatDateTime,
  formatDuration,
  formatEffort,
  getActivityIcon,
} from '../utils/format';
import { buildActivityMarkdown, copyText } from '../utils/activityMarkdown';
import { formatComparisonValue } from '../utils/training';
import ActivitySplits from '../components/ActivitySplits';
import { PoweredByStrava, ViewOnStrava } from '../components/StravaBrand';
import CoachReviewForm, { PublishedReviews } from '../components/CoachReviewForm';
import { activityOriginLabel } from '../utils/activityOrigin';

export default function ActivityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isCoach, user } = useAuth();
  const [data, setData] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [reviewCoachId, setReviewCoachId] = useState('');
  const [asking, setAsking] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [similar, setSimilar] = useState(null);
  const [pickedSimilar, setPickedSimilar] = useState([]);

  useEffect(() => {
    setLoadError('');
    setSimilar(null);
    setPickedSimilar([]);
    api.get(`/activities/${id}`).then((res) => setData(res.data)).catch((err) => {
      setLoadError(err.response?.data?.message || 'Could not load this session');
    });
    api.get(`/activities/${id}/similar`).then((res) => setSimilar(res.data)).catch(() => {
      setSimilar({ supported: false, activities: [] });
    });
    api.get('/coaches/my-coaches').then((res) => setCoaches(res.data.coaches || [])).catch(() => {});
  }, [id]);

  if (loadError) {
    const shareBlocked = /not shared Strava/i.test(loadError);
    return (
      <Layout>
        <div className="card">
          <h2 className="section-title mb-2">{shareBlocked ? 'Strava sessions are private' : 'Could not load this session'}</h2>
          <p className="text-sm text-muted mb-4">
            {shareBlocked
              ? 'This athlete has not allowed assigned coaches to view activities imported from Strava. Manual and file-imported sessions are still available.'
              : loadError}
          </p>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => navigate(isCoach ? '/coaches' : '/activities')}
          >
            Back
          </button>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return <Layout><p className="text-muted">Loading…</p></Layout>;
  }

  const { activity, insights, athleteInsights, reviews, requests, plannedWorkout } = data;
  const mine = activity.athleteId === user.id;
  const pendingRequests = (requests || []).filter((r) => r.status === 'pending');
  const hasReview = (reviews || []).length > 0;
  const myReview = (reviews || []).find((r) => r.coachId === user.id);
  const myPendingRequest = (requests || []).find((r) => r.status === 'pending' && r.coachId === user.id);
  const coachIdOf = (c) => c.coachId || c.id;
  const pendingCoachIds = new Set(pendingRequests.map((r) => r.coachId));
  const reviewedCoachIds = new Set((reviews || []).map((r) => r.coachId));
  const availableCoaches = coaches.filter((c) => {
    const id = coachIdOf(c);
    return id && !pendingCoachIds.has(id) && !reviewedCoachIds.has(id);
  });
  const selectedCoachId = availableCoaches.some((c) => coachIdOf(c) === reviewCoachId)
    ? reviewCoachId
    : '';
  const glance = insights || athleteInsights || {};
  const metric = activityMetric(activity.type, activity.sportType);
  const effort = effortStat(activity);
  const primary = formatActivityPrimary(activity);
  const primaryLabel = metric === 'duration' ? 'Duration' : metric === 'swim' ? 'Distance' : 'Distance';

  const requestReview = async (coachId) => {
    if (!coachId) {
      setMessage('Select a coach');
      return;
    }
    setAsking(true);
    try {
      await api.post('/reviews/request', { activityId: activity.id, coachId });
      const { data: fresh } = await api.get(`/activities/${id}`);
      setData(fresh);
      setReviewCoachId('');
      setMessage('Review requested');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Request failed');
    } finally {
      setAsking(false);
    }
  };

  const copyForAi = async () => {
    const markdown = buildActivityMarkdown(activity, glance);
    const ok = await copyText(markdown);
    if (ok) {
      setCopied(true);
      setMessage('Copied — paste into ChatGPT, Gemini, or Claude to get this session reviewed.');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setMessage('Could not copy. Try again, or copy from the prompt if it appears.');
    }
  };

  const stats = metric === 'duration'
    ? [
        Number(activity.calories) > 0
          ? { label: 'Calories', value: `${Math.round(activity.calories)}`, unit: 'kcal' }
          : null,
        activity.avgHeartrate
          ? { label: 'Avg HR', value: `${Math.round(activity.avgHeartrate)}`, unit: 'bpm' }
          : null,
        activity.maxHeartrate
          ? { label: 'Max HR', value: `${Math.round(activity.maxHeartrate)}`, unit: 'bpm' }
          : null,
      ].filter(Boolean)
    : [
        { label: 'Time', value: formatDuration(activity.movingTime || activity.elapsedTime) },
        effort.label ? { label: effort.label, value: effort.value, unit: effort.unit } : null,
        Number(activity.elevationGain) > 0
          ? { label: 'Climb', value: `${Math.round(activity.elevationGain)}`, unit: 'm' }
          : null,
        activity.avgHeartrate
          ? { label: 'Avg HR', value: `${Math.round(activity.avgHeartrate)}`, unit: 'bpm' }
          : null,
      ].filter(Boolean);

  return (
    <Layout>
      <div className="flex items-center justify-between gap-3 mb-3">
        <ViewOnStrava activity={activity} />
        <button
          type="button"
          className="btn-outline btn-sm shrink-0"
          onClick={() => navigate(
            isCoach && !mine
              ? `/coaches/athletes/${activity.athleteId}`
              : '/activities'
          )}
        >
          Done
        </button>
      </div>

      <div className="hero-week">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="stat-label text-teal-100/70">
              {getActivityIcon(activity.type)} {activity.type} · {formatDateTime(activity.startDate)}
              {isCoach && !mine && activity.mafHeartRate
                ? ` · MAF ${activity.mafHeartRate} bpm`
                : ''}
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white mt-2 leading-tight">
              {activity.name}
            </h2>
          </div>
          <span className="text-4xl shrink-0">{getActivityIcon(activity.type)}</span>
        </div>
        <div className="font-display text-5xl md:text-6xl font-bold tracking-tight text-white mt-5 leading-none">
          {primary}
        </div>
        <div className="stat-label text-teal-100/70 mt-2">{primaryLabel}</div>
        <div className="flex flex-wrap gap-2 mt-5">
          <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">
            {activityOriginLabel(activity)}
            {activity.origin?.filename ? ` · ${activity.origin.filename}` : ''}
          </span>
          {formatEffort(activity) && formatEffort(activity) !== '—' && (
            <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">{formatEffort(activity)}</span>
          )}
          {glance.heartRateZone?.label && (
            <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">Z{glance.heartRateZone.zone} {glance.heartRateZone.label}</span>
          )}
        </div>
      </div>

      {message && (
        <div className="alert-success mb-6">{message}</div>
      )}

      {plannedWorkout && (
        <section className="card mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="section-title mb-1">Planned vs actual</h3>
              <p className="text-sm text-muted mb-0">
                Matched to {plannedWorkout.name || plannedWorkout.workoutType}
                {plannedWorkout.programName ? ` · ${plannedWorkout.programName}` : ''}
              </p>
            </div>
            <Link to={`/training/workouts/${plannedWorkout.id}`} className="btn-outline btn-sm no-underline shrink-0">
              Workout
            </Link>
          </div>
          <div className="space-y-2 text-sm">
            {(plannedWorkout.comparison || []).map((m) => (
              <div key={m.key} className="flex justify-between gap-3">
                <span className="text-muted">{m.label}</span>
                <span>{formatComparisonValue(m, 'planned')} → {formatComparisonValue(m, 'actual')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2 mb-5">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value text-brand">
              {s.value}
              {s.unit ? <span className="text-sm text-muted font-sans font-semibold ml-1">{s.unit}</span> : null}
            </div>
          </div>
        ))}
      </div>

      {activity.source === 'strava' && (
        <p className="mb-6">
          <ViewOnStrava activity={activity} />
        </p>
      )}
      <ActivitySplits activity={activity} />

      {similar?.supported && (
      <section className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="section-title mb-0">{similar.heading || 'Similar sessions'}</h3>
          <button
            type="button"
            className="btn-outline btn-sm shrink-0"
            disabled={pickedSimilar.length < 1 || pickedSimilar.length > 2}
            onClick={() => navigate(
              `/activities/compare?a=${activity.id}&b=${pickedSimilar[0]}${pickedSimilar[1] ? `&c=${pickedSimilar[1]}` : ''}&from=/activities/${activity.id}`
            )}
          >
            Compare {pickedSimilar.length ? pickedSimilar.length + 1 : ''}
          </button>
        </div>
        <p className="text-xs text-muted mb-3">
          Same route, or the same title at a matching distance
          {Number(activity.elevationGain) >= 200 ? ', or a similar climb' : ''}. Select 1 or 2 to compare.
        </p>
        {!similar.activities?.length ? (
          <div className="card text-muted text-sm">
            No matching {String(similar.heading || 'Similar sessions').replace(/^Similar /i, '')} yet.
          </div>
        ) : (
          <div className="space-y-2">
            {similar.activities.map((act) => {
              const checked = pickedSimilar.includes(act.id);
              return (
                <div key={act.id} className="card flex items-center gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={`Select ${act.name || 'session'} to compare`}
                    onChange={() => {
                      setPickedSimilar((prev) => {
                        if (prev.includes(act.id)) return prev.filter((id) => id !== act.id);
                        if (prev.length >= 2) return prev;
                        return [...prev, act.id];
                      });
                    }}
                  />
                  <Link to={`/activities/${act.id}`} className="min-w-0 flex-1 text-inherit no-underline">
                    <div className="font-semibold truncate">{act.name || 'Session'}</div>
                    <div className="text-xs text-muted mt-1">
                      {formatDateTime(act.startDate)} · {act.size || formatActivityPrimary(act)}
                      {act.why ? ` · ${act.why}` : ''}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {(insights || athleteInsights) && (
        <section className="mb-6">
          <h3 className="section-title mb-3">Session read</h3>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {glance.paceConsistency && glance.paceConsistency !== 'unknown' && effort.kind !== 'duration' && (
              <Insight label={effort.kind === 'speed' ? 'Speed' : 'Pace'} value={glance.paceConsistency} />
            )}
            {glance.heartRateZone?.label && (
              <Insight label="HR zone" value={`Z${glance.heartRateZone.zone}`} hint={glance.heartRateZone.label} />
            )}
            {glance.mafCheck && (
              <Insight
                label="MAF"
                value={glance.mafCheck.label}
                plain
                hint={
                  glance.mafCheck.maxAboveMaf
                    ? `MAF ${glance.mafCheck.mafHeartRate} bpm · max ${glance.mafCheck.maxHeartrate} spiked above`
                    : `MAF ${glance.mafCheck.mafHeartRate} bpm (180 − age)`
                }
              />
            )}
            {glance.trainingLoad != null && (
              <Insight label="Load" value={Math.round(glance.trainingLoad)} />
            )}
          </div>
          {glance.elevationImpact && effort.kind !== 'duration' && (
            <div className="card mb-2 text-sm text-muted">{glance.elevationImpact}</div>
          )}
          {glance.recoveryRecommendation && (
            <div className="race-card">
              <div className="stat-label text-orange-200/80">Recovery</div>
              <p className="text-sm mt-2 mb-0">{glance.recoveryRecommendation}</p>
            </div>
          )}
        </section>
      )}

      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="section-title mb-1">Ask AI for a review</h3>
            <p className="text-sm text-muted mb-0">
              Copy the AI prompt here and paste it into ChatGPT, Gemini, Claude, or any AI to get this session reviewed.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary shrink-0 px-5 py-3 text-base"
            onClick={copyForAi}
            title={copied ? 'Copied' : 'Copy AI prompt'}
            aria-label="Copy AI prompt to get this session reviewed"
          >
            {copied ? <CheckIcon size={22} /> : <CopyIcon size={22} />}
            {copied ? 'Copied' : 'Copy AI prompt'}
          </button>
        </div>
      </div>

      {mine && (
        <div className="card mb-6">
          <h3 className="section-title mb-3">Coach review</h3>
          {hasReview && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant="success">Reviewed</Badge>
              <span className="text-sm text-muted">A coach has already reviewed this activity.</span>
            </div>
          )}
          {pendingRequests.length > 0 && (
            <div className="space-y-2 mb-3">
              {pendingRequests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="warning">Review requested</Badge>
                  <span className="text-sm text-muted">
                    Waiting on {r.coachFirstName} {r.coachLastName}
                    {r.requestedAt ? ` · ${formatDate(r.requestedAt)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          {!coaches.length ? (
            <p className="text-sm text-muted mb-0">No coach yet. Add one from Profile, or ask your club admin to assign a coach.</p>
          ) : availableCoaches.length === 0 ? null : coaches.length === 1 ? (
            <button
              className="btn-outline btn-sm"
              type="button"
              disabled={asking}
              onClick={() => requestReview(coachIdOf(availableCoaches[0]))}
            >
              {asking ? 'Sending…' : 'Ask coach for review'}
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <select
                className="sm:max-w-xs"
                value={selectedCoachId}
                onChange={(e) => setReviewCoachId(e.target.value)}
                aria-label="Select a coach"
              >
                <option value="">Select a coach</option>
                {availableCoaches.map((c) => (
                  <option key={coachIdOf(c)} value={coachIdOf(c)}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
              <button
                className="btn-outline btn-sm sm:w-auto"
                type="button"
                disabled={asking || !selectedCoachId}
                onClick={() => requestReview(selectedCoachId)}
              >
                {asking ? 'Sending…' : 'Ask for review'}
              </button>
            </div>
          )}
        </div>
      )}

      <PublishedReviews reviews={reviews} />

      {isCoach && !mine && !myReview && (
        <CoachReviewForm
          activityId={activity.id}
          requestId={myPendingRequest?.id}
          programId={plannedWorkout?.programId}
          plannedWorkoutId={plannedWorkout?.id}
          onPublished={async () => {
            const { data: fresh } = await api.get(`/activities/${id}`);
            setData(fresh);
            setMessage('Review published');
          }}
        />
      )}
      {activity.source === 'strava' && (
        <div className="mt-8 mb-8">
          <PoweredByStrava />
        </div>
      )}
    </Layout>
  );
}

function Insight({ label, value, hint, plain }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value text-xl text-brand ${plain ? '' : 'capitalize'}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted mt-1">{hint}</div>}
    </div>
  );
}

function CopyIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
