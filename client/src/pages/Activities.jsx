import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import ActivityTypeFilter from '../components/ActivityTypeFilter';
import AddActivityModal from '../components/AddActivityModal';
import { useAuth } from '../context/AuthContext';
import {
  formatDate,
  formatDateShort,
  formatDistance,
  formatDuration,
  formatPace,
  getActivityIcon,
  initialActivityType,
  rememberActivityType,
  visibleActivityTypeOptions,
} from '../utils/format';

const emptyFilters = {
  q: '',
  startDate: '',
  endDate: '',
};

const PAGE_SIZES = [10, 20, 50, 100];

const SORT_OPTIONS = [
  { sort: 'date', dir: 'desc', label: 'Date (newest)' },
  { sort: 'date', dir: 'asc', label: 'Date (oldest)' },
  { sort: 'name', dir: 'asc', label: 'Name A–Z' },
  { sort: 'name', dir: 'desc', label: 'Name Z–A' },
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

export default function Activities() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(() => searchParams.get('add') === '1');
  const [typeFilter, setTypeFilter] = useState(() => initialActivityType(user));
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('date');
  const [dir, setDir] = useState('desc');
  const [searchOpen, setSearchOpen] = useState(false);

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
  }, [typeFilter, page, applied, limit, sort, dir]);

  useEffect(() => {
    const allowed = visibleActivityTypeOptions(user).map((opt) => opt.value);
    if (typeFilter !== 'all' && !allowed.includes(typeFilter)) {
      setTypeFilter('all');
      setPage(1);
    }
  }, [user?.syncActivityTypes]);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit, sort, dir };
      if (typeFilter) params.type = typeFilter;
      if (applied.q.trim()) params.q = applied.q.trim();
      if (applied.startDate) params.startDate = applied.startDate;
      if (applied.endDate) params.endDate = applied.endDate;
      const { data } = await api.get('/activities', { params });
      setActivities(data.activities || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
      if (data.page && data.page !== page) setPage(data.page);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const setFilter = (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (key !== 'q') {
      setApplied(next);
      setPage(1);
    }
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setApplied(emptyFilters);
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

  const changeLimit = (next) => {
    setLimit(next);
    setPage(1);
  };

  const hasExtraFilters = Boolean(applied.q.trim() || applied.startDate || applied.endDate);

  const closeAdd = () => {
    setAdding(false);
    if (searchParams.get('add')) {
      const next = new URLSearchParams(searchParams);
      next.delete('add');
      setSearchParams(next, { replace: true });
    }
  };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <Layout>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-2">
        <div>
          <h2 className="page-title">Log</h2>
          <p className="text-muted text-sm">Your sessions</p>
        </div>
        <button className="btn-primary w-full sm:w-auto" type="button" onClick={() => setAdding(true)}>
          Add activity
        </button>
      </div>
      <ActivityTypeFilter
        value={typeFilter}
        onChange={(next) => {
          rememberActivityType(next);
          setTypeFilter(next);
          setPage(1);
        }}
        options={visibleActivityTypeOptions(user)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <button
          type="button"
          className={`btn-sm ${searchOpen || hasExtraFilters ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSearchOpen((open) => !open)}
          aria-expanded={searchOpen}
        >
          Search{hasExtraFilters ? ' · on' : ''} {searchOpen ? '▴' : '▾'}
        </button>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted mb-0 min-w-0">
          <span>Sort</span>
          <select
            className="w-full sm:w-auto min-w-0 py-1.5"
            value={`${sort}:${dir}`}
            onChange={(e) => changeSortOption(e.target.value)}
            aria-label="Sort activities"
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

      {searchOpen && (
        <div className="card py-3 mb-3 space-y-2">
          <input
            id="activitySearch"
            type="search"
            placeholder="Name"
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            aria-label="Search by name"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              id="startDate"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilter('startDate', e.target.value)}
              aria-label="From date"
            />
            <input
              id="endDate"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilter('endDate', e.target.value)}
              aria-label="To date"
            />
          </div>
          {hasExtraFilters && (
            <button className="btn-outline btn-sm" type="button" onClick={clearFilters}>Clear</button>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : !activities.length ? (
        <div className="card text-center text-muted py-12">
          {hasExtraFilters ? 'No activities match these filters.' : (
            <>
              <p className="mb-4">No activities yet. Add one, import a GPX, or connect Strava from Home.</p>
              <button className="btn-primary" type="button" onClick={() => setAdding(true)}>Add activity</button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {activities.map((act) => (
              <button
                key={act.id}
                type="button"
                className="card w-full text-left hover:border-brand"
                onClick={() => navigate(`/activities/${act.id}`)}
              >
                <div className="font-semibold truncate">{act.name || 'Session'}</div>
                <div className="text-xs text-muted mt-1">
                  {formatDateShort(act.startDate)} · {getActivityIcon(act.type)} {act.type || 'Session'}
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
                  <th className="p-3">
                    <SortHeader label="Name" column="name" sort={sort} dir={dir} onSort={changeSort} />
                  </th>
                  <th className="p-3 text-muted font-semibold">Type</th>
                  <th className="p-3 text-muted font-semibold">Distance</th>
                  <th className="p-3 text-muted font-semibold">Time</th>
                  <th className="p-3 text-muted font-semibold">Pace</th>
                  <th className="p-3 text-muted font-semibold">Avg HR</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((act) => (
                  <tr
                    key={act.id}
                    className="border-t border-line hover:bg-hover/60 cursor-pointer"
                    onClick={() => navigate(`/activities/${act.id}`)}
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
      {adding && (
        <AddActivityModal
          onClose={closeAdd}
          onSaved={(id) => {
            closeAdd();
            navigate(`/activities/${id}`);
          }}
        />
      )}
    </Layout>
  );
}
