import { useEffect, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

export default function Support() {
  const { isAppAdmin } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [form, setForm] = useState({ subject: '', body: '' });

  const load = () => api.get('/support').then((r) => setTickets(r.data.tickets));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    await api.post('/support', form);
    setForm({ subject: '', body: '' });
    load();
  };

  const update = async (id, status) => {
    await api.patch(`/support/${id}`, { status });
    load();
  };

  return (
    <Layout>
      <h2 className="page-title">Support</h2>
      <p className="page-sub">Ask the platform team for help</p>
      <form className="card space-y-3 mb-6" onSubmit={submit}>
        <input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
        <textarea placeholder="How can we help?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
        <button className="btn-primary" type="submit">Submit ticket</button>
      </form>
      <div className="space-y-2">
        {tickets.map((t) => (
          <div key={t.id} className="card">
            <div className="flex justify-between">
              <strong>{t.subject}</strong>
              <span className="badge bg-brand/15 text-brand">{t.status}</span>
            </div>
            <p className="text-sm text-muted mt-1">{t.body}</p>
            {isAppAdmin && (
              <div className="flex gap-2 mt-3">
                {['open', 'in_progress', 'resolved', 'closed'].map((s) => (
                  <button key={s} className="btn-outline btn-sm" onClick={() => update(t.id, s)}>{s}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
