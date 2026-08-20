import { ACTIVITY_TYPE_OPTIONS, getActivityIcon } from '../utils/format';

export default function ActivityTypeFilter({ value, onChange, showAll = true, options }) {
  const sports = options?.length ? options : ACTIVITY_TYPE_OPTIONS;
  const chips = showAll
    ? [{ value: 'all', label: 'All' }, ...sports]
    : sports;

  return (
    <div className="chip-row">
        {chips.map((opt) => {
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
