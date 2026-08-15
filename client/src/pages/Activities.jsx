import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { formatDate, formatDistance, formatDuration, getActivityIcon } from '../utils/format';

export default function Activities() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    load();
  }, [typeFilter, page]);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (typeFilter) params.type = typeFilter;
      const { data } = await api.get('/activities', { params });
      setActivities(data.activities);
      setTotalPages(data.pages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const types = ['Run', 'Ride', 'Swim', 'Walk', 'Hike', 'VirtualRun', 'VirtualRide'];

  return (
    <Layout>
      <h2 className="page-title">Activities</h2>
      <p className="page-sub">Synced from Garmin and Strava</p>
      <div className="mb-4">
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="max-w-xs">
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : !activities.length ? (
        <div className="card text-center text-muted py-12">No activities yet. Connect Garmin or Strava from the dashboard.</div>
      ) : (
        <div className="space-y-3">
          {activities.map((act) => (
            <Link key={act.id} to={`/activities/${act.id}`} className="card flex items-center gap-4 hover:border-brand text-inherit no-underline">
              <div className="w-12 h-12 rounded-xl bg-ink grid place-items-center text-2xl">{getActivityIcon(act.type)}</div>
              <div className="flex-1">
                <h4 className="font-semibold">{act.name}</h4>
                <div className="text-sm text-muted">{formatDate(act.startDate)} · {act.type} · {act.source}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-brand">{formatDistance(act.distance)}</div>
                <div className="text-sm text-muted">{formatDuration(act.movingTime)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex gap-2 mt-6">
          <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button className="btn-outline btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </Layout>
  );
}
