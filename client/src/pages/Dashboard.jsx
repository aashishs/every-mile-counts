import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import ActivityTypeFilter from '../components/ActivityTypeFilter';
import PersonalRecords from '../components/PersonalRecords';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatTime, getActivityIcon, initialActivityType, rememberActivityType } from '../utils/format';
import { isClubOnlyAccount } from '../utils/roles';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still going';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function daysOut(date) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const d = Math.round((target - start) / 86400000);
  if (d < 0) return 'Done';
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `${d} days`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const clubOnly = isClubOnlyAccount(user);
  const [data, setData] = useState(null);
  const [strava, setStrava] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [searchParams] = useSearchParams();
  const [type, setType] = useState(() => initialActivityType(user, searchParams.get('type')));
  const alertKey = searchParams.get('strava');

  useEffect(() => {
    rememberActivityType(type);
  }, [type]);

  useEffect(() => {
    load();
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
    try {
      const { data: d } = await api.get(`/${provider}/connect`);
      if (!d?.url || !String(d.url).startsWith('https://www.strava.com/')) {
        alert('Strava did not return a valid connect URL. Check CLIENT_URL on the API service.');
        return;
      }
      window.location.assign(d.url);
    } catch (err) {
      alert(err.response?.data?.message || 'Could not start Strava connect');
    }
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

  const why = searchParams.get('why');
  const messages = {
    connected: { type: 'success', text: 'Device connected. Activities are syncing.' },
    error: {
      type: 'error',
      text:
        why === 'encryption'
          ? 'Set ENCRYPTION_KEY on the Railway api service to 64 hex characters, then redeploy and connect again.'
          : why === 'token'
            ? 'Strava rejected the login. Check STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and the Authorization Callback Domain.'
            : 'Connection failed. Check the api service logs, then try Connect Strava once more.',
    },
  };

  const sportTotal = (data?.distanceSports || []).find((s) => s.type === type);
  const nextEvent = data?.upcomingEvents?.[0];
  const nextGoal = (data?.goals || []).find((g) => Number(g.completionPct) < 100) || data?.goals?.[0];

  return (
    <Layout>
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.22em] text-brand font-semibold">{greeting()}</p>
        <h2 className="page-title mb-0">{user.firstName}</h2>
        <p className="text-muted text-sm mt-1">Your {type.toLowerCase()} at a glance</p>
      </div>
      <ActivityTypeFilter value={type} onChange={setType} showAll={false} />

      {alertKey && messages[alertKey] && (
        <div className={`mb-4 rounded-2xl p-3 text-sm ${messages[alertKey].type === 'success' ? 'bg-emerald-500/10 border border-emerald-500 text-emerald-200' : 'bg-red-500/10 border border-red-500 text-red-200'}`}>
          {messages[alertKey].text}
        </div>
      )}

      {data && (
        <>
          <div className="hero-week">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="stat-label text-teal-100/70">This week · {getActivityIcon(type)} {type}</div>
                <div className="font-display text-5xl md:text-6xl font-bold tracking-tight mt-2 text-white">
                  {data.mileage.formatted.weekly}
                </div>
              </div>
              <Link to={`/analysis?type=${encodeURIComponent(type)}`} className="btn-outline btn-sm no-underline text-white border-white/20">
                Stats
              </Link>
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">{data.consistency}% consistent</span>
              <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">{data.recoveryIndicator || 'Recovery'}</span>
              <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">{data.totals.activities} sessions</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-5">
            <Stat label="Month" value={data.mileage.formatted.monthly} />
            <Stat label="Year" value={data.mileage.formatted.yearly} />
            <Stat label="All time" value={data.mileage.formatted.allTime} />
          </div>

          {sportTotal && (
            <div className="card mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="stat-label">{sportTotal.type} lifetime</div>
                <div className="stat-value text-brand">{sportTotal.formattedAllTime}</div>
                <div className="text-[11px] text-muted mt-1">{sportTotal.yearCount} this year · {sportTotal.formattedYearly}</div>
              </div>
              <span className="text-4xl">{getActivityIcon(sportTotal.type)}</span>
            </div>
          )}

          {nextEvent && (
            <Link to="/events" className="race-card mb-5 flex items-center justify-between gap-3 text-inherit no-underline">
              <div>
                <div className="stat-label text-orange-200/80">Next race</div>
                <div className="font-display text-2xl font-bold tracking-tight mt-1">{nextEvent.name}</div>
                <div className="text-xs text-muted mt-1">
                  {formatDate(nextEvent.eventDate)}
                  {nextEvent.eventTime ? ` · ${formatTime(nextEvent.eventTime)}` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-3xl font-bold text-accent leading-none">{daysOut(nextEvent.eventDate)}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted mt-1">out</div>
              </div>
            </Link>
          )}

          {nextGoal && (
            <Link to="/goals" className="card mb-5 block text-inherit no-underline">
              <div className="flex justify-between items-center mb-2">
                <span className="stat-label">Goal</span>
                <span className="font-display text-xl font-bold text-brand">{nextGoal.completionPct}%</span>
              </div>
              <div className="font-semibold mb-2">{nextGoal.title}</div>
              <div className="h-2.5 bg-ink rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand to-accent" style={{ width: `${nextGoal.completionPct}%` }} />
              </div>
            </Link>
          )}

          {!clubOnly && strava && (strava.configured === false || strava.missing?.length) && (
            <div className="card mb-5 border-accent/40">
              <div className="font-semibold">Strava is not configured</div>
              <p className="text-xs text-muted mt-1">
                Add these on Railway → <strong>api</strong> → Variables (not web), then redeploy api:
                {' '}
                {(strava.missing || ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET']).join(', ')}
              </p>
            </div>
          )}

          {!clubOnly && strava?.configured !== false && !strava?.missing?.length && !strava?.connected && (
            <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-accent/40">
              <div>
                <div className="font-semibold">Connect Strava</div>
                <p className="text-xs text-muted mt-1">Pull in your runs, rides, and swims</p>
              </div>
              <button className="btn-accent btn-sm" onClick={() => connect('strava')}>Connect</button>
            </div>
          )}

          <section className="mb-8">
            <PersonalRecords records={data.personalRecords} sport={type} />
          </section>

          <section className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <h3 className="section-title">Upcoming</h3>
              <Link to="/events" className="text-sm text-brand no-underline">All events</Link>
            </div>
            {!data.upcomingEvents?.length ? (
              <div className="card text-muted text-sm">No race on the calendar yet.</div>
            ) : (
              <div className="space-y-2">
                {data.upcomingEvents.slice(0, 3).map((e) => (
                  <div key={e.id} className="card flex justify-between items-center py-3">
                    <div>
                      <div className="font-semibold">{e.name}</div>
                      <div className="text-xs text-muted">{formatDate(e.eventDate)}{e.eventTime ? ` · ${formatTime(e.eventTime)}` : ''}</div>
                    </div>
                    <span className="font-display text-lg font-bold text-accent">{daysOut(e.eventDate)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mb-6">
            <h3 className="section-title mb-3">By distance</h3>
            {!(data.byActivityType || []).length ? (
              <div className="card text-muted text-sm">PRs appear after you sync activities.</div>
            ) : (
              <div className="space-y-4">
                {(data.byActivityType || []).map((sport) => (
                  <SportCard key={sport.type} sport={sport} />
                ))}
              </div>
            )}
          </section>

          {!clubOnly && strava?.connected && (
            <div className="flex items-center justify-between gap-3 text-xs text-muted mb-4">
              <span>Strava · last sync {strava.lastSyncAt ? new Date(strava.lastSyncAt).toLocaleString() : '—'}</span>
              <button className="btn-outline btn-sm" onClick={sync} disabled={syncing}>
                {syncing || strava.lastSyncStatus === 'running' ? 'Syncing…' : 'Full sync'}
              </button>
            </div>
          )}
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
          {sport.count} · {sport.formattedDistance}
          {!duration && ` · ${sport.formattedTime}`}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {(sport.buckets || []).map((bucket) => (
          <div key={bucket.key} className={`pr-tile ${bucket.fastest ? '' : 'pr-tile-locked'}`}>
            <div className="text-xs text-muted">{bucket.label}</div>
            <div className="font-display text-2xl font-bold text-brand mt-1">{bucket.count}</div>
            <div className="text-[11px] text-muted mb-2">completed</div>
            {bucket.fastest ? (
              <Link
                to={`/activities/${bucket.fastest.activityId}`}
                className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide no-underline"
                title={bucket.fastest.name}
              >
                {duration ? '⏱' : '⚡'} {bucket.badge || 'PR'} {bucket.fastest.time}
              </Link>
            ) : (
              <span className="text-[11px] text-muted">None yet</span>
            )}
          </div>
        ))}
        {sport.longest && (
          <div className="pr-tile">
            <div className="text-xs text-muted">{duration ? 'Longest session' : sport.type === 'Swim' ? 'Longest' : 'Max distance'}</div>
            <div className="font-display text-2xl font-bold text-brand mt-1">{sport.longest.distance}</div>
            <div className="text-[11px] text-muted mb-2">{duration ? sport.longest.name : sport.longest.time}</div>
            <Link
              to={`/activities/${sport.longest.activityId}`}
              className="inline-flex items-center gap-1 rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide no-underline"
            >
              Longest
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card text-center px-2">
      <div className="stat-label">{label}</div>
      <div className="stat-value text-lg md:text-2xl mt-2">{value}</div>
    </div>
  );
}
