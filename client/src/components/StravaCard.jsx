import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ACTIVITY_TYPE_OPTIONS } from '../utils/format';
import { isAthleteAccount } from '../utils/roles';
import ActivityTypePicker from './ActivityTypePicker';
import ConfirmDialog from './ConfirmDialog';

const ALL_TYPES = ACTIVITY_TYPE_OPTIONS.map((opt) => opt.value);

function sameTypes(a, b) {
  const left = [...(a || [])].sort().join('|');
  const right = [...(b || [])].sort().join('|');
  return left === right;
}

export default function StravaCard({ user, autoConnect = false }) {
  const hidden = !isAthleteAccount(user);
  const { refresh, updateUser } = useAuth();
  const [strava, setStrava] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState(() => (
    Array.isArray(user?.syncActivityTypes) && user.syncActivityTypes.length
      ? user.syncActivityTypes
      : ALL_TYPES
  ));
  const [confirmResync, setConfirmResync] = useState(false);
  const autoStarted = useRef(false);

  const savedTypes = useMemo(
    () => (Array.isArray(user?.syncActivityTypes) && user.syncActivityTypes.length ? user.syncActivityTypes : ALL_TYPES),
    [user?.syncActivityTypes]
  );

  useEffect(() => {
    setSelected(savedTypes);
  }, [savedTypes]);

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
  const needsFirstPick = Boolean(strava?.needsFirstTypePick) || (!user?.syncActivityTypesConfirmed && !connected && !strava?.lastSyncAt);
  const dirty = !sameTypes(selected, savedTypes);
  const canSaveTypes = selected.length > 0;

  const persistTypes = async () => {
    const { data } = await api.post('/strava/activity-types', { types: selected }, { timeout: 10 * 60 * 1000 });
    if (data?.user) updateUser(data.user);
    else await refresh();
    await load();
    return data;
  };

  const connect = async () => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      if (needsFirstPick || (dirty && !connected)) {
        await persistTypes();
      }
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
    if (needsFirstPick) return;
    autoStarted.current = true;
    connect();
  }, [autoConnect, hidden, strava, connected, idsMissing, busy, needsFirstPick]);

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

  const saveTypes = async () => {
    if (!canSaveTypes) {
      setErr('Select at least one activity type.');
      return;
    }
    if ((connected || strava?.lastSyncAt) && dirty) {
      setConfirmResync(true);
      return;
    }
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await persistTypes();
      setMsg('Activity types saved. Connect Strava when you are ready.');
    } catch (error) {
      setErr(error.response?.data?.message || 'Could not save activity types');
    } finally {
      setBusy(false);
    }
  };

  const confirmAndResync = async () => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const data = await persistTypes();
      setConfirmResync(false);
      if (data?.resynced) {
        setMsg(`Activity types updated. Re-synced ${data.synced || 0} Strava activities.`);
      } else {
        setMsg('Activity types saved.');
      }
    } catch (error) {
      setErr(error.response?.data?.message || 'Could not update activity types');
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
            <button
              className="btn-accent w-full sm:w-auto px-5 py-3"
              type="button"
              onClick={connect}
              disabled={busy || idsMissing || !canSaveTypes}
            >
              {busy ? 'Opening Strava…' : needsFirstPick ? 'Save types & connect Strava' : 'Connect Strava'}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="font-medium text-sm">Activity types to sync and view</div>
        <p className="text-xs text-muted mt-1 mb-3">
          {needsFirstPick
            ? 'All sports are selected by default. Uncheck any you do not want before the first sync.'
            : 'Changing these later removes unchecked Strava sports from your log and re-syncs the rest.'}
        </p>
        <ActivityTypePicker value={selected} onChange={setSelected} disabled={busy} />
        {(needsFirstPick || dirty) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {connected || strava?.lastSyncAt ? (
              <button className="btn-outline btn-sm" type="button" onClick={saveTypes} disabled={busy || !canSaveTypes}>
                Save activity types
              </button>
            ) : needsFirstPick && !connected ? (
              <p className="text-xs text-muted mb-0">Connect Strava to save this selection and start the first sync.</p>
            ) : (
              <button className="btn-outline btn-sm" type="button" onClick={saveTypes} disabled={busy || !canSaveTypes}>
                Save activity types
              </button>
            )}
            {!canSaveTypes && <p className="text-xs text-orange-300 mb-0">Select at least one sport.</p>}
          </div>
        )}
      </div>

      {confirmResync && (
        <ConfirmDialog
          title="Change activity types?"
          confirmLabel="Change and re-sync"
          busy={busy}
          error={err}
          onCancel={() => {
            if (!busy) {
              setConfirmResync(false);
              setSelected(savedTypes);
            }
          }}
          onConfirm={confirmAndResync}
        >
          <p>
            Changing activity types will re-sync from Strava. Sports you uncheck will be removed from your Strava log, and newly checked sports will be imported.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
