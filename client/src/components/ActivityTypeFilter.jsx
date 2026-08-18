import { ACTIVITY_TYPE_OPTIONS, getActivityIcon } from '../utils/format';

export default function ActivityTypeFilter({ value, onChange, showAll = true }) {
  const options = showAll
    ? [{ value: 'all', label: 'All' }, ...ACTIVITY_TYPE_OPTIONS]
    : ACTIVITY_TYPE_OPTIONS;

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`${active ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => onChange(opt.value)}
          >
            {opt.value !== 'all' ? `${getActivityIcon(opt.value)} ` : ''}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
