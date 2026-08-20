import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import api from '../api/client';
import Layout from '../components/Layout';
import ActivityTypeFilter from '../components/ActivityTypeFilter';
import PersonalRecords from '../components/PersonalRecords';
import { useAuth } from '../context/AuthContext';
import { formatDistance, formatDuration, initialActivityType, rememberActivityType, visibleActivityTypeOptions } from '../utils/format';

const PERIODS = [
  { value: '90', label: 'Last 3 months' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

function formatPaceSec(secPerKm) {
  if (secPerKm == null || secPerKm <= 0) return '—';
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export default function Analysis() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [period, setPeriod] = useState('90');
  const [type, setType] = useState(() => initialActivityType(user, searchParams.get('type')));
  const [data, setData] = useState(null);

  useEffect(() => {
    rememberActivityType(type);
    if (searchParams.get('type') !== type) {
      setSearchParams({ type }, { replace: true });
    }
  }, [type]);

  useEffect(() => {
    const allowed = visibleActivityTypeOptions(user).map((opt) => opt.value);
    if (!allowed.includes(type)) setType(allowed[0] || 'Run');
  }, [user?.syncActivityTypes]);

  useEffect(() => {
    api.get('/activities/analysis', { params: { period, type } }).then((res) => setData(res.data));
  }, [period, type]);

  const duration = data?.metric === 'duration';
  const swim = data?.metric === 'swim';
  const volumeLabel = duration ? 'Time' : 'Distance';
  const formatVolume = (v) => (duration ? formatDuration(v) : swim ? `${Math.round(v)} m` : formatDistance(v));
  const months = data?.monthlyBreakdown || data?.weeklyBreakdown || [];
  const chartData = months.map((row) => ({
    ...row,
    volume: duration ? row.time : swim ? row.distance : Number(row.distance || 0) / 1000,
  }));
  const xAngle = chartData.length > 6 ? -35 : 0;
  const xInterval = chartData.length > 18 ? Math.ceil(chartData.length / 12) - 1 : 0;

  const formatVolumeTick = (v) => {
    if (v == null) return '';
    if (duration) return formatDuration(v);
    if (swim) return `${Math.round(v)}`;
    return Number(v) >= 10 ? `${Math.round(v)}` : Number(v).toFixed(1);
  };

  return (
    <Layout>
        <h2 className="page-title">Analytics</h2>
        <p className="page-sub">Trends and PRs for {type}</p>
      <ActivityTypeFilter
        value={type}
        onChange={setType}
        showAll={false}
        options={visibleActivityTypeOptions(user)}
      />
      <div className="chip-row">
        {PERIODS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`${period === opt.value ? 'chip-active' : 'chip'}`}
            onClick={() => setPeriod(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Activities" value={data.current.count} delta={data.comparison.countPct} />
            <Stat label={volumeLabel} value={data.current.formatted.distance} delta={data.comparison.distancePct} />
            {!duration && <Stat label="Time" value={data.current.formatted.time} delta={data.comparison.timePct} />}
            <Stat label="Elevation" value={data.current.formatted.elevation} />
          </div>

          <div className="space-y-6 mb-6">
            <div className="card h-80">
              <h3 className="font-semibold mb-3">
                {duration ? 'Monthly time' : 'Monthly distance'}
                <span className="text-muted font-normal text-sm"> · {duration ? 'total time' : swim ? 'total m' : 'total km'}</span>
              </h3>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: xAngle ? 16 : 0 }}>
                  <XAxis dataKey="label" stroke="#8b9cb3" fontSize={11} interval={xInterval} angle={xAngle} textAnchor={xAngle ? 'end' : 'middle'} height={xAngle ? 48 : 30} />
                  <YAxis
                    stroke="#8b9cb3"
                    fontSize={11}
                    width={48}
                    tickFormatter={formatVolumeTick}
                  />
                  <Tooltip
                    formatter={(_, __, item) => formatVolume(duration ? item.payload.time : item.payload.distance)}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label}
                  />
                  <Bar dataKey="volume" fill="#0d9488" radius={6} name={volumeLabel} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card h-80">
              <h3 className="font-semibold mb-3">
                {duration ? 'Heart rate trend' : 'Pace trend'}
                <span className="text-muted font-normal text-sm"> · {duration ? 'avg bpm' : 'min/km'}</span>
              </h3>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: xAngle ? 16 : 0 }}>
                  <XAxis dataKey="label" stroke="#8b9cb3" fontSize={11} interval={xInterval} angle={xAngle} textAnchor={xAngle ? 'end' : 'middle'} height={xAngle ? 48 : 30} />
                  <YAxis
                    stroke="#8b9cb3"
                    reversed={!duration}
                    fontSize={11}
                    width={48}
                    tickFormatter={(v) => (duration ? Math.round(v) : formatPaceSec(v))}
                  />
                  <Tooltip
                    formatter={(v) => (duration ? `${Math.round(v)} bpm` : `${formatPaceSec(v)} /km`)}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label}
                  />
                  <Line
                    type="monotone"
                    dataKey={duration ? 'hr' : 'paceSecPerKm'}
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    name={duration ? 'HR' : 'Pace'}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <PersonalRecords records={data.personalRecords} sport={type} />
        </>
      )}
    </Layout>
  );
}

function Stat({ label, value, delta }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value text-brand">{value}</div>
      {delta != null && (
        <div className={`text-xs mt-1 ${delta >= 0 ? 'text-emerald-400' : 'text-orange-300'}`}>
          {delta >= 0 ? '+' : ''}{delta}% vs prior
        </div>
      )}
    </div>
  );
}
