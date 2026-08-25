import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { formatActivityPrimary, formatDate, formatDateShort, getActivityIcon } from '../utils/format';

const PAGE_SIZES = [10, 20, 50, 100];

const SORT_OPTIONS = [
  { sort: 'name', dir: 'asc', label: 'Name A–Z' },
  { sort: 'name', dir: 'desc', label: 'Name Z–A' },
  { sort: 'lastActivity', dir: 'desc', label: 'Last activity (newest)' },
  { sort: 'lastActivity', dir: 'asc', label: 'Last activity (oldest)' },
  { sort: 'activities', dir: 'desc', label: 'Most activities' },
  { sort: 'activities', dir: 'asc', label: 'Fewest activities' },
];

const INBOX_SORT_OPTIONS = [
  { sort: 'requestedAt', dir: 'desc', label: 'Requested (newest)' },
  { sort: 'requestedAt', dir: 'asc', label: 'Requested (oldest)' },
  { sort: 'name', dir: 'asc', label: 'Name A–Z' },
  { sort: 'name', dir: 'desc', label: 'Name Z–A' },
];

function sortLabel(sort, dir) {
  return SORT_OPTIONS.find((o) => o.sort === sort && o.dir === dir)?.label || 'Name A–Z';
}

function SortHeader({ label, column, sort, dir, onSort }) {
  const active = sort === column;
  const arrow = !active ? '' : dir === 'asc' ? ' ↑' : ' ↓';
  return (
    <button
      type="button"
      className={`font-semibold bg-transparent border-0 p-0 text-left ${active ? 'text-brand' : 'text-muted'}`}
      onClick={() => onSort(column)}
    >
      {label}{arrow}
    </button>
  );
}

