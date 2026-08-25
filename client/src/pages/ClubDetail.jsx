import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { isAthleteAccount } from '../utils/roles';
import { formatActivityPrimary, formatDate, formatDateShort, getActivityIcon } from '../utils/format';
import ClubInviteCodes from '../components/ClubInviteCodes';

const PAGE_SIZES = [10, 20, 50, 100];

const ATHLETE_SORT_OPTIONS = [
  { sort: 'name', dir: 'asc', label: 'Name A–Z' },
  { sort: 'name', dir: 'desc', label: 'Name Z–A' },
  { sort: 'lastActivity', dir: 'desc', label: 'Last activity (newest)' },
  { sort: 'lastActivity', dir: 'asc', label: 'Last activity (oldest)' },
  { sort: 'activities', dir: 'desc', label: 'Most activities' },
  { sort: 'activities', dir: 'asc', label: 'Fewest activities' },
];

const COACH_SORT_OPTIONS = [
  { sort: 'name', dir: 'asc', label: 'Name A–Z' },
  { sort: 'name', dir: 'desc', label: 'Name Z–A' },
  { sort: 'athletes', dir: 'desc', label: 'Most athletes' },
  { sort: 'athletes', dir: 'asc', label: 'Fewest athletes' },
];

const REQUEST_SORT_OPTIONS = [
  { sort: 'requestedAt', dir: 'desc', label: 'Requested (newest)' },
  { sort: 'requestedAt', dir: 'asc', label: 'Requested (oldest)' },
  { sort: 'name', dir: 'asc', label: 'Name A–Z' },
  { sort: 'name', dir: 'desc', label: 'Name Z–A' },
];

function SortHeader({ label, column, sort, dir, onSort }) {
  const active = sort === column;
  const arrow = !active ? '' : dir === 'asc' ? ' ↑' : ' ↓';
  return (
    <button
      type="button"
      className={`font-semibold bg-transparent border-0 p-0 text-left ${active ? 'text-brand' : 'text-muted'}`}
      onClick={() => onSort(column)}
    >
      {label}{arrow}
    </button>
  );
}

function sortPeople(list, sort, dir) {
  const mul = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sort === 'activities') {
      return ((a.activityCount || 0) - (b.activityCount || 0)) * mul;
    }
    if (sort === 'athletes') {
      return ((a.assignedCount || 0) - (b.assignedCount || 0)) * mul;
    }
    if (sort === 'requestedAt') {
      const av = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const bv = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return (av - bv) * mul;
    }
    if (sort === 'lastActivity') {
      const av = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bv = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return (av - bv) * mul;
    }
    const an = `${a.lastName || ''} ${a.firstName || ''}`.toLowerCase();
    const bn = `${b.lastName || ''} ${b.firstName || ''}`.toLowerCase();
    return an.localeCompare(bn) * mul;
  });
}

function pageSlice(list, page, limit) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * limit;
  return {
    rows: list.slice(start, start + limit),
    total,
    pages,
    page: safePage,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + limit, total),
  };
}

