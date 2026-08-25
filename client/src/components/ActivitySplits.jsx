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
  fastestSplitPace,
  fastestSplitSpeed,
  elapsedPaceSec,
  elapsedSpeedKmh,
} from '../utils/splits';
import { activityMetric, effortKind } from '../utils/format';

function formatClock(seconds) {
  const sec = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function StatRows({ rows }) {
  const visible = (rows || []).filter((row) => row?.value);
  if (!visible.length) return null;
  return (
    <div className="pt-4 mt-1 border-t border-line space-y-3">
      {visible.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3">
          <span className="text-muted">{row.label}</span>
          <span className="font-display text-xl font-bold tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

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
  const kind = effortKind(activity?.type, activity?.sportType);
  const rows = useMemo(
    () => fillMissingElevation(normalizeSplits(activity?.splits), activity?.gpsPoints),
    [activity?.splits, activity?.gpsPoints]
  );
  const bars = useMemo(() => splitBarWidths(rows, kind === 'speed' ? 'speed' : 'pace'), [rows, kind]);
  const series = useMemo(() => {
    const fromTrack = activitySeriesFromTrack(activity?.gpsPoints);
    return fromTrack.length ? fromTrack : paceSeriesFromSplits(rows);
  }, [activity?.gpsPoints, rows]);
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);

  if (!rows.length && !series.length) return null;
  if (kind === 'duration' && !series.some((row) => row.hr > 0)) return null;

  const avgMps = Number(activity?.avgSpeed) > 0 ? Number(activity.avgSpeed) : null;
  const avgPace = avgMps ? 1000 / avgMps : null;
  const avgSpeedKmh = avgMps ? avgMps * 3.6 : null;
  const avgHr = Number(activity?.avgHeartrate) > 0 ? Number(activity.avgHeartrate) : null;
  const selected = pinned || hover;
  const hasEffort = series.some((row) => row.paceSec > 0 || row.speedKmh > 0);
  const hasHr = series.some((row) => row.hr > 0);
  const elevStats = elevationSummary(series);
  const hasElev = Boolean(elevStats);
  const fastestPace = fastestSplitPace(rows);
  const fastestSpeed = fastestSplitSpeed(rows);
  const elapsed = Number(activity?.elapsedTime);
  const moving = Number(activity?.movingTime);
  const elapsedPace = elapsedPaceSec(activity);
  const elapsedSpeed = elapsedSpeedKmh(activity);
  const paused = elapsed > 0 && moving > 0 && elapsed - moving >= 2;
  const seriesMaxHr = series.reduce((max, row) => (row.hr > max ? row.hr : max), 0);
  const maxHr = Number(activity?.maxHeartrate) > 0
    ? Math.round(Number(activity.maxHeartrate))
    : seriesMaxHr > 0
      ? Math.round(seriesMaxHr)
      : null;
  const seriesMaxSpeed = series.reduce((max, row) => (row.speedKmh > max ? row.speedKmh : max), 0);
  const maxSpeed = Number(activity?.maxSpeed) > 0
    ? Number(activity.maxSpeed) * 3.6
    : seriesMaxSpeed || null;
  const hrAlreadyOnStats = activityMetric(activity?.type, activity?.sportType) === 'duration';
  const swimMetres = kind === 'swim' && rows.every((row) => row.distanceM < 950);
  const effortChart = kind === 'speed'
    ? {
      title: 'Speed',
      yKey: 'speedKmh',
      yAxisId: 'speed',
      reversed: false,
      yLabel: 'km/h',
      tickFormatter: (v) => `${Math.round(v)}`,
      avg: avgSpeedKmh,
    }
    : kind === 'swim'
      ? {
        title: 'Pace',
        yKey: 'pace100',
        yAxisId: 'pace',
        reversed: true,
        yLabel: '/100m',
        tickFormatter: formatSplitClock,
        avg: avgPace ? avgPace / 10 : null,
      }
      : kind === 'row'
        ? {
          title: 'Pace',
          yKey: 'pace500',
          yAxisId: 'pace',
          reversed: true,
          yLabel: '/500m',
          tickFormatter: formatSplitClock,
          avg: avgPace ? avgPace / 2 : null,
        }
        : {
          title: 'Pace',
          yKey: 'paceSec',
          yAxisId: 'pace',
          reversed: true,
          yLabel: '/km',
          tickFormatter: formatSplitClock,
          avg: avgPace,
        };
  const effortFooter = (
    <StatRows
      rows={
        kind === 'speed'
          ? [
            paused && elapsedSpeed ? { label: 'Avg Elapsed Speed', value: `${elapsedSpeed.toFixed(1)} km/h` } : null,
            paused ? { label: 'Elapsed Time', value: formatClock(elapsed) } : null,
            maxSpeed ? { label: 'Max Speed', value: `${maxSpeed.toFixed(1)} km/h` } : null,
            fastestSpeed ? { label: 'Fastest Split', value: `${fastestSpeed.toFixed(1)} km/h` } : null,
          ]
          : kind === 'swim'
            ? [
              paused && elapsedPace ? { label: 'Avg Elapsed Pace', value: `${formatSplitClock(elapsedPace / 10)} /100m` } : null,
              paused ? { label: 'Elapsed Time', value: formatClock(elapsed) } : null,
              fastestPace ? { label: 'Fastest Split', value: `${formatSplitClock(fastestPace / 10)} /100m` } : null,
            ]
            : kind === 'row'
              ? [
                paused && elapsedPace ? { label: 'Avg Elapsed Pace', value: `${formatSplitClock(elapsedPace / 2)} /500m` } : null,
                paused ? { label: 'Elapsed Time', value: formatClock(elapsed) } : null,
                fastestPace ? { label: 'Fastest Split', value: `${formatSplitClock(fastestPace / 2)} /500m` } : null,
              ]
              : [
                paused && elapsedPace ? { label: 'Avg Elapsed Pace', value: `${formatSplitClock(elapsedPace)} /km` } : null,
                paused ? { label: 'Elapsed Time', value: formatClock(elapsed) } : null,
                fastestPace ? { label: 'Fastest Split', value: `${formatSplitClock(fastestPace)} /km` } : null,
              ]
      }
    />
  );

  const pin = (point) => {
    if (!point) return;
    setPinned(nearestSeriesPoint(series, point.km) || point);
  };
  const splitGrid =
    'grid w-full grid-cols-[1.7rem_2.8rem_minmax(0,1fr)_2.4rem_2.4rem] gap-x-2 sm:grid-cols-[2rem_3.1rem_minmax(0,1fr)_2.75rem_2.75rem] sm:gap-x-3';
  const splitNum = 'min-w-0 tabular-nums text-[13px] sm:text-sm font-medium leading-none';

  return (
    <section className="mb-6">
      {!!rows.length && kind !== 'duration' && (
        <>
          <h3 className="section-title mb-3">Splits</h3>
          <div className="card mb-5 !p-3 sm:!p-4 overflow-hidden">
            <div className="text-[13px] sm:text-sm leading-none [text-size-adjust:100%]">
              <div className={`${splitGrid} pb-3 text-[13px] sm:text-sm text-muted font-medium`}>
                <div>{swimMetres ? 'm' : 'Km'}</div>
                <div>{kind === 'speed' ? 'km/h' : 'Pace'}</div>
                <div />
                <div className="text-right">Elev</div>
                <div className="text-right">HR</div>
              </div>
              {rows.map((row, i) => {
                const km = rows.slice(0, i + 1).reduce((sum, item) => sum + item.distanceM / 1000, 0);
                const active = pinned && Math.abs((pinned.km || 0) - km) < 0.51;
                return (
                  <button
                    key={`${row.kmLabel}-${i}`}
                    type="button"
                    className={`${splitGrid} items-center border-t border-line/70 px-0 py-2.5 text-left text-[13px] sm:text-sm font-medium ${
                      active ? 'bg-brand/10' : ''
                    }`}
                    onClick={() => pin({ km })}
                  >
                    <span className={`${splitNum} text-muted`}>
                      {swimMetres ? Math.round(row.distanceM) : row.kmLabel}
                    </span>
                    <span className={splitNum}>{formatSplitEffort(row, kind)}</span>
                    <span className="min-w-0">
                      <span className="block h-3 rounded-sm bg-brand/80" style={{ width: `${bars[i]}%` }} />
                    </span>
                    <span className={`${splitNum} text-right text-muted`}>{formatElev(row.elevM)}</span>
                    <span className={`${splitNum} text-right`}>{row.hr ?? '—'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {series.length > 1 && (hasEffort || hasHr || hasElev) && (
        <>
          {hasEffort && kind !== 'duration' && (
            <SessionChart
              title={effortChart.title}
              series={series}
              selected={selected}
              yKey={effortChart.yKey}
              yAxisId={effortChart.yAxisId}
              color="#2563eb"
              stroke="#60a5fa"
              reversed={effortChart.reversed}
              tickFormatter={effortChart.tickFormatter}
              yLabel={effortChart.yLabel}
              avg={effortChart.avg}
              onHover={setHover}
              onPin={pin}
              footer={effortFooter}
            />
          )}
          {hasHr && (
            <SessionChart
              title="Heart Rate"
              series={series}
              selected={selected}
              yKey="hr"
              yAxisId="hr"
              color="#e11d48"
              stroke="#fb7185"
              tickFormatter={(v) => `${Math.round(v)}`}
              yLabel="bpm"
              avg={avgHr}
              onHover={setHover}
              onPin={pin}
              footer={(
                <StatRows
                  rows={[
                    !hrAlreadyOnStats && maxHr
                      ? { label: 'Max Heart Rate', value: `${maxHr} bpm` }
                      : null,
                  ]}
                />
              )}
            />
          )}
          {hasElev && kind !== 'duration' && (
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
                <StatRows
                  rows={[
                    { label: 'Max Elevation', value: `${elevStats.max} m` },
                  ]}
                />
              )}
            />
          )}
        </>
      )}
    </section>
  );
}

function formatSplitEffort(row, kind) {
  if (kind === 'speed') return row.speedKmh > 0 ? row.speedKmh.toFixed(1) : '—';
  if (kind === 'swim' && row.paceSec > 0) return formatSplitClock(row.paceSec / 10);
  if (kind === 'row' && row.paceSec > 0) return formatSplitClock(row.paceSec / 2);
  return formatSplitClock(row.paceSec);
}

function hoverPrimary(yKey, point) {
  if (!point) return null;
  if (yKey === 'speedKmh' && point.speedKmh > 0) return `${Number(point.speedKmh).toFixed(1)} km/h`;
  if (yKey === 'paceSec' && point.paceSec > 0) return `${formatSplitClock(point.paceSec)} /km`;
  if (yKey === 'pace100' && point.pace100 > 0) return `${formatSplitClock(point.pace100)} /100m`;
  if (yKey === 'pace500' && point.pace500 > 0) return `${formatSplitClock(point.pace500)} /500m`;
  if (yKey === 'hr' && point.hr > 0) return `${Math.round(point.hr)} bpm`;
  if (yKey === 'elev' && point.elev != null) return `${Math.round(point.elev)} m`;
  return null;
}

function HoverCard({ active, payload, yKey }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const primary = hoverPrimary(yKey, point);
  if (!primary) return null;
  const tone = yKey === 'hr'
    ? 'bg-rose-500 text-white'
    : yKey === 'elev'
      ? 'bg-slate-300 text-[#111827]'
      : 'bg-blue-600 text-white';
  const sub = yKey === 'elev' ? 'text-slate-700' : 'text-white/80';
  return (
    <div className={`rounded-xl px-3 py-2 shadow-md pointer-events-none whitespace-nowrap ${tone}`}>
      <div className="font-display text-xl font-bold leading-none tabular-nums">{primary}</div>
      <div className={`text-xs mt-1 tabular-nums ${sub}`}>
        {point.km != null ? `${Number(point.km).toFixed(2)} km` : ''}
      </div>
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
        <div className="h-72 touch-none">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={series}
              margin={{ top: 52, right: 12, left: 4, bottom: 0 }}
              onMouseMove={(state) => {
                const point = chartPoint(state);
                if (point) onHover(point);
              }}
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
              <Tooltip
                cursor={{ stroke: '#e2e8f0', strokeWidth: 1.5 }}
                content={<HoverCard yKey={yKey} />}
                isAnimationActive={false}
                allowEscapeViewBox={{ x: true, y: true }}
                offset={10}
                wrapperStyle={{ outline: 'none', zIndex: 10 }}
              />
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
