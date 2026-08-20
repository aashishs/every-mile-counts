import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDuration, getActivityIcon } from '../utils/format';
import { COMPLETION_LABEL, formatKm, PROGRAM_STATUS_LABEL, statusClass } from '../utils/training';

export default function TrainingProgram() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [program, setProgram] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/training/programs/${id}`).then((res) => setProgram(res.data.program)).catch((err) => {
      setError(err.response?.data?.message || 'Program not found');
    });
  }, [id]);

  if (error) {
    return <Layout><div className="card text-rose-200">{error}</div></Layout>;
  }
  if (!program) return <Layout><p className="text-muted">Loading…</p></Layout>;
  const progress = program.progress || {};
  const home = user?.id === program.athleteId ? '/training' : '/coaches/training';

  return (
    <Layout>
      <p className="text-xs text-muted mb-2">
        <Link to={home} className="text-brand no-underline">{user?.id === program.athleteId ? 'My Training' : 'Training'}</Link>
      </p>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="page-title mb-1">{program.name}</h2>
          <p className="page-sub mb-0">
            {program.sport}
            {program.club?.name ? ` · ${program.club.name}` : ''}
            {program.targetEventName ? ` · ${program.targetEventName}` : ''}
          </p>
        </div>
        <span className={`badge ${statusClass(program.status)}`}>{PROGRAM_STATUS_LABEL[program.status]}</span>
      </div>
      {program.description && <p className="text-sm text-muted mb-4">{program.description}</p>}

      <div className="card mb-6">
        <div className="h-2 bg-ink rounded-full overflow-hidden mb-3">
          <div className="h-full bg-brand" style={{ width: `${progress.completionPct || 0}%` }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-muted text-xs">Workouts</div><div className="font-semibold">{progress.completedWorkouts} / {progress.totalWorkouts}</div></div>
          <div><div className="text-muted text-xs">Adherence</div><div className="font-semibold">{progress.adherencePct}%</div></div>
          <div><div className="text-muted text-xs">Planned</div><div className="font-semibold">{formatKm(progress.plannedDistance)}</div></div>
          <div><div className="text-muted text-xs">Actual</div><div className="font-semibold">{formatKm(progress.actualDistance)}</div></div>
        </div>
      </div>

      {(program.phases || []).map((phase) => (
        <section key={phase.id} className="mb-6">
          <h3 className="section-title">{phase.name}</h3>
          {phase.objective && <p className="text-sm text-muted">{phase.objective}</p>}
          {(phase.weeks || []).map((week) => (
            <div key={week.id} className="card mb-3">
              <div className="font-semibold mb-2">Week {week.weekNumber}{week.startDate ? ` · ${formatDate(week.startDate)}` : ''}</div>
              <div className="space-y-2">
                {(week.workouts || []).map((w) => (
                  <button key={w.id} type="button" className="w-full text-left rounded-xl border border-line p-3 hover:border-brand" onClick={() => navigate(`/training/workouts/${w.id}`)}>
                    <div className="flex justify-between gap-2">
                      <span>{getActivityIcon(w.sport)} {w.name || w.workoutType}</span>
                      <span className={`badge ${statusClass(w.completionStatus)}`}>{COMPLETION_LABEL[w.completionStatus]}</span>
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {formatDate(w.scheduledDate)}
                      {w.distance ? ` · ${formatKm(w.distance)}` : ''}
                      {w.duration ? ` · ${formatDuration(w.duration)}` : ''}
                    </div>
                  </button>
                ))}
                {!(week.workouts || []).length && <p className="text-muted text-sm mb-0">No workouts in this week.</p>}
              </div>
            </div>
          ))}
        </section>
      ))}
    </Layout>
  );
}
