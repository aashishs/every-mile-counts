import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { formatDate } from '../utils/format';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [strava, setStrava] = useState(null);
  const [garmin, setGarmin] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const alertKey = searchParams.get('strava') || searchParams.get('garmin');
  const source = searchParams.get('strava') ? 'strava' : searchParams.get('garmin') ? 'garmin' : null;

  useEffect(() => {
    load();
    if (alertKey) setSearchParams({}, { replace: true });
  }, []);

  const load = async () => {
    try {
      const [dash, s, g] = await Promise.all([
        api.get('/activities/dashboard'),
        api.get('/strava/status'),
        api.get('/garmin/status'),
      ]);
      setData(dash.data);
      setStrava(s.data);
      setGarmin(g.data);
    } catch (err) {
      console.error(err);
    }
  };

  const connect = async (provider) => {
    const { data: d } = await api.get(`/${provider}/connect`);
    window.location.href = d.url;
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await api.post('/activities/sync');
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const messages = {
    connected: { type: 'success', text: 'Device connected. Activities are syncing.' },
    error: { type: 'error', text: 'Connection failed. Please try again.' },
  };

  return (
    <Layout>
      <h2 className="page-title">Dashboard</h2>
      <p className="page-sub">Weekly, monthly, and yearly training at a glance</p>

      {alertKey && messages[alertKey] && (
        <div className={`mb-4 rounded-xl p-3 text-sm ${messages[alertKey].type === 'success' ? 'bg-emerald-500/10 border border-emerald-500 text-emerald-200' : 'bg-red-500/10 border border-red-500 text-red-200'}`}>
          {source ? `${source}: ` : ''}{messages[alertKey].text}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card flex items-center justify-between gap-4">
          <div>
            <div className={strava?.connected ? 'text-emerald-400' : 'text-muted'}>
              {strava?.connected ? '● Strava connected' : '○ Strava not connected'}
            </div>
            <p className="text-xs text-muted mt-1">Fallback sync source</p>
          </div>
          {strava?.connected ? (
            <button className="btn-outline btn-sm" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>
          ) : (
            <button className="btn-accent btn-sm" onClick={() => connect('strava')}>Connect Strava</button>
          )}
        </div>
        <div className="card flex items-center justify-between gap-4">
          <div>
            <div className={garmin?.connected ? 'text-emerald-400' : 'text-muted'}>
              {garmin?.connected ? '● Garmin connected' : '○ Garmin not connected'}
            </div>
            <p className="text-xs text-muted mt-1">Preferred device source</p>
          </div>
          {garmin?.connected ? (
            <button className="btn-outline btn-sm" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>
          ) : (
            <button className="btn-primary btn-sm" onClick={() => connect('garmin')}>Connect Garmin</button>
          )}
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="This week" value={data.mileage.formatted.weekly} />
            <Stat label="This month" value={data.mileage.formatted.monthly} />
            <Stat label="This year" value={data.mileage.formatted.yearly} />
            <Stat label="Activities" value={data.totals.activities} />
            <Stat label="Consistency" value={`${data.consistency}%`} />
            <Stat label="Recovery" value={data.recoveryIndicator} />
            <Stat label="Coaches" value={data.coaches?.length || 0} />
            <Stat label="Pending reviews" value={data.pendingReviews?.length || 0} />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <section>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold">Personal records</h3>
                <Link to="/analysis" className="btn-outline btn-sm">Analysis</Link>
              </div>
              <div className="card space-y-2 text-sm">
                {Object.keys(data.personalRecords || {}).length === 0 && <p className="text-muted">PRs appear after you sync activities.</p>}
                {Object.entries(data.personalRecords || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                    <span>{v.time || v.distance}</span>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold">Upcoming events</h3>
                <Link to="/events" className="btn-outline btn-sm">View all</Link>
              </div>
              {!data.upcomingEvents?.length ? (
                <div className="card text-muted text-sm">No upcoming races. Add a goal event.</div>
              ) : (
                <div className="space-y-2">
                  {data.upcomingEvents.map((e) => (
                    <div key={e.id} className="card flex justify-between items-center">
                      <div>
                        <div className="font-semibold">{e.name}</div>
                        <div className="text-xs text-muted">{formatDate(e.eventDate)} · {e.category}</div>
                      </div>
                      <span className="badge bg-accent/15 text-accent">Upcoming</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="mt-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Goal progress</h3>
              <Link to="/goals" className="btn-outline btn-sm">Goals</Link>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {(data.goals || []).map((g) => (
                <div key={g.id} className="card">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold">{g.title}</span>
                    <span className="text-brand">{g.completionPct}%</span>
                  </div>
                  <div className="h-2 bg-ink rounded-full overflow-hidden">
                    <div className="h-full bg-brand" style={{ width: `${g.completionPct}%` }} />
                  </div>
                </div>
              ))}
              {!data.goals?.length && <div className="card text-muted text-sm">Create a goal to track readiness.</div>}
            </div>
          </section>
        </>
      )}
    </Layout>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-xl font-bold text-brand mt-1">{value}</div>
    </div>
  );
}
