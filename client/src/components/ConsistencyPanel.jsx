const PERIODS = [
  { id: '30', label: '1 month' },
  { id: '90', label: '3 months' },
  { id: '180', label: '6 months' },
  { id: '365', label: '1 year' },
];

function tone(score) {
  if (score >= 90) return 'text-emerald-300';
  if (score >= 75) return 'text-brand';
  if (score >= 60) return 'text-orange-200';
  return 'text-orange-300';
}

export default function ConsistencyPanel({
  windows,
  adherence,
  period = '30',
  onPeriodChange,
  showPeriods = false,
  compact = false,
  footnote,
}) {
  const snapshot = adherence || windows?.periods?.[period] || windows?.periods?.['30'];
  if (!snapshot) return null;
  const target = snapshot.weeklyTargetDays || windows?.weeklyTargetDays || 5;
  const score = snapshot.score ?? 0;

  if (compact) {
    return (
      <span className="whitespace-nowrap">
        <span className={`font-semibold ${tone(score)}`}>{score}%</span>
        <span className="text-muted"> · {target}d/wk</span>
        {snapshot.currentWeekStreak ? (
          <span className="text-muted"> · {snapshot.currentWeekStreak}w streak</span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="card mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="stat-label">Consistency</div>
          <h3 className="section-title mb-0 mt-1">Showing up vs {target} days a week</h3>
        </div>
        <div className={`font-display text-5xl font-bold leading-none ${tone(score)}`}>{score}%</div>
      </div>
      <p className="text-sm text-muted mb-3">
        {snapshot.daysWithActivity} of {snapshot.expectedDays} expected days
        {snapshot.label ? ` · ${snapshot.label}` : ''}
        {snapshot.weeksConsidered
          ? ` · ${snapshot.weeksHit}/${snapshot.weeksConsidered} weeks hit the target`
          : ''}
      </p>
      {showPeriods && onPeriodChange && (
        <div className="chip-row mb-4">
          {PERIODS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={period === opt.id ? 'chip-active' : 'chip'}
              onClick={() => onPeriodChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Streak label="Week streak" value={snapshot.currentWeekStreak} hint="weeks at target" />
        <Streak label="Best weeks" value={snapshot.longestWeekStreak} hint="in this period" />
        <Streak label="Day streak" value={snapshot.currentDayStreak} hint="active days in a row" />
        <Streak label="Best days" value={snapshot.longestDayStreak} hint="in this period" />
      </div>
      <p className="text-[11px] text-muted mt-3 mb-0">
        {footnote || `Score is unique training days compared with a ${target}-day week, not every calendar day. The weekly streak pauses for rest days and only breaks after a finished week misses the target. Change the target in Profile.`}
      </p>
    </div>
  );
}

function Streak({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-line bg-ink/50 px-3 py-2">
      <div className="stat-label">{label}</div>
      <div className="font-display text-2xl font-bold text-white mt-1">{value ?? 0}</div>
      <div className="text-[11px] text-muted">{hint}</div>
    </div>
  );
}
