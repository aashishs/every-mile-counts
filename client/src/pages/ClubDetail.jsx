import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { isClubOnlyAccount } from '../utils/roles';
import { normalizeRoles } from '../components/Badge';
import { formatActivityPrimary, formatDate, getActivityIcon } from '../utils/format';

export default function ClubDetail() {
  const { id } = useParams();
  const { isAppAdmin, user, refresh } = useAuth();
  const clubOnly = isClubOnlyAccount(user);
  const [data, setData] = useState(null);
  const [code, setCode] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [athleteEmail, setAthleteEmail] = useState('');
  const [profile, setProfile] = useState({ name: '', description: '', location: '', website: '' });
  const [assignPick, setAssignPick] = useState({});
  const [msg, setMsg] = useState('');
  const [openAthleteId, setOpenAthleteId] = useState(null);
  const [athleteActs, setAthleteActs] = useState([]);

  const load = () =>
    api.get(`/clubs/${id}`).then((r) => {
      setData(r.data);
      const c = r.data.club;
      setProfile({
        name: c.name || '',
        description: c.description || '',
        location: c.location || '',
        website: c.website || '',
      });
    });
  useEffect(() => { load(); }, [id]);

  if (!data) return <Layout><p className="text-muted">Loading…</p></Layout>;
  const { club, members, assignments, myMembership } = data;
  const isAdmin = isAppAdmin || (myMembership?.role === 'club_admin' && myMembership.status === 'active');
  const isMember = myMembership?.status === 'active';
  const isClubCoach = (m) => {
    if (m.status !== 'active') return false;
    if (m.role === 'coach') return true;
    return m.role === 'club_admin' && normalizeRoles(m.userRoles).includes('coach');
  };
  const coaches = (members || []).filter(isClubCoach);
  const athletes = (members || []).filter((m) => m.role === 'member' && m.status === 'active');
  const admins = (members || []).filter((m) => m.role === 'club_admin' && m.status === 'active');
  const pending = (members || []).filter((m) => m.status === 'pending');
  const adminIsCoach = (user?.roles || []).includes('coach');
  const assignedFor = (athleteId) => (assignments || []).filter((a) => a.athleteId === athleteId);

  const flash = (text) => setMsg(text);

  const join = async () => {
    try {
      await api.post(`/clubs/${id}/join`, { invitationCode: code || undefined });
      flash('Request sent');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Join failed');
    }
  };

  const approve = async (memberId) => {
    try {
      await api.post(`/clubs/${id}/members/${memberId}/approve`, {});
      flash('Request approved');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not approve');
    }
  };

  const addCoach = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/clubs/${id}/coaches`, { email: coachEmail });
      setCoachEmail('');
      flash('Coach added');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not add coach');
    }
  };

  const addAthlete = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/clubs/${id}/members`, { email: athleteEmail });
      setAthleteEmail('');
      flash('Athlete added');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not add athlete');
    }
  };

  const removeCoach = async (userId) => {
    try {
      await api.delete(`/clubs/${id}/coaches/${userId}`);
      flash('Coach removed');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not remove coach');
    }
  };

  const assign = async (athleteId) => {
    const coachId = assignPick[athleteId];
    if (!coachId) return;
    try {
      await api.post(`/clubs/${id}/assign-coach`, { athleteId, coachId });
      setAssignPick((prev) => ({ ...prev, [athleteId]: '' }));
      flash('Coach assigned');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not assign coach');
    }
  };

  const unassign = async (athleteId, coachId) => {
    try {
      await api.post(`/clubs/${id}/unassign-coach`, { athleteId, coachId });
      flash('Coach unassigned');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not unassign coach');
    }
  };

  const viewAthlete = async (userId) => {
    if (openAthleteId === userId) {
      setOpenAthleteId(null);
      setAthleteActs([]);
      return;
    }
    setOpenAthleteId(userId);
    try {
      const { data: next } = await api.get(`/activities/athlete/${userId}`);
      setAthleteActs(next.activities || []);
    } catch (err) {
      flash(err.response?.data?.message || 'Could not load athlete activities');
      setAthleteActs([]);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    await api.patch(`/clubs/${id}`, profile);
    flash('Club updated');
    load();
  };

  return (
    <Layout>
      <h2 className="page-title">{club.name} {club.isVerified ? '✓' : ''}</h2>
      <p className="page-sub">
        {club.location || 'Location TBD'}
        {isMember || isAdmin ? ` · ${coaches.length} coaches · ${athletes.length} athletes` : ''}
        {isAdmin ? ' · athletes connect Strava on their own accounts' : ''}
      </p>
      {club.description && <p className="text-sm text-muted mb-4">{club.description}</p>}
      {msg && <div className="card mb-4 text-sm">{msg}</div>}

      {myMembership?.status === 'pending' && (
        <div className="card mb-6 text-sm text-muted">Your join request is waiting for a club admin to approve.</div>
      )}

      {!myMembership && !clubOnly && (
        <div className="card mb-6">
          <p className="text-sm text-muted mb-3">Request to join this club. A club admin will approve you.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input placeholder="Invitation code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn-primary" onClick={join}>Request to join</button>
          </div>
        </div>
      )}

      {myMembership && myMembership.status === 'active' && myMembership.role !== 'club_admin' && !clubOnly && (
        <div className="card mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-muted m-0">You are a {myMembership.role} of this club.</p>
          <button
            className="btn-outline btn-sm"
            type="button"
            onClick={async () => {
              try {
                await api.post(`/clubs/${id}/leave`);
                flash('You left this club');
                load();
              } catch (err) {
                flash(err.response?.data?.message || 'Could not leave');
              }
            }}
          >
            Leave club
          </button>
        </div>
      )}

      {isAdmin && (
        <form className="card grid md:grid-cols-2 gap-3 mb-6" onSubmit={saveProfile}>
          <h3 className="font-semibold md:col-span-2">Club profile</h3>
          <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Name" required />
          <input value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} placeholder="Location" />
          <input value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} placeholder="Website" />
          <textarea className="md:col-span-2" value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} placeholder="About this club" />
          <button className="btn-primary md:col-span-2" type="submit">Save club</button>
        </form>
      )}

      {(isMember || isAdmin) && (
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <section>
          <h3 className="font-semibold mb-3">Coaches</h3>
          {isAdmin && (
            <form className="card space-y-2 mb-3" onSubmit={addCoach}>
              <input placeholder="Coach email" value={coachEmail} onChange={(e) => setCoachEmail(e.target.value)} required />
              <button className="btn-primary">Add coach</button>
              {isAdmin && !adminIsCoach && (
                <button
                  className="btn-outline"
                  type="button"
                  onClick={async () => {
                    try {
                      await api.post(`/clubs/${id}/coaches`, { email: user.email });
                      await refresh();
                      flash('You can now coach athletes in this club');
                      load();
                    } catch (err) {
                      flash(err.response?.data?.message || 'Could not enable coaching');
                    }
                  }}
                >
                  I also coach at this club
                </button>
              )}
              {club.status === 'pending_coach' && (
                <p className="text-xs text-accent">Add at least one coach before accepting athletes.</p>
              )}
            </form>
          )}
          <div className="space-y-2">
            {coaches.map((c) => (
              <div key={c.id} className="card flex justify-between items-center gap-3">
                <div>
                  <div className="font-semibold">{c.firstName} {c.lastName}</div>
                  <div className="text-xs text-muted">
                    {c.email}
                    {c.role === 'club_admin' ? ' · club admin' : ''}
                  </div>
                </div>
                {isAdmin && (
                  <button className="btn-outline btn-sm" onClick={() => removeCoach(c.userId)}>
                    {c.role === 'club_admin' ? 'Stop coaching' : 'Remove'}
                  </button>
                )}
              </div>
            ))}
            {!coaches.length && <div className="card text-muted text-sm">No coaches yet.</div>}
          </div>
        </section>

        <section>
          <h3 className="font-semibold mb-3">Admins</h3>
          <div className="space-y-2">
            {admins.map((a) => (
              <div key={a.id} className="card">
                <div className="font-semibold">{a.firstName} {a.lastName}</div>
                <div className="text-xs text-muted">{a.email}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
      )}

      {isAdmin && (
        <>
          <h3 className="font-semibold mb-3">Athletes</h3>
          <p className="text-sm text-muted mb-3">View club athletes and assign a coach from this club.</p>
          <form className="card space-y-2 mb-3" onSubmit={addAthlete}>
            <input placeholder="Athlete email" type="email" value={athleteEmail} onChange={(e) => setAthleteEmail(e.target.value)} required />
            <button className="btn-primary">Add athlete</button>
          </form>
          <div className="space-y-3 mb-8">
            {athletes.map((a) => {
              const assigned = assignedFor(a.userId);
              const available = coaches.filter((c) => !assigned.some((x) => x.coachId === c.userId));
              const open = openAthleteId === a.userId;
              return (
                <div key={a.id} className="card">
                  <div className="flex flex-wrap justify-between gap-2 mb-2">
                    <div>
                      <div className="font-semibold">{a.firstName} {a.lastName}</div>
                      <div className="text-xs text-muted">
                        {a.email}
                        {a.activityCount != null ? ` · ${a.activityCount} ${a.activityCount === 1 ? 'activity' : 'activities'}` : ''}
                      </div>
                    </div>
                    <button className="btn-outline btn-sm" type="button" onClick={() => viewAthlete(a.userId)}>
                      {open ? 'Hide' : 'View'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {assigned.map((x) => (
                      <span key={x.id} className="badge bg-brand/15 text-brand normal-case">
                        {x.coachFirstName} {x.coachLastName}
                        <button className="ml-1" type="button" onClick={() => unassign(a.userId, x.coachId)}>×</button>
                      </span>
                    ))}
                    {!assigned.length && <span className="text-sm text-muted">No coach assigned</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="max-w-xs"
                      value={assignPick[a.userId] || ''}
                      onChange={(e) => setAssignPick((prev) => ({ ...prev, [a.userId]: e.target.value }))}
                    >
                      <option value="">{coaches.length ? 'Assign a coach…' : 'Add a coach first'}</option>
                      {available.map((c) => (
                        <option key={c.userId} value={c.userId}>{c.firstName} {c.lastName}</option>
                      ))}
                    </select>
                    <button className="btn-primary btn-sm" type="button" onClick={() => assign(a.userId)} disabled={!assignPick[a.userId]}>
                      Assign
                    </button>
                  </div>
                  {open && (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      {!athleteActs.length ? (
                        <p className="text-sm text-muted mb-0">No activities yet.</p>
                      ) : (
                        athleteActs.slice(0, 12).map((act) => (
                          <Link
                            key={act.id}
                            to={`/activities/${act.id}`}
                            className="flex items-center justify-between gap-3 text-inherit no-underline text-sm py-1"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span>{getActivityIcon(act.type)}</span>
                              <span className="truncate">{act.name}</span>
                            </span>
                            <span className="text-xs text-muted shrink-0">
                              {formatActivityPrimary(act)} · {formatDate(act.startDate)}
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!athletes.length && <div className="card text-muted text-sm">No athletes in this club yet. Add one by email or approve a join request.</div>}
          </div>

          <div className="card mb-6">
            <h3 className="font-semibold mb-3">Join requests</h3>
            {pending.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 py-2 border-b border-line">
                <span className="flex-1">{m.firstName} {m.lastName} · {m.email}</span>
                <button className="btn-primary btn-sm" onClick={() => approve(m.id)}>Approve</button>
              </div>
            ))}
            {!pending.length && <p className="text-sm text-muted">No pending requests.</p>}
          </div>
        </>
      )}
    </Layout>
  );
}
