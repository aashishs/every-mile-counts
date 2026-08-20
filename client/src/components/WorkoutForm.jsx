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
  return {
    ...form,
    distance: form.distance === '' ? null : Number(form.distance),
    duration: secondsFromMinutes(form.duration),
    targetPace: inputToPace(form.targetPace),
    targetHrZone: form.targetHrZone === '' ? null : Number(form.targetHrZone),
    targetHr: form.targetHr === '' ? null : Number(form.targetHr),
    targetPower: form.targetPower === '' ? null : Number(form.targetPower),
    rpe: form.rpe === '' ? null : Number(form.rpe),
  };
}

export default function WorkoutForm({ form, setForm, onSave, onCancel, submitLabel = 'Save workout' }) {
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return (
    <form className="mt-4 grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <input placeholder="Workout name" value={form.name} onChange={set('name')} />
      <input type="date" required value={form.scheduledDate} onChange={set('scheduledDate')} />
      <select value={form.sport} onChange={set('sport')}>
        {ACTIVITY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select value={form.workoutType} onChange={set('workoutType')}>
        {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input type="number" step="0.1" placeholder="Distance km" value={form.distance} onChange={set('distance')} />
      <input type="number" placeholder="Duration minutes" value={form.duration} onChange={set('duration')} />
      <input placeholder="Pace mm:ss /km" value={form.targetPace} onChange={set('targetPace')} />
      <input type="number" min="1" max="5" placeholder="HR zone 1-5" value={form.targetHrZone} onChange={set('targetHrZone')} />
      <input type="number" placeholder="Target HR" value={form.targetHr} onChange={set('targetHr')} />
      <input type="number" placeholder="Target power" value={form.targetPower} onChange={set('targetPower')} />
      <input type="number" min="1" max="10" placeholder="RPE 1-10" value={form.rpe} onChange={set('rpe')} />
      <textarea className="md:col-span-2" placeholder="Warm-up" value={form.warmup} onChange={set('warmup')} />
      <textarea className="md:col-span-2" placeholder="Main workout" value={form.mainSet} onChange={set('mainSet')} />
      <textarea className="md:col-span-2" placeholder="Cool-down" value={form.cooldown} onChange={set('cooldown')} />
      <textarea className="md:col-span-2" placeholder="Instructions" value={form.instructions} onChange={set('instructions')} />
      <textarea className="md:col-span-2" placeholder="Coach notes" value={form.coachNotes} onChange={set('coachNotes')} />
      <div className="md:col-span-2 flex gap-2">
        <button className="btn-primary" type="submit">{submitLabel}</button>
        {onCancel ? <button className="btn-outline" type="button" onClick={onCancel}>Cancel</button> : null}
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
