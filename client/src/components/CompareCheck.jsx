export function CompareCheck({ activity, checked, disabled, onToggle }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={`Select ${activity.name || 'session'} to compare`}
      onClick={(e) => e.stopPropagation()}
      onChange={() => onToggle(activity)}
    />
  );
}

export function ComparePickBar({ hint, canCompare, count, onCompare }) {
  return (
    <div className="card py-3 mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p className="text-sm text-muted mb-0">{hint}</p>
      <button className="btn-primary w-full sm:w-auto" type="button" disabled={!canCompare} onClick={onCompare}>
        Compare{count ? ` ${count}` : ''}
      </button>
    </div>
  );
}
