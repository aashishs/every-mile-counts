import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import api from '../api/client';
import Layout from '../components/Layout';
import ActivityTypeFilter from '../components/ActivityTypeFilter';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_ACTIVITY_TYPE, formatDistance, formatDuration } from '../utils/format';

export default function Analysis() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('30');
  const [type, setType] = useState(user?.defaultActivityType || DEFAULT_ACTIVITY_TYPE);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/activities/analysis', { params: { period, type } }).then((res) => setData(res.data));
  }, [period, type]);

  const duration = data?.metric === 'duration';
  const volumeKey = duration ? 'time' : 'distance';
  const volumeLabel = duration ? 'Time' : data?.metric === 'swim' ? 'Distance' : 'Distance';
  const formatVolume = (v) => (duration ? formatDuration(v) : data?.metric === 'swim' ? `${Math.round(v)} m` : formatDistance(v));

  return (
    <Layout>
      <h2 className="page-title">Performance analytics</h2>
      <p className="page-sub">Trends, comparisons, and personal records by sport</p>
      <ActivityTypeFilter value={type} onChange={setType} />
      <select value={period} onChange={(e) => setPeriod(e.target.value)} className="max-w-xs mb-6">
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="365">Last year</option>
      </select>

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

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="card h-72">
              <h3 className="font-semibold mb-3">{duration ? 'Weekly time' : 'Weekly distance'}</h3>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={data.weeklyBreakdown}>
                  <XAxis dataKey="week" stroke="#8b9cb3" fontSize={11} />
                  <YAxis stroke="#8b9cb3" fontSize={11} />
                  <Tooltip formatter={(v) => formatVolume(v)} />
                  <Bar dataKey={volumeKey} fill="#0d9488" radius={6} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card h-72">
              <h3 className="font-semibold mb-3">{duration ? 'Heart rate trend' : 'Pace trend (sec/km)'}</h3>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={data.paceTrends}>
                  <XAxis dataKey="date" hide />
                  <YAxis stroke="#8b9cb3" reversed={!duration} fontSize={11} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey={duration ? 'hr' : 'paceSecPerKm'}
                    stroke="#f97316"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Personal records{type !== 'all' ? ` · ${type}` : ''}</h3>
            <div className="grid md:grid-cols-2 gap-2 text-sm">
              {Object.entries(data.personalRecords || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line py-2">
                  <span className="text-muted">{v.label || k.replace(/([A-Z])/g, ' $1')}</span>
                  <span>{v.time || v.distance} · {v.name}</span>
                </div>
              ))}
              {!Object.keys(data.personalRecords || {}).length && <p className="text-muted">No PRs yet for this sport.</p>}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}

function Stat({ label, value, delta }) {
  return (
    <div className="stat-card">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-xl font-bold text-brand">{value}</div>
      {delta != null && (
        <div className={`text-xs ${delta >= 0 ? 'text-emerald-400' : 'text-orange-300'}`}>
          {delta >= 0 ? '+' : ''}{delta}% vs prior period
        </div>
      )}
    </div>
  );
}
