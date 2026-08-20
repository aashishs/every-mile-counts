import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { ACTIVITY_TYPE_OPTIONS, formatDate, getActivityIcon } from '../utils/format';
import {
  COMPLETION_LABEL,
  inputToPace,
  metersToKmInput,
  minutesFromSeconds,
  paceToInput,
  PROGRAM_STATUS_LABEL,
  secondsFromMinutes,
  statusClass,
  WORKOUT_TYPES,
} from '../utils/training';

const emptyWorkout = {
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

export default function CoachProgramEditor() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const [program, setProgram] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    clubId: '',
    sport: 'Run',
    startDate: '',
    endDate: '',
    targetEventName: '',
  });
  const [phaseName, setPhaseName] = useState('');
  const [weekForm, setWeekForm] = useState({ phaseId: '', startDate: '' });
  const [workoutForm, setWorkoutForm] = useState(emptyWorkout);
  const [weekId, setWeekId] = useState('');
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [athleteId, setAthleteId] = useState('');

  const loadProgram = async (programId) => {
    const { data } = await api.get(`/training/programs/${programId}`);
    if (data.canEdit === false) {
      navigate(`/training/programs/${programId}`, { replace: true });
      return;
    }
    setProgram(data.program);
    setForm({
      name: data.program.name || '',
      description: data.program.description || '',
      clubId: data.program.clubId,
      sport: data.program.sport || 'Run',
      startDate: String(data.program.startDate || '').slice(0, 10),
      endDate: String(data.program.endDate || '').slice(0, 10),
      targetEventName: data.program.targetEventName || '',
    });
  };

  useEffect(() => {
    api.get('/clubs/mine').then((res) => setClubs(res.data.clubs || res.data || [])).catch(() => setClubs([]));
    api.get('/coaches/my-athletes', { params: { limit: 100 } }).then((res) => setAthletes(res.data.athletes || [])).catch(() => setAthletes([]));
  }, []);

  useEffect(() => {
    if (isNew) return undefined;
    loadProgram(id).catch((err) => setError(err.response?.data?.message || 'Could not load program'));
  }, [id, isNew]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/training/programs', form);
      navigate(`/coaches/programs/${data.program.id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create program');
    }
  };

  const saveMeta = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/training/programs/${program.id}`, form);
      await loadProgram(program.id);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save program');
    }
  };

  const run = async (fn) => {
    setError('');
    try {
      await fn();
      if (program?.id) await loadProgram(program.id);
    } catch (err) {
      setError(err.response?.data?.message || 'Request failed');
    }
  };

  if (isNew) {
    return (
      <Layout>
        <h2 className="page-title">New training program</h2>
        <p className="page-sub">Club context is required so only coaches in that club can later share reviews.</p>
        {error && <div className="card text-rose-200 mb-4">{error}</div>}
        <form className="card grid md:grid-cols-2 gap-3" onSubmit={create}>
          <input required placeholder="Program name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select required value={form.clubId} onChange={(e) => setForm({ ...form, clubId: e.target.value })}>
            <option value="">Club</option>
            {(Array.isArray(clubs) ? clubs : []).filter((c) => ['coach', 'club_admin'].includes(c.role)).map((c) => (
              <option key={c.id || c.clubId} value={c.id || c.clubId}>{c.name || c.clubName}</option>
            ))}
          </select>
          <select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })}>
            {ACTIVITY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input placeholder="Target race / event" value={form.targetEventName} onChange={(e) => setForm({ ...form, targetEventName: e.target.value })} />
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <textarea className="md:col-span-2" placeholder="Objective / description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button className="btn-primary md:col-span-2" type="submit">Create draft</button>
        </form>
      </Layout>
    );
  }

  if (!program && !error) return <Layout><p className="text-muted">Loading…</p></Layout>;
  if (error && !program) return <Layout><div className="card text-rose-200">{error}</div></Layout>;

  const clubAthletes = athletes.filter((a) => !form.clubId || a.clubId === form.clubId || !a.clubId);
  const progress = program.progress || {};

  return (
    <Layout>
      <p className="text-xs text-muted mb-2">
        <Link to="/coaches/training" className="text-brand no-underline">Training</Link>
      </p>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="page-title mb-1">{program.name}</h2>
          <p className="page-sub mb-0">{program.club?.name} · {program.sport}</p>
        </div>
        <span className={`badge ${statusClass(program.status)}`}>{PROGRAM_STATUS_LABEL[program.status]}</span>
      </div>
      {error && <div className="card text-rose-200 mb-4">{error}</div>}

      <form className="card grid md:grid-cols-2 gap-3 mb-6" onSubmit={saveMeta}>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })}>
          {ACTIVITY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        <input className="md:col-span-2" placeholder="Target race / event" value={form.targetEventName} onChange={(e) => setForm({ ...form, targetEventName: e.target.value })} />
        <textarea className="md:col-span-2" placeholder="Objective" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="btn-outline md:col-span-2" type="submit">Save details</button>
      </form>

      <div className="card mb-6 grid md:grid-cols-2 gap-3">
        <div>
          <label>Assign athlete</label>
          <div className="flex gap-2">
            <select value={athleteId || program.athleteId || ''} onChange={(e) => setAthleteId(e.target.value)}>
              <option value="">Choose athlete in this club</option>
              {clubAthletes.map((a) => (
                <option key={a.athleteId} value={a.athleteId}>{a.firstName} {a.lastName}</option>
              ))}
            </select>
            <button className="btn-primary" type="button" onClick={() => run(() => api.post(`/training/programs/${program.id}/assign`, { athleteId: athleteId || program.athleteId }))}>
              Assign
            </button>
          </div>
        </div>
        <div>
          <label>Program status</label>
          <div className="flex flex-wrap gap-2">
            {program.status === 'draft' && <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.post(`/training/programs/${program.id}/status`, { status: 'active' }))}>Activate</button>}
            {program.status === 'active' && <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.post(`/training/programs/${program.id}/status`, { status: 'paused' }))}>Pause</button>}
            {program.status === 'paused' && <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.post(`/training/programs/${program.id}/status`, { status: 'active' }))}>Resume</button>}
            {['active', 'paused'].includes(program.status) && <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.post(`/training/programs/${program.id}/status`, { status: 'halted' }))}>Halt</button>}
            {program.status === 'halted' && <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.post(`/training/programs/${program.id}/status`, { status: 'active' }))}>Resume</button>}
            {['active', 'paused'].includes(program.status) && <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.post(`/training/programs/${program.id}/status`, { status: 'completed' }))}>Complete</button>}
            {program.status !== 'archived' && <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.post(`/training/programs/${program.id}/status`, { status: 'archived' }))}>Archive</button>}
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="h-2 bg-ink rounded-full overflow-hidden mb-3">
          <div className="h-full bg-brand" style={{ width: `${progress.completionPct || 0}%` }} />
        </div>
        <div className="text-sm text-muted">
          {progress.completedWorkouts || 0} / {progress.totalWorkouts || 0} workouts · {progress.adherencePct || 0}% adherence
        </div>
      </div>

      <div className="card mb-6 flex flex-col sm:flex-row gap-2">
        <input placeholder="Phase name (Base, Build, Peak)" value={phaseName} onChange={(e) => setPhaseName(e.target.value)} />
        <button className="btn-outline" type="button" onClick={() => run(async () => {
          await api.post(`/training/programs/${program.id}/phases`, { name: phaseName || 'Phase' });
          setPhaseName('');
        })}>Add phase</button>
      </div>

      {(program.phases || []).map((phase) => (
        <section key={phase.id} className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="section-title mb-0">{phase.name}</h3>
            <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.delete(`/training/phases/${phase.id}`))}>Delete phase</button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input type="date" value={weekForm.phaseId === phase.id ? weekForm.startDate : ''} onChange={(e) => setWeekForm({ phaseId: phase.id, startDate: e.target.value })} />
            <button className="btn-outline btn-sm" type="button" onClick={() => run(async () => {
              await api.post(`/training/phases/${phase.id}/weeks`, { startDate: weekForm.phaseId === phase.id ? weekForm.startDate : null });
              setWeekForm({ phaseId: '', startDate: '' });
            })}>Add week</button>
          </div>
          {(phase.weeks || []).map((week) => (
            <div key={week.id} className="card mb-3">
              <div className="flex justify-between gap-2 mb-3">
                <div className="font-semibold">Week {week.weekNumber}{week.startDate ? ` · ${formatDate(week.startDate)}` : ''}</div>
                <div className="flex gap-2">
                  <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.post(`/training/weeks/${week.id}/copy`, { shiftDays: 7 }))}>Copy week</button>
                  <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.delete(`/training/weeks/${week.id}`))}>Delete</button>
                </div>
              </div>
              {(week.workouts || []).map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-2 py-2 border-t border-line">
                  <button type="button" className="text-left bg-transparent border-0 p-0" onClick={() => navigate(`/training/workouts/${w.id}`)}>
                    <div className="font-medium">{getActivityIcon(w.sport)} {w.name || w.workoutType}</div>
                    <div className="text-xs text-muted">{formatDate(w.scheduledDate)} · {w.workoutType}</div>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${statusClass(w.completionStatus)}`}>{COMPLETION_LABEL[w.completionStatus]}</span>
                    <button className="btn-outline btn-sm" type="button" onClick={() => {
                      setEditingWorkout(w);
                      setWeekId(week.id);
                      setWorkoutForm({
                        ...emptyWorkout,
                        name: w.name || '',
                        sport: w.sport,
                        workoutType: w.workoutType,
                        scheduledDate: String(w.scheduledDate).slice(0, 10),
                        distance: metersToKmInput(w.distance),
                        duration: minutesFromSeconds(w.duration),
                        targetPace: paceToInput(w.targetPace),
                        targetHrZone: w.targetHrZone || '',
                        targetHr: w.targetHr || '',
                        targetPower: w.targetPower || '',
                        rpe: w.rpe || '',
                        warmup: w.warmup || '',
                        mainSet: w.mainSet || '',
                        cooldown: w.cooldown || '',
                        instructions: w.instructions || '',
                        coachNotes: w.coachNotes || '',
                      });
                    }}>Edit</button>
                    <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.post(`/training/workouts/${w.id}/duplicate`))}>Copy</button>
                    <button className="btn-outline btn-sm" type="button" onClick={() => run(() => api.delete(`/training/workouts/${w.id}`))}>Delete</button>
                  </div>
                </div>
              ))}
              <button className="btn-outline btn-sm mt-3" type="button" onClick={() => {
                setEditingWorkout(null);
                setWeekId(week.id);
                setWorkoutForm({ ...emptyWorkout, sport: program.sport, scheduledDate: String(week.startDate || program.startDate || '').slice(0, 10) });
              }}>Add workout</button>
              {weekId === week.id && (
                <WorkoutForm
                  form={workoutForm}
                  setForm={setWorkoutForm}
                  onCancel={() => { setWeekId(''); setEditingWorkout(null); }}
                  onSave={() => run(async () => {
                    const payload = payloadFromForm(workoutForm);
                    if (editingWorkout) await api.patch(`/training/workouts/${editingWorkout.id}`, payload);
                    else await api.post(`/training/weeks/${week.id}/workouts`, payload);
                    setWeekId('');
                    setEditingWorkout(null);
                    setWorkoutForm(emptyWorkout);
                  })}
                />
              )}
            </div>
          ))}
        </section>
      ))}
    </Layout>
  );
}

function payloadFromForm(form) {
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

function WorkoutForm({ form, setForm, onSave, onCancel }) {
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
        <button className="btn-primary" type="submit">Save workout</button>
        <button className="btn-outline" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
