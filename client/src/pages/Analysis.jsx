import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import api from '../api/client';
import Layout from '../components/Layout';
import { formatDistance } from '../utils/format';

export default function Analysis() {
  const [period, setPeriod] = useState('30');
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/activities/analysis?period=${period}`).then((res) => setData(res.data));
  }, [period]);

  return (
    <Layout>
      <h2 className="page-title">Performance analytics</h2>
      <p className="page-sub">Trends, comparisons, and personal records</p>
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
            <Stat label="Distance" value={data.current.formatted.distance} delta={data.comparison.distancePct} />
            <Stat label="Time" value={data.current.formatted.time} delta={data.comparison.timePct} />
            <Stat label="Elevation" value={data.current.formatted.elevation} />
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="card h-72">
              <h3 className="font-semibold mb-3">Weekly distance</h3>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={data.weeklyBreakdown}>
                  <XAxis dataKey="week" stroke="#8b9cb3" fontSize={11} />
                  <YAxis stroke="#8b9cb3" fontSize={11} />
                  <Tooltip formatter={(v) => formatDistance(v)} />
                  <Bar dataKey="distance" fill="#0d9488" radius={6} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card h-72">
              <h3 className="font-semibold mb-3">Pace trend (sec/km)</h3>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={data.paceTrends}>
                  <XAxis dataKey="date" hide />
                  <YAxis stroke="#8b9cb3" reversed fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="paceSecPerKm" stroke="#f97316" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Personal records</h3>
            <div className="grid md:grid-cols-2 gap-2 text-sm">
              {Object.entries(data.personalRecords || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line py-2">
                  <span className="text-muted capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                  <span>{v.time || v.distance} · {v.name}</span>
                </div>
              ))}
              {!Object.keys(data.personalRecords || {}).length && <p className="text-muted">No PRs yet.</p>}
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
