import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime, formatDuration, formatActivityPrimary, getActivityIcon } from '../utils/format';
import { COMPLETION_LABEL, formatComparisonValue, formatKm, formatPaceSec, statusClass } from '../utils/training';

export default function WorkoutDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activities, setActivities] = useState([]);
  const [activityId, setActivityId] = useState('');
  const [reviewForm, setReviewForm] = useState({
    performanceSummary: '',
    comments: '',
    rating: 5,
  });
  const [reviewMsg, setReviewMsg] = useState('');

  const load = async () => {
    try {
      const { data: payload } = await api.get(`/training/workouts/${id}`);
      setData(payload);
      setError('');
      if (payload.program?.athleteId || payload.workout?.athleteId) {
        const list = await api.get('/activities', { params: { athleteId: payload.program?.athleteId || payload.workout.athleteId, limit: 20 } });
        setActivities(list.data.activities || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Workout not found');
    }
  };

  useEffect(() => { load(); }, [id]);

  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update workout');
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return (
      <Layout>
        <div className="card text-rose-200">{error}</div>
        <button className="btn-outline mt-4" type="button" onClick={() => navigate(-1)}>Back</button>
      </Layout>
    );
  }
  if (!data) return <Layout><p className="text-muted">Loading…</p></Layout>;

  const { workout, program, comparison, suggested, accepted, reviews, canEdit } = data;
  const isAthlete = user.id === (program?.athleteId || workout.athleteId);
  const workoutPath = program?.id
    ? (canEdit ? `/coaches/programs/${program.id}` : `/training/programs/${program.id}`)
    : (isAthlete ? '/training' : '/coaches/training');
  const myReview = (reviews || []).find((r) => r.coachId === user.id);

  const publishReview = async (e) => {
    e.preventDefault();
    if (!accepted?.activityId) return;
    setBusy(true);
    setReviewMsg('');
    try {
      await api.post('/reviews', {
        activityId: accepted.activityId,
        programId: program?.id || undefined,
        plannedWorkoutId: workout.id,
        ...reviewForm,
        status: 'published',
      });
      setReviewMsg('Review published. Same-club coaches can see it; other clubs cannot.');
      await load();
    } catch (err) {
      setReviewMsg(err.response?.data?.message || 'Could not publish review');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <p className="text-xs text-muted mb-2">
        <Link to={isAthlete ? '/training' : '/coaches/training'} className="text-brand no-underline">Training</Link>
        {' · '}
        <Link to={workoutPath} className="text-brand no-underline">{workout.programName || program.name}</Link>
      </p>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="page-title mb-1">{getActivityIcon(workout.sport)} {workout.name || workout.workoutType}</h2>
          <p className="page-sub mb-0">{formatDate(workout.scheduledDate)} · {workout.workoutType} · {workout.sport}</p>
        </div>
        <span className={`badge ${statusClass(workout.completionStatus)}`}>{COMPLETION_LABEL[workout.completionStatus]}</span>
      </div>
      {error && <div className="card text-rose-200 mb-4">{error}</div>}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h3 className="section-title mb-3">Planned</h3>
          <dl className="space-y-2 text-sm">
            {workout.distance != null && <Row label="Distance" value={formatKm(workout.distance)} />}
            {workout.duration != null && <Row label="Duration" value={formatDuration(workout.duration)} />}
            {workout.targetPace != null && <Row label="Target pace" value={formatPaceSec(workout.targetPace)} />}
            {workout.targetHrZone != null && <Row label="HR zone" value={`Zone ${workout.targetHrZone}`} />}
            {workout.targetHr != null && <Row label="Heart rate" value={`${workout.targetHr} bpm`} />}
            {workout.targetPower != null && <Row label="Power" value={`${workout.targetPower} W`} />}
            {workout.rpe != null && <Row label="RPE" value={workout.rpe} />}
          </dl>
          {workout.warmup && <Block title="Warm-up" text={workout.warmup} />}
          {workout.mainSet && <Block title="Main set" text={workout.mainSet} />}
          {workout.cooldown && <Block title="Cool-down" text={workout.cooldown} />}
          {workout.instructions && <Block title="Instructions" text={workout.instructions} />}
          {workout.coachNotes && <Block title="Coach notes" text={workout.coachNotes} />}
        </div>
        <div className="card">
          <h3 className="section-title mb-3">Actual</h3>
          {!accepted ? (
            <p className="text-muted text-sm">No matched activity yet. After you sync Strava or add a session, we try to match it here.</p>
          ) : (
            <>
              <Link to={`/activities/${accepted.activityId}`} className="font-semibold no-underline text-inherit">
                {accepted.activityName || 'Activity'}
              </Link>
              <div className="text-xs text-muted mb-3">{accepted.source} · {accepted.type}</div>
              <div className="space-y-2">
                {comparison.map((m) => (
                  <div key={m.key} className="flex justify-between text-sm gap-3">
                    <span className="text-muted">{m.label}</span>
                    <span>{formatComparisonValue(m, 'planned')} → {formatComparisonValue(m, 'actual')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {!!suggested?.length && (isAthlete || canEdit) && (
        <section className="card mb-6">
          <h3 className="section-title mb-3">Suggested match</h3>
          {suggested.map((m) => (
            <div key={m.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2">
              <div>
                <div className="font-semibold">{m.activityName}</div>
                <div className="text-xs text-muted">{[formatActivityPrimary(m), `score ${Math.round(m.score)}`].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary btn-sm" disabled={busy} type="button" onClick={() => act(() => api.post(`/training/workouts/${workout.id}/matches/${m.id}/confirm`))}>Confirm</button>
                <button className="btn-outline btn-sm" disabled={busy} type="button" onClick={() => act(() => api.post(`/training/workouts/${workout.id}/matches/${m.id}/reject`))}>Not this</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {(isAthlete || canEdit) && !accepted && (
        <section className="card mb-6">
          <h3 className="section-title mb-3">Link an activity</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
              <option value="">Choose a recent activity</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.type} · {formatDateTime(a.startDate)}
                </option>
              ))}
            </select>
            <button className="btn-outline" type="button" disabled={busy || !activityId} onClick={() => act(() => api.post(`/training/workouts/${workout.id}/link-activity`, { activityId }))}>
              Link
            </button>
            {workout.completionStatus !== 'skipped' && (
              <button className="btn-outline" type="button" disabled={busy} onClick={() => act(() => api.post(`/training/workouts/${workout.id}/skip`))}>
                Skip
              </button>
            )}
          </div>
        </section>
      )}

      {canEdit && accepted && !myReview && (
        <form className="card space-y-3 mb-6" onSubmit={publishReview}>
          <h3 className="section-title">Coach feedback</h3>
          <p className="text-sm text-muted">Published under this plan’s club. Other clubs’ coaches will not see it.</p>
          {reviewMsg && <p className="text-sm text-brand mb-0">{reviewMsg}</p>}
          <div>
            <label>Summary</label>
            <textarea rows={2} value={reviewForm.performanceSummary} onChange={(e) => setReviewForm({ ...reviewForm, performanceSummary: e.target.value })} />
          </div>
          <div>
            <label>Comments</label>
            <textarea rows={2} value={reviewForm.comments} onChange={(e) => setReviewForm({ ...reviewForm, comments: e.target.value })} />
          </div>
          <div>
            <label>Rating</label>
            <select value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })} className="max-w-xs">
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button className="btn-primary" type="submit" disabled={busy}>Publish review</button>
        </form>
      )}

      {!!reviews?.length && (
        <section className="mb-6">
          <h3 className="section-title mb-3">Coach feedback</h3>
          {reviews.map((r) => (
            <div key={r.id} className="card mb-2 text-sm">
              <div className="font-semibold">{r.coachFirstName} {r.coachLastName}{r.clubName ? ` · ${r.clubName}` : ''}</div>
              {r.performanceSummary && <p className="mb-0 mt-1">{r.performanceSummary}</p>}
              {r.comments && <p className="text-muted mb-0 mt-1">{r.comments}</p>}
            </div>
          ))}
        </section>
      )}
    </Layout>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="mb-0 font-medium">{value}</dd>
    </div>
  );
}

function Block({ title, text }) {
  return (
    <div className="mt-4">
      <div className="text-[11px] uppercase tracking-wide text-muted">{title}</div>
      <p className="text-sm mb-0 mt-1 whitespace-pre-wrap">{text}</p>
    </div>
  );
}
