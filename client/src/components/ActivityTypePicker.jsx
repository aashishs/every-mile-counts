import { ACTIVITY_TYPE_OPTIONS, getActivityIcon } from '../utils/format';

export default function ActivityTypePicker({ value = [], onChange, disabled = false }) {
  const selected = new Set(value);
  const toggle = (type) => {
    if (disabled) return;
    const next = selected.has(type)
      ? value.filter((item) => item !== type)
      : [...value, type];
    onChange(ACTIVITY_TYPE_OPTIONS.filter((opt) => next.includes(opt.value)).map((opt) => opt.value));
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {ACTIVITY_TYPE_OPTIONS.map((opt) => {
        const on = selected.has(opt.value);
        return (
          <label
            key={opt.value}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${
              on ? 'border-accent/70 bg-accent/10' : 'border-white/10'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <input
              type="checkbox"
              className="w-auto"
              checked={on}
              disabled={disabled}
              onChange={() => toggle(opt.value)}
            />
            <span>{getActivityIcon(opt.value)} {opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}
