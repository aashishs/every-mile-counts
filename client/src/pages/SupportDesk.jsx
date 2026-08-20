import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { StatusBadge } from '../components/Badge';
import { formatDate, formatDateShort } from '../utils/format';

const STATUS_OPTIONS = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

export default function SupportDesk() {
  const [analytics, setAnalytics] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    const [{ data: stats }, { data: list }] = await Promise.all([
      api.get('/support/analytics'),
      api.get('/support', { params: { limit: 100, sort: 'date', dir: 'desc' } }),
    ]);
    setAnalytics(stats);
    setTickets(list.tickets || []);
  };

  const openTicket = async (id) => {
    setSelectedId(id);
    setErr('');
    const { data } = await api.get(`/support/${id}`);
    setDetail(data);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    await api.patch(`/support/${id}`, { status });
    await load();
    if (selectedId === id) openTicket(id);
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await api.post(`/support/${selectedId}/replies`, { body: reply.trim() });
      setReply('');
      await load();
      await openTicket(selectedId);
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Could not send reply');
    } finally {
      setBusy(false);
    }
  };

  const visible = tickets.filter((t) => statusFilter === 'all' || t.status === statusFilter);

  return (
    <Layout>
      <h2 className="page-title">Support desk</h2>
      <p className="page-sub">Ticket logs, replies, and volume</p>

      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Open" value={analytics.totals.open} />
          <Stat label="In progress" value={analytics.totals.inProgress} />
          <Stat label="Closed (30d)" value={analytics.closed30Days} />
          <Stat label="Avg hours to close" value={analytics.avgHoursToClose ?? '—'} />
        </div>
      )}
      {analytics && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-2">Tickets last 14 days</h3>
          <div className="flex items-end gap-1 h-24">
            {(analytics.daily || []).map((d) => (
              <div key={d.day} className="flex-1 flex flex-col justify-end items-center gap-1" title={`${d.day}: ${d.count}`}>
                <div
                  className="w-full rounded-sm bg-brand/80 min-h-[4px]"
                  style={{ height: `${Math.max(8, (d.count / Math.max(...analytics.daily.map((x) => x.count), 1)) * 100)}%` }}
                />
                <span className="text-[10px] text-muted">{String(d.day).slice(5)}</span>
              </div>
            ))}
            {!analytics.daily?.length && <p className="text-sm text-muted mb-0">No tickets in this window.</p>}
          </div>
          <p className="text-xs text-muted mt-3 mb-0">
            {analytics.last7Days} in 7 days · {analytics.last30Days} in 30 days · {analytics.totals.all} all time
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {[{ id: 'all', label: 'All' }, ...STATUS_OPTIONS].map((s) => (
          <button
            key={s.id}
            type="button"
            className={`btn-sm ${statusFilter === s.id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setStatusFilter(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          {!visible.length ? (
            <div className="card text-sm text-muted">No tickets in this filter.</div>
          ) : visible.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`card w-full text-left ${selectedId === t.id ? 'border-brand' : ''}`}
              onClick={() => openTicket(t.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold min-w-0">{t.subject}</div>
                <StatusBadge value={t.status} />
              </div>
              <div className="text-xs text-muted mt-1">
                {t.firstName} {t.lastName} · {t.email} · {formatDateShort(t.createdAt)}
                {t.messageCount ? ` · ${t.messageCount} messages` : ''}
              </div>
            </button>
          ))}
        </div>

        <div className="card">
          {!detail ? (
            <p className="text-sm text-muted mb-0">Select a ticket to view the log and reply.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="section-title mb-1">{detail.ticket.subject}</h3>
                  <p className="text-xs text-muted mb-0">
                    {detail.ticket.firstName} {detail.ticket.lastName} · {detail.ticket.email}
                  </p>
                </div>
                <StatusBadge value={detail.ticket.status} />
              </div>
              <div className="flex flex-wrap gap-1 mb-4">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`btn-sm ${detail.ticket.status === s.id ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => updateStatus(detail.ticket.id, s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto mb-4">
                {(detail.messages || []).map((m) => (
                  <div key={m.id} className="rounded-xl border border-line p-3">
                    <div className="text-xs text-muted mb-1">
                      {m.firstName || m.lastName ? `${m.firstName || ''} ${m.lastName || ''}`.trim() : m.email || 'User'}
                      {' · '}{formatDate(m.createdAt)}
                    </div>
                    <p className="text-sm mb-0 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
              {err && <p className="text-sm text-orange-300">{err}</p>}
              <form onSubmit={sendReply} className="space-y-2">
                <textarea
                  placeholder="Reply to the user"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  required
                />
                <button className="btn-primary w-full" type="submit" disabled={busy}>
                  {busy ? 'Sending…' : 'Send reply'}
                </button>
              </form>
              <p className="text-xs text-muted mt-3 mb-0">
                Users can add more detail from <Link to="/support">Help</Link> on their account.
              </p>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value text-xl">{value}</div>
    </div>
  );
}
