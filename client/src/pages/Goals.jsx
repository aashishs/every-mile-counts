import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import GoalCard from '../components/GoalCard';
import Layout from '../components/Layout';
import { DurationPicker, secondsFromTime, timeFromSeconds } from '../components/MonthCalendar';
import { useAuth } from '../context/AuthContext';
import {
  ACTIVITY_TYPE_OPTIONS,
  GOAL_ACTIVITY_TYPES,
  GOAL_TYPES,
} from '../utils/format';
import { sortGoals } from '../utils/goals';

function emptyGoalForm(activityType = 'Run') {
  return {
    title: '',
    type: 'distance',
    activityType,
    km: '',
    targetTime: '',
    targetDate: '',
    notes: '',
    coachVisible: false,
  };
}

function kmFromMeters(meters) {
  const n = Number(meters);
  if (!(n > 0)) return '';
  return String(Number((n / 1000).toFixed(2)));
}

function formFromGoal(goal, fallbackSport) {
  const type = goal.type || 'distance';
  const needsKm = type === 'distance' || type === 'weekly_mileage' || type === 'race';
  const timeSeconds = type === 'time' ? goal.targetValue : goal.targetTime;
  return {
    title: goal.title || '',
    type,
    activityType: GOAL_ACTIVITY_TYPES.includes(goal.activityType) ? goal.activityType : fallbackSport,
    km: needsKm ? kmFromMeters(goal.targetValue) : '',
    targetTime: type === 'time' || type === 'race' ? timeFromSeconds(timeSeconds) : '',
    targetDate: goal.targetDate || '',
    notes: goal.notes || '',
    coachVisible: Boolean(goal.coachVisible),
  };
}

