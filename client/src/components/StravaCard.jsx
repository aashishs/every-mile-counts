import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ACTIVITY_TYPE_OPTIONS } from '../utils/format';
import { isAthleteAccount } from '../utils/roles';
import ConfirmDialog from './ConfirmDialog';
import { ConnectWithStravaButton, PoweredByStrava } from './StravaBrand';

const ALL_TYPES = ACTIVITY_TYPE_OPTIONS.map((opt) => opt.value);

export default function StravaCard({ user, autoConnect = false }) {
  const hidden = !isAthleteAccount(user);
  const { refresh, updateUser } = useAuth();
  const [strava, setStrava] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [coachShare, setCoachShare] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const autoStarted = useRef(false);

  const load = async () => {
    if (hidden) return;
    try {
      const { data } = await api.get('/strava/status');
      setStrava(data);
      setCoachShare(Boolean(data.coachShareConsented));
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
  const needsFirstPick = Boolean(strava?.needsFirstTypePick) || (!user?.syncActivityTypesConfirmed && !connected && !strava?.lastSyncAt);
  const shareRequired = !connected && !coachShare && !strava?.coachShareConsented;
  const needsCoachShare = connected && !strava?.coachShareConsented;

  const confirmTypesIfNeeded = async () => {
    if (!needsFirstPick) return;
    const types = Array.isArray(user?.syncActivityTypes) && user.syncActivityTypes.length
      ? user.syncActivityTypes
      : ALL_TYPES;
    const { data } = await api.post('/strava/activity-types', { types }, { timeout: 60 * 1000 });
    if (data?.user) updateUser(data.user);
    else await refresh();
  };

  const connect = async () => {
    setErr('');
    setMsg('');
    if (!connected && !coachShare && !strava?.coachShareConsented) {
      setErr('Confirm that assigned coaches may view Strava-imported activities.');
      return;
    }
    setBusy(true);
    try {
      await confirmTypesIfNeeded();
      const { data } = await api.get('/strava/connect', { params: { coachShare: coachShare || strava?.coachShareConsented ? '1' : '0' } });
      if (!data?.url || !String(data.url).startsWith('https://www.strava.com/oauth/authorize')) {
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
    if (shareRequired) return;
    autoStarted.current = true;
    connect();
  }, [autoConnect, hidden, strava, connected, idsMissing, busy, shareRequired]);

  if (hidden) return null;

  const sync = async () => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { data } = await api.post('/strava/sync', null, { timeout: 10 * 60 * 1000 });
      await load();
      setMsg(`Imported or updated ${data.synced} activities from Strava.`);
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

  const saveShare = async (enabled) => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { data } = await api.post('/strava/coach-share', { enabled });
      setCoachShare(enabled);
      await load();
      setMsg(data.message);
    } catch (error) {
      setErr(error.response?.data?.message || 'Could not update coach sharing');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setErr('');
    setBusy(true);
    try {
      const { data } = await api.post('/strava/disconnect');
      setConfirmDisconnect(false);
      await load();
      setMsg(data.message);
    } catch (error) {
      setErr(error.response?.data?.message || 'Could not disconnect Strava');
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
      <div className="flex flex-col gap-3">
        <div>
          <div className="font-semibold">Compatible with Strava</div>
          <p className="text-sm text-muted mt-1">
            {connected
              ? `Last sync ${strava.lastSyncAt ? new Date(strava.lastSyncAt).toLocaleString() : 'not yet'}`
              : 'Authorize Strava to import your activities into Every Mile Counts. This is not an official Strava app.'}
          </p>
          <p className="text-xs text-muted mt-1 mb-0">
            Choose which sports to import in{' '}
            <Link to="/profile?tab=sports" className="text-brand font-semibold no-underline">Profile → Sports</Link>
            . Read how we use this data in{' '}
            <Link to="/privacy" className="text-brand font-semibold no-underline">Privacy</Link>.
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

        <div className="flex flex-col items-start gap-3">
          {(!connected || needsCoachShare) && (
            <label className="flex items-start gap-3 mb-0 font-normal cursor-pointer max-w-xl">
              <input
                type="checkbox"
                className="mt-[3px]"
                checked={coachShare}
                onChange={(event) => setCoachShare(event.target.checked)}
              />
              <span className="text-sm leading-5">
                I allow my assigned coaches to view activities imported from Strava.
                {connected ? ' Save this before they can see those sessions.' : ''}
              </span>
            </label>
          )}

          {connected && strava.coachShareConsented && (
            <label className="flex items-start gap-3 mb-0 font-normal cursor-pointer max-w-xl">
              <input
                type="checkbox"
                className="mt-[3px]"
                checked={coachShare}
                disabled={busy}
                onChange={(event) => saveShare(event.target.checked)}
              />
              <span className="text-sm leading-5">Assigned coaches may view my Strava-imported activities</span>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {connected ? (
              <>
                {needsCoachShare ? (
                  <button className="btn-primary btn-sm" type="button" disabled={busy || !coachShare} onClick={() => saveShare(true)}>
                    {busy ? 'Saving…' : 'Allow coaches to view'}
                  </button>
                ) : (
                  <button className="btn-primary btn-sm" type="button" onClick={sync} disabled={busy}>
                    {busy || strava?.lastSyncStatus === 'running' ? 'Syncing…' : 'Sync'}
                  </button>
                )}
                <button
                  className={`${needsReconnect ? 'btn-accent' : 'btn-outline'} btn-sm`}
                  type="button"
                  onClick={connect}
                  disabled={busy}
                >
                  Reconnect
                </button>
                <button className="btn-outline btn-sm" type="button" onClick={() => setConfirmDisconnect(true)} disabled={busy}>
                  Disconnect
                </button>
              </>
            ) : (
              <ConnectWithStravaButton onClick={connect} busy={busy} />
            )}
          </div>
        </div>
        <PoweredByStrava />
      </div>

      {confirmDisconnect && (
        <ConfirmDialog
          title="Disconnect Strava?"
          danger
          busy={busy}
          confirmLabel={busy ? 'Disconnecting…' : 'Disconnect'}
          onCancel={() => setConfirmDisconnect(false)}
          onConfirm={disconnect}
        >
          <p className="mb-0">
            This revokes Every Mile Counts’ access and removes Strava-imported activities from this app. Manual and file imports stay.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
