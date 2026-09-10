import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { formatDateTime } from '../utils/format';

function notificationPath(n) {
  const data = n.data || {};
  if (data.url) return data.url;
  if ((n.type === 'review' || n.type === 'review_request') && data.activityId) {
    return `/activities/${data.activityId}`;
  }
  if ((n.type === 'club' || n.type === 'announcement') && data.clubId) return `/clubs/${data.clubId}`;
  if (n.type === 'goal') return '/dashboard';
  if (n.type === 'sync') return '/activities';
  if (n.type === 'membership') return '/membership';
  if (n.type === 'event' && data.clubId) return `/clubs/${data.clubId}`;
  if (n.type === 'event') return '/events';
  if (n.type === 'training' && data.url) return data.url;
  if (n.type === 'training' && data.workoutId) return `/training/workouts/${data.workoutId}`;
  if (n.type === 'training' && data.programId) return `/training/programs/${data.programId}`;
  if (n.type === 'training') return '/training';
  return null;
}

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);

  const load = () =>
    api.get('/notifications').then((r) => {
      setItems((r.data.notifications || []).filter((n) => !n.readAt));
    });
  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    await api.post(`/notifications/${id}/read`);
    setItems((prev) => prev.filter((n) => n.id !== id));
  };

  const openItem = async (n) => {
    await markRead(n.id);
    const path = notificationPath(n);
    if (path) navigate(path);
  };

  const markAll = async () => {
    await api.post('/notifications/read-all');
    setItems([]);
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="page-title">Notifications</h2>
          <p className="text-muted">Sync, reviews, training, events, membership, and club updates</p>
        </div>
        {items.length > 0 && (
          <button className="btn-outline btn-sm" type="button" onClick={markAll}>Mark all read</button>
        )}
      </div>
      <div className="space-y-2">
        {items.map((n) => (
          <div key={n.id} className="card">
            <button
              type="button"
              className="w-full text-left bg-transparent border-0 p-0"
              onClick={() => openItem(n)}
            >
              <div className="flex justify-between gap-3">
                <strong>{n.title}</strong>
                <span className="text-xs text-muted whitespace-nowrap">{formatDateTime(n.createdAt)}</span>
              </div>
              <p className="text-sm text-muted mb-0 mt-1">{n.body}</p>
            </button>
            <button className="btn-outline btn-sm mt-3" type="button" onClick={() => markRead(n.id)}>
              Mark read
            </button>
          </div>
        ))}
        {!items.length && <div className="card text-muted">You are all caught up.</div>}
      </div>
    </Layout>
  );
}
