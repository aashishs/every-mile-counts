import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { ACTIVITY_TYPE_OPTIONS, DEFAULT_ACTIVITY_TYPE } from '../utils/format';
import { homePath, isAppAdminAccount, isClubOnlyAccount } from '../utils/roles';
import StravaCard from '../components/StravaCard';

export default function Profile() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const clubOnly = isClubOnlyAccount(user);
  const appAdmin = isAppAdminAccount(user);
  const athlete = !appAdmin && user.roles?.includes('athlete');
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    bio: user.bio || '',
    location: user.location || '',
    timezone: user.timezone || 'UTC',
    maxHeartRate: user.maxHeartRate || '',
    restingHeartRate: user.restingHeartRate || '',
    dateOfBirth: user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '',
    defaultActivityType: user.defaultActivityType || DEFAULT_ACTIVITY_TYPE,
    notificationPrefs: user.notificationPrefs || {},
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [clubs, setClubs] = useState([]);
  const [clubQ, setClubQ] = useState('');
  const [clubResults, setClubResults] = useState([]);
  const [inviteCode, setInviteCode] = useState('');

  const [coaches, setCoaches] = useState([]);
  const [maxCoaches, setMaxCoaches] = useState(3);
  const [available, setAvailable] = useState([]);
  const [coachQ, setCoachQ] = useState('');
  const [coachHits, setCoachHits] = useState([]);
  const [coachPick, setCoachPick] = useState('');

  const flash = (ok, text) => {
    setMsg(ok ? text : '');
    setErr(ok ? '' : text);
  };

  const loadClubs = async () => {
    const { data } = await api.get('/clubs/mine');
    setClubs(data.clubs || []);
  };

  const loadCoaches = async () => {
    const [{ data: mine }, { data: pool }] = await Promise.all([
      api.get('/coaches/my-coaches'),
      api.get('/coaches/available').catch(() => ({ data: { coaches: [] } })),
    ]);
    setCoaches(mine.coaches || []);
    setMaxCoaches(mine.max || 3);
    setAvailable(pool.coaches || []);
  };

  useEffect(() => {
    if (!clubOnly && !appAdmin) loadClubs().catch(() => {});
    if (athlete) loadCoaches().catch(() => {});
  }, [clubOnly, appAdmin, athlete]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.patch('/users/me', form);
      await refresh();
      flash(true, 'Profile saved');
    } catch (ex) {
      flash(false, ex.response?.data?.message || 'Could not save profile');
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirmPassword) {
      flash(false, 'New passwords do not match');
      return;
    }
    try {
      await api.post('/users/me/password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
      flash(true, 'Password updated');
    } catch (ex) {
      flash(false, ex.response?.data?.message || 'Could not update password');
    }
  };

  const searchClubs = async (e) => {
    e?.preventDefault();
    const query = clubQ.trim();
    if (query.length < 2) {
      flash(false, 'Type at least 2 characters to search clubs');
      setClubResults([]);
      return;
    }
    const { data } = await api.get('/clubs', { params: { q: query } });
    const mineIds = new Set(clubs.map((c) => c.id));
    setClubResults((data.clubs || []).filter((c) => !mineIds.has(c.id)));
  };

  const joinClub = async (clubId) => {
    try {
      await api.post(`/clubs/${clubId}/join`, { invitationCode: inviteCode || undefined });
      setInviteCode('');
      setClubResults([]);
      await loadClubs();
      flash(true, 'Join request sent');
    } catch (ex) {
      flash(false, ex.response?.data?.message || 'Could not join club');
    }
  };

  const leaveClub = async (club) => {
    if (!window.confirm(`Leave ${club.name}? Coaches from this club will be unassigned.`)) return;
    try {
      await api.post(`/clubs/${club.id}/leave`);
      await Promise.all([loadClubs(), athlete ? loadCoaches() : Promise.resolve()]);
      flash(true, `Left ${club.name}`);
    } catch (ex) {
      flash(false, ex.response?.data?.message || 'Could not leave club');
    }
  };

  const searchCoaches = async (e) => {
    e?.preventDefault();
    if (!coachQ || coachQ.length < 2) {
      flash(false, 'Type at least 2 characters to search coaches');
      return;
    }
    const { data } = await api.get('/users/search', { params: { q: coachQ, role: 'coach' } });
    const taken = new Set(coaches.map((c) => c.coachId || c.id));
    setCoachHits((data.users || []).filter((u) => u.id !== user.id && !taken.has(u.id)));
  };

  const addCoach = async (coachId) => {
    try {
      await api.post('/coaches/add', { coachId });
      setCoachPick('');
      setCoachHits([]);
      setCoachQ('');
      await loadCoaches();
      flash(true, 'Coach added');
    } catch (ex) {
      flash(false, ex.response?.data?.message || 'Could not add coach');
    }
  };

  const removeCoach = async (coach) => {
    const id = coach.coachId || coach.id;
    if (!window.confirm(`Remove ${coach.firstName} ${coach.lastName} as your coach?`)) return;
    try {
      await api.delete(`/coaches/remove/${id}`);
      await loadCoaches();
      flash(true, 'Coach removed');
    } catch (ex) {
      flash(false, ex.response?.data?.message || 'Could not remove coach');
    }
  };

  const togglePref = (key) => {
    setForm({
      ...form,
      notificationPrefs: { ...form.notificationPrefs, [key]: !form.notificationPrefs?.[key] },
    });
  };

  const canAddCoach = coaches.length < maxCoaches;

  return (
    <Layout>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="page-title">Profile</h2>
          <p className="page-sub">
            {appAdmin
              ? 'Edit your details and password'
              : clubOnly
                ? 'Edit your details and password'
                : 'Edit your details, password, club, and coaches'}
          </p>
        </div>
        <button
          type="button"
          className="btn-outline btn-sm shrink-0"
          onClick={() => navigate(homePath(user))}
        >
          Done
        </button>
      </div>
      {msg && <div className="card mb-4 text-brand text-sm">{msg}</div>}
      {err && <div className="card mb-4 text-orange-300 text-sm">{err}</div>}

      {!clubOnly && !appAdmin && <StravaCard user={user} />}

      <form className="card grid md:grid-cols-2 gap-3 mb-6" onSubmit={save}>
        <h3 className="font-semibold md:col-span-2">Edit profile</h3>
        <div>
          <label htmlFor="firstName">First name</label>
          <input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </div>
        <div>
          <label htmlFor="lastName">Last name</label>
          <input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        </div>
        <div className="md:col-span-2">
          <label>Email</label>
          <input value={user.email || ''} disabled className="opacity-60" />
        </div>
        <div>
          <label htmlFor="location">Location</label>
          <input id="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City" />
        </div>
        {!clubOnly && !appAdmin && (
          <>
            <div>
              <label htmlFor="dateOfBirth">Date of birth</label>
              <input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
            <div>
              <label htmlFor="maxHeartRate">Max HR</label>
              <input id="maxHeartRate" type="number" value={form.maxHeartRate} onChange={(e) => setForm({ ...form, maxHeartRate: e.target.value })} placeholder="bpm" />
            </div>
            <div>
              <label htmlFor="restingHeartRate">Resting HR</label>
              <input id="restingHeartRate" type="number" value={form.restingHeartRate} onChange={(e) => setForm({ ...form, restingHeartRate: e.target.value })} placeholder="bpm" />
            </div>
            <div>
              <label htmlFor="defaultActivityType">Default activity</label>
              <select
                id="defaultActivityType"
                value={form.defaultActivityType}
                onChange={(e) => setForm({ ...form, defaultActivityType: e.target.value })}
              >
                {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="md:col-span-2">
          <label htmlFor="bio">Bio</label>
          <textarea id="bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="About you" />
        </div>
        {appAdmin ? null : (
        <div className="md:col-span-2">
          <p className="text-sm font-medium mb-2">Notifications</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {['push', 'inApp', ...(clubOnly ? [] : ['sync']), 'reviews', 'events', 'membership', 'announcements'].map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" className="w-auto" checked={form.notificationPrefs?.[k] !== false} onChange={() => togglePref(k)} />
                {k}
              </label>
            ))}
          </div>
        </div>
        )}
        <button className="btn-primary md:col-span-2" type="submit">Save profile</button>
      </form>

      <form className="card space-y-3 mb-6 max-w-lg" onSubmit={changePw}>
        <h3 className="font-semibold">Change password</h3>
        <div>
          <label htmlFor="currentPassword">Current password</label>
          <input id="currentPassword" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
        </div>
        <div>
          <label htmlFor="newPassword">New password</label>
          <input id="newPassword" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} minLength={8} required />
        </div>
        <div>
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input id="confirmPassword" type="password" value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} minLength={8} required />
        </div>
        <button className="btn-outline" type="submit">Update password</button>
      </form>

      {!clubOnly && !appAdmin && (
        <section className="card space-y-4 mb-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Club</h3>
            <Link to="/clubs" className="text-sm text-brand no-underline">Search clubs</Link>
          </div>
          <div className="space-y-2">
            {clubs.map((c) => (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-line p-3">
                <div>
                  <Link to={`/clubs/${c.id}`} className="font-semibold text-inherit no-underline">{c.name}</Link>
                  <div className="text-xs text-muted">
                    {c.role === 'club_admin' ? 'Admin' : c.role === 'coach' ? 'Coach' : 'Athlete'}
                    {c.membershipStatus === 'pending' ? ' · pending approval' : ''}
                  </div>
                </div>
                {c.role !== 'club_admin' && (
                  <button type="button" className="btn-outline btn-sm" onClick={() => leaveClub(c)}>
                    {c.membershipStatus === 'pending' ? 'Cancel request' : 'Leave / change'}
                  </button>
                )}
              </div>
            ))}
            {!clubs.length && <p className="text-sm text-muted">You are not in a club yet.</p>}
          </div>
          <form className="space-y-2" onSubmit={searchClubs}>
            <label>Find another club</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input placeholder="Search clubs" value={clubQ} onChange={(e) => setClubQ(e.target.value)} />
              <button className="btn-primary sm:w-auto w-full" type="submit">Search</button>
            </div>
            <input placeholder="Invitation code (optional)" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          </form>
          <div className="space-y-2">
            {clubResults.map((c) => (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-line p-3">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-muted">{c.location || 'Location TBD'}</div>
                </div>
                <button type="button" className="btn-outline btn-sm" onClick={() => joinClub(c.id)}>
                  {clubs.length ? 'Switch / request join' : 'Request to join'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {athlete && (
        <section className="card space-y-4 mb-6">
          <h3 className="font-semibold">Coaches · {coaches.length}/{maxCoaches}</h3>
          <div className="space-y-2">
            {coaches.map((c) => (
              <div key={c.id || c.coachId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-line p-3">
                <div>
                  <div className="font-semibold">{c.firstName} {c.lastName}</div>
                  <div className="text-xs text-muted">{c.email}{c.clubName ? ` · ${c.clubName}` : ''}</div>
                </div>
                <button type="button" className="btn-outline btn-sm" onClick={() => removeCoach(c)}>Remove</button>
              </div>
            ))}
            {!coaches.length && <p className="text-sm text-muted">No coaches yet. Add one from your club or search by name.</p>}
          </div>
          {canAddCoach ? (
            <>
              {!!available.length && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <select value={coachPick} onChange={(e) => setCoachPick(e.target.value)}>
                    <option value="">Coach from your club…</option>
                    {available.map((c) => (
                      <option key={`${c.id}-${c.clubId}`} value={c.id}>
                        {c.firstName} {c.lastName}{c.clubName ? ` · ${c.clubName}` : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-primary sm:w-auto w-full" disabled={!coachPick} onClick={() => addCoach(coachPick)}>
                    Add
                  </button>
                </div>
              )}
              <form className="flex flex-col sm:flex-row gap-2" onSubmit={searchCoaches}>
                <input placeholder="Search coach name or email" value={coachQ} onChange={(e) => setCoachQ(e.target.value)} />
                <button className="btn-outline sm:w-auto w-full" type="submit">Search</button>
              </form>
              <div className="space-y-2">
                {coachHits.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3">
                    <div>
                      <div className="font-semibold">{c.firstName} {c.lastName}</div>
                      <div className="text-xs text-muted">{c.email}</div>
                    </div>
                    <button type="button" className="btn-primary btn-sm" onClick={() => addCoach(c.id)}>Add</button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">You already have three coaches. Remove one to add another.</p>
          )}
        </section>
      )}
    </Layout>
  );
}
