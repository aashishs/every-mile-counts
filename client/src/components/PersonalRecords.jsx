import { Link } from 'react-router-dom';
import { formatDate, getActivityIcon } from '../utils/format';

const SLOTS = {
  Run: [
    { key: '5k', short: '5K', emoji: '⚡' },
    { key: '10k', short: '10K', emoji: '🔥' },
    { key: 'hm', short: 'Half', emoji: '🏅' },
    { key: 'fm', short: 'Marathon', emoji: '👑' },
    { key: 'ultra', short: 'Ultra', emoji: '🏔️' },
    { key: 'longest', short: 'Longest', emoji: '🗺️' },
  ],
  Ride: [
    { key: '50k', short: '50 km', emoji: '🚴' },
    { key: '100k', short: '100 km', emoji: '🔥' },
    { key: '150k', short: '150 km', emoji: '🏅' },
    { key: '200k', short: '200 km', emoji: '👑' },
    { key: 'longest', short: 'Longest', emoji: '🗺️' },
  ],
  Swim: [
    { key: '100m', short: '100 m', emoji: '💧' },
    { key: '200m', short: '200 m', emoji: '🌊' },
    { key: '500m', short: '500 m', emoji: '🏅' },
    { key: '1000m', short: '1000 m', emoji: '🔥' },
    { key: 'plus', short: '1500 m+', emoji: '👑' },
    { key: 'longest', short: 'Longest', emoji: '🗺️' },
  ],
};

const FEATURE_KEYS = ['fm', 'hm', '10k', '5k', 'ultra', '200k', '150k', '100k', '50k', 'plus', '1000m', 'longest', 'longestDistance', 'longestSession'];

function headline(record) {
  if (!record) return '';
  if (record.key === 'longest' || record.key === 'longestDistance') return record.distance || record.time;
  return record.time || record.distance;
}

function buildBoard(records = {}, sport) {
  const byKey = records;
  const slots = SLOTS[sport] || Object.keys(byKey).map((key) => ({
    key,
    short: byKey[key]?.label || key,
    emoji: '🏅',
  }));
  const used = new Set(slots.map((s) => s.key));
  const extra = Object.keys(byKey)
    .filter((key) => !used.has(key))
    .map((key) => ({ key, short: byKey[key]?.label || key, emoji: '🏅' }));
  return [...slots, ...extra].map((slot) => {
    const rec = byKey[slot.key];
    const earned = Boolean(rec && rec.activityId);
    return {
      ...slot,
      ...rec,
      label: rec?.label || `PR ${slot.short}`,
      earned,
    };
  });
}

export default function PersonalRecords({ records, sport }) {
  const board = buildBoard(records, sport);
  const featured = FEATURE_KEYS.map((k) => board.find((r) => r.key === k && r.earned)).find(Boolean) || board.find((r) => r.earned);
  const tiles = board.filter((r) => r !== featured);
  const earnedCount = board.filter((r) => r.earned).length;

  if (!board.length) {
    return (
      <div className="card text-muted text-sm">No personal records yet. Sync activities and the board fills in.</div>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <h3 className="section-title flex items-center gap-2">
            <span>🏆</span> Personal records
            {sport && sport !== 'all' ? <span className="text-muted font-normal">· {getActivityIcon(sport)} {sport}</span> : null}
          </h3>
          <p className="text-xs text-muted mt-1">{earnedCount} of {board.length} badges unlocked</p>
        </div>
      </div>

      {featured ? (
        <Link
          to={`/activities/${featured.activityId}`}
          className="card pr-featured mb-4 block text-inherit no-underline overflow-hidden"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Headline PR</div>
              <div className="text-sm text-muted mt-1">{featured.emoji} {featured.label}</div>
              <div className="font-display text-4xl md:text-5xl font-bold text-white mt-2 tracking-tight">{headline(featured)}</div>
              <div className="mt-3 text-sm text-slate-200">{featured.name}</div>
              <div className="text-xs text-muted mt-1">
                {featured.distance && featured.time ? `${featured.distance} · ${featured.time}` : featured.distance || featured.time}
                {featured.date ? ` · ${formatDate(featured.date)}` : ''}
              </div>
            </div>
            <span className="badge bg-accent text-white">View activity →</span>
          </div>
        </Link>
      ) : (
        <div className="card mb-4 text-sm text-muted">
          Land a {sport || 'run'} and this board lights up with your first PR.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {tiles.map((tile) => {
          const inner = (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">{tile.emoji}</span>
                {tile.earned ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-accent">PR</span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide text-muted">Locked</span>
                )}
              </div>
              <div className="text-xs text-muted">{tile.short}</div>
              <div className={`text-xl font-bold mt-1 ${tile.earned ? 'text-brand' : 'text-muted'}`}>
                {tile.earned ? headline(tile) : '—'}
              </div>
              <div className="text-[11px] text-muted mt-2 truncate">
                {tile.earned ? tile.name : 'Not yet'}
              </div>
            </>
          );
          if (tile.earned) {
            return (
              <Link key={tile.key} to={`/activities/${tile.activityId}`} className="pr-tile text-inherit no-underline">
                {inner}
              </Link>
            );
          }
          return (
            <div key={tile.key} className="pr-tile pr-tile-locked">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
