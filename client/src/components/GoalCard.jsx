import { Link } from 'react-router-dom';
import { formatActivityPrimary, formatDate, formatDateTime } from '../utils/format';
import { formatKm } from '../utils/training';
import {
  goalMetaLine,
  goalStatusLabel,
  showsProgress,
  sortGoals,
  goalDatePassed,
} from '../utils/goals';

function WeeklyStreak({ goal }) {
  const weeks = goal.type === 'weekly_mileage' ? goal.weekHistory || [] : [];
  if (!weeks.length) return null;
  const streak = Number(goal.weekStreak || 0);
  return (
    <div className="mt-3">
      <p className="text-xs text-muted mb-2">
        {streak > 0 ? `${streak}-week streak` : 'No streak yet'}
      </p>
      <div className="flex gap-1.5">
        {weeks.map((w) => (
          <div
            key={w.start}
            title={`${w.start}–${w.end}: ${formatKm(w.meters)}${w.hit ? ' · hit' : ''}${w.isCurrent ? ' · this week' : ''}`}
            className={`h-7 flex-1 rounded-md ${
              w.hit ? 'bg-emerald-400/85' : w.isCurrent ? 'bg-brand/35' : 'bg-ink'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function GoalCard({ goal, actions, showNotes = true, onShareChange }) {
  const meta = goalMetaLine(goal);

  return (
    <div className={`card ${goal.status === 'completed' ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold min-w-0 break-words mb-0">{goal.title}</h3>
        <span className={`badge shrink-0 ${goal.status === 'completed' ? 'badge-success' : 'badge-brand'}`}>
          {goalStatusLabel(goal.status)}
        </span>
      </div>
      {meta ? <p className="text-xs text-muted mt-1 mb-0">{meta}</p> : null}
      {showsProgress(goal) && (
        <>
          <div className="h-2 bg-ink rounded-full overflow-hidden mt-3">
            <div className={`h-full ${goal.status === 'completed' || (goal.type === 'weekly_mileage' && (goal.completionPct || 0) >= 100) ? 'bg-emerald-400' : 'bg-brand'}`} style={{ width: `${goal.completionPct || 0}%` }} />
          </div>
          <p className="text-xs text-muted mt-2 mb-0">
            {goal.status === 'completed'
              ? 'Completed'
              : goal.type === 'weekly_mileage' && (goal.completionPct || 0) >= 100
                ? 'This week complete'
                : goal.type === 'weekly_mileage'
                  ? `${goal.completionPct || 0}% this week`
                  : `${goal.completionPct || 0}% complete`}
          </p>
        </>
      )}
      {showNotes && goal.notes ? <p className="text-sm mt-3 mb-0">{goal.notes}</p> : null}
      <WeeklyStreak goal={goal} />
      {actions ? <div className="flex flex-wrap gap-2 mt-3">{actions}</div> : null}
      {typeof onShareChange === 'function' && (
        <label className="flex items-start gap-3 mt-3 mb-0 font-normal cursor-pointer">
          <input
            type="checkbox"
            className="mt-[3px] w-4 h-4 shrink-0"
            checked={Boolean(goal.coachVisible)}
            onChange={(e) => onShareChange(e.target.checked)}
          />
          <span className="text-sm leading-5">Assigned coaches can see this goal</span>
        </label>
      )}
      {goal.matchedActivity?.id && (
        <Link
          to={`/activities/${goal.matchedActivity.id}`}
          className="mt-3 flex items-center justify-between gap-3 text-inherit no-underline hover:text-brand"
        >
          <span className="min-w-0">
            <span className="block text-[11px] text-muted">
              {goal.status === 'completed' ? 'Completed with' : 'Matching session'}
            </span>
            <span className="font-semibold truncate block">{goal.matchedActivity.name}</span>
          </span>
          <span className="text-xs text-muted shrink-0">
            {[formatActivityPrimary(goal.matchedActivity), goal.matchedActivity.startDate ? formatDateTime(goal.matchedActivity.startDate) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </Link>
      )}
    </div>
  );
}

export function AthleteGoalsList({ goals, emptyText }) {
  const rows = sortGoals(goals);
  if (!rows.length) return <div className="card text-muted">{emptyText}</div>;
  return (
    <div className="space-y-3">
      {rows.map((goal) => (
        <GoalCard key={goal.id} goal={goal} />
      ))}
    </div>
  );
}

export function AthleteGoalsGlance({ goals, moreHref }) {
  const shared = (goals || []).length;
  const rows = sortGoals(goals).filter((g) => !goalDatePassed(g)).slice(0, 3);
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="section-title mb-0">Goals</h3>
        {moreHref ? (
          <Link to={moreHref} className="text-sm text-brand no-underline">
            {shared ? 'See all' : 'Training'}
          </Link>
        ) : null}
      </div>
      {!rows.length ? (
        <div className="card text-muted text-sm">
          {shared ? 'No upcoming goals.' : 'This athlete has not shared any goals with you.'}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((goal) => {
            const meta = goalMetaLine(goal);
            return (
              <div key={goal.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold min-w-0 break-words">{goal.title}</span>
                  <span className={`badge shrink-0 ${goal.status === 'completed' ? 'badge-success' : 'badge-brand'}`}>
                    {goalStatusLabel(goal.status)}
                  </span>
                </div>
                {meta ? <p className="text-xs text-muted mt-1 mb-0">{meta}</p> : null}
                {goal.type === 'weekly_mileage' && Number(goal.weekStreak || 0) > 0 ? (
                  <p className="text-xs text-muted mt-1 mb-0">{goal.weekStreak}-week streak</p>
                ) : null}
                {showsProgress(goal) && (
                  <div className="h-1.5 bg-ink rounded-full overflow-hidden mt-2">
                    <div className={`h-full ${goal.status === 'completed' ? 'bg-emerald-400' : 'bg-brand'}`} style={{ width: `${goal.completionPct || 0}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
