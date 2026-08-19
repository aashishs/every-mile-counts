import { useEffect, useState } from 'react';
import api from '../api/client';
import { isAppAdminAccount, isClubOnlyAccount } from '../utils/roles';

export default function StravaCard({ user }) {
  const hidden = isAppAdminAccount(user) || isClubOnlyAccount(user);
  const [strava, setStrava] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    if (hidden) return;
    try {
      const { data } = await api.get('/strava/status');
      setStrava(data);
    } catch {
      setStrava({ connected: false, configured: true, missing: [] });
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  if (hidden) return null;

  const connect = async () => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { data } = await api.get('/strava/connect');
      if (!data?.url || !String(data.url).startsWith('https://www.strava.com/')) {
        setErr('Strava did not return a valid connect URL. Ask an admin to check CLIENT_URL on the API.');
        return;
      }
      window.location.assign(data.url);
    } catch (error) {
      setErr(error.response?.data?.message || 'Could not start Strava connect');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { data } = await api.post('/strava/sync', null, { timeout: 10 * 60 * 1000 });
      await load();
      setMsg(`Imported or updated ${data.synced} Strava activities.`);
    } catch (error) {
      setErr(error.response?.data?.message || 'Sync failed');
    } finally {
      setBusy(false);
    }
  };

  const missing = strava?.missing || [];
  const connected = Boolean(strava?.connected);
  const idsMissing = missing.includes('STRAVA_CLIENT_ID') || missing.includes('STRAVA_CLIENT_SECRET') || strava?.configured === false;

  return (
    <div className="card mb-5 border-accent/40">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{connected ? 'Strava connected' : 'Sync from Strava'}</div>
          <p className="text-xs text-muted mt-1">
            {connected
              ? `Last sync ${strava.lastSyncAt ? new Date(strava.lastSyncAt).toLocaleString() : 'not yet'}`
              : 'Connect your Strava account to pull in runs, rides, and swims.'}
          </p>
          {strava?.lastSyncError && connected && (
            <p className="text-xs text-orange-300 mt-1">{strava.lastSyncError}</p>
          )}
          {idsMissing && (
            <p className="text-xs text-orange-300 mt-1">
              Strava is not configured on the API yet ({(missing.length ? missing : ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET']).join(', ')}).
            </p>
          )}
          {msg && <p className="text-xs text-brand mt-1">{msg}</p>}
          {err && <p className="text-xs text-orange-300 mt-1">{err}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          {connected ? (
            <>
              <button className="btn-primary btn-sm" type="button" onClick={sync} disabled={busy}>
                {busy || strava?.lastSyncStatus === 'running' ? 'Syncing…' : 'Sync Strava'}
              </button>
              <button className="btn-outline btn-sm" type="button" onClick={connect} disabled={busy}>
                Reconnect
              </button>
            </>
          ) : (
            <button className="btn-accent btn-sm" type="button" onClick={connect} disabled={busy || idsMissing}>
              {busy ? 'Connecting…' : 'Connect Strava'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
