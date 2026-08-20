import { useState } from 'react';
import { ACTIVITY_TYPE_OPTIONS } from '../utils/format';
import {
  inputToPace,
  minutesFromSeconds,
  paceToInput,
  secondsFromMinutes,
  WORKOUT_TYPES,
} from '../utils/training';

export const emptyWorkout = {
  name: '',
  sport: 'Run',
  workoutType: 'Easy',
  scheduledDate: '',
  distance: '',
  duration: '',
  targetPace: '',
  targetHrZone: '',
  targetHr: '',
  targetPower: '',
  rpe: '',
  warmup: '',
  mainSet: '',
  cooldown: '',
  instructions: '',
  coachNotes: '',
};

export function payloadFromForm(form) {
  const workoutType = form.workoutType || 'Easy';
  return {
    ...form,
    name: String(form.name || '').trim() || workoutType,
    workoutType,
    distance: form.distance === '' ? null : Number(form.distance),
    duration: secondsFromMinutes(form.duration),
    targetPace: inputToPace(form.targetPace),
    targetHrZone: form.targetHrZone === '' ? null : Number(form.targetHrZone),
    targetHr: form.targetHr === '' ? null : Number(form.targetHr),
    targetPower: form.targetPower === '' ? null : Number(form.targetPower),
    rpe: form.rpe === '' ? null : Number(form.rpe),
  };
}

function Field({ label, hint, className = '', children }) {
  return (
    <div className={className}>
      <label>{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-muted mt-1 mb-0">{hint}</p> : null}
    </div>
  );
}

export default function WorkoutForm({
  form,
  setForm,
  onSave,
  onCancel,
  submitLabel = 'Save session',
  busy = false,
}) {
  const [showDetails, setShowDetails] = useState(Boolean(
    form.warmup || form.mainSet || form.cooldown || form.instructions || form.coachNotes
    || form.targetHr || form.targetHrZone || form.targetPower || form.rpe
  ));
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const rest = String(form.workoutType || '').toLowerCase() === 'rest';

  return (
    <form className="grid md:grid-cols-2 gap-3" onSubmit={(event) => { event.preventDefault(); if (!busy) onSave(); }}>
      <Field label="Date">
        <input type="date" required value={form.scheduledDate} onChange={set('scheduledDate')} />
      </Field>
      <Field label="Title" hint="Leave blank to use the session type">
        <input placeholder="e.g. Easy 8 km" value={form.name} onChange={set('name')} />
      </Field>
      <Field label="Sport">
        <select value={form.sport} onChange={set('sport')}>
          {ACTIVITY_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
      <Field label="Session type">
        <select value={form.workoutType} onChange={set('workoutType')}>
          {WORKOUT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </Field>
      {!rest && (
        <>
          <Field label="Distance (km)">
            <input type="number" min="0" step="0.1" placeholder="e.g. 8" value={form.distance} onChange={set('distance')} />
          </Field>
          <Field label="Duration (minutes)">
            <input type="number" min="0" placeholder="e.g. 45" value={form.duration} onChange={set('duration')} />
          </Field>
          <Field label="Target pace" hint="Minutes:seconds per km">
            <input placeholder="e.g. 5:30" value={form.targetPace} onChange={set('targetPace')} />
          </Field>
        </>
      )}
      <div className="md:col-span-2">
        <button type="button" className="text-sm text-brand bg-transparent border-0 p-0" onClick={() => setShowDetails((open) => !open)}>
          {showDetails ? 'Hide extra details' : 'Add warm-up, notes, HR / power'}
        </button>
      </div>
      {showDetails && (
        <>
          <Field label="HR zone (1–5)">
            <input type="number" min="1" max="5" value={form.targetHrZone} onChange={set('targetHrZone')} />
          </Field>
          <Field label="Target HR (bpm)">
            <input type="number" min="0" value={form.targetHr} onChange={set('targetHr')} />
          </Field>
          <Field label="Target power">
            <input type="number" min="0" value={form.targetPower} onChange={set('targetPower')} />
          </Field>
          <Field label="RPE (1–10)">
            <input type="number" min="1" max="10" value={form.rpe} onChange={set('rpe')} />
          </Field>
          <Field label="Warm-up" className="md:col-span-2">
            <textarea rows={2} value={form.warmup} onChange={set('warmup')} />
          </Field>
          <Field label="Main set" className="md:col-span-2">
            <textarea rows={3} value={form.mainSet} onChange={set('mainSet')} />
          </Field>
          <Field label="Cool-down" className="md:col-span-2">
            <textarea rows={2} value={form.cooldown} onChange={set('cooldown')} />
          </Field>
          <Field label="Instructions for the athlete" className="md:col-span-2">
            <textarea rows={2} value={form.instructions} onChange={set('instructions')} />
          </Field>
          <Field label="Private coach notes" className="md:col-span-2">
            <textarea rows={2} value={form.coachNotes} onChange={set('coachNotes')} />
          </Field>
        </>
      )}
      <div className="md:col-span-2 flex gap-2">
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel ? <button className="btn-outline" type="button" disabled={busy} onClick={onCancel}>Cancel</button> : null}
      </div>
    </form>
  );
}

export function workoutFormFromRecord(w, extras = {}) {
  return {
    ...emptyWorkout,
    name: w.name || '',
    sport: w.sport,
    workoutType: w.workoutType,
    scheduledDate: String(w.scheduledDate || '').slice(0, 10),
    distance: extras.distance ?? '',
    duration: extras.duration ?? minutesFromSeconds(w.duration),
    targetPace: extras.targetPace ?? paceToInput(w.targetPace),
    targetHrZone: w.targetHrZone || '',
    targetHr: w.targetHr || '',
    targetPower: w.targetPower || '',
    rpe: w.rpe || '',
    warmup: w.warmup || '',
    mainSet: w.mainSet || '',
    cooldown: w.cooldown || '',
    instructions: w.instructions || '',
    coachNotes: w.coachNotes || '',
  };
}
