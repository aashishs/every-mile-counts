import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import ActivityTypeFilter from '../components/ActivityTypeFilter';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatActivityPrimary, formatActivitySecondary, getActivityIcon, initialActivityType, rememberActivityType } from '../utils/format';

const emptyFilters = {
  q: '',
  startDate: '',
  endDate: '',
  minDistance: '',
  maxDistance: '',
};

export default function Activities() {
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState(() => initialActivityType(user));
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setApplied((prev) => {
        if (prev.q === filters.q) return prev;
        setPage(1);
        return { ...prev, q: filters.q };
      });
    }, 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  useEffect(() => {
    load();
  }, [typeFilter, page, applied]);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (typeFilter) params.type = typeFilter;
      if (applied.q.trim()) params.q = applied.q.trim();
      if (applied.startDate) params.startDate = applied.startDate;
      if (applied.endDate) params.endDate = applied.endDate;
      if (applied.minDistance) params.minDistance = applied.minDistance;
      if (applied.maxDistance) params.maxDistance = applied.maxDistance;
      const { data } = await api.get('/activities', { params });
      setActivities(data.activities);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyRange = (e) => {
    e.preventDefault();
    setApplied({ ...filters });
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setApplied(emptyFilters);
    setPage(1);
  };

  const hasExtraFilters = Boolean(
    applied.q.trim() || applied.startDate || applied.endDate || applied.minDistance || applied.maxDistance
  );

  return (
    <Layout>
      <h2 className="page-title">Log</h2>
      <p className="page-sub">Search by name, date, or distance</p>
      <ActivityTypeFilter
        value={typeFilter}
        onChange={(next) => {
          rememberActivityType(next);
          setTypeFilter(next);
          setPage(1);
        }}
      />

      <form className="card grid sm:grid-cols-2 gap-3 mb-4" onSubmit={applyRange}>
        <div className="sm:col-span-2">
          <label htmlFor="activitySearch">Search</label>
          <input
            id="activitySearch"
            type="search"
            placeholder="Activity name"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="startDate">From</label>
          <input id="startDate" type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
        </div>
        <div>
          <label htmlFor="endDate">To</label>
          <input id="endDate" type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
        </div>
        <div>
          <label htmlFor="minDistance">Min km</label>
          <input id="minDistance" type="number" min="0" step="0.1" placeholder="e.g. 5" value={filters.minDistance} onChange={(e) => setFilters({ ...filters, minDistance: e.target.value })} />
        </div>
        <div>
          <label htmlFor="maxDistance">Max km</label>
          <input id="maxDistance" type="number" min="0" step="0.1" placeholder="e.g. 21" value={filters.maxDistance} onChange={(e) => setFilters({ ...filters, maxDistance: e.target.value })} />
        </div>
        <div className="sm:col-span-2 flex gap-2">
          <button className="btn-primary flex-1" type="submit">Apply</button>
          {hasExtraFilters && (
            <button className="btn-outline" type="button" onClick={clearFilters}>Clear</button>
          )}
        </div>
      </form>

      <p className="text-xs text-muted mb-3">{loading ? 'Searching…' : `${total} activit${total === 1 ? 'y' : 'ies'}`}</p>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : !activities.length ? (
        <div className="card text-center text-muted py-12">
          {hasExtraFilters ? 'No activities match these filters.' : 'No activities yet. Connect Strava from Home.'}
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((act) => (
            <Link key={act.id} to={`/activities/${act.id}`} className="card flex items-center gap-3 hover:border-brand text-inherit no-underline">
              <div className="w-12 h-12 rounded-2xl bg-ink grid place-items-center text-2xl shrink-0">{getActivityIcon(act.type)}</div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold truncate">{act.name}</h4>
                <div className="text-xs text-muted truncate">{formatDate(act.startDate)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display text-xl font-bold text-brand leading-none">{formatActivityPrimary(act)}</div>
                <div className="text-xs text-muted mt-1">{formatActivitySecondary(act)}</div>
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
