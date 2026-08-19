import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { isAppAdminAccount, isClubOnlyAccount } from '../utils/roles';

export default function StravaCard({ user, autoConnect = false }) {
  const hidden = isAppAdminAccount(user) || isClubOnlyAccount(user);
  const [strava, setStrava] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const autoStarted = useRef(false);

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

  const missing = strava?.missing || [];
  const connected = Boolean(strava?.connected);
  const idsMissing = missing.includes('STRAVA_CLIENT_ID') || missing.includes('STRAVA_CLIENT_SECRET') || strava?.configured === false;

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

  useEffect(() => {
    if (!autoConnect || autoStarted.current || hidden || !strava || connected || idsMissing || busy) return;
    autoStarted.current = true;
    connect();
  }, [autoConnect, hidden, strava, connected, idsMissing, busy]);

  if (hidden) return null;

  const sync = async () => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { data } = await api.post('/strava/sync', null, { timeout: 10 * 60 * 1000 });
      await load();
      setMsg(`Imported or updated ${data.synced} Strava activities.`);
    } catch (error) {
      await load();
      const data = error.response?.data;
      if (data?.code === 'strava_reauth' || error.response?.status === 401 || /401|unauthorized/i.test(data?.message || '')) {
        setErr('Strava access expired. Try Reconnect to continue syncing.');
      } else {
        setErr(data?.message || 'Sync failed. Try Reconnect if this keeps happening.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!strava) return null;

  const needsReconnect = Boolean(strava.needsReconnect) || /401|unauthorized|access expired/i.test(String(strava.lastSyncError || err || ''));
  const syncError = needsReconnect
    ? 'Strava access expired. Try Reconnect to continue syncing.'
    : strava?.lastSyncError;

  return (
    <div className={`card mb-5 ${connected ? 'border-accent/40' : 'border-accent/60'}`}>
      <div className={`flex ${connected ? 'flex-col sm:flex-row sm:items-center' : 'flex-col'} justify-between gap-3`}>
        <div>
          <div className="font-semibold">{connected ? 'Strava connected' : 'Connect Strava to get started'}</div>
          <p className="text-sm text-muted mt-1">
            {connected
              ? `Last sync ${strava.lastSyncAt ? new Date(strava.lastSyncAt).toLocaleString() : 'not yet'}`
              : 'Authorize Strava to pull in your runs, rides, and swims automatically. This is the fastest way to fill your log.'}
          </p>
          {syncError && connected && (
            <p className="text-xs text-orange-300 mt-1">{syncError}</p>
          )}
          {idsMissing && (
            <p className="text-xs text-orange-300 mt-1">
              Strava is not configured on the API yet ({(missing.length ? missing : ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET']).join(', ')}).
            </p>
          )}
          {msg && <p className="text-xs text-brand mt-1">{msg}</p>}
          {err && (!syncError || err !== syncError) && <p className="text-xs text-orange-300 mt-1">{err}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          {connected ? (
            <>
              <button className="btn-primary btn-sm" type="button" onClick={sync} disabled={busy}>
                {busy || strava?.lastSyncStatus === 'running' ? 'Syncing…' : 'Sync Strava'}
              </button>
              <button
                className={`${needsReconnect ? 'btn-accent' : 'btn-outline'} btn-sm`}
                type="button"
                onClick={connect}
                disabled={busy}
              >
                Reconnect
              </button>
            </>
          ) : (
            <button className="btn-accent w-full sm:w-auto px-5 py-3" type="button" onClick={connect} disabled={busy || idsMissing}>
              {busy ? 'Opening Strava…' : 'Connect Strava'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
