import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import {
  formatSplitClock,
  fillMissingElevation,
  nearestSeriesPoint,
  normalizeSplits,
  paceSeriesFromSplits,
  activitySeriesFromTrack,
  splitBarWidths,
  elevationSummary,
} from '../utils/splits';

function formatElev(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Math.round(Number(value));
  if (n > 0) return `+${n}`;
  return `${n}`;
}

function chartPoint(state) {
  return state?.activePayload?.[0]?.payload || null;
}

export default function ActivitySplits({ activity }) {
  const rows = useMemo(
    () => fillMissingElevation(normalizeSplits(activity?.splits), activity?.gpsPoints),
    [activity?.splits, activity?.gpsPoints]
  );
  const bars = useMemo(() => splitBarWidths(rows), [rows]);
  const series = useMemo(() => {
    const fromTrack = activitySeriesFromTrack(activity?.gpsPoints);
    return fromTrack.length ? fromTrack : paceSeriesFromSplits(rows);
  }, [activity?.gpsPoints, rows]);
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);

  if (!rows.length && !series.length) return null;

  const avgPace = Number(activity?.avgSpeed) > 0 ? 1000 / Number(activity.avgSpeed) : null;
  const avgHr = Number(activity?.avgHeartrate) > 0 ? Number(activity.avgHeartrate) : null;
  const selected = pinned || hover;
  const hasPace = series.some((row) => row.paceSec > 0);
  const hasHr = series.some((row) => row.hr > 0);
  const elevStats = elevationSummary(series);
  const hasElev = Boolean(elevStats);

  const pin = (point) => {
    if (!point) return;
    setPinned(nearestSeriesPoint(series, point.km) || point);
  };

  return (
    <section className="mb-6">
      {!!rows.length && (
        <>
          <h3 className="section-title mb-3">Splits</h3>
          <div className="card overflow-x-auto mb-5">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-3 pr-2 font-semibold">Km</th>
                  <th className="pb-3 pr-2 font-semibold">Pace</th>
                  <th className="pb-3 pr-3 font-semibold w-[36%]" />
                  <th className="pb-3 pr-2 font-semibold text-right">Elev</th>
                  <th className="pb-3 font-semibold text-right">HR</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const km = rows.slice(0, i + 1).reduce((sum, item) => sum + item.distanceM / 1000, 0);
                  const active = pinned && Math.abs((pinned.km || 0) - km) < 0.51;
                  return (
                    <tr
                      key={`${row.kmLabel}-${i}`}
                      className={`border-t border-line/70 cursor-pointer ${active ? 'bg-brand/10' : 'hover:bg-hover/50'}`}
                      onClick={() => pin({ km })}
                    >
                      <td className="py-2.5 pr-2 tabular-nums text-muted">{row.kmLabel}</td>
                      <td className="py-2.5 pr-2 tabular-nums font-semibold">{formatSplitClock(row.paceSec)}</td>
                      <td className="py-2.5 pr-3">
                        <div className="h-3 rounded-sm bg-brand/80" style={{ width: `${bars[i]}%` }} />
                      </td>
                      <td className="py-2.5 pr-2 tabular-nums text-right text-muted">
                        {formatElev(row.elevM)}{row.elevM != null ? ' m' : ''}
                      </td>
                      <td className="py-2.5 tabular-nums text-right">{row.hr ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {series.length > 1 && (hasPace || hasHr || hasElev) && (
        <>
          <Readout point={selected} pinned={Boolean(pinned)} onClear={() => setPinned(null)} />
          {hasPace && (
            <SessionChart
              title="Pace"
              series={series}
              selected={selected}
              yKey="paceSec"
              yAxisId="pace"
              color="#2563eb"
              stroke="#60a5fa"
              reversed
              tickFormatter={formatSplitClock}
              avg={avgPace}
              onHover={setHover}
              onPin={pin}
            />
          )}
          {hasHr && (
            <SessionChart
              title="Heart rate"
              series={series}
              selected={selected}
              yKey="hr"
              yAxisId="hr"
              color="#ea580c"
              stroke="#fb923c"
              tickFormatter={(v) => `${Math.round(v)}`}
              avg={avgHr}
              onHover={setHover}
              onPin={pin}
            />
          )}
          {hasElev && (
            <SessionChart
              title="Elevation"
              series={series}
              selected={selected}
              yKey="elev"
              yAxisId="elev"
              color="#94a3b8"
              stroke="#cbd5e1"
              tickFormatter={(v) => `${Math.round(v)}`}
              yLabel="m"
              onHover={setHover}
              onPin={pin}
              footer={(
                <div className="grid grid-cols-2 gap-3 pt-3 mt-1 border-t border-line">
                  <div>
                    <div className="stat-label">Elevation gain</div>
                    <div className="font-display text-2xl font-bold mt-1">{elevStats.gain} m</div>
                  </div>
                  <div className="text-right">
                    <div className="stat-label">Max elevation</div>
                    <div className="font-display text-2xl font-bold mt-1">{elevStats.max} m</div>
                  </div>
                </div>
              )}
            />
          )}
        </>
      )}
    </section>
  );
}

function Readout({ point, pinned, onClear }) {
  if (!point) {
    return (
      <p className="text-xs text-muted mb-3">Tap or click a chart (or a split) to pin the exact values at that point.</p>
    );
  }
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
      <div className="rounded-xl bg-brand px-3 py-2 text-white shadow-card min-w-[160px]">
        <div className="font-display text-2xl font-bold leading-none">
          {point.km != null ? `${Number(point.km).toFixed(2)} km` : '—'}
        </div>
        <div className="text-sm mt-2 space-y-0.5">
          {point.paceSec ? <div>{formatSplitClock(point.paceSec)} /km</div> : null}
          {point.hr ? <div>{Math.round(point.hr)} bpm</div> : null}
          {point.elev != null ? <div>{Math.round(point.elev)} m elev</div> : null}
        </div>
      </div>
      {pinned ? (
        <button type="button" className="btn-outline btn-sm" onClick={onClear}>
          Clear pin
        </button>
      ) : (
        <p className="text-xs text-muted mb-0">Click to pin this point</p>
      )}
    </div>
  );
}

function SessionChart({
  title,
  series,
  selected,
  yKey,
  yAxisId,
  color,
  stroke,
  reversed = false,
  tickFormatter,
  yLabel,
  avg,
  footer,
  onHover,
  onPin,
}) {
  const overlayElev = yKey !== 'elev';
  return (
    <>
      <h3 className="section-title mb-3">{title}</h3>
      <div className="card mb-5">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={series}
              margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
              onMouseMove={(state) => onHover(chartPoint(state))}
              onMouseLeave={() => onHover(null)}
              onClick={(state) => onPin(chartPoint(state))}
            >
              <CartesianGrid stroke="#1f2a36" strokeDasharray="3 3" />
              <XAxis
                dataKey="km"
                type="number"
                domain={['dataMin', 'dataMax']}
                stroke="#8b9cb3"
                fontSize={11}
                tickFormatter={(v) => `${Math.round(v)} km`}
              />
              <YAxis
                yAxisId={yAxisId}
                reversed={reversed}
                stroke="#8b9cb3"
                fontSize={11}
                width={48}
                tickFormatter={tickFormatter}
                domain={['auto', 'auto']}
                label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#8b9cb3', fontSize: 11 } : undefined}
              />
              {overlayElev ? (
                <YAxis yAxisId="elevOverlay" orientation="right" hide domain={['dataMin', 'dataMax']} />
              ) : null}
              <Tooltip cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} content={() => null} />
              {overlayElev ? (
                <Area
                  yAxisId="elevOverlay"
                  type="monotone"
                  dataKey="elev"
                  fill="#64748b"
                  fillOpacity={0.2}
                  stroke="none"
                  isAnimationActive={false}
                />
              ) : null}
              <Area
                yAxisId={yAxisId}
                type="monotone"
                dataKey={yKey}
                fill={color}
                fillOpacity={yKey === 'elev' ? 0.85 : 0.5}
                stroke={stroke}
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
                activeDot={{ r: 5, fill: '#fff', stroke, strokeWidth: 2 }}
              />
              {avg ? (
                <ReferenceLine yAxisId={yAxisId} y={avg} stroke="#94a3b8" strokeDasharray="4 4" />
              ) : null}
              {selected?.km != null ? (
                <ReferenceLine yAxisId={yAxisId} x={selected.km} stroke="#e2e8f0" />
              ) : null}
              <Line
                yAxisId={yAxisId}
                dataKey={yKey}
                stroke="none"
                legendType="none"
                isAnimationActive={false}
                dot={(props) => {
                  if (selected?.km == null || Math.abs(props.payload?.km - selected.km) > 0.0001) return null;
                  return (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={6}
                      fill="#fff"
                      stroke={stroke}
                      strokeWidth={2}
                    />
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {footer}
      </div>
    </>
  );
}
