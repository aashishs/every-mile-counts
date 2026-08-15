import { useEffect, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import { GOAL_TYPES, formatDate } from '../utils/format';

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState({ title: '', type: 'distance', targetValue: '', targetUnit: 'meters', targetDate: '', notes: '' });

  const load = () => api.get('/goals').then((r) => setGoals(r.data.goals));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const targetValue = form.type === 'distance' || form.type === 'weekly_mileage'
      ? Number(form.targetValue) * 1000
      : Number(form.targetValue);
    await api.post('/goals', { ...form, targetValue, targetUnit: form.type.includes('distance') || form.type === 'weekly_mileage' ? 'meters' : form.targetUnit });
    setForm({ title: '', type: 'distance', targetValue: '', targetUnit: 'meters', targetDate: '', notes: '' });
    load();
  };

  return (
    <Layout>
      <h2 className="page-title">Goals</h2>
      <p className="page-sub">Mileage targets, race PBs, and challenges</p>
      <form className="card grid md:grid-cols-2 gap-3 mb-6" onSubmit={submit}>
        <input placeholder="Goal title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {GOAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input placeholder={form.type.includes('distance') || form.type === 'weekly_mileage' ? 'Target km' : 'Target value'} value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} />
        <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
        <textarea className="md:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button className="btn-primary md:col-span-2" type="submit">Create goal</button>
      </form>
      <div className="space-y-3">
        {goals.map((g) => (
          <div key={g.id} className="card">
            <div className="flex justify-between mb-2">
              <div>
                <h3 className="font-semibold">{g.title}</h3>
                <p className="text-xs text-muted">{g.type} {g.targetDate ? `· ${formatDate(g.targetDate)}` : ''}</p>
              </div>
              <span className="badge bg-brand/15 text-brand">{g.status}</span>
            </div>
            <div className="h-2 bg-ink rounded-full overflow-hidden">
              <div className="h-full bg-brand" style={{ width: `${g.completionPct || 0}%` }} />
            </div>
            <p className="text-xs text-muted mt-2">{g.completionPct || 0}% complete</p>
          </div>
        ))}
        {!goals.length && <div className="card text-muted">No goals yet.</div>}
      </div>
    </Layout>
  );
}
