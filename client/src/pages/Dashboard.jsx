import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import ActivityTypeFilter from '../components/ActivityTypeFilter';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_ACTIVITY_TYPE, formatDate, getActivityIcon } from '../utils/format';
import { isClubOnlyAccount } from '../utils/roles';

export default function Dashboard() {
  const { user } = useAuth();
  const clubOnly = isClubOnlyAccount(user);
  const [data, setData] = useState(null);
  const [strava, setStrava] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [type, setType] = useState(user?.defaultActivityType || DEFAULT_ACTIVITY_TYPE);
  const [searchParams, setSearchParams] = useSearchParams();
  const alertKey = searchParams.get('strava');

  useEffect(() => {
    load();
    if (alertKey) setSearchParams({}, { replace: true });
  }, [type]);

  const load = async () => {
    try {
      const [dash, s] = await Promise.all([
        api.get('/activities/dashboard', { params: { type } }),
        clubOnly ? Promise.resolve({ data: { applicable: false, connected: false } }) : api.get('/strava/status'),
      ]);
      setData(dash.data);
      setStrava(s.data);
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
      const { data: result } = await api.post('/strava/sync', null, { timeout: 10 * 60 * 1000 });
      await load();
      alert(`Imported or updated ${result.synced} Strava activities.`);
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
      <ActivityTypeFilter value={type} onChange={setType} />

      {alertKey && messages[alertKey] && (
        <div className={`mb-4 rounded-xl p-3 text-sm ${messages[alertKey].type === 'success' ? 'bg-emerald-500/10 border border-emerald-500 text-emerald-200' : 'bg-red-500/10 border border-red-500 text-red-200'}`}>
          {messages[alertKey].text}
        </div>
      )}

      {!clubOnly && (
      <div className="card flex items-center justify-between gap-4 mb-6">
        <div>
          <div className={strava?.connected ? 'text-emerald-400' : 'text-muted'}>
            {strava?.connected ? '● Strava connected' : '○ Strava not connected'}
          </div>
          <p className="text-xs text-muted mt-1">
            {strava?.lastSyncAt
              ? `Last sync ${new Date(strava.lastSyncAt).toLocaleString()}${strava.lastSyncError ? ` · ${strava.lastSyncError}` : ''}`
              : 'Sync all runs, rides, and swims from Strava'}
          </p>
        </div>
          {strava?.connected ? (
            <button className="btn-outline btn-sm" onClick={sync} disabled={syncing}>
              {syncing || strava.lastSyncStatus === 'running' ? 'Syncing history…' : 'Sync all history'}
            </button>
          ) : (
          <button className="btn-accent btn-sm" onClick={() => connect('strava')}>Connect Strava</button>
        )}
      </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="This week" value={data.mileage.formatted.weekly} />
            <Stat label="This month" value={data.mileage.formatted.monthly} />
            <Stat label="This year" value={data.mileage.formatted.yearly} />
            <Stat label="All time" value={data.mileage.formatted.allTime} />
            <Stat label={type === 'all' ? 'Activities' : `${type} activities`} value={data.totals.activities} />
            <Stat label="Consistency" value={`${data.consistency}%`} />
            <Stat label="Recovery" value={data.recoveryIndicator} />
            <Stat label="Coaches" value={data.coaches?.length || 0} />
          </div>

          <section className="mb-8">
            <h3 className="font-semibold mb-3">Distance totals</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(data.distanceSports || []).map((sport) => (
                <div key={sport.type} className="card">
                  <div className="font-semibold mb-3 flex items-center gap-2">
                    <span>{getActivityIcon(sport.type)}</span> {sport.type}
                  </div>
                  <div className="text-xs text-muted">All time</div>
                  <div className="text-xl font-bold text-brand">{sport.formattedAllTime}</div>
                  <div className="text-xs text-muted mt-3">This year</div>
                  <div className="text-lg font-semibold">{sport.formattedYearly}</div>
                  <div className="text-[11px] text-muted mt-2">{sport.count} all-time · {sport.yearCount} this year</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">By activity type</h3>
              <Link to="/analysis" className="btn-outline btn-sm">Analysis</Link>
            </div>
            {!(data.byActivityType || []).length ? (
              <div className="card text-muted text-sm">PRs and distance badges appear after you sync activities.</div>
            ) : (
              <div className="space-y-4">
                {(data.byActivityType || []).map((sport) => (
                  <SportCard key={sport.type} sport={sport} />
                ))}
              </div>
            )}
          </section>

          <div className="grid md:grid-cols-2 gap-6">
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
            <section>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold">Goal progress</h3>
                <Link to="/goals" className="btn-outline btn-sm">Goals</Link>
              </div>
              <div className="space-y-3">
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
          </div>
        </>
      )}
    </Layout>
  );
}

function SportCard({ sport }) {
  const duration = sport.metric === 'duration';
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h4 className="font-semibold text-lg flex items-center gap-2">
          <span>{getActivityIcon(sport.type)}</span> {sport.type}
        </h4>
        <div className="text-sm text-muted">
          {sport.count} activities · {sport.formattedDistance}
          {!duration && ` · ${sport.formattedTime}`}
          {duration && sport.formattedCalories ? ` · ${sport.formattedCalories}` : ''}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {(sport.buckets || []).map((bucket) => (
          <div key={bucket.key} className="rounded-xl border border-line bg-ink p-3">
            <div className="text-xs text-muted">{bucket.label}</div>
            <div className="text-xl font-bold text-brand mt-1">{bucket.count}</div>
            <div className="text-[11px] text-muted mb-2">completed</div>
            {bucket.fastest ? (
              <Link
                to={`/activities/${bucket.fastest.activityId}`}
                className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide no-underline"
                title={bucket.fastest.name}
              >
                {duration ? '⏱' : '⚡'} {bucket.badge || 'Fastest'} {bucket.fastest.time}
              </Link>
            ) : (
              <span className="text-[11px] text-muted">None yet</span>
            )}
          </div>
        ))}
        {sport.longest && (
          <div className="rounded-xl border border-line bg-ink p-3">
            <div className="text-xs text-muted">{duration ? 'Longest session' : sport.type === 'Swim' ? 'Longest' : 'Max distance'}</div>
            <div className="text-xl font-bold text-brand mt-1">{sport.longest.distance}</div>
            <div className="text-[11px] text-muted mb-2">{duration ? sport.longest.name : sport.longest.time}</div>
            <Link
              to={`/activities/${sport.longest.activityId}`}
              className="inline-flex items-center gap-1 rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide no-underline"
            >
              {duration ? 'Longest' : 'Longest'}
            </Link>
          </div>
        )}
      </div>
    </div>
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
