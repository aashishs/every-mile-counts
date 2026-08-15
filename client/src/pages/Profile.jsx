import { useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    bio: user.bio || '',
    location: user.location || '',
    timezone: user.timezone || 'UTC',
    maxHeartRate: user.maxHeartRate || '',
    restingHeartRate: user.restingHeartRate || '',
    dateOfBirth: user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '',
    notificationPrefs: user.notificationPrefs || {},
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');

  const save = async (e) => {
    e.preventDefault();
    await api.patch('/users/me', form);
    await refresh();
    setMsg('Profile saved');
  };

  const changePw = async (e) => {
    e.preventDefault();
    await api.post('/users/me/password', pw);
    setPw({ currentPassword: '', newPassword: '' });
    setMsg('Password updated');
  };

  const togglePref = (key) => {
    setForm({
      ...form,
      notificationPrefs: { ...form.notificationPrefs, [key]: !form.notificationPrefs?.[key] },
    });
  };

  return (
    <Layout>
      <h2 className="page-title">Profile</h2>
      <p className="page-sub">Personal details, heart-rate zones, and notification preferences</p>
      {msg && <div className="card mb-4 text-brand text-sm">{msg}</div>}
      <form className="card grid md:grid-cols-2 gap-3 mb-6" onSubmit={save}>
        <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" />
        <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" />
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" />
        <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
        <input type="number" value={form.maxHeartRate} onChange={(e) => setForm({ ...form, maxHeartRate: e.target.value })} placeholder="Max HR" />
        <input type="number" value={form.restingHeartRate} onChange={(e) => setForm({ ...form, restingHeartRate: e.target.value })} placeholder="Resting HR" />
        <textarea className="md:col-span-2" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Bio" />
        <div className="md:col-span-2">
          <p className="text-sm font-medium mb-2">Notifications</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {['push', 'inApp', 'sync', 'reviews', 'events', 'membership', 'goals', 'announcements'].map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" className="w-auto" checked={form.notificationPrefs?.[k] !== false} onChange={() => togglePref(k)} />
                {k}
              </label>
            ))}
          </div>
        </div>
        <button className="btn-primary md:col-span-2" type="submit">Save profile</button>
      </form>
      <form className="card space-y-3 max-w-md" onSubmit={changePw}>
        <h3 className="font-semibold">Change password</h3>
        <input type="password" placeholder="Current password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        <input type="password" placeholder="New password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} minLength={8} />
        <button className="btn-outline" type="submit">Update password</button>
      </form>
    </Layout>
  );
}