export default function Goals() {
  const { user } = useAuth();
  const typeOptions = ACTIVITY_TYPE_OPTIONS.filter((opt) => GOAL_ACTIVITY_TYPES.includes(opt.value));
  const defaultSport = GOAL_ACTIVITY_TYPES.includes(user?.defaultActivityType)
    ? user.defaultActivityType
    : 'Run';
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState(() => emptyGoalForm(defaultSport));
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const needsKm = form.type === 'distance' || form.type === 'weekly_mileage' || form.type === 'race';
  const needsTime = form.type === 'time' || form.type === 'race';
  const dateRequired = form.type === 'race';

  const load = async () => {
    const r = await api.get('/goals');
    setGoals(r.data.goals || []);
  };
  useEffect(() => {
    load().catch((err) => {
      const status = err.response?.status;
      const message = err.response?.data?.message;
      setError(status >= 400 && status < 500 && message ? message : 'Could not load goals');
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const km = Number(form.km);
    const timeSeconds = secondsFromTime(form.targetTime);
    if (needsKm && !(km > 0)) {
      setError(form.type === 'weekly_mileage' ? 'Enter km per week' : 'Enter a target distance in km');
      return;
    }
    if (needsTime && !timeSeconds) {
      setError('Enter a goal time');
      return;
    }
    if (!form.activityType) {
      setError('Choose an activity type');
      return;
    }
    if (dateRequired && !form.targetDate) {
      setError('Race date is required');
      return;
    }
    setBusy(true);
    try {
      const isTime = form.type === 'time';
      const payload = {
        title: form.title.trim(),
        type: form.type,
        activityType: form.activityType,
        targetValue: isTime ? timeSeconds : needsKm ? km * 1000 : null,
        targetUnit: isTime ? 'seconds' : needsKm ? 'meters' : null,
        targetTime: form.type === 'race' ? timeSeconds : null,
        targetDate: form.targetDate || null,
        notes: form.notes.trim() || null,
        coachVisible: Boolean(form.coachVisible),
      };
      if (editingId) await api.put(`/goals/${editingId}`, payload);
      else await api.post('/goals', payload);
      setEditingId(null);
      setForm(emptyGoalForm(form.activityType));
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message;
      setError(status >= 400 && status < 500 && message ? message : 'Could not save goal');
      setBusy(false);
      return;
    }
    try {
      await load();
    } catch {
      setError('Goal saved, but the list could not be refreshed');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (goal) => {
    setError('');
    setEditingId(goal.id);
    setForm(formFromGoal(goal, defaultSport));
    document.getElementById('goalTitle')?.focus();
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError('');
    setForm(emptyGoalForm(form.activityType || defaultSport));
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this goal?')) return;
    if (editingId === id) cancelEdit();
    await api.delete(`/goals/${id}`);
    await load();
  };

  const markCompleted = async (goal) => {
    if (!window.confirm(`Mark “${goal.title}” as completed?`)) return;
    setError('');
    try {
      await api.post(`/goals/${goal.id}/complete`);
      if (editingId === goal.id) cancelEdit();
      await load();
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message;
      setError(status >= 400 && status < 500 && message ? message : 'Could not mark goal completed');
    }
  };

  const setShare = async (goal, coachVisible) => {
    setError('');
    try {
      await api.post(`/goals/${goal.id}/share`, { coachVisible });
      if (editingId === goal.id) setForm((f) => ({ ...f, coachVisible }));
      await load();
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message;
      setError(status >= 400 && status < 500 && message ? message : 'Could not update coach sharing');
    }
  };

  return (
    <Layout>
      <h2 className="page-title">Goals</h2>
      <p className="page-sub">Race times, weekly km, and PBs. Progress updates from your log.</p>
      <form className="card space-y-3 mb-6 max-w-lg" onSubmit={submit}>
        {editingId && <h3 className="font-semibold mb-0">Edit goal</h3>}
        <div>
          <label htmlFor="goalTitle">Title</label>
          <input
            id="goalTitle"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={form.type === 'race' ? 'Mumbai Marathon' : 'Goal name'}
            required
          />
        </div>
        <div>
          <label htmlFor="goalActivityType">Activity type</label>
          <select
            id="goalActivityType"
            value={form.activityType}
            onChange={(e) => setForm({ ...form, activityType: e.target.value })}
            required
          >
            {typeOptions.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="goalType">Type</label>
          <select
            id="goalType"
            value={form.type}
            onChange={(e) => setForm({
              ...emptyGoalForm(form.activityType),
              type: e.target.value,
              title: form.title,
              notes: form.notes,
              coachVisible: form.coachVisible,
            })}
          >
            {GOAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        {needsKm && (
          <div>
            <label htmlFor="goalKm">{form.type === 'weekly_mileage' ? 'Target km per week' : 'Distance (km)'}</label>
            <input
              id="goalKm"
              type="number"
              min="0.1"
              step="0.1"
              value={form.km}
              onChange={(e) => setForm({ ...form, km: e.target.value })}
              required
            />
            {form.type === 'weekly_mileage' && (
              <p className="text-xs text-muted mt-1 mb-0">
                Counts this week only, then resets. Change the week start on{' '}
                <Link to="/profile" className="text-brand no-underline">Profile</Link>.
              </p>
            )}
          </div>
        )}
        {needsTime && (
          <DurationPicker
            value={form.targetTime}
            onChange={(targetTime) => setForm({ ...form, targetTime })}
            label={form.type === 'race' ? 'Goal finish time' : 'Target time'}
          />
        )}
        {(dateRequired || form.type === 'distance' || form.type === 'time' || form.type === 'challenge') && (
          <div>
            <label htmlFor="goalDate">{form.type === 'race' ? 'Race date' : 'By date'}</label>
            <input
              id="goalDate"
              type="date"
              value={form.targetDate}
              onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
              required={dateRequired}
            />
          </div>
        )}
        <div>
          <label htmlFor="goalNotes">Notes</label>
          <textarea id="goalNotes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
        </div>
        <label className="flex items-start gap-3 mb-0 font-normal cursor-pointer">
          <input
            id="goalCoachVisible"
            type="checkbox"
            className="mt-[3px]"
            checked={Boolean(form.coachVisible)}
            onChange={(e) => setForm({ ...form, coachVisible: e.target.checked })}
          />
          <span className="text-sm leading-5">Assigned coaches can see this goal</span>
        </label>
        {error && <p className="text-sm text-orange-300 mb-0">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create goal'}
          </button>
          {editingId && (
            <button className="btn-outline" type="button" disabled={busy} onClick={cancelEdit}>Cancel</button>
          )}
        </div>
      </form>
      <div className="space-y-3 max-w-lg">
        {sortGoals(goals).map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            onShareChange={editingId === g.id ? undefined : (visible) => setShare(g, visible)}
            actions={(
              <>
                {g.status !== 'completed' && (
                  <>
                    <button type="button" className="btn-outline btn-sm" onClick={() => startEdit(g)}>
                      {editingId === g.id ? 'Editing' : 'Edit'}
                    </button>
                    <button type="button" className="btn-outline btn-sm" onClick={() => markCompleted(g)}>
                      Mark completed
                    </button>
                  </>
                )}
                <button type="button" className="btn-outline btn-sm" onClick={() => remove(g.id)}>Remove</button>
              </>
            )}
          />
        ))}
        {!goals.length && <div className="card text-muted">No goals yet. Choose a type above and fill the fields for that goal.</div>}
      </div>
    </Layout>
  );
}
