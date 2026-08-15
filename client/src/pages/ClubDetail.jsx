import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDistance } from '../utils/format';

export default function ClubDetail() {
  const { id } = useParams();
  const { isAppAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [code, setCode] = useState('');
  const [announce, setAnnounce] = useState({ title: '', body: '' });
  const [coachEmail, setCoachEmail] = useState('');
  const [eventForm, setEventForm] = useState({ name: '', eventDate: '', distance: '', location: '' });
  const [msg, setMsg] = useState('');

  const load = () => api.get(`/clubs/${id}`).then((r) => setData(r.data));
  useEffect(() => { load(); }, [id]);

  if (!data) return <Layout><p className="text-muted">Loading…</p></Layout>;
  const { club, members, announcements, events, analytics, myMembership } = data;
  const isAdmin = isAppAdmin || (myMembership?.role === 'club_admin' && myMembership.status === 'active');
  const coaches = members.filter((m) => m.role === 'coach' && m.status === 'active');

  const join = async () => {
    try {
      await api.post(`/clubs/${id}/join`, { invitationCode: code || undefined });
      setMsg('Request sent');
      load();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Join failed');
    }
  };

  const approve = async (memberId, coachId) => {
    await api.post(`/clubs/${id}/members/${memberId}/approve`, { coachId });
    load();
  };

  const addCoach = async (e) => {
    e.preventDefault();
    await api.post(`/clubs/${id}/coaches`, { email: coachEmail });
    setCoachEmail('');
    load();
  };

  const publish = async (e) => {
    e.preventDefault();
    await api.post(`/clubs/${id}/announcements`, announce);
    setAnnounce({ title: '', body: '' });
    load();
  };

  const addEvent = async (e) => {
    e.preventDefault();
    await api.post(`/clubs/${id}/events`, { ...eventForm, distance: eventForm.distance ? Number(eventForm.distance) * 1000 : null });
    setEventForm({ name: '', eventDate: '', distance: '', location: '' });
    load();
  };

  return (
    <Layout>
      <h2 className="page-title">{club.name} {club.isVerified ? '✓' : ''}</h2>
      <p className="page-sub">{club.location} · {club.status} · {club.description || 'No description yet'}</p>
      {msg && <div className="card mb-4 text-sm">{msg}</div>}

      {!myMembership && (
        <div className="card mb-6 flex gap-2">
          <input placeholder="Club invitation code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-primary" onClick={join}>Request to join</button>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card"><div className="text-sm text-muted">Members</div><div className="text-xl font-bold text-brand">{analytics.members}</div></div>
        <div className="stat-card"><div className="text-sm text-muted">Month distance</div><div className="text-xl font-bold text-brand">{formatDistance(analytics.distance)}</div></div>
        <div className="stat-card"><div className="text-sm text-muted">Activities</div><div className="text-xl font-bold text-brand">{analytics.activities}</div></div>
      </div>

      <h3 className="font-semibold mb-2">Leaderboard</h3>
      <div className="card mb-6">
        {(analytics.leaderboard || []).map((row) => (
          <div key={row.athleteId} className="flex justify-between py-2 border-b border-line last:border-0 text-sm">
            <span>#{row.rank} {row.name}</span>
            <span className="text-brand">{row.formattedDistance}</span>
          </div>
        ))}
        {!analytics.leaderboard?.length && <p className="text-muted text-sm">No activity this month.</p>}
      </div>

      {isAdmin && (
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <form className="card space-y-2" onSubmit={addCoach}>
            <h3 className="font-semibold">Add coach</h3>
            <input placeholder="Coach email" value={coachEmail} onChange={(e) => setCoachEmail(e.target.value)} required />
            <button className="btn-primary">Add</button>
            {club.status === 'pending_coach' && <p className="text-xs text-accent">Add a coach before accepting members.</p>}
          </form>
          <form className="card space-y-2" onSubmit={publish}>
            <h3 className="font-semibold">Announcement</h3>
            <input placeholder="Title" value={announce.title} onChange={(e) => setAnnounce({ ...announce, title: e.target.value })} required />
            <textarea placeholder="Body" value={announce.body} onChange={(e) => setAnnounce({ ...announce, body: e.target.value })} required />
            <button className="btn-primary">Publish</button>
          </form>
          <form className="card space-y-2 md:col-span-2" onSubmit={addEvent}>
            <h3 className="font-semibold">Club event</h3>
            <div className="grid md:grid-cols-4 gap-2">
              <input placeholder="Name" value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} required />
              <input type="date" value={eventForm.eventDate} onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })} required />
              <input placeholder="Distance km" value={eventForm.distance} onChange={(e) => setEventForm({ ...eventForm, distance: e.target.value })} />
              <input placeholder="Location" value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} />
            </div>
            <button className="btn-primary">Create event</button>
          </form>
        </div>
      )}

      {isAdmin && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-3">Membership requests</h3>
          {members.filter((m) => m.status === 'pending').map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 py-2 border-b border-line">
              <span className="flex-1">{m.firstName} {m.lastName}</span>
              <select id={`coach-${m.id}`} className="max-w-xs">
                {coaches.map((c) => <option key={c.userId} value={c.userId}>{c.firstName} {c.lastName}</option>)}
              </select>
              <button className="btn-primary btn-sm" onClick={() => approve(m.id, document.getElementById(`coach-${m.id}`)?.value)}>Approve + assign coach</button>
            </div>
          ))}
          {!members.some((m) => m.status === 'pending') && <p className="text-sm text-muted">No pending requests.</p>}
        </div>
      )}

      <h3 className="font-semibold mb-2">Announcements</h3>
      <div className="space-y-2 mb-6">
        {announcements.map((a) => (
          <div key={a.id} className="card">
            <div className="font-semibold">{a.title}</div>
            <p className="text-sm text-muted">{a.body}</p>
          </div>
        ))}
      </div>
      <h3 className="font-semibold mb-2">Club events</h3>
      <div className="space-y-2">
        {events.map((e) => (
          <div key={e.id} className="card flex justify-between">
            <span>{e.name}</span>
            <span className="text-sm text-muted">{formatDate(e.eventDate)}</span>
          </div>
        ))}
      </div>
    </Layout>
  );
}
