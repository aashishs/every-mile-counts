import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import Badge from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import {
  activityMetric,
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
  getActivityIcon,
} from '../utils/format';
import { buildActivityMarkdown, copyText } from '../utils/activityMarkdown';

export default function ActivityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isCoach, user } = useAuth();
  const [data, setData] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [form, setForm] = useState({
    performanceSummary: '',
    strengths: '',
    improvements: '',
    technique: '',
    recommendations: '',
    recoveryAdvice: '',
    comments: '',
    rating: 5,
  });
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get(`/activities/${id}`).then((res) => setData(res.data));
    api.get('/coaches/my-coaches').then((res) => setCoaches(res.data.coaches || [])).catch(() => {});
  }, [id]);

  if (!data) {
    return <Layout><p className="text-muted">Loading…</p></Layout>;
  }

  const { activity, insights, athleteInsights, reviews, requests } = data;
  const mine = activity.athleteId === user.id;
  const pendingRequests = (requests || []).filter((r) => r.status === 'pending');
  const hasReview = (reviews || []).length > 0;
  const myReview = (reviews || []).find((r) => r.coachId === user.id);
  const glance = insights || athleteInsights || {};
  const metric = activityMetric(activity.type, activity.sportType, activity.distance);
  const primary = metric === 'swim'
    ? `${Math.round(activity.distance || 0)} m`
    : metric === 'duration'
      ? formatDuration(activity.movingTime || activity.elapsedTime)
      : formatDistance(activity.distance);
  const primaryLabel = metric === 'duration' ? 'Duration' : metric === 'swim' ? 'Distance' : 'Distance';

  const requestReview = async (coachId) => {
    try {
      await api.post('/reviews/request', { activityId: activity.id, coachId });
      const { data: fresh } = await api.get(`/activities/${id}`);
      setData(fresh);
      setMessage('Review requested');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Request failed');
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

  const submitReview = async (e) => {
    e.preventDefault();
    try {
      await api.post('/reviews', { activityId: activity.id, ...form, status: 'published' });
      const { data: fresh } = await api.get(`/activities/${id}`);
      setData(fresh);
      setMessage('Review published');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not save review');
    }
  };

  const stats = metric === 'duration'
    ? [
        { label: 'Duration', value: formatDuration(activity.movingTime || activity.elapsedTime) },
        { label: 'Avg HR', value: activity.avgHeartrate ? `${Math.round(activity.avgHeartrate)}` : '—', unit: activity.avgHeartrate ? 'bpm' : '' },
        { label: 'Max HR', value: activity.maxHeartrate ? `${Math.round(activity.maxHeartrate)}` : '—', unit: activity.maxHeartrate ? 'bpm' : '' },
      ]
    : [
        { label: 'Time', value: formatDuration(activity.movingTime) },
        { label: 'Pace', value: formatPace(activity.avgSpeed).replace(' /km', ''), unit: metric === 'swim' ? '' : '/km' },
        { label: 'Climb', value: `${Math.round(activity.elevationGain || 0)}`, unit: 'm' },
        { label: 'Avg HR', value: activity.avgHeartrate ? `${Math.round(activity.avgHeartrate)}` : '—', unit: activity.avgHeartrate ? 'bpm' : '' },
      ];

  return (
    <Layout>
      <div className="flex justify-end mb-3">
        <button type="button" className="btn-outline btn-sm" onClick={() => navigate('/activities')}>
          Done
        </button>
      </div>

      <div className="hero-week">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="stat-label text-teal-100/70">
              {getActivityIcon(activity.type)} {activity.type} · {formatDate(activity.startDate)}
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
          <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">{activity.source || 'manual'}</span>
          {glance.pace && <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">{glance.pace} /km</span>}
          {glance.heartRateZone?.label && (
            <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">Z{glance.heartRateZone.zone} {glance.heartRateZone.label}</span>
          )}
        </div>
      </div>

      {message && <div className="mb-4 card text-sm text-brand">{message}</div>}

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

      {(insights || athleteInsights) && (
        <section className="mb-6">
          <h3 className="section-title mb-3">Session read</h3>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {glance.paceConsistency && glance.paceConsistency !== 'unknown' && (
              <Insight label="Pace" value={glance.paceConsistency} />
            )}
            {glance.heartRateZone?.label && (
              <Insight label="HR zone" value={`Z${glance.heartRateZone.zone}`} hint={glance.heartRateZone.label} />
            )}
            {glance.trainingLoad != null && (
              <Insight label="Load" value={Math.round(glance.trainingLoad)} />
            )}
          </div>
          {glance.elevationImpact && (
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
          {hasReview ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Reviewed</Badge>
              <span className="text-sm text-muted">A coach has already reviewed this activity.</span>
            </div>
          ) : pendingRequests.length ? (
            <div className="space-y-2">
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
          ) : !coaches.length ? (
            <p className="text-sm text-muted mb-0">No coach yet. Add one from Profile.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {coaches.map((c) => (
                <button key={c.coachId || c.id} className="btn-outline btn-sm" type="button" onClick={() => requestReview(c.coachId || c.id)}>
                  Ask {c.firstName} for review
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {reviews?.length > 0 && (
        <section className="mb-6">
          <h3 className="section-title mb-3">Coach notes</h3>
          {reviews.map((r) => (
            <div key={r.id} className="card mb-3 text-sm space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{r.coachFirstName} {r.coachLastName}</span>
                {r.rating ? <span className="text-accent">{'★'.repeat(r.rating)}</span> : null}
              </div>
              {r.performanceSummary && <p className="mb-0">{r.performanceSummary}</p>}
              {r.strengths && <p className="mb-0 text-muted"><span className="text-slate-100 font-medium">Strengths.</span> {r.strengths}</p>}
              {r.improvements && <p className="mb-0 text-muted"><span className="text-slate-100 font-medium">Work on.</span> {r.improvements}</p>}
              {r.technique && <p className="mb-0 text-muted"><span className="text-slate-100 font-medium">Technique.</span> {r.technique}</p>}
              {r.recommendations && <p className="mb-0 text-muted"><span className="text-slate-100 font-medium">Training.</span> {r.recommendations}</p>}
              {r.recoveryAdvice && <p className="mb-0 text-muted"><span className="text-slate-100 font-medium">Recovery.</span> {r.recoveryAdvice}</p>}
              {r.comments && <p className="mb-0 text-muted">{r.comments}</p>}
            </div>
          ))}
        </section>
      )}

      {isCoach && !mine && !myReview && (
        <form className="card space-y-3" onSubmit={submitReview}>
          <h3 className="section-title">Write review</h3>
          {['performanceSummary', 'strengths', 'improvements', 'technique', 'recommendations', 'recoveryAdvice', 'comments'].map((field) => (
            <div key={field}>
              <label className="capitalize">{field.replace(/([A-Z])/g, ' $1')}</label>
              <textarea rows={2} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
            </div>
          ))}
          <div>
            <label>Rating</label>
            <select value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} className="max-w-xs">
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button className="btn-primary w-full" type="submit">Publish review</button>
        </form>
      )}
    </Layout>
  );
}

function Insight({ label, value, hint }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value text-xl capitalize text-brand">{value}</div>
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
