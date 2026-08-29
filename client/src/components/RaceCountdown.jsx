import { Link } from 'react-router-dom';
import { formatActivityPrimary, formatDate, formatDateTime, getActivityIcon } from '../utils/format';
import { activityTypeLabel, daysUntil, daysUntilLabel, formatGoalTime } from '../utils/goals';
import { formatKm } from '../utils/training';

export default function RaceCountdown({ goal, href }) {
  if (!goal) return null;
  const days = daysUntil(goal.targetDate);
  const label = daysUntilLabel(goal.targetDate);
  const sport = activityTypeLabel(goal.activityType);
  const km = Number(goal.targetValue) > 0 ? formatKm(goal.targetValue) : null;
  const time = formatGoalTime(goal.targetTime);
  const sub = days == null || days < 0 ? '' : days === 0 ? 'race day' : 'to go';
  const title = (
    <>
      <div className="stat-label text-orange-200/80">{goal.type === 'race' ? 'Race goal' : 'Goal date'}</div>
      <div className="font-display text-2xl font-bold tracking-tight mt-1">{goal.title}</div>
      <p className="text-xs text-muted mt-1 mb-0">
        {[sport ? `${getActivityIcon(goal.activityType)} ${sport}` : null, goal.targetDate ? formatDate(goal.targetDate) : null, km, time]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </>
  );

  return (
    <div className="race-card mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {href ? (
            <Link to={href} className="text-inherit no-underline hover:text-brand">
              {title}
            </Link>
          ) : (
            title
          )}
        </div>
        {label && (
          <div className="text-right shrink-0">
            <div className="font-display text-3xl font-bold text-accent leading-none">{label}</div>
            {sub ? <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{sub}</div> : null}
          </div>
        )}
      </div>
      {goal.matchedActivity?.id && (
        <Link
          to={`/activities/${goal.matchedActivity.id}`}
          className="mt-3 flex items-center justify-between gap-3 text-inherit no-underline hover:text-brand"
        >
          <span className="min-w-0">
            <span className="block text-[11px] text-muted">
              {goal.status === 'completed' || days < 0 ? 'Completed with' : 'Matching session'}
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
