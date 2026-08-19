import { ACTIVITY_TYPE_OPTIONS, getActivityIcon } from '../utils/format';

export default function ActivityTypeFilter({ value, onChange, showAll = true }) {
  const options = showAll
    ? [{ value: 'all', label: 'All' }, ...ACTIVITY_TYPE_OPTIONS]
    : ACTIVITY_TYPE_OPTIONS;

  return (
    <div className="chip-row">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`${active ? 'chip-active' : 'chip'}`}
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