function SortControls({ options, sort, dir, limit, onSortOption, onLimit, sortLabel, limitLabel }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted mb-0 min-w-0">
        <span>Sort</span>
        <select
          className="w-full sm:w-auto min-w-0 py-1.5"
          value={`${sort}:${dir}`}
          onChange={(e) => onSortOption(e.target.value)}
          aria-label={sortLabel}
        >
          {options.map((opt) => (
            <option key={`${opt.sort}:${opt.dir}`} value={`${opt.sort}:${opt.dir}`}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted mb-0 min-w-0">
        <span>Show</span>
        <select
          className="w-full sm:w-auto min-w-0 py-1.5"
          value={limit}
          onChange={(e) => onLimit(Number(e.target.value))}
          aria-label={limitLabel}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Pager({ from, to, total, page, pages, onPage }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <p className="text-xs text-muted mb-0">
        Showing {from}–{to} of {total} · Page {page} of {pages}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <button className="btn-outline btn-sm" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="btn-outline btn-sm" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export default function ClubDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAppAdmin, user } = useAuth();
  const [data, setData] = useState(null);
  const [code, setCode] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [athleteEmail, setAthleteEmail] = useState('');
  const [profile, setProfile] = useState({ name: '', description: '', location: '', website: '' });
  const [assignPick, setAssignPick] = useState({});
  const [msg, setMsg] = useState('');
  const [openAthleteId, setOpenAthleteId] = useState(null);
  const [athleteActs, setAthleteActs] = useState([]);
  const [coachSort, setCoachSort] = useState('name');
  const [coachDir, setCoachDir] = useState('asc');
  const [coachPage, setCoachPage] = useState(1);
  const [coachLimit, setCoachLimit] = useState(10);
  const [athleteSort, setAthleteSort] = useState('name');
  const [athleteDir, setAthleteDir] = useState('asc');
  const [athletePage, setAthletePage] = useState(1);
  const [athleteLimit, setAthleteLimit] = useState(10);
  const [requestSort, setRequestSort] = useState('requestedAt');
  const [requestDir, setRequestDir] = useState('desc');
  const [requestPage, setRequestPage] = useState(1);
  const [requestLimit, setRequestLimit] = useState(10);
  const [requestingCoach, setRequestingCoach] = useState(false);

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

  const members = data?.members || [];
  const assignments = data?.assignments || [];
  const club = data?.club;
  const myMembership = data?.myMembership;
  const isAdmin = Boolean(isAppAdmin || (myMembership?.role === 'club_admin' && myMembership.status === 'active'));
  const isMember = myMembership?.status === 'active';

  const coaches = useMemo(
    () => members
      .filter((m) => m.status === 'active' && (
        m.role === 'coach'
        || (m.role === 'club_admin' && club?.headCoachUserId === m.userId)
      ))
      .map((c) => ({
        ...c,
        assignedCount: assignments.filter((a) => a.coachId === c.userId).length,
        isHeadCoach: club?.headCoachUserId === c.userId,
      })),
    [members, assignments, club?.headCoachUserId]
  );
  const athletes = useMemo(
    () => members.filter((m) => m.role === 'member' && m.status === 'active'),
    [members]
  );
  const pending = useMemo(
    () => members.filter((m) => m.status === 'pending' && !m.approvedAt),
    [members]
  );
  const coachRequests = useMemo(
    () =>
      members.filter(
        (m) =>
          m.role === 'member' &&
          m.status === 'active' &&
          m.coachRequested &&
          !assignments.some((a) => a.athleteId === m.userId)
      ),
    [members, assignments]
  );

  const coachTable = useMemo(() => {
    const sorted = sortPeople(coaches, coachSort, coachDir);
    return pageSlice(sorted, coachPage, coachLimit);
  }, [coaches, coachSort, coachDir, coachPage, coachLimit]);

  const athleteTable = useMemo(() => {
    const sorted = sortPeople(athletes, athleteSort, athleteDir);
    return pageSlice(sorted, athletePage, athleteLimit);
  }, [athletes, athleteSort, athleteDir, athletePage, athleteLimit]);

  const requestTable = useMemo(() => {
    const sorted = sortPeople(pending, requestSort, requestDir);
    return pageSlice(sorted, requestPage, requestLimit);
  }, [pending, requestSort, requestDir, requestPage, requestLimit]);

  useEffect(() => {
    if (coachTable.page !== coachPage) setCoachPage(coachTable.page);
  }, [coachTable.page, coachPage]);

  useEffect(() => {
    if (athleteTable.page !== athletePage) setAthletePage(athleteTable.page);
  }, [athleteTable.page, athletePage]);

  useEffect(() => {
    if (requestTable.page !== requestPage) setRequestPage(requestTable.page);
  }, [requestTable.page, requestPage]);

  if (!data) return <Layout><p className="text-muted">Loading…</p></Layout>;

  const assignedFor = (athleteId) => assignments.filter((a) => a.athleteId === athleteId);
  const myAssignedCoaches = assignedFor(user.id);
  const myCoachRequested = Boolean(members.find((m) => m.userId === user.id)?.coachRequested);
  const canRequestCoach =
    isAthleteAccount(user) &&
    myMembership?.status === 'active' &&
    myMembership.role === 'member';

  const flash = (text) => setMsg(text);

  const requestCoach = async () => {
    setRequestingCoach(true);
    try {
      await api.post(`/clubs/${id}/request-coach`);
      flash('Club admin has been asked to assign a coach.');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not send request');
    } finally {
      setRequestingCoach(false);
    }
  };

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
      setData((prev) => prev ? {
        ...prev,
        members: (prev.members || []).map((m) => (
          m.id === memberId ? { ...m, status: 'active', approvedAt: new Date().toISOString() } : m
        )),
      } : prev);
      flash('Request approved');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not approve');
    }
  };

  const addCoach = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/clubs/${id}/coaches`, { email: coachEmail });
      setCoachEmail('');
      flash(data.requested ? 'Request sent to platform admin' : 'Coach added');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not add coach');
    }
  };

  const requestCoachRole = async (userId) => {
    try {
      const { data } = await api.post(`/clubs/${id}/coaches`, { userId });
      flash(data.requested ? 'Request sent to platform admin' : 'Coach added');
      load();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not request coach');
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
      const { data: next } = await api.get(`/activities/athlete/${userId}`, { params: { limit: 100 } });
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

  const changeCoachSort = (column) => {
    if (coachSort === column) {
      setCoachDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setCoachSort(column);
      setCoachDir(column === 'name' ? 'asc' : 'desc');
    }
    setCoachPage(1);
  };

  const changeAthleteSort = (column) => {
    if (athleteSort === column) {
      setAthleteDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setAthleteSort(column);
      setAthleteDir(column === 'name' ? 'asc' : 'desc');
    }
    setAthletePage(1);
  };

  const changeRequestSort = (column) => {
    if (requestSort === column) {
      setRequestDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setRequestSort(column);
      setRequestDir(column === 'name' ? 'asc' : 'desc');
    }
    setRequestPage(1);
  };

  const tabs = isAdmin
    ? [
        { id: 'about', label: 'About' },
        ...(myMembership?.role === 'club_admin' && myMembership.status === 'active'
          ? [{ id: 'invites', label: 'QR codes' }]
          : []),
        { id: 'coaches', label: `Coaches (${coaches.length})` },
        { id: 'athletes', label: `Athletes (${athletes.length})` },
        { id: 'requests', label: (pending.length + coachRequests.length) ? `Requests (${pending.length + coachRequests.length})` : 'Requests' },
      ]
    : [];
  const requestedTab = searchParams.get('tab');
  const tab = tabs.some((t) => t.id === requestedTab) ? requestedTab : 'about';
  const setTab = (nextId) => {
    setMsg('');
    const next = new URLSearchParams(searchParams);
    if (nextId === 'about') next.delete('tab');
    else next.set('tab', nextId);
    setSearchParams(next, { replace: true });
  };

  return (
    <Layout>
      <h2 className="page-title">{club.name} {club.isVerified ? '✓' : ''}</h2>
      <p className="page-sub">
        {club.location || 'Location TBD'}
        {isMember || isAdmin ? ` · ${coaches.length} coaches · ${athletes.length} athletes` : ''}
        {isAdmin ? ' · athletes connect Strava on their own accounts' : ''}
      </p>
      {club.description && !isAdmin && <p className="text-sm text-muted mb-4">{club.description}</p>}
      {msg && <div className="card mb-4 text-sm">{msg}</div>}

      {myMembership?.status === 'pending' && (
        <div className="card mb-6 text-sm text-muted">Your join request is waiting for a club admin to approve.</div>
      )}

      {!myMembership && isAthleteAccount(user) && (
        <div className="card mb-6">
          <p className="text-sm text-muted mb-3">Request to join this club. A club admin will approve you.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input placeholder="Invitation code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn-primary" onClick={join}>Request to join</button>
          </div>
        </div>
      )}

      {myMembership && myMembership.status === 'active' && myMembership.role !== 'club_admin' && (
        <div className="card mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted m-0">You are a {myMembership.role === 'coach' ? 'coach' : 'athlete'} of this club.</p>
            {canRequestCoach && (
              myAssignedCoaches.length ? (
                <p className="text-sm text-muted mb-0 mt-1">
                  Coach{myAssignedCoaches.length === 1 ? '' : 'es'}:{' '}
                  {myAssignedCoaches.map((x) => `${x.coachFirstName} ${x.coachLastName}`).join(', ')}
                </p>
              ) : myCoachRequested ? (
                <p className="text-sm text-muted mb-0 mt-1">Request sent. Waiting for a club admin to assign a coach.</p>
              ) : (
                <p className="text-sm text-muted mb-0 mt-1">No coach assigned in this club.</p>
              )
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canRequestCoach && !myAssignedCoaches.length && !myCoachRequested && (
              <button className="btn-outline btn-sm" type="button" disabled={requestingCoach} onClick={requestCoach}>
                {requestingCoach ? 'Sending…' : 'Request a coach'}
              </button>
            )}
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
        </div>
      )}

      {isAdmin && (
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

      {isAdmin && tab === 'about' && (
        <form className="card grid md:grid-cols-2 gap-3 mb-6" onSubmit={saveProfile}>
          <h3 className="font-semibold md:col-span-2">Club profile</h3>
          <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Name" required />
          <input value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} placeholder="Location" />
          <input value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} placeholder="Website" />
          <textarea className="md:col-span-2" value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} placeholder="About this club" />
          <button className="btn-primary md:col-span-2" type="submit">Save club</button>
        </form>
      )}

      {isAdmin && tab === 'invites' && (
        <div className="mb-8">
          <ClubInviteCodes clubId={id} clubName={club.name} pendingCoach={club.status === 'pending_coach'} />
        </div>
      )}

      {isAdmin && tab === 'coaches' && (
        <>
          <div className="flex flex-col gap-3 mb-3">
            <SortControls
              options={COACH_SORT_OPTIONS}
              sort={coachSort}
              dir={coachDir}
              limit={coachLimit}
              onSortOption={(value) => {
                const [nextSort, nextDir] = value.split(':');
                setCoachSort(nextSort);
                setCoachDir(nextDir);
                setCoachPage(1);
              }}
              onLimit={(next) => {
                setCoachLimit(next);
                setCoachPage(1);
              }}
              sortLabel="Sort coaches"
              limitLabel="Coaches per page"
            />
          </div>
          <form className="card space-y-2 mb-3" onSubmit={addCoach}>
            <div className="flex flex-col sm:flex-row gap-2">
              <input placeholder="Coach email" value={coachEmail} onChange={(e) => setCoachEmail(e.target.value)} required />
              <button className="btn-primary sm:w-auto w-full" type="submit">Add or request coach</button>
            </div>
            {club.status === 'pending_coach' && (
              <p className="text-xs text-accent mb-0">
                Add a coach, or choose I am the head coach on Profile, before the club can accept athletes.
              </p>
            )}
          </form>
          {!coaches.length ? (
            <div className="card text-muted text-sm mb-8">No coaches yet.</div>
          ) : (
            <>
              <div className="space-y-2 md:hidden mb-3">
                {coachTable.rows.map((c) => (
                  <div key={c.id} className="card">
                    <div className="font-semibold">
                      {c.firstName} {c.lastName}
                      {c.isHeadCoach ? <span className="text-xs font-normal text-muted"> · Head coach</span> : null}
                    </div>
                    <div className="text-xs text-muted truncate mt-0.5">{c.email}</div>
                    <div className="text-xs text-muted mt-2">{c.assignedCount} assigned athlete{c.assignedCount === 1 ? '' : 's'}</div>
                    {c.isHeadCoach ? (
                      <p className="text-xs text-muted mb-0 mt-3">Change this on Profile.</p>
                    ) : (
                      <button className="btn-outline btn-sm mt-3" type="button" onClick={() => removeCoach(c.userId)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="card overflow-x-auto mb-3 hidden md:block">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left border-b border-line">
                      <th className="p-3">
                        <SortHeader label="Name" column="name" sort={coachSort} dir={coachDir} onSort={changeCoachSort} />
                      </th>
                      <th className="p-3 text-muted font-semibold">Email</th>
                      <th className="p-3">
                        <SortHeader label="Athletes" column="athletes" sort={coachSort} dir={coachDir} onSort={changeCoachSort} />
                      </th>
                      <th className="p-3 text-muted font-semibold"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {coachTable.rows.map((c) => (
                      <tr key={c.id} className="border-t border-line">
                        <td className="p-3 font-semibold text-slate-100 whitespace-nowrap">
                          {c.firstName} {c.lastName}
                          {c.isHeadCoach ? <span className="text-xs font-normal text-muted"> · Head coach</span> : null}
                        </td>
                        <td className="p-3 text-muted">{c.email}</td>
                        <td className="p-3 whitespace-nowrap">{c.assignedCount}</td>
                        <td className="p-3 whitespace-nowrap text-right">
                          {c.isHeadCoach ? (
                            <span className="text-xs text-muted">Change on Profile</span>
                          ) : (
                            <button className="btn-outline btn-sm" type="button" onClick={() => removeCoach(c.userId)}>
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                from={coachTable.from}
                to={coachTable.to}
                total={coachTable.total}
                page={coachTable.page}
                pages={coachTable.pages}
                onPage={setCoachPage}
              />
            </>
          )}
        </>
      )}

      {!isAdmin && isMember && (
        <section className="mb-8">
          <h3 className="font-semibold mb-3">Coaches</h3>
          <div className="space-y-2">
            {coaches.map((c) => (
              <div key={c.id} className="card">
                <div className="font-semibold">
                  {c.firstName} {c.lastName}
                  {c.isHeadCoach ? <span className="text-xs font-normal text-muted"> · Head coach</span> : null}
                </div>
                <div className="text-xs text-muted">{c.email}</div>
              </div>
            ))}
            {!coaches.length && <div className="card text-muted text-sm">No coaches yet.</div>}
          </div>
        </section>
      )}

      {isAdmin && tab === 'athletes' && (
        <>
          <div className="flex flex-col gap-3 mb-3">
            <SortControls
              options={ATHLETE_SORT_OPTIONS}
              sort={athleteSort}
              dir={athleteDir}
              limit={athleteLimit}
              onSortOption={(value) => {
                const [nextSort, nextDir] = value.split(':');
                setAthleteSort(nextSort);
                setAthleteDir(nextDir);
                setAthletePage(1);
              }}
              onLimit={(next) => {
                setAthleteLimit(next);
                setAthletePage(1);
              }}
              sortLabel="Sort athletes"
              limitLabel="Athletes per page"
            />
          </div>
          <p className="text-sm text-muted mb-3">View club athletes and assign a coach from this club.</p>
          <form className="card space-y-2 mb-3" onSubmit={addAthlete}>
            <div className="flex flex-col sm:flex-row gap-2">
              <input placeholder="Athlete email" type="email" value={athleteEmail} onChange={(e) => setAthleteEmail(e.target.value)} required />
              <button className="btn-primary sm:w-auto w-full" type="submit">Add athlete</button>
            </div>
          </form>
          {!athletes.length ? (
            <div className="card text-muted text-sm mb-8">No athletes in this club yet. Add one by email or approve a join request.</div>
          ) : (
            <>
              <div className="space-y-2 md:hidden mb-3">
                {athleteTable.rows.map((a) => {
                  const assigned = assignedFor(a.userId);
                  const available = coaches.filter((c) => !assigned.some((x) => x.coachId === c.userId));
                  const open = openAthleteId === a.userId;
                  return (
                    <div key={a.id} className="card">
                      <div className="font-semibold">{a.firstName} {a.lastName}</div>
                      {a.coachRequested && !assigned.length && (
                        <div className="text-[11px] font-semibold text-orange-200 mt-0.5">Requested a coach</div>
                      )}
                      <div className="text-xs text-muted truncate mt-0.5">{a.email}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted mt-2">
                        <span>{a.activityCount ?? 0} activities</span>
                        <span>Last {a.lastActivityAt ? formatDateShort(a.lastActivityAt) : '—'}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {assigned.map((x) => (
                          <span key={x.id} className="badge bg-brand/15 text-brand normal-case">
                            {x.coachFirstName} {x.coachLastName}
                            <button className="ml-1" type="button" onClick={() => unassign(a.userId, x.coachId)}>×</button>
                          </span>
                        ))}
                        {!assigned.length && <span className="text-sm text-muted">No coach assigned</span>}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <select
                          className="min-w-0 flex-1"
                          value={assignPick[a.userId] || ''}
                          onChange={(e) => setAssignPick((prev) => ({ ...prev, [a.userId]: e.target.value }))}
                        >
                          <option value="">{coaches.length ? 'Assign a coach…' : 'Add a coach first'}</option>
                          {available.map((c) => (
                            <option key={c.userId} value={c.userId}>
                              {c.firstName} {c.lastName}{c.isHeadCoach ? ' · Head coach' : ''}
                            </option>
                          ))}
                        </select>
                        <button className="btn-primary btn-sm" type="button" onClick={() => assign(a.userId)} disabled={!assignPick[a.userId]}>
                          Assign
                        </button>
                        {a.coachRoleRequested ? (
                          <span className="text-xs text-orange-200 self-center">Coach request pending</span>
                        ) : (
                          <button className="btn-outline btn-sm" type="button" onClick={() => requestCoachRole(a.userId)}>
                            Request as coach
                          </button>
                        )}
                        <button className="btn-outline btn-sm" type="button" onClick={() => viewAthlete(a.userId)}>
                          {open ? 'Hide' : 'View'}
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
              </div>
              <div className="card overflow-x-auto mb-3 hidden md:block">
                <table className="w-full text-sm min-w-[860px]">
                  <thead>
                    <tr className="text-left border-b border-line">
                      <th className="p-3">
                        <SortHeader label="Name" column="name" sort={athleteSort} dir={athleteDir} onSort={changeAthleteSort} />
                      </th>
                      <th className="p-3 text-muted font-semibold">Email</th>
                      <th className="p-3">
                        <SortHeader label="Activities" column="activities" sort={athleteSort} dir={athleteDir} onSort={changeAthleteSort} />
                      </th>
                      <th className="p-3">
                        <SortHeader label="Last activity" column="lastActivity" sort={athleteSort} dir={athleteDir} onSort={changeAthleteSort} />
                      </th>
                      <th className="p-3 text-muted font-semibold">Coach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {athleteTable.rows.map((a) => {
                      const assigned = assignedFor(a.userId);
                      const available = coaches.filter((c) => !assigned.some((x) => x.coachId === c.userId));
                      const open = openAthleteId === a.userId;
                      return (
                        <tr key={a.id} className="border-t border-line align-top">
                          <td className="p-3 font-semibold text-slate-100 whitespace-nowrap">
                            {a.firstName} {a.lastName}
                            {a.coachRequested && !assigned.length && (
                              <div className="text-[11px] font-semibold text-orange-200 mt-0.5">Requested a coach</div>
                            )}
                            {open && (
                              <div className="mt-3 space-y-2 font-normal">
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
                          </td>
                          <td className="p-3 text-muted">{a.email}</td>
                          <td className="p-3 whitespace-nowrap">{a.activityCount ?? 0}</td>
                          <td className="p-3 whitespace-nowrap text-muted">
                            {a.lastActivityAt ? formatDate(a.lastActivityAt) : '—'}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1 mb-2">
                              {assigned.map((x) => (
                                <span key={x.id} className="badge bg-brand/15 text-brand normal-case">
                                  {x.coachFirstName} {x.coachLastName}
                                  <button className="ml-1" type="button" onClick={() => unassign(a.userId, x.coachId)}>×</button>
                                </span>
                              ))}
                              {!assigned.length && <span className="text-xs text-muted">None</span>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <select
                                className="min-w-0 py-1.5"
                                value={assignPick[a.userId] || ''}
                                onChange={(e) => setAssignPick((prev) => ({ ...prev, [a.userId]: e.target.value }))}
                              >
                                <option value="">{coaches.length ? 'Assign…' : 'Add a coach first'}</option>
                                {available.map((c) => (
                                  <option key={c.userId} value={c.userId}>
                                    {c.firstName} {c.lastName}{c.isHeadCoach ? ' · Head coach' : ''}
                                  </option>
                                ))}
                              </select>
                              <button className="btn-primary btn-sm" type="button" onClick={() => assign(a.userId)} disabled={!assignPick[a.userId]}>
                                Assign
                              </button>
                              {a.coachRoleRequested ? (
                                <span className="text-xs text-orange-200 self-center">Coach request pending</span>
                              ) : (
                                <button className="btn-outline btn-sm" type="button" onClick={() => requestCoachRole(a.userId)}>
                                  Request as coach
                                </button>
                              )}
                              <button className="btn-outline btn-sm" type="button" onClick={() => viewAthlete(a.userId)}>
                                {open ? 'Hide' : 'View'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager
                from={athleteTable.from}
                to={athleteTable.to}
                total={athleteTable.total}
                page={athleteTable.page}
                pages={athleteTable.pages}
                onPage={setAthletePage}
              />
            </>
          )}
        </>
      )}

      {isAdmin && tab === 'requests' && (
        <>
          {!!pending.length && (
          <div className="flex flex-col gap-3 mb-3">
            <SortControls
              options={REQUEST_SORT_OPTIONS}
              sort={requestSort}
              dir={requestDir}
              limit={requestLimit}
              onSortOption={(value) => {
                const [nextSort, nextDir] = value.split(':');
                setRequestSort(nextSort);
                setRequestDir(nextDir);
                setRequestPage(1);
              }}
              onLimit={(next) => {
                setRequestLimit(next);
                setRequestPage(1);
              }}
              sortLabel="Sort requests"
              limitLabel="Requests per page"
            />
          </div>
          )}
          <h3 className="font-semibold mb-3">Join requests</h3>
          {!pending.length ? (
            <div className="card text-muted text-sm mb-6">No pending join requests.</div>
          ) : (
            <>
              <div className="space-y-2 md:hidden mb-3">
                {requestTable.rows.map((m) => (
                  <div key={m.id} className="card">
                    <div className="font-semibold">{m.firstName} {m.lastName}</div>
                    <div className="text-xs text-muted truncate mt-0.5">{m.email}</div>
                    <div className="text-xs text-muted mt-2">Requested {m.requestedAt ? formatDateShort(m.requestedAt) : '—'}</div>
                    <button className="btn-primary btn-sm mt-3" type="button" onClick={() => approve(m.id)}>
                      Approve
                    </button>
                  </div>
                ))}
              </div>
              <div className="card overflow-x-auto mb-3 hidden md:block">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left border-b border-line">
                      <th className="p-3">
                        <SortHeader label="Requested" column="requestedAt" sort={requestSort} dir={requestDir} onSort={changeRequestSort} />
                      </th>
                      <th className="p-3">
                        <SortHeader label="Name" column="name" sort={requestSort} dir={requestDir} onSort={changeRequestSort} />
                      </th>
                      <th className="p-3 text-muted font-semibold">Email</th>
                      <th className="p-3 text-muted font-semibold"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestTable.rows.map((m) => (
                      <tr key={m.id} className="border-t border-line">
                        <td className="p-3 whitespace-nowrap text-muted">{m.requestedAt ? formatDate(m.requestedAt) : '—'}</td>
                        <td className="p-3 font-semibold text-slate-100 whitespace-nowrap">
                          {m.firstName} {m.lastName}
                        </td>
                        <td className="p-3 text-muted">{m.email}</td>
                        <td className="p-3 whitespace-nowrap text-right">
                          <button className="btn-primary btn-sm" type="button" onClick={() => approve(m.id)}>
                            Approve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                from={requestTable.from}
                to={requestTable.to}
                total={requestTable.total}
                page={requestTable.page}
                pages={requestTable.pages}
                onPage={setRequestPage}
              />
            </>
          )}

          <h3 className="font-semibold mb-3 mt-6">Coach assignment</h3>
          {!coachRequests.length ? (
            <div className="card text-muted text-sm mb-6">No athletes are waiting for a coach.</div>
          ) : (
            <>
              <div className="space-y-2 md:hidden mb-6">
                {coachRequests.map((m) => (
                  <div key={m.id} className="card">
                    <div className="font-semibold">{m.firstName} {m.lastName}</div>
                    <div className="text-xs text-muted truncate mt-0.5">{m.email}</div>
                    <button className="btn-primary btn-sm mt-3" type="button" onClick={() => setTab('athletes')}>
                      Assign
                    </button>
                  </div>
                ))}
              </div>
              <div className="card overflow-x-auto mb-6 hidden md:block">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-left border-b border-line">
                      <th className="p-3 text-muted font-semibold">Name</th>
                      <th className="p-3 text-muted font-semibold">Email</th>
                      <th className="p-3 text-muted font-semibold"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {coachRequests.map((m) => (
                      <tr key={m.id} className="border-t border-line">
                        <td className="p-3 font-semibold text-slate-100 whitespace-nowrap">
                          {m.firstName} {m.lastName}
                        </td>
                        <td className="p-3 text-muted">{m.email}</td>
                        <td className="p-3 text-right">
                          <button className="btn-primary btn-sm" type="button" onClick={() => setTab('athletes')}>
                            Assign
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  );
}
