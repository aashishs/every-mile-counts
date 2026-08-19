const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfCalendar(year, month) {
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - mondayOffset);
  first.setHours(0, 0, 0, 0);
  return first;
}

export default function MonthCalendar({
  value,
  onChange,
  events = [],
  monthDate,
  onMonthChange,
}) {
  const cursor = monthDate ? new Date(monthDate) : value ? new Date(`${value}T00:00:00`) : new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const today = ymd(new Date());
  const start = startOfCalendar(year, month);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const byDay = {};
  for (const event of events) {
    const key = String(event.eventDate).slice(0, 10);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(event);
  }
  const title = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const shift = (delta) => {
    const next = new Date(year, month + delta, 1);
    onMonthChange?.(next);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <button type="button" className="btn-outline btn-sm" onClick={() => shift(-1)}>‹</button>
        <h3 className="font-semibold">{title}</h3>
        <button type="button" className="btn-outline btn-sm" onClick={() => shift(1)}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-muted mb-2">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = ymd(day);
          const inMonth = day.getMonth() === month;
          const selected = value === key;
          const isToday = key === today;
          const marks = byDay[key] || [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`min-h-[3.25rem] rounded-xl p-1 text-sm transition ${
                selected
                  ? 'bg-brand text-white'
                  : inMonth
                    ? 'bg-ink hover:bg-hover'
                    : 'bg-transparent text-muted/40'
              } ${isToday && !selected ? 'ring-1 ring-accent' : ''}`}
            >
              <div className="font-semibold">{day.getDate()}</div>
              {!!marks.length && (
                <div className="flex justify-center gap-0.5 mt-1">
                  {marks.slice(0, 3).map((ev) => (
                    <span
                      key={ev.id}
                      className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-accent'}`}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TimePicker({ value, onChange, label = 'Time' }) {
  return (
    <div>
      <label htmlFor={`time-${label}`}>{label}</label>
      <input
        id={`time-${label}`}
        type="time"
        step={60}
        value={value ? String(value).slice(0, 5) : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function pad2(n) {
  return String(n ?? 0).padStart(2, '0');
}

export function DurationPicker({ value, onChange, label = 'Goal time' }) {
  const [h = '', m = '', s = ''] = String(value || '').split(':');

  const emit = (nextH, nextM, nextS) => {
    if (nextH === '' && nextM === '' && nextS === '') {
      onChange('');
      return;
    }
    const clamp = (v, max) => {
      if (v === '' || v == null) return 0;
      return Math.min(max, Math.max(0, Number(v) || 0));
    };
    onChange(`${pad2(clamp(nextH, 99))}:${pad2(clamp(nextM, 59))}:${pad2(clamp(nextS, 59))}`);
  };

  return (
    <div>
      <label>{label}</label>
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto] items-center gap-1.5">
        <input
          type="number"
          min="0"
          max="99"
          placeholder="h"
          aria-label="Hours"
          value={h === '' ? '' : Number(h)}
          onChange={(e) => emit(e.target.value, m, s)}
        />
        <span className="text-muted text-sm">h</span>
        <input
          type="number"
          min="0"
          max="59"
          placeholder="mm"
          aria-label="Minutes"
          value={m === '' ? '' : Number(m)}
          onChange={(e) => emit(h, e.target.value, s)}
        />
        <span className="text-muted text-sm">m</span>
        <input
          type="number"
          min="0"
          max="59"
          placeholder="ss"
          aria-label="Seconds"
          value={s === '' ? '' : Number(s)}
          onChange={(e) => emit(h, m, e.target.value)}
        />
        <span className="text-muted text-sm">s</span>
      </div>
    </div>
  );
}

export function secondsFromTime(value) {
  if (!value) return null;
  const parts = String(value).split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

export function timeFromSeconds(total) {
  const n = Number(total);
  if (!n || n <= 0) return '';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
