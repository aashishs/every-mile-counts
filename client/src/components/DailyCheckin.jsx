import { Link } from 'react-router-dom';
import { quoteForDay } from '../utils/dailyQuotes';

export default function DailyCheckin({ user, today, onClose }) {
  if (!today?.date) return null;
  const quote = quoteForDay(user?.id, today.date);
  const name = user?.firstName || 'Athlete';

  return (
    <div
      className="fixed inset-0 bg-black/70 grid place-items-center p-4 z-[60]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-title"
      >
        <p className="stat-label text-brand">Today · {today.date}</p>
        <h3 id="checkin-title" className="font-display text-3xl font-bold mt-2 mb-0">
          {today.trained ? `Nice work, ${name}` : `Let’s go, ${name}`}
        </h3>
        <p className="text-slate-100 text-base leading-relaxed mt-4 mb-0">“{quote}”</p>
        <p className="text-[11px] text-muted mt-2 mb-0">Every Mile Counts</p>

        {today.trained ? (
          <div className="mt-5 rounded-2xl border border-line bg-ink/60 p-4">
            <div className="stat-label">Workout score</div>
            <div className="flex items-end justify-between gap-3 mt-1">
              <div className="font-display text-5xl font-bold text-brand leading-none">{today.score}</div>
              <div className="text-right">
                <div className="font-semibold">{today.label}</div>
                <div className="text-xs text-muted mt-1">
                  {today.count > 1 ? `${today.count} sessions` : today.name}
                </div>
              </div>
            </div>
            {today.activityId ? (
              <Link
                to={`/activities/${today.activityId}`}
                className="btn-outline btn-sm mt-4 no-underline inline-flex"
                onClick={onClose}
              >
                Open session
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted mt-5 mb-0">
            No session logged yet today. There is still time to get one in — or take the rest day on purpose.
          </p>
        )}

        <button type="button" className="btn-primary w-full mt-5" onClick={onClose}>
          {today.trained ? 'Continue' : 'Let’s train'}
        </button>
      </div>
    </div>
  );
}
