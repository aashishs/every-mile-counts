import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ACTIVITY_TYPE_OPTIONS } from '../utils/format';
import ActivityTypePicker from './ActivityTypePicker';
import ConfirmDialog from './ConfirmDialog';

const ALL_TYPES = ACTIVITY_TYPE_OPTIONS.map((opt) => opt.value);

function sameTypes(a, b) {
  const left = [...(a || [])].sort().join('|');
  const right = [...(b || [])].sort().join('|');
  return left === right;
}

export default function ActivityTypesSettings({ user }) {
  const { refresh, updateUser } = useAuth();
  const [selected, setSelected] = useState(() => (
    Array.isArray(user?.syncActivityTypes) && user.syncActivityTypes.length
      ? user.syncActivityTypes
      : ALL_TYPES
  ));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirmResync, setConfirmResync] = useState(false);
  const [strava, setStrava] = useState(null);

  const savedTypes = useMemo(
    () => (Array.isArray(user?.syncActivityTypes) && user.syncActivityTypes.length ? user.syncActivityTypes : ALL_TYPES),
    [user?.syncActivityTypes]
  );

  useEffect(() => {
    setSelected(savedTypes);
  }, [savedTypes]);

  useEffect(() => {
    api.get('/strava/status').then((res) => setStrava(res.data)).catch(() => setStrava({ connected: false }));
  }, [user?.id]);

  const dirty = !sameTypes(selected, savedTypes);
  const canSave = selected.length > 0;
  const willResync = Boolean(strava?.connected || strava?.lastSyncAt);
  const needsFirstPick = !user?.syncActivityTypesConfirmed && !strava?.connected && !strava?.lastSyncAt;

  const persist = async () => {
    const { data } = await api.post('/strava/activity-types', { types: selected }, { timeout: 10 * 60 * 1000 });
    if (data?.user) updateUser(data.user);
    else await refresh();
    return data;
  };

  const save = async () => {
    if (!canSave) {
      setErr('Select at least one activity type.');
      return;
    }
    if (willResync && dirty) {
      setConfirmResync(true);
      return;
    }
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await persist();
      setMsg('Activity types saved. Dashboard, log, and analytics will only show these sports.');
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
      const data = await persist();
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

  return (
    <div className="card mb-6">
      <div className="font-semibold">Activity types to sync and view</div>
      <p className="text-sm text-muted mt-1 mb-3">
        {needsFirstPick
          ? 'All sports are selected by default. Uncheck any you do not want before the first Strava sync. Filters on other pages follow this list.'
          : willResync
            ? 'These sports appear in your dashboard, log, and analytics. Changing them later will re-sync Strava.'
            : 'These sports appear in your dashboard, log, and analytics.'}
      </p>
      <ActivityTypePicker value={selected} onChange={setSelected} disabled={busy} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn-primary btn-sm" type="button" onClick={save} disabled={busy || !canSave || !dirty}>
          {busy ? 'Saving…' : 'Save activity types'}
        </button>
        {!canSave && <p className="text-xs text-orange-300 mb-0">Select at least one sport.</p>}
        {msg && <p className="text-xs text-brand mb-0">{msg}</p>}
        {err && <p className="text-xs text-orange-300 mb-0">{err}</p>}
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
