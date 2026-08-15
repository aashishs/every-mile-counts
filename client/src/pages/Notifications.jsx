import { useEffect, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import { formatDateTime } from '../utils/format';

export default function Notifications() {
  const [items, setItems] = useState([]);

  const load = () => api.get('/notifications').then((r) => setItems(r.data.notifications));
  useEffect(() => { load(); }, []);

  const markAll = async () => {
    await api.post('/notifications/read-all');
    load();
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="page-title">Notifications</h2>
          <p className="text-muted">Sync, reviews, events, membership, and club updates</p>
        </div>
        <button className="btn-outline btn-sm" onClick={markAll}>Mark all read</button>
      </div>
      <div className="space-y-2">
        {items.map((n) => (
          <div key={n.id} className={`card ${n.readAt ? 'opacity-70' : ''}`}>
            <div className="flex justify-between gap-3">
              <strong>{n.title}</strong>
              <span className="text-xs text-muted">{formatDateTime(n.createdAt)}</span>
            </div>
            <p className="text-sm text-muted">{n.body}</p>
          </div>
        ))}
        {!items.length && <div className="card text-muted">You are all caught up.</div>}
      </div>
    </Layout>
  );
}
