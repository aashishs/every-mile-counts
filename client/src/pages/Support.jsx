import { useEffect, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import { StatusBadge } from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateShort } from '../utils/format';

const PAGE_SIZES = [10, 20, 50, 100];

const STATUS_OPTIONS = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

const SORT_OPTIONS = [
  { sort: 'date', dir: 'desc', label: 'Date (newest)' },
  { sort: 'date', dir: 'asc', label: 'Date (oldest)' },
  { sort: 'subject', dir: 'asc', label: 'Subject A–Z' },
  { sort: 'subject', dir: 'desc', label: 'Subject Z–A' },
  { sort: 'status', dir: 'asc', label: 'Status A–Z' },
  { sort: 'status', dir: 'desc', label: 'Status Z–A' },
];

const ADMIN_SORT_OPTIONS = [
  ...SORT_OPTIONS,
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
      onClick={() => onSort(column)}
    >
      {label}{arrow}
    </button>
  );
}

export default function Support() {
  const { isAppAdmin } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [form, setForm] = useState({ subject: '', body: '' });
  const [sort, setSort] = useState('date');
  const [dir, setDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const sortOptions = isAppAdmin ? ADMIN_SORT_OPTIONS : SORT_OPTIONS;

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/support', { params: { sort, dir, page, limit } });
      setTickets(data.tickets || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      if (data.page && data.page !== page) setPage(data.page);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [sort, dir, page, limit, isAppAdmin]);

  const submit = async (e) => {
    e.preventDefault();
    await api.post('/support', form);
    setForm({ subject: '', body: '' });
    setSort('date');
    setDir('desc');
    setPage(1);
    load();
  };

  const update = async (id, status) => {
    await api.patch(`/support/${id}`, { status });
    load();
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

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <Layout>
      <h2 className="page-title">Support</h2>
      <p className="page-sub">
        {isAppAdmin ? 'Review and update user tickets' : 'Ask the platform team for help'}
      </p>
      {!isAppAdmin && (
        <form className="card space-y-3 mb-6" onSubmit={submit}>
          <input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
          <textarea placeholder="How can we help?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          <button className="btn-primary" type="submit">Submit ticket</button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end mb-3">
        <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted mb-0 min-w-0">
          <span>Sort</span>
          <select
            className="w-full sm:w-auto min-w-0 py-1.5"
            value={`${sort}:${dir}`}
            onChange={(e) => changeSortOption(e.target.value)}
            aria-label="Sort tickets"
          >
            {sortOptions.map((opt) => (
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

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : !tickets.length ? (
        <div className="card text-sm text-muted">
          {isAppAdmin ? 'No support tickets yet.' : 'You have not submitted a ticket yet.'}
        </div>
      ) : (
        <>
          <div className="space-y-2 md:hidden mb-3">
            {tickets.map((t) => (
              <div key={t.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold min-w-0">{t.subject}</div>
                  <StatusBadge value={t.status} />
                </div>
                {isAppAdmin && (t.email || t.firstName) && (
                  <div className="text-xs text-muted mt-1">
                    {t.firstName} {t.lastName} · {t.email}
                  </div>
                )}
                <div className="text-xs text-muted mt-1">{formatDateShort(t.createdAt)}</div>
                <p className="text-sm text-muted mt-2 mb-0">{t.body}</p>
                {isAppAdmin && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`btn-sm ${t.status === s.id ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => update(t.id, s.id)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="card overflow-x-auto hidden md:block">
            <table className={`w-full text-sm ${isAppAdmin ? 'min-w-[860px]' : 'min-w-[640px]'}`}>
              <thead>
                <tr className="text-left border-b border-line">
                  <th className="p-3">
                    <SortHeader label="Date" column="date" sort={sort} dir={dir} onSort={changeSort} />
                  </th>
                  {isAppAdmin && (
                    <th className="p-3">
                      <SortHeader label="Name" column="name" sort={sort} dir={dir} onSort={changeSort} />
                    </th>
                  )}
                  <th className="p-3">
                    <SortHeader label="Subject" column="subject" sort={sort} dir={dir} onSort={changeSort} />
                  </th>
                  <th className="p-3">
                    <SortHeader label="Status" column="status" sort={sort} dir={dir} onSort={changeSort} />
                  </th>
                  {isAppAdmin && <th className="p-3 text-muted font-semibold">Update</th>}
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-t border-line align-top">
                    <td className="p-3 whitespace-nowrap text-muted">{formatDate(t.createdAt)}</td>
                    {isAppAdmin && (
                      <td className="p-3">
                        <div className="font-semibold text-slate-100 whitespace-nowrap">
                          {t.firstName} {t.lastName}
                        </div>
                        <div className="text-xs text-muted">{t.email}</div>
                      </td>
                    )}
                    <td className="p-3">
                      <div className="font-semibold text-slate-100">{t.subject}</div>
                      <p className="text-xs text-muted mb-0 mt-1">{t.body}</p>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <StatusBadge value={t.status} />
                    </td>
                    {isAppAdmin && (
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {STATUS_OPTIONS.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={`btn-sm ${t.status === s.id ? 'btn-primary' : 'btn-outline'}`}
                              onClick={() => update(t.id, s.id)}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
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
