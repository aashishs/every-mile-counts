import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import CoachReviewForm, { PublishedReviews } from '../components/CoachReviewForm';
import { useAuth } from '../context/AuthContext';
import { buildComparePrompt, copyText } from '../utils/activityMarkdown';
import {
  formatActivityPrimary,
  formatDateTime,
  getActivityIcon,
  sportFamily,
} from '../utils/format';
import { activityOriginLabel } from '../utils/activityOrigin';

function idsFromParams(searchParams) {
  const fromIds = String(searchParams.get('ids') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (fromIds.length) return [...new Set(fromIds)].slice(0, 3);
  return ['a', 'b', 'c'].map((key) => searchParams.get(key) || '').filter(Boolean);
}

export default function CompareActivities() {
  const navigate = useNavigate();
  const { user, isCoach } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = idsFromParams(searchParams);
  const [options, setOptions] = useState([]);
  const [picked, setPicked] = useState([selected[0] || '', selected[1] || '', selected[2] || '']);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviewId, setReviewId] = useState(null);
  const [reviewDetail, setReviewDetail] = useState(null);
  const [reviewedIds, setReviewedIds] = useState([]);

  useEffect(() => {
    setPicked([selected[0] || '', selected[1] || '', selected[2] || '']);
  }, [selected.join('|')]);

  useEffect(() => {
    const loadList = async () => {
      try {
        let athleteId;
        let sport;
        const seed = selected[0];
        if (seed) {
          const { data: detail } = await api.get(`/activities/${seed}`);
          athleteId = detail.activity?.athleteId;
          sport = sportFamily(detail.activity) || detail.activity?.type;
        }
        const params = { limit: 100, page: 1 };
        if (athleteId) params.athleteId = athleteId;
        if (sport) params.type = sport;
        const { data: list } = await api.get('/activities', { params });
        setOptions(list.activities || []);
      } catch {
        setOptions([]);
      }
    };
    loadList();
  }, [selected[0]]);

  const typeA = sportFamily(options.find((act) => act.id === picked[0])) || data?.sport;
  const otherOptions = useMemo(() => {
    return options.filter((act) => {
      if (!picked[0] || act.id === picked[0]) return false;
      if (!typeA) return true;
      return sportFamily(act) === typeA;
    });
  }, [options, picked[0], typeA]);

  useEffect(() => {
    const ids = picked.filter(Boolean);
    const unique = [...new Set(ids)];
    if (unique.length < 2 || unique.length !== ids.length) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setErr('');
    api.get('/activities/compare', { params: { ids: unique.join(',') } })
      .then((res) => {
        if (!cancelled) {
          setData(res.data);
          setReviewedIds(res.data.reviewedIds || []);
          setReviewId(null);
          setReviewDetail(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setData(null);
          setErr(error.response?.data?.message || 'Could not compare these sessions.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [picked.join('|')]);

  useEffect(() => {
    if (!data?.sessions) return;
    setOptions((prev) => {
      const extra = data.sessions.filter((s) => s?.id && !prev.some((p) => p.id === s.id));
      return extra.length ? [...extra, ...prev] : prev;
    });
  }, [data]);

  const apply = (next) => {
    const ids = next.filter(Boolean);
    const params = {};
    ids.forEach((id, i) => { params[['a', 'b', 'c'][i]] = id; });
    const from = searchParams.get('from');
    if (from) params.from = from;
    setSearchParams(params);
  };

  const donePath = searchParams.get('from') && String(searchParams.get('from')).startsWith('/')
    ? searchParams.get('from')
    : picked[0]
      ? `/activities/${picked[0]}`
      : '/activities';

  const copyPrompt = async () => {
    const prompt = buildComparePrompt(data);
    if (!prompt) return;
    const ok = await copyText(prompt);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const canReview = Boolean(isCoach && data?.canReview && data.athleteId && data.athleteId !== user?.id);

  useEffect(() => {
    if (!reviewId || !canReview) {
      setReviewDetail(null);
      return undefined;
    }
    let cancelled = false;
    api.get(`/activities/${reviewId}`).then((res) => {
      if (!cancelled) setReviewDetail(res.data);
    }).catch(() => {
      if (!cancelled) setReviewDetail(null);
    });
    return () => { cancelled = true; };
  }, [reviewId, canReview]);

  useEffect(() => {
    if (!reviewId) return undefined;
    const el = document.getElementById('compare-review');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return undefined;
  }, [reviewId]);

  const labels = ['First session', 'Second session', 'Third session (optional)'];
  const reviewSession = data?.sessions?.find((session) => session.id === reviewId);
  const myPendingRequest = (reviewDetail?.requests || []).find(
    (r) => r.status === 'pending' && r.coachId === user?.id
  );
  const myReview = (reviewDetail?.reviews || []).find((r) => r.coachId === user?.id);

  return (
    <Layout>
      <div className="flex justify-end mb-3">
        <button type="button" className="btn-outline btn-sm" onClick={() => navigate(donePath)}>
          Done
        </button>
      </div>
      <h2 className="page-title">Compare</h2>
      <p className="page-sub">2 or 3 sessions of the same type. Route, title, or climb matches work best.</p>

      <div className="card grid md:grid-cols-3 gap-3 mb-5">
        {labels.map((label, index) => (
          <div key={label}>
            <label htmlFor={`compare${index}`}>{label}</label>
            <select
              id={`compare${index}`}
              value={picked[index]}
              disabled={index > 0 && !picked[0]}
              onChange={(e) => {
                const next = [...picked];
                next[index] = e.target.value;
                if (index === 0) {
                  next[1] = next[1] === e.target.value ? '' : next[1];
                  next[2] = next[2] === e.target.value ? '' : next[2];
                }
                setPicked(next);
                apply(next);
              }}
            >
              <option value="">{index === 2 ? 'None' : index === 0 ? 'Select activity' : 'Select matching activity'}</option>
              {(index === 0 ? options : otherOptions.filter((act) => act.id !== picked[index === 1 ? 2 : 1])).map((act) => (
                <option key={act.id} value={act.id}>
                  {formatDateTime(act.startDate)} · {act.name} · {formatActivityPrimary(act)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {err && <div className="card mb-4 text-sm text-orange-200">{err}</div>}
      {loading && <p className="text-muted">Comparing…</p>}

      {data && !loading && (
        <>
          <div className="mb-5 rounded-2xl border border-line bg-white/5 p-4 text-sm text-slate-100">
            {data.headline}
          </div>

          <div className={`grid gap-3 mb-5 ${data.sessions.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {data.sessions.map((session, index) => (
              <SessionCard
                key={session.id}
                label={index === 0 ? 'Oldest' : index === data.sessions.length - 1 ? 'Newest' : 'Middle'}
                session={session}
                reviewable={canReview}
                reviewing={reviewId === session.id}
                alreadyReviewed={reviewedIds.includes(session.id)}
                onReview={() => setReviewId((id) => (id === session.id ? null : session.id))}
              />
            ))}
          </div>

          <div className="card overflow-x-auto mb-5">
            <h3 className="section-title mb-3">Comparison</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2 font-medium">Metric</th>
                  {data.sessions.map((session) => (
                    <th key={session.id} className="pb-2 font-medium">{formatDateTime(session.startDate)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.key} className="border-t border-line">
                    <td className="py-2.5 pr-3">{row.label}</td>
                    {(row.values || []).map((value, i) => (
                      <td key={`${row.key}-${i}`} className="py-2.5 pr-3">{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="section-title mb-1">Ask AI</h3>
              <p className="text-sm text-muted mb-0">Copy a short prompt and paste it into ChatGPT, Gemini, or Claude.</p>
            </div>
            <button type="button" className="btn-primary shrink-0" onClick={copyPrompt}>
              {copied ? 'Copied' : 'Copy AI prompt'}
            </button>
          </div>

          {canReview && reviewId && (
            <div className="mt-5" id="compare-review">
              <h3 className="section-title mb-3">
                Review {reviewSession?.name || 'session'}
              </h3>
              {reviewedIds.includes(reviewId) && !reviewDetail && (
                <p className="text-muted">Loading review…</p>
              )}
              <PublishedReviews reviews={reviewDetail?.reviews || []} />
              {!reviewedIds.includes(reviewId) && !myReview && (
                <CoachReviewForm
                  key={reviewId}
                  activityId={reviewId}
                  requestId={myPendingRequest?.id}
                  programId={reviewDetail?.plannedWorkout?.programId}
                  plannedWorkoutId={reviewDetail?.plannedWorkout?.id}
                  title=""
                  onPublished={() => {
                    setReviewedIds((ids) => (ids.includes(reviewId) ? ids : [...ids, reviewId]));
                    api.get(`/activities/${reviewId}`).then((res) => setReviewDetail(res.data)).catch(() => {});
                  }}
                />
              )}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

function SessionCard({ label, session, reviewable, reviewing, alreadyReviewed, onReview }) {
  return (
    <div className={`card ${reviewing ? 'border-brand' : ''}`}>
      <Link to={`/activities/${session.id}`} className="text-inherit no-underline hover:text-brand">
        <div className="stat-label">{label} · {session.sport}</div>
        <div className="flex items-start gap-3 mt-2">
          <div className="text-2xl">{getActivityIcon(session.type)}</div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{session.name}</div>
            <div className="text-xs text-muted">{formatDateTime(session.startDate)}{activityOriginLabel(session) ? ` · ${activityOriginLabel(session)}` : ''}</div>
            <div className="font-display text-2xl font-bold text-brand mt-2">
              {session.metric === 'duration' ? session.formatted.time : session.formatted.distance}
            </div>
            <div className="text-xs text-muted mt-1">
              {session.formatted.time}
              {session.pace ? ` · ${session.formatted.pace}` : ''}
              {session.avgHeartrate ? ` · ${session.formatted.hr}` : ''}
            </div>
          </div>
        </div>
      </Link>
      {reviewable && (
        <button type="button" className="btn-outline btn-sm mt-3 w-full" onClick={onReview}>
          {alreadyReviewed ? (reviewing ? 'Hide review' : 'View review') : reviewing ? 'Cancel review' : 'Write review'}
        </button>
      )}
    </div>
  );
}
