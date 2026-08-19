import { useEffect, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import { StatusBadge } from '../components/Badge';
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
      <p className="page-sub">
        {isAppAdmin ? 'Review and update user tickets' : 'Ask the platform team for help'}
      </p>
      {!isAppAdmin && (
        <form className="card space-y-3 mb-6" onSubmit={submit}>
          <input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
          <textarea placeholder="How can we help?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          <button className="btn-primary" type="submit">Submit ticket</button>
        </form>
      )}
      <div className="space-y-2">
        {tickets.map((t) => (
          <div key={t.id} className="card">
            <div className="flex justify-between">
              <strong>{t.subject}</strong>
              <span className="inline-block"><StatusBadge value={t.status} /></span>
            </div>
            {isAppAdmin && (t.email || t.firstName) && (
              <div className="text-xs text-muted mt-1">
                {t.firstName} {t.lastName} · {t.email}
              </div>
            )}
            <p className="text-sm text-muted mt-1">{t.body}</p>
            {isAppAdmin && (
              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  { id: 'open', label: 'Open' },
                  { id: 'in_progress', label: 'In progress' },
                  { id: 'resolved', label: 'Resolved' },
                  { id: 'closed', label: 'Closed' },
                ].map((s) => (
                  <button
                    key={s.id}
                    className={`btn-sm ${t.status === s.id ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => update(t.id, s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {!tickets.length && (
          <div className="card text-sm text-muted">
            {isAppAdmin ? 'No support tickets yet.' : 'You have not submitted a ticket yet.'}
          </div>
        )}
      </div>
    </Layout>
  );
}