export default function Coaches() {
  const { isCoach } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [coaches, setCoaches] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [removingId, setRemovingId] = useState('');
  const [inboxSort, setInboxSort] = useState('requestedAt');
  const [inboxDir, setInboxDir] = useState('desc');
  const [inboxPage, setInboxPage] = useState(1);
  const [inboxLimit, setInboxLimit] = useState(10);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [inboxPages, setInboxPages] = useState(1);
  const [loadingInbox, setLoadingInbox] = useState(false);

  const load = async () => {
    const c = await api.get('/coaches/my-coaches');
    setCoaches(c.data.coaches || []);
  };

  const loadInbox = async () => {
    if (!isCoach) return;
    setLoadingInbox(true);
    try {
      const { data } = await api.get('/reviews/inbox', {
        params: { sort: inboxSort, dir: inboxDir, page: inboxPage, limit: inboxLimit },
      });
      setInbox(data.requests || []);
      setInboxTotal(data.total || 0);
      setInboxPages(data.pages || 1);
      if (data.page && data.page !== inboxPage) setInboxPage(data.page);
    } finally {
      setLoadingInbox(false);
    }
  };

  const loadAthletes = async () => {
    if (!isCoach) return;
    setLoadingAthletes(true);
    try {
      const { data } = await api.get('/coaches/my-athletes', {
        params: { sort, dir, page, limit },
      });
      setAthletes(data.athletes || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      if (data.page && data.page !== page) setPage(data.page);
    } finally {
      setLoadingAthletes(false);
    }
  };

  useEffect(() => { load(); }, [isCoach, location.key]);
  useEffect(() => { loadInbox(); }, [isCoach, inboxSort, inboxDir, inboxPage, inboxLimit, location.key]);
  useEffect(() => { loadAthletes(); }, [isCoach, sort, dir, page, limit, location.key]);

  const changeSort = (column) => {
    if (sort === column) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(column);
      setDir(column === 'name' ? 'asc' : 'desc');
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

  const changeInboxSort = (column) => {
    if (inboxSort === column) {
      setInboxDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setInboxSort(column);
      setInboxDir(column === 'name' ? 'asc' : 'desc');
    }
    setInboxPage(1);
  };

  const changeInboxSortOption = (value) => {
    const [nextSort, nextDir] = value.split(':');
    setInboxSort(nextSort);
    setInboxDir(nextDir);
    setInboxPage(1);
  };

  const changeInboxLimit = (next) => {
    setInboxLimit(next);
    setInboxPage(1);
  };

  const removeAthlete = async (athleteId) => {
    if (!window.confirm('Remove this athlete from your coaching list? They stay in the club.')) return;
    setRemovingId(athleteId);
    try {
      await api.delete(`/coaches/athletes/${athleteId}`);
      await loadAthletes();
    } finally {
      setRemovingId('');
    }
  };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const inboxFrom = inboxTotal === 0 ? 0 : (inboxPage - 1) * inboxLimit + 1;
  const inboxTo = Math.min(inboxPage * inboxLimit, inboxTotal);

  return (
    <Layout>
      <h2 className="page-title">Coaching</h2>
      <p className="page-sub">Athletes, reviews, and training plans. Athletes may have up to three coaches.</p>
      {isCoach && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button className="btn-primary" type="button" onClick={() => navigate('/coaches/training')}>Training dashboard</button>
          <button className="btn-outline" type="button" onClick={() => navigate('/coaches/programs/new')}>New program</button>
        </div>
      )}

      <h3 className="font-semibold mb-2">My coaches</h3>
      <div className="grid md:grid-cols-3 gap-3 mb-8">
        {coaches.map((c) => (
          <div key={c.id || c.coachId} className="card">
            <div className="font-semibold">{c.firstName} {c.lastName}</div>
            <div className="text-xs text-muted">{c.email} {c.clubName ? `· ${c.clubName}` : ''}</div>
            <button className="btn-outline btn-sm mt-3" type="button" onClick={async () => {
              await api.delete(`/coaches/remove/${c.coachId || c.id}`);
              load();
            }}>
              Remove
            </button>
          </div>
        ))}
        {!coaches.length && <div className="card text-muted text-sm">No coaches assigned yet. Add one from Profile, or join a club.</div>}
      </div>

      {isCoach && (
        <>
          <div className="flex flex-col gap-3 mb-3">
            <h3 className="font-semibold mb-0">Review requests</h3>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted mb-0 min-w-0">
                <span>Sort</span>
                <select
                  className="w-full sm:w-auto min-w-0 py-1.5"
                  value={`${inboxSort}:${inboxDir}`}
                  onChange={(e) => changeInboxSortOption(e.target.value)}
                  aria-label="Sort review requests"
                >
                  {INBOX_SORT_OPTIONS.map((opt) => (
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
                  value={inboxLimit}
                  onChange={(e) => changeInboxLimit(Number(e.target.value))}
                  aria-label="Review requests per page"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loadingInbox ? (
            <p className="text-muted mb-8">Loading…</p>
          ) : !inbox.length ? (
            <div className="card text-muted text-sm mb-8">No pending requests. You can still open an athlete activity and review it.</div>
          ) : (
            <>
              <div className="space-y-2 md:hidden mb-3">
                {inbox.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="card w-full text-left hover:border-brand"
                    onClick={() => navigate(`/activities/${r.activityId}`)}
                  >
                    <div className="font-semibold">{r.firstName} {r.lastName}</div>
                    <div className="text-xs text-muted truncate mt-0.5">{r.activityName || 'Session'}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted mt-2">
                      <span>Requested {formatDateShort(r.requestedAt)}</span>
                      <span>{getActivityIcon(r.type)} {r.type || 'Session'}</span>
                      <span>{formatActivityPrimary(r)}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="card overflow-x-auto mb-3 hidden md:block">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left border-b border-line">
                      <th className="p-3">
                        <SortHeader label="Requested" column="requestedAt" sort={inboxSort} dir={inboxDir} onSort={changeInboxSort} />
                      </th>
                      <th className="p-3">
                        <SortHeader label="Name" column="name" sort={inboxSort} dir={inboxDir} onSort={changeInboxSort} />
                      </th>
                      <th className="p-3 text-muted font-semibold">Session</th>
                      <th className="p-3 text-muted font-semibold">Type</th>
                      <th className="p-3 text-muted font-semibold">Time / Dist.</th>
                      <th className="p-3 text-muted font-semibold">Activity date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inbox.map((r) => (
                      <tr
                        key={r.id}
                        className="border-t border-line hover:bg-hover/60 cursor-pointer"
                        onClick={() => navigate(`/activities/${r.activityId}`)}
                      >
                        <td className="p-3 whitespace-nowrap text-muted">{formatDate(r.requestedAt)}</td>
                        <td className="p-3 font-semibold text-slate-100 whitespace-nowrap">
                          {r.firstName} {r.lastName}
                        </td>
                        <td className="p-3">{r.activityName || 'Session'}</td>
                        <td className="p-3 whitespace-nowrap">
                          {getActivityIcon(r.type)} {r.type || '—'}
                        </td>
                        <td className="p-3 whitespace-nowrap">{formatActivityPrimary(r)}</td>
                        <td className="p-3 whitespace-nowrap text-muted">{formatDate(r.startDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
                <p className="text-xs text-muted mb-0">
                  Showing {inboxFrom}–{inboxTo} of {inboxTotal} · Page {inboxPage} of {inboxPages}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button className="btn-outline btn-sm" type="button" disabled={inboxPage <= 1} onClick={() => setInboxPage((p) => p - 1)}>
                    Previous
                  </button>
                  <button className="btn-outline btn-sm" type="button" disabled={inboxPage >= inboxPages} onClick={() => setInboxPage((p) => p + 1)}>
                    Next
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-3 mb-3">
            <h3 className="font-semibold mb-0">Assigned athletes</h3>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted mb-0 min-w-0">
                <span>Sort</span>
                <select
                  className="w-full sm:w-auto min-w-0 py-1.5"
                  value={`${sort}:${dir}`}
                  onChange={(e) => changeSortOption(e.target.value)}
                  aria-label="Sort athletes"
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
                  aria-label="Athletes per page"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loadingAthletes ? (
            <p className="text-muted">Loading…</p>
          ) : !athletes.length ? (
            <div className="card text-muted text-sm mb-6">No athletes assigned yet.</div>
          ) : (
            <>
              <div className="space-y-2 md:hidden mb-3">
                {athletes.map((a) => (
                  <div key={a.athleteId || a.id} className="card">
                    <button
                      type="button"
                      className="w-full text-left bg-transparent border-0 p-0 text-inherit"
                      onClick={() => navigate(`/coaches/athletes/${a.athleteId}`)}
                    >
                      <div className="font-semibold">{a.firstName} {a.lastName}</div>
                      <div className="text-xs text-muted truncate mt-0.5">{a.email}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted mt-2">
                        <span>{a.activityCount ?? 0} activities</span>
                        <span>Last {a.lastActivityAt ? formatDateShort(a.lastActivityAt) : '—'}</span>
                        <span>{a.mafHeartRate ? `MAF ${a.mafHeartRate}` : 'MAF —'}</span>
                      </div>
                    </button>
                    <button
                      className="btn-outline btn-sm mt-3"
                      type="button"
                      disabled={removingId === a.athleteId}
                      onClick={() => removeAthlete(a.athleteId)}
                    >
                      Remove from my list
                    </button>
                  </div>
                ))}
              </div>
              <div className="card overflow-x-auto mb-3 hidden md:block">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left border-b border-line">
                      <th className="p-3">
                        <SortHeader label="Name" column="name" sort={sort} dir={dir} onSort={changeSort} />
                      </th>
                      <th className="p-3 text-muted font-semibold">Email</th>
                      <th className="p-3">
                        <SortHeader label="Activities" column="activities" sort={sort} dir={dir} onSort={changeSort} />
                      </th>
                      <th className="p-3">
                        <SortHeader label="Last activity" column="lastActivity" sort={sort} dir={dir} onSort={changeSort} />
                      </th>
                      <th className="p-3 text-muted font-semibold">MAF</th>
                      <th className="p-3 text-muted font-semibold">Plan</th>
                      <th className="p-3 text-muted font-semibold">List</th>
                    </tr>
                  </thead>
                  <tbody>
                    {athletes.map((a) => (
                      <tr
                        key={a.athleteId || a.id}
                        className="border-t border-line hover:bg-hover/60 cursor-pointer"
                        onClick={() => navigate(`/coaches/athletes/${a.athleteId}`)}
                      >
                        <td className="p-3 font-semibold text-slate-100 whitespace-nowrap">
                          {a.firstName} {a.lastName}
                        </td>
                        <td className="p-3 text-muted">{a.email}</td>
                        <td className="p-3 whitespace-nowrap">{a.activityCount ?? 0}</td>
                        <td className="p-3 whitespace-nowrap text-muted">
                          {a.lastActivityAt ? formatDate(a.lastActivityAt) : '—'}
                        </td>
                        <td className="p-3 whitespace-nowrap">{a.mafHeartRate ? `${a.mafHeartRate}` : '—'}</td>
                        <td className="p-3 whitespace-nowrap">
                          <button
                            className="btn-outline btn-sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/coaches/athletes/${a.athleteId}/training`);
                            }}
                          >
                            Training
                          </button>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <button
                            className="btn-outline btn-sm"
                            type="button"
                            disabled={removingId === a.athleteId}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAthlete(a.athleteId);
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <p className="text-xs text-muted mb-0">
                  Showing {from}–{to} of {total} · {sortLabel(sort, dir)} · Page {page} of {pages}
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
        </>
      )}
    </Layout>
  );
}
