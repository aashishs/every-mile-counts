import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  formatDate,
  formatDateShort,
  formatDistance,
  formatDuration,
  formatPace,
  getActivityIcon,
} from '../utils/format';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Needs review' },
  { id: 'reviewed', label: 'Reviewed' },
];

const PAGE_SIZES = [10, 20, 50, 100];

const SORT_OPTIONS = [
  { sort: 'date', dir: 'desc', label: 'Date (newest)' },
  { sort: 'date', dir: 'asc', label: 'Date (oldest)' },
  { sort: 'type', dir: 'asc', label: 'Type A–Z' },
  { sort: 'type', dir: 'desc', label: 'Type Z–A' },
];

function SortHeader({ label, column, sort, dir, onSort }) {
  const active = sort === column;
  const arrow = !active ? '' : dir === 'asc' ? ' ↑' : ' ↓';
  return (
    <button
      type="button"
      className={`font-semibold bg-transparent border-0 p-0 text-left ${active ? 'text-brand' : 'text-muted'}`}
      onClick={(e) => {
        e.stopPropagation();
        onSort(column);
      }}
    >
      {label}{arrow}
    </button>
  );
}

export default function CoachAthleteActivities() {
  const { athleteId } = useParams();
  const { isCoach } = useAuth();
  const navigate = useNavigate();
  const [athlete, setAthlete] = useState(null);
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [sort, setSort] = useState('date');
  const [dir, setDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const assigned = Boolean(athlete);

  useEffect(() => {
    if (!isCoach) {
      navigate('/coaches', { replace: true });
    }
  }, [isCoach, navigate]);

  useEffect(() => {
    if (!isCoach) return undefined;
    let cancelled = false;
    setError('');
    setAthlete(null);
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
          params: { page, limit, review: filter, sort, dir },
        });
        if (cancelled) return;
        setActivities(data.activities || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
        setPendingTotal(data.pendingTotal || 0);
        if (data.page && data.page !== page) setPage(data.page);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Could not load activities');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [athleteId, isCoach, assigned, page, limit, filter, sort, dir]);

  const changeFilter = (next) => {
    setFilter(next);
    setPage(1);
  };

  const changeLimit = (next) => {
    setLimit(next);
    setPage(1);
  };

  const changeSort = (column) => {
    if (sort === column) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(column);
      setDir(column === 'date' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const changeSortOption = (value) => {
    const [nextSort, nextDir] = value.split(':');
    setSort(nextSort);
    setDir(nextDir);
    setPage(1);
  };

  const name = athlete ? `${athlete.firstName} ${athlete.lastName}` : 'Athlete';
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <Layout>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-2">
        <div>
          <h2 className="page-title">{name}</h2>
          <p className="page-sub mb-0">
            {athlete?.mafHeartRate ? `MAF ${athlete.mafHeartRate} bpm` : 'MAF —'}
            {athlete?.age ? ` · age ${athlete.age}` : ''}
            {loading
              ? ' · Loading sessions…'
              : ` · ${total} session${total === 1 ? '' : 's'}${pendingTotal ? ` · ${pendingTotal} need review` : ''}`}
          </p>
        </div>
        <Link to="/coaches" className="btn-outline btn-sm no-underline shrink-0 self-start">
          Back to coaching
        </Link>
      </div>

      {error && <div className="card mb-4 text-sm text-orange-300">{error}</div>}

      {!error && (
        <div className="flex flex-col gap-3 mb-4">
          <div className="chip-row mb-0">
            {FILTERS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`btn-sm ${filter === opt.id ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => changeFilter(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted mb-0 min-w-0">
              <span>Sort</span>
              <select
                className="w-full sm:w-auto min-w-0 py-1.5"
                value={`${sort}:${dir}`}
                onChange={(e) => changeSortOption(e.target.value)}
                aria-label="Sort sessions"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={`${opt.sort}:${opt.dir}`} value={`${opt.sort}:${opt.dir}`}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted mb-0 min-w-0">
              <span>Show</span>
              <select
                className="w-full sm:w-auto min-w-0 py-1.5"
                value={limit}
                onChange={(e) => changeLimit(Number(e.target.value))}
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : !activities.length ? (
        <div className="card text-muted text-sm">
          {total === 0 && filter === 'all'
            ? 'No activities yet for this athlete.'
            : filter === 'pending'
              ? 'All listed sessions already have your review.'
              : 'No reviewed sessions yet.'}
        </div>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {activities.map((act) => (
              <button
                key={act.id}
                type="button"
                className="card w-full text-left hover:border-brand"
                onClick={() => navigate(`/activities/${act.id}`, { state: { fromAthlete: athleteId } })}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{act.name || 'Session'}</div>
                    <div className="text-xs text-muted mt-1">
                      {formatDateShort(act.startDate)} · {getActivityIcon(act.type)} {act.type || 'Session'}
                    </div>
                  </div>
                  {act.reviewedByMe ? (
                    <span className="text-[11px] font-semibold text-brand shrink-0">Reviewed</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-orange-200 shrink-0">Needs review</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted mt-3">
                  <span>{formatDistance(act.distance)}</span>
                  <span>{formatDuration(act.movingTime || act.elapsedTime)}</span>
                  <span>{formatPace(act.avgSpeed)}</span>
                  <span>{act.avgHeartrate ? `${Math.round(act.avgHeartrate)} bpm` : 'No HR'}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="card overflow-x-auto hidden md:block">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left border-b border-line">
                  <th className="p-3">
                    <SortHeader label="Date" column="date" sort={sort} dir={dir} onSort={changeSort} />
                  </th>
                  <th className="p-3 text-muted font-semibold">Session</th>
                  <th className="p-3">
                    <SortHeader label="Type" column="type" sort={sort} dir={dir} onSort={changeSort} />
                  </th>
                  <th className="p-3 text-muted font-semibold">Distance</th>
                  <th className="p-3 text-muted font-semibold">Time</th>
                  <th className="p-3 text-muted font-semibold">Pace</th>
                  <th className="p-3 text-muted font-semibold">Avg HR</th>
                  <th className="p-3 text-muted font-semibold">Review</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((act) => (
                  <tr
                    key={act.id}
                    className="border-t border-line hover:bg-hover/60 cursor-pointer"
                    onClick={() => navigate(`/activities/${act.id}`, { state: { fromAthlete: athleteId } })}
                  >
                    <td className="p-3 whitespace-nowrap text-muted">{formatDate(act.startDate)}</td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-100">{act.name || 'Session'}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {getActivityIcon(act.type)} {act.type || '—'}
                    </td>
                    <td className="p-3 whitespace-nowrap">{formatDistance(act.distance)}</td>
                    <td className="p-3 whitespace-nowrap">{formatDuration(act.movingTime || act.elapsedTime)}</td>
                    <td className="p-3 whitespace-nowrap">{formatPace(act.avgSpeed)}</td>
                    <td className="p-3 whitespace-nowrap">
                      {act.avgHeartrate ? `${Math.round(act.avgHeartrate)} bpm` : '—'}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {act.reviewedByMe ? (
                        <span className="text-brand font-semibold">Reviewed</span>
                      ) : (
                        <span className="text-orange-200 font-semibold">Needs review</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <p className="text-xs text-muted mb-0">
              Showing {from}–{to} of {total} · Page {page} of {pages}
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
    </Layout>
  );
}
