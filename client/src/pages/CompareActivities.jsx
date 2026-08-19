import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import {
  formatActivityPrimary,
  formatDate,
  getActivityIcon,
} from '../utils/format';

function deltaClass(improved) {
  if (improved === true) return 'text-emerald-300';
  if (improved === false) return 'text-orange-300';
  return 'text-muted';
}

function verdictTone(verdict) {
  if (verdict === 'improved') return 'bg-emerald-500/10 border-emerald-500 text-emerald-200';
  if (verdict === 'slower') return 'bg-orange-500/10 border-orange-500 text-orange-200';
  return 'bg-white/5 border-line text-slate-100';
}

function familyOf(act) {
  const t = `${act?.type || ''} ${act?.sportType || ''}`.toLowerCase();
  if (t.includes('swim')) return 'Swim';
  if (t.includes('ride') || t.includes('cycle') || t.includes('bike')) return 'Ride';
  if (t.includes('run') || t.includes('trail')) return 'Run';
  if (t.includes('walk')) return 'Walk';
  if (t.includes('hike')) return 'Hike';
  return act?.type || '';
}

export default function CompareActivities() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const a = searchParams.get('a') || '';
  const b = searchParams.get('b') || '';
  const [options, setOptions] = useState([]);
  const [pickedA, setPickedA] = useState(a);
  const [pickedB, setPickedB] = useState(b);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPickedA(a);
    setPickedB(b);
  }, [a, b]);

  useEffect(() => {
    const loadList = async () => {
      try {
        let athleteId;
        let sport;
        const seed = a || b;
        if (seed) {
          const { data: detail } = await api.get(`/activities/${seed}`);
          athleteId = detail.activity?.athleteId;
          sport = detail.activity?.type;
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
  }, [a, b]);

  const typeA = familyOf(options.find((act) => act.id === pickedA)) || data?.sport;
  const candidatesB = useMemo(() => {
    return options.filter((act) => {
      if (act.id === pickedA) return false;
      if (!typeA) return true;
      return familyOf(act) === typeA;
    });
  }, [options, pickedA, typeA]);

  useEffect(() => {
    if (!a || !b || a === b) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setErr('');
    api.get('/activities/compare', { params: { a, b } })
      .then((res) => {
        if (!cancelled) setData(res.data);
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
  }, [a, b]);

  useEffect(() => {
    if (!data) return;
    setOptions((prev) => {
      const extra = [data.older, data.newer].filter((s) => s?.id && !prev.some((p) => p.id === s.id));
      return extra.length ? [...extra, ...prev] : prev;
    });
  }, [data]);

  const apply = (nextA, nextB) => {
    const params = {};
    if (nextA) params.a = nextA;
    if (nextB) params.b = nextB;
    setSearchParams(params);
  };

  const donePath = searchParams.get('from') && String(searchParams.get('from')).startsWith('/')
    ? searchParams.get('from')
    : a
      ? `/activities/${a}`
      : '/analysis';

  return (
    <Layout>
      <div className="flex justify-end mb-3">
        <button type="button" className="btn-outline btn-sm" onClick={() => navigate(donePath)}>
          Done
        </button>
      </div>
      <h2 className="page-title">Compare</h2>
      <p className="page-sub">Two sessions of the same type, older vs newer, to check performance.</p>

      <div className="card grid md:grid-cols-2 gap-3 mb-5">
        <div>
          <label htmlFor="compareA">Earlier or first session</label>
          <select
            id="compareA"
            value={pickedA}
            onChange={(e) => {
              setPickedA(e.target.value);
              apply(e.target.value, pickedB);
            }}
          >
            <option value="">Select activity</option>
            {options.map((act) => (
              <option key={act.id} value={act.id}>
                {formatDate(act.startDate)} · {act.name} · {formatActivityPrimary(act)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="compareB">Other session (same type)</label>
          <select
            id="compareB"
            value={pickedB}
            onChange={(e) => {
              setPickedB(e.target.value);
              apply(pickedA, e.target.value);
            }}
            disabled={!pickedA}
          >
            <option value="">{pickedA ? 'Select matching activity' : 'Pick the first session'}</option>
            {candidatesB.map((act) => (
              <option key={act.id} value={act.id}>
                {formatDate(act.startDate)} · {act.name} · {formatActivityPrimary(act)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {err && <div className="card mb-4 text-sm text-orange-200">{err}</div>}
      {loading && <p className="text-muted">Comparing…</p>}

      {data && !loading && (
        <>
          <div className={`mb-5 rounded-2xl border p-4 text-sm ${verdictTone(data.verdict)}`}>
            {data.headline}
          </div>

          <div className="grid md:grid-cols-2 gap-3 mb-5">
            <SessionCard label="Older" session={data.older} />
            <SessionCard label="Newer" session={data.newer} />
          </div>

          <div className="card overflow-x-auto">
            <h3 className="section-title mb-3">Improvement check</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2 font-medium">Metric</th>
                  <th className="pb-2 font-medium">Older</th>
                  <th className="pb-2 font-medium">Newer</th>
                  <th className="pb-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.key} className="border-t border-line">
                    <td className="py-2.5 pr-3">{row.label}</td>
                    <td className="py-2.5 pr-3">{row.older}</td>
                    <td className="py-2.5 pr-3">{row.newer}</td>
                    <td className={`py-2.5 font-semibold ${deltaClass(row.improved)}`}>{row.deltaLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.comparable && (
              <p className="text-xs text-muted mt-3 mb-0">
                Distances differ by more than 20%. Treat pace as the main performance signal.
              </p>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}

function SessionCard({ label, session }) {
  return (
    <Link to={`/activities/${session.id}`} className="card text-inherit no-underline hover:border-brand">
      <div className="stat-label">{label} · {session.sport}</div>
      <div className="flex items-start gap-3 mt-2">
        <div className="text-2xl">{getActivityIcon(session.type)}</div>
        <div className="min-w-0">
          <div className="font-semibold truncate">{session.name}</div>
          <div className="text-xs text-muted">{formatDate(session.startDate)}</div>
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
  );
}
