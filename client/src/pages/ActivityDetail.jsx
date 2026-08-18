import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDistance, formatDuration, formatPace, activityMetric } from '../utils/format';

export default function ActivityDetail() {
  const { id } = useParams();
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

  useEffect(() => {
    api.get(`/activities/${id}`).then((res) => setData(res.data));
    api.get('/coaches/my-coaches').then((res) => setCoaches(res.data.coaches || [])).catch(() => {});
  }, [id]);

  if (!data) {
    return <Layout><p className="text-muted">Loading…</p></Layout>;
  }

  const { activity, insights, athleteInsights, reviews } = data;
  const mine = activity.athleteId === user.id;

  const requestReview = async (coachId) => {
    try {
      await api.post('/reviews/request', { activityId: activity.id, coachId });
      setMessage('Review requested');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Request failed');
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

  return (
    <Layout>
      <h2 className="page-title">{activity.name}</h2>
      <p className="page-sub">{formatDate(activity.startDate)} · {activity.type} · {activity.source}</p>
      {message && <div className="mb-4 card text-sm text-brand">{message}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {activityMetric(activity.type, activity.sportType, activity.distance) === 'duration' ? (
          <>
            <Metric label="Duration" value={formatDuration(activity.movingTime || activity.elapsedTime)} />
            <Metric label="Calories" value={activity.calories ? `${Math.round(activity.calories)} kcal` : '—'} />
            <Metric label="Avg HR" value={activity.avgHeartrate ? `${Math.round(activity.avgHeartrate)} bpm` : '—'} />
            <Metric label="Max HR" value={activity.maxHeartrate ? `${Math.round(activity.maxHeartrate)} bpm` : '—'} />
          </>
        ) : (
          <>
            <Metric label="Distance" value={activityMetric(activity.type, activity.sportType, activity.distance) === 'swim' ? `${Math.round(activity.distance || 0)} m` : formatDistance(activity.distance)} />
            <Metric label="Moving time" value={formatDuration(activity.movingTime)} />
            <Metric label="Pace" value={formatPace(activity.avgSpeed)} />
            <Metric label="Elevation" value={`${Math.round(activity.elevationGain || 0)} m`} />
            <Metric label="Avg HR" value={activity.avgHeartrate ? `${Math.round(activity.avgHeartrate)} bpm` : '—'} />
            <Metric label="Cadence" value={activity.avgCadence ? Math.round(activity.avgCadence) : '—'} />
            <Metric label="Power" value={activity.avgPower ? `${Math.round(activity.avgPower)} W` : '—'} />
            <Metric label="Calories" value={activity.calories ? Math.round(activity.calories) : '—'} />
          </>
        )}
      </div>

      {(athleteInsights || insights) && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-2">Insights</h3>
          {insights ? (
            <ul className="text-sm space-y-1 text-muted">
              <li>Pace consistency: {insights.paceConsistency}</li>
              <li>HR zone: {insights.heartRateZone?.label || '—'}</li>
              <li>Cadence: {insights.cadenceEfficiency || '—'}</li>
              <li>{insights.elevationImpact}</li>
              <li>Training load: {insights.trainingLoad}</li>
              <li>{insights.recoveryRecommendation}</li>
            </ul>
          ) : (
            <p className="text-sm text-muted">{athleteInsights.recoveryRecommendation}</p>
          )}
        </div>
      )}

      {mine && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-3">Request coach review</h3>
          {!coaches.length ? (
            <p className="text-sm text-muted">No assigned coaches yet. Join a club or wait for a club admin to assign one.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {coaches.map((c) => (
                <button key={c.coachId || c.id} className="btn-outline btn-sm" onClick={() => requestReview(c.coachId || c.id)}>
                  Ask {c.firstName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {reviews?.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Coach reviews</h3>
          {reviews.map((r) => (
            <div key={r.id} className="card mb-3 text-sm space-y-1">
              <div className="font-semibold text-brand">{r.coachFirstName} {r.coachLastName} {r.rating ? `· ${'★'.repeat(r.rating)}` : ''}</div>
              {r.performanceSummary && <p>{r.performanceSummary}</p>}
              {r.strengths && <p><strong>Strengths:</strong> {r.strengths}</p>}
              {r.improvements && <p><strong>Improve:</strong> {r.improvements}</p>}
              {r.technique && <p><strong>Technique:</strong> {r.technique}</p>}
              {r.recommendations && <p><strong>Training:</strong> {r.recommendations}</p>}
              {r.recoveryAdvice && <p><strong>Recovery:</strong> {r.recoveryAdvice}</p>}
              {r.comments && <p>{r.comments}</p>}
            </div>
          ))}
        </div>
      )}

      {isCoach && !mine && (
        <form className="card space-y-3" onSubmit={submitReview}>
          <h3 className="font-semibold">Write review</h3>
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
          <button className="btn-primary" type="submit">Publish review</button>
        </form>
      )}
    </Layout>
  );
}

function Metric({ label, value }) {
  return (
    <div className="stat-card">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-bold text-brand">{value}</div>
    </div>
  );
}
