import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { formatDate, formatDuration, getActivityIcon } from '../utils/format';
import {
  COMPLETION_LABEL,
  formatKm,
  PROGRAM_STATUS_FILTERS,
  PROGRAM_STATUS_LABEL,
  statusClass,
} from '../utils/training';

const FILTERS = [
  { id: 'all', label: 'All' },
  ...PROGRAM_STATUS_FILTERS.map((id) => ({ id, label: PROGRAM_STATUS_LABEL[id] })),
];

export default function CoachTraining() {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');
  const assignedCount = location.state?.assigned;

  useEffect(() => {
    api.get('/training/coach-dashboard').then((res) => setData(res.data)).catch((err) => {
      setError(err.response?.data?.message || 'Could not load coaching dashboard');
    });
  }, []);

  const programs = useMemo(() => {
    const list = data?.programs || [];
    const q = query.trim().toLowerCase();
    return list.filter((p) => {
      if (filter !== 'all' && p.status !== filter) return false;
      if (!q) return true;
      const blob = `${p.name} ${p.athleteFirstName || ''} ${p.athleteLastName || ''} ${p.clubName || ''} ${p.sport || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [data, filter, query]);

  if (error) return <Layout><div className="card text-rose-200">{error}</div></Layout>;
  if (!data) return <Layout><p className="text-muted">Loading…</p></Layout>;

  const counts = data.counts || {};

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="page-title">Training</h2>
          <p className="page-sub">Plans, single activities, and athlete groups</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link to="/coaches/groups" className="btn-outline no-underline text-center">Groups</Link>
          <Link to="/coaches/activities/new" className="btn-outline no-underline text-center">Assign activity</Link>
          <Link to="/coaches/programs/new" className="btn-primary no-underline text-center">New program</Link>
        </div>
      </div>

      {assignedCount ? (
        <div className="card mb-4 text-sm">
          Scheduled {assignedCount} session{assignedCount === 1 ? '' : 's'}. Athletes will see it on Training.
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
        <CountCard label="Active" value={counts.active || 0} onClick={() => setFilter('active')} active={filter === 'active'} />
        <CountCard label="Paused" value={counts.paused || 0} onClick={() => setFilter('paused')} active={filter === 'paused'} />
        <CountCard label="Halted" value={counts.halted || 0} onClick={() => setFilter('halted')} active={filter === 'halted'} />
        <CountCard label="Completed" value={counts.completed || 0} onClick={() => setFilter('completed')} active={filter === 'completed'} />
        <CountCard label="Draft" value={counts.draft || 0} onClick={() => setFilter('draft')} active={filter === 'draft'} />
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="section-title mb-0">Groups</h3>
          <Link to="/coaches/groups" className="text-sm text-brand no-underline">Manage</Link>
        </div>
        {!data.groups?.length ? (
          <div className="card text-muted text-sm">Create a group to assign a plan or activity to several athletes at once, or to send them a note.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {data.groups.map((g) => (
              <button key={g.id} type="button" className="card w-full text-left hover:border-brand" onClick={() => navigate('/coaches/groups')}>
                <div className="font-semibold">{g.name}</div>
                <div className="text-xs text-muted mt-1">{g.clubName} · {g.athleteCount || g.athletes?.length || 0} athletes</div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h3 className="section-title mb-3">For athletes to prepare</h3>
        {!data.toPrepare?.length ? (
          <div className="card text-muted text-sm">No upcoming activities. Assign a session, add workouts to a plan, or activate a draft.</div>
        ) : (
          <div className="space-y-2">
            {data.toPrepare.slice(0, 12).map((w) => (
              <button key={w.id} type="button" className="card w-full text-left hover:border-brand" onClick={() => navigate(`/training/workouts/${w.id}`)}>
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {w.firstName ? `${w.firstName} ${w.lastName} · ` : ''}
                      {getActivityIcon(w.sport)} {w.name || w.workoutType}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {formatDate(w.scheduledDate)} · {w.programName} · {w.workoutType}
                      {w.distance ? ` · ${formatKm(w.distance)}` : ''}
                      {w.duration ? ` · ${formatDuration(w.duration)}` : ''}
                    </div>
                  </div>
                  <span className={`badge h-fit ${statusClass(w.completionStatus)}`}>{COMPLETION_LABEL[w.completionStatus]}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {!!data.today?.length && (
        <section className="mb-8">
          <h3 className="section-title mb-3">Today</h3>
          <div className="space-y-2">
            {data.today.map((w) => (
              <button key={w.id} type="button" className="card w-full text-left hover:border-brand" onClick={() => navigate(`/training/workouts/${w.id}`)}>
                <div className="font-semibold">{w.firstName} {w.lastName} · {w.name || w.workoutType}</div>
                <div className="text-xs text-muted">{w.programName} · {w.workoutType}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {!!data.missed?.length && (
        <section className="mb-8">
          <h3 className="section-title mb-3">Missed</h3>
          <div className="space-y-2">
            {data.missed.slice(0, 8).map((w) => (
              <button key={w.id} type="button" className="card w-full text-left hover:border-brand" onClick={() => navigate(`/training/workouts/${w.id}`)}>
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{w.firstName} {w.lastName} · {w.name || w.workoutType}</span>
                  <span className={`badge ${statusClass('missed')}`}>Missed</span>
                </div>
                <div className="text-xs text-muted">{formatDate(w.scheduledDate)} · {w.programName}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <div className="flex flex-col gap-3 mb-3">
          <h3 className="section-title mb-0">Plans</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <select className="sm:w-auto" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter plans">
              {FILTERS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}{f.id !== 'all' && counts[f.id] != null ? ` (${counts[f.id]})` : ''}</option>
              ))}
            </select>
            <input
              placeholder="Search plan, athlete, club"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {!programs.length ? (
          <div className="card text-muted text-sm">
            {filter === 'all' ? 'Create a program, then assign it to an athlete.' : `No ${PROGRAM_STATUS_LABEL[filter] || filter} plans.`}
          </div>
        ) : (
          <div className="space-y-3">
            {programs.map((p) => (
              <article key={p.id} className="card">
                <button type="button" className="w-full text-left bg-transparent border-0 p-0" onClick={() => navigate(`/coaches/programs/${p.id}`)}>
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-muted mt-1">
                        {p.clubName} · {p.sport}
                        {p.athleteFirstName ? ` · ${p.athleteFirstName} ${p.athleteLastName}` : ' · Unassigned'}
                        {p.startDate ? ` · ${formatDate(p.startDate)}` : ''}
                      </div>
                    </div>
                    <span className={`badge h-fit ${statusClass(p.status)}`}>{PROGRAM_STATUS_LABEL[p.status]}</span>
                  </div>
                  <div className="h-2 bg-ink rounded-full overflow-hidden mt-3">
                    <div className="h-full bg-brand" style={{ width: `${p.completionPct || 0}%` }} />
                  </div>
                  <div className="text-xs text-muted mt-2">
                    {p.completedCount || 0} / {p.workoutCount || 0} activities
                    {p.status === 'active' ? ` · ${p.toPrepareCount || 0} to prepare` : ''}
                  </div>
                </button>
                {p.status === 'active' && !!p.toPrepare?.length && (
                  <div className="mt-3 pt-3 border-t border-line space-y-1">
                    <div className="text-[11px] uppercase tracking-wide text-muted">Athlete still to prepare</div>
                    {p.toPrepare.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        className="w-full text-left text-sm py-1 bg-transparent border-0 hover:text-brand"
                        onClick={() => navigate(`/training/workouts/${w.id}`)}
                      >
                        {formatDate(w.scheduledDate)} · {getActivityIcon(w.sport)} {w.name || w.workoutType}
                        {w.distance ? ` · ${formatKm(w.distance)}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h3 className="section-title mb-3">Assigned athletes</h3>
        {!data.athletes?.length ? (
          <div className="card text-muted text-sm">No athletes assigned yet.</div>
        ) : (
          <div className="space-y-2">
            {data.athletes.map((a) => (
              <button
                key={a.athleteId}
                type="button"
                className="card w-full text-left hover:border-brand"
                onClick={() => navigate(`/coaches/athletes/${a.athleteId}/training`)}
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="font-semibold">{a.firstName} {a.lastName}</div>
                    <div className="text-xs text-muted">
                      {a.clubName || 'No club'}
                      {a.programs?.length
                        ? ` · ${a.programs.length} plan${a.programs.length === 1 ? '' : 's'} (${a.activePlanCount} active)`
                        : ' · No plans yet'}
                    </div>
                    {!!a.programs?.length && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {a.programs.slice(0, 4).map((p) => (
                          <span key={p.id} className={`badge ${statusClass(p.status)}`}>{p.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted">
                    {a.toPrepareCount ? `${a.toPrepareCount} to prepare` : 'Caught up'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}

function CountCard({ label, value, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`stat-card text-center px-2 ${active ? 'ring-1 ring-brand' : ''}`}
    >
      <div className="stat-label">{label}</div>
      <div className="stat-value text-2xl mt-1">{value}</div>
    </button>
  );
}
