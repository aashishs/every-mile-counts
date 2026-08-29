import { useMemo, useState } from 'react';
import api from '../api/client';
import { ymdToday } from '../utils/training';

export default function DeployTemplate({
  template,
  athletes = [],
  groups = [],
  defaultAthleteId = '',
  defaultGroupId = '',
  onCancel,
  onDone,
}) {
  const clubAthletes = useMemo(
    () => athletes.filter((a) => !template.clubId || a.clubId === template.clubId || !a.clubId),
    [athletes, template.clubId]
  );
  const clubGroups = useMemo(
    () => groups.filter((g) => !template.clubId || g.clubId === template.clubId),
    [groups, template.clubId]
  );
  const [athleteId, setAthleteId] = useState(defaultAthleteId || '');
  const [groupId, setGroupId] = useState(defaultGroupId || '');
  const [startDate, setStartDate] = useState(ymdToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const use = async (e) => {
    e.preventDefault();
    setError('');
    if (!athleteId && !groupId) {
      setError('Choose an athlete or a group');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/training/templates/${template.id}/deploy`, {
        athleteId: groupId ? undefined : athleteId,
        groupId: groupId || undefined,
        startDate,
      });
      onDone?.(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not assign this template');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 grid place-items-center p-4 z-[60]"
      onClick={onCancel}
      role="presentation"
    >
      <form
        className="card w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={use}
      >
        <h3 className="font-semibold text-lg mb-0">Use {template.name}</h3>
        <p className="text-sm text-muted mb-0">
          Each athlete gets their own copy. Dates move so the plan’s first day lands on the start date.
        </p>
        {error ? <p className="text-sm text-orange-300 mb-0">{error}</p> : null}
        <div>
          <label htmlFor="tpl-athlete">Athlete</label>
          <select
            id="tpl-athlete"
            value={athleteId}
            disabled={Boolean(groupId)}
            onChange={(e) => {
              setAthleteId(e.target.value);
              if (e.target.value) setGroupId('');
            }}
          >
            <option value="">Choose athlete</option>
            {clubAthletes.map((a) => (
              <option key={a.athleteId} value={a.athleteId}>{a.firstName} {a.lastName}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tpl-group">Or group</label>
          <select
            id="tpl-group"
            value={groupId}
            disabled={Boolean(athleteId)}
            onChange={(e) => {
              setGroupId(e.target.value);
              if (e.target.value) setAthleteId('');
            }}
          >
            <option value="">Choose group</option>
            {clubGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.athleteCount || g.athletes?.length || 0})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tpl-start">Start date</label>
          <input id="tpl-start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Assigning…' : 'Assign copies'}</button>
        </div>
      </form>
    </div>
  );
}
