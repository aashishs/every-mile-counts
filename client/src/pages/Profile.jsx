import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_ACTIVITY_TYPE, visibleActivityTypeOptions } from '../utils/format';
import { afterJoinPath, homePath, isAppAdminAccount, isAthleteAccount, isClubOnlyAccount, needsProfile } from '../utils/roles';
import { ageFromDob, mafHeartRate, parseDateOfBirth, todayIsoDate } from '../utils/maf';
import StravaCard from '../components/StravaCard';
import ActivityTypesSettings from '../components/ActivityTypesSettings';
import ConfirmDialog from '../components/ConfirmDialog';

const TAB_DEFS = [
  { id: 'profile', label: 'Profile', athleteOnly: false },
  { id: 'sports', label: 'Sports', athleteOnly: true },
  { id: 'password', label: 'Password', athleteOnly: false },
  { id: 'strava', label: 'Strava', athleteOnly: true },
  { id: 'club', label: 'Club', athleteOnly: true },
  { id: 'coaches', label: 'Coaches', athleteOnly: true },
];

export default function Profile() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const appAdmin = isAppAdminAccount(user);
  const athlete = isAthleteAccount(user);
  const clubAdmin = isClubOnlyAccount(user);
  const completing = needsProfile(user);
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    bio: user.bio || '',
    location: user.location || '',
    timezone: user.timezone || 'UTC',
    maxHeartRate: user.maxHeartRate || '',
    restingHeartRate: user.restingHeartRate || '',
    dateOfBirth: parseDateOfBirth(user.dateOfBirth) || '',
    defaultActivityType: user.defaultActivityType || DEFAULT_ACTIVITY_TYPE,
    weeklyTargetDays: user.weeklyTargetDays || 5,
    notificationPrefs: user.notificationPrefs || {},
    clubName: user.adminClubName || '',
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [clubs, setClubs] = useState([]);
  const [maxClubs, setMaxClubs] = useState(3);
  const [clubQ, setClubQ] = useState('');
  const [clubResults, setClubResults] = useState([]);
  const [inviteCode, setInviteCode] = useState('');

  const [coaches, setCoaches] = useState([]);
  const [maxCoaches, setMaxCoaches] = useState(3);
  const [available, setAvailable] = useState([]);
  const [coachQ, setCoachQ] = useState('');
  const [coachHits, setCoachHits] = useState([]);
  const [coachPick, setCoachPick] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [requestingCoach, setRequestingCoach] = useState(null);

  const flash = (ok, text) => {
    setMsg(ok ? text : '');
    setErr(ok ? '' : text);
  };

  const loadClubs = async () => {
    const { data } = await api.get('/clubs/mine');
    setClubs(data.clubs || []);
    setMaxClubs(data.max || 3);
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
    if (athlete) loadClubs().catch(() => {});
    if (athlete) loadCoaches().catch(() => {});
  }, [athlete]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.patch('/users/me', {
        ...form,
        ...(clubAdmin && !user.adminClubId ? { clubName: form.clubName.trim() } : {}),
      });
      const next = await refresh();
      flash(true, 'Profile saved');
      if (completing && !needsProfile(next)) {
        navigate(afterJoinPath(next || user), { replace: true });
      }
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

  const leaveClub = (club) => {
    setConfirmError('');
    setConfirm({ kind: 'leave-club', club });
  };

  const requestCoach = async (clubId) => {
    setRequestingCoach(clubId);
    try {
      await api.post(`/clubs/${clubId}/request-coach`);
      await loadClubs();
      flash(true, 'Club admin has been asked to assign a coach.');
    } catch (ex) {
      flash(false, ex.response?.data?.message || 'Could not send request');
    } finally {
      setRequestingCoach(null);
    }
  };

  const removeCoach = (coach) => {
    setConfirmError('');
    setConfirm({ kind: 'remove-coach', coach });
  };

  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirm(null);
    setConfirmError('');
  };

  const runConfirm = async () => {
    setConfirmBusy(true);
    setConfirmError('');
    try {
      if (confirm?.kind === 'leave-club') {
        await api.post(`/clubs/${confirm.club.id}/leave`);
        await Promise.all([loadClubs(), athlete ? loadCoaches() : Promise.resolve()]);
        flash(true, `Left ${confirm.club.name}`);
      }
      if (confirm?.kind === 'remove-coach') {
        const id = confirm.coach.coachId || confirm.coach.id;
        await api.delete(`/coaches/remove/${id}`);
        await loadCoaches();
        flash(true, 'Coach removed');
      }
      setConfirm(null);
    } catch (ex) {
      setConfirmError(ex.response?.data?.message || 'Could not complete that action');
    } finally {
      setConfirmBusy(false);
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

  useEffect(() => {
    const allowed = visibleActivityTypeOptions(user).map((opt) => opt.value);
    if (allowed.length && !allowed.includes(form.defaultActivityType)) {
      setForm((prev) => ({ ...prev, defaultActivityType: allowed[0] }));
    }
  }, [user?.syncActivityTypes]);

  const canAddCoach = coaches.length < maxCoaches;
  const athleteClubCount = clubs.filter((c) => c.role === 'member' || c.role === 'coach').length;
  const canJoinClub = athleteClubCount < maxClubs;

  const previewAge = ageFromDob(form.dateOfBirth);
  const previewMaf = mafHeartRate(previewAge);

  const tabs = TAB_DEFS.filter((t) => !t.athleteOnly || athlete);
  const requestedTab = completing ? 'profile' : searchParams.get('tab');
  const tab = tabs.some((t) => t.id === requestedTab) ? requestedTab : 'profile';

  const setTab = (id) => {
    setMsg('');
    setErr('');
    const next = new URLSearchParams(searchParams);
    if (id === 'profile') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  const tabCopy = {
    profile: completing
      ? 'Fill in your details to continue'
      : appAdmin ? 'Edit your details' : 'Edit your details and notification preferences',
    password: 'Change the password you use to sign in',
    sports: 'Choose which sports to sync from Strava and show in your log',
    strava: 'Connect Strava to sync activities',
    club: 'Join or manage your club',
    coaches: `Assign up to ${maxCoaches} coaches`,
  };

  return (
    <Layout>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="page-title">Profile</h2>
          <p className="page-sub">{tabCopy[tab] || 'Manage your account'}</p>
        </div>
        {!completing && (
        <button
          type="button"
          className="btn-outline btn-sm shrink-0"
          onClick={() => navigate(homePath(user))}
        >
          Done
        </button>
        )}
      </div>

      {!completing && (
      <div className="chip-row">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn-sm ${tab === t.id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      )}

      {msg && <div className="card mb-4 text-brand text-sm">{msg}</div>}
      {err && <div className="card mb-4 text-orange-300 text-sm">{err}</div>}

      {completing && tab === 'profile' && (
        <div className="card mb-4 text-sm text-orange-200">
          Finish your profile to continue.
          {athlete ? ' Date of birth sets your age and MAF (180 − age).' : ''}
          {clubAdmin && !user.adminClubId ? ' Add your club name to create the club.' : ''}
        </div>
      )}

      {tab === 'sports' && athlete && <ActivityTypesSettings user={user} />}

      {tab === 'strava' && athlete && (
        <>
          <ActivityTypesSettings user={user} />
          <StravaCard user={user} />
        </>
      )}

      {tab === 'profile' && (
      <form className="card grid md:grid-cols-2 gap-3 mb-6" onSubmit={save}>
        <h3 className="font-semibold md:col-span-2">{completing ? 'Your details' : 'Edit profile'}</h3>
        <div>
          <label htmlFor="firstName">{clubAdmin ? 'Admin first name' : 'First name'}</label>
          <input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </div>
        <div>
          <label htmlFor="lastName">{clubAdmin ? 'Admin last name' : 'Last name'}</label>
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
        {clubAdmin && !user.adminClubId && (
          <div>
            <label htmlFor="clubName">Club name</label>
            <input
              id="clubName"
              value={form.clubName}
              onChange={(e) => setForm({ ...form, clubName: e.target.value })}
              required
            />
          </div>
        )}
        {athlete && (
          <>
            <div>
              <label htmlFor="dateOfBirth">Date of birth</label>
              <input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                required
                max={todayIsoDate()}
              />
              {previewAge != null && previewMaf != null && (
                <p className="text-xs text-muted mt-1">
                  Age {previewAge} · MAF {previewMaf} bpm (180 − age)
                </p>
              )}
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
                {visibleActivityTypeOptions(user).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="weeklyTargetDays">Training days per week</label>
              <select
                id="weeklyTargetDays"
                value={form.weeklyTargetDays}
                onChange={(e) => setForm({ ...form, weeklyTargetDays: Number(e.target.value) })}
              >
                {[3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n} days</option>
                ))}
              </select>
              <p className="text-xs text-muted mt-1">
                Consistency is scored against this target. Default is 5, which is a common endurance-training week.
              </p>
            </div>
          </>
        )}
        <div className="md:col-span-2">
          <label htmlFor="bio">Bio</label>
          <textarea id="bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="About you" />
        </div>
        <button className="btn-primary md:col-span-2" type="submit">
          {completing ? 'Save and continue' : 'Save profile'}
        </button>
      </form>
      )}


      {tab === 'password' && (
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
      )}

      {tab === 'club' && athlete && (
        <section className="card space-y-4 mb-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Clubs · {athleteClubCount}/{maxClubs}</h3>
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
                  {c.role === 'member' && c.membershipStatus === 'active' && (
                    <div className="text-xs text-muted mt-1">
                      {(c.coaches || []).length
                        ? `Coach${c.coaches.length === 1 ? '' : 'es'}: ${c.coaches.map((x) => `${x.firstName} ${x.lastName}`).join(', ')}`
                        : c.coachRequested
                          ? 'Request sent. Waiting for a club admin to assign a coach.'
                          : 'No coach assigned'}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.role === 'member' && c.membershipStatus === 'active' && !(c.coaches || []).length && !c.coachRequested && (
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      disabled={requestingCoach === c.id}
                      onClick={() => requestCoach(c.id)}
                    >
                      {requestingCoach === c.id ? 'Sending…' : 'Request a coach'}
                    </button>
                  )}
                  {c.role !== 'club_admin' && (
                    <button type="button" className="btn-outline btn-sm" onClick={() => leaveClub(c)}>
                      {c.membershipStatus === 'pending' ? 'Cancel request' : 'Leave / change'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!clubs.length && <p className="text-sm text-muted">You are not in a club yet.</p>}
          </div>
          {canJoinClub ? (
          <>
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
          </>
          ) : (
            <p className="text-sm text-muted">You already belong to {maxClubs} clubs. Leave one to join another.</p>
          )}
        </section>
      )}

      {tab === 'coaches' && athlete && (
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
      {confirm?.kind === 'leave-club' && (
        <ConfirmDialog
          title="Leave this club?"
          confirmLabel="Leave club"
          danger
          busy={confirmBusy}
          error={confirmError}
          onCancel={closeConfirm}
          onConfirm={runConfirm}
        >
          <p className="mb-0">
            Leave <span className="text-slate-100 font-medium">{confirm.club.name}</span>? Coaches from this club will be unassigned.
          </p>
        </ConfirmDialog>
      )}
      {confirm?.kind === 'remove-coach' && (
        <ConfirmDialog
          title="Remove this coach?"
          confirmLabel="Remove coach"
          danger
          busy={confirmBusy}
          error={confirmError}
          onCancel={closeConfirm}
          onConfirm={runConfirm}
        >
          <p className="mb-0">
            Remove <span className="text-slate-100 font-medium">{confirm.coach.firstName} {confirm.coach.lastName}</span> as your coach?
          </p>
        </ConfirmDialog>
      )}
    </Layout>
  );
}
