import { useEffect, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import Badge, { CodeTypeBadge, RoleBadges, StatusBadge, StravaBadge } from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import { isSuperAdminAccount } from '../utils/roles';
import { formatActivityPrimary, formatActivitySecondary, formatDate, formatDateTime, getActivityIcon } from '../utils/format';

const ALL_TABS = [
  { id: 'staff', label: 'Staff', superOnly: true },
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'clubs', label: 'Clubs' },
  { id: 'coach-requests', label: 'Coach requests' },
  { id: 'codes', label: 'Invite codes', superOnly: true },
  { id: 'memberships', label: 'Memberships' },
  { id: 'settings', label: 'Settings', superOnly: true },
  { id: 'audit', label: 'Audit log', superOnly: true },
];

const CODE_TYPES = [
  { value: 'athlete', label: 'Athlete' },
  { value: 'coach', label: 'Coach' },
  { value: 'club', label: 'Club' },
  { value: 'universal', label: 'Any (universal)' },
];

const emptyCodeForm = {
  type: 'athlete',
  planId: '',
  count: 1,
  maxActivations: 1,
  expiresAt: '',
  prefix: '',
  customCode: '',
  notes: '',
};

const AUDIT_PAGE_SIZES = [10, 20, 50, 100];

function copyText(value) {
  return navigator.clipboard.writeText(value);
}

function codeStateLabel(state) {
  if (state === 'used_up') return 'Used up';
  if (state === 'disabled') return 'Revoked';
  if (state === 'expired') return 'Expired';
  if (state === 'active') return 'Active';
  return state || 'Active';
}

export default function Admin() {
  const { user } = useAuth();
  const superAdmin = isSuperAdminAccount(user);
  const tabs = ALL_TABS.filter((t) => superAdmin || !t.superOnly);
  const [tab, setTab] = useState('users');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [codes, setCodes] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [settings, setSettings] = useState({});
  const [audit, setAudit] = useState([]);
  const [auditDays, setAuditDays] = useState([]);
  const [auditDay, setAuditDay] = useState(localDayString());
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit, setAuditLimit] = useState(20);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPages, setAuditPages] = useState(1);
  const auditTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [plans, setPlans] = useState([]);
  const [codeForm, setCodeForm] = useState(emptyCodeForm);
  const [codeFilter, setCodeFilter] = useState({ type: 'all', status: 'all', q: '' });
  const [createdCodes, setCreatedCodes] = useState([]);
  const [codeMsg, setCodeMsg] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [openRedemptions, setOpenRedemptions] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [userQ, setUserQ] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [syncingId, setSyncingId] = useState(null);
  const [adminMsg, setAdminMsg] = useState('');
  const [adminErr, setAdminErr] = useState('');
  const [clubPick, setClubPick] = useState('');
  const [clubRole, setClubRole] = useState('member');
  const [coachPick, setCoachPick] = useState('');
  const [selectedClubId, setSelectedClubId] = useState(null);
  const [clubDetail, setClubDetail] = useState(null);
  const [selectedMembershipId, setSelectedMembershipId] = useState(null);
  const [membershipDetail, setMembershipDetail] = useState(null);
  const [extendDates, setExtendDates] = useState({});
  const [membershipBusy, setMembershipBusy] = useState(null);
  const [membershipMsg, setMembershipMsg] = useState('');
  const [membershipErr, setMembershipErr] = useState('');
  const [dialog, setDialog] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [staff, setStaff] = useState([]);
  const [staffForm, setStaffForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'admin' });
  const [clubForm, setClubForm] = useState({ name: '', location: '', email: '', password: '', firstName: '', lastName: '' });
  const [coachRequests, setCoachRequests] = useState([]);

  const load = async (next = tab) => {
    if (next === 'staff' && superAdmin) setStaff((await api.get('/admin/staff')).data.users);
    if (next === 'overview') setOverview((await api.get('/admin/overview')).data);
    if (next === 'users') {
      const params = {};
      if (userQ.trim()) params.q = userQ.trim();
      setUsers((await api.get('/admin/users', { params })).data.users);
      setClubs((await api.get('/admin/clubs')).data.clubs);
    }
    if (next === 'clubs') setClubs((await api.get('/admin/clubs')).data.clubs);
    if (next === 'coach-requests') setCoachRequests((await api.get('/admin/coach-requests')).data.requests || []);
    if (next === 'codes') {
      const params = {};
      if (codeFilter.type !== 'all') params.type = codeFilter.type;
      if (codeFilter.status !== 'all') params.status = codeFilter.status;
      if (codeFilter.q) params.q = codeFilter.q;
      setCodes((await api.get('/membership/codes', { params })).data.codes);
      setPlans((await api.get('/membership/plans')).data.plans);
    }
    if (next === 'memberships') {
      setMemberships((await api.get('/admin/memberships')).data.memberships);
      if (selectedMembershipId) {
        try {
          setMembershipDetail((await api.get(`/admin/memberships/${selectedMembershipId}`)).data);
        } catch {
          setSelectedMembershipId(null);
          setMembershipDetail(null);
        }
      }
    }
    if (next === 'settings') setSettings((await api.get('/admin/settings')).data.settings);
    if (next === 'audit') {
      await loadAudit(auditDay, 1, auditLimit);
    }
  };

  useEffect(() => { load(tab); }, [tab]);
  useEffect(() => {
    if (tab === 'codes') load('codes');
  }, [codeFilter.type, codeFilter.status]);

  const generate = async (e) => {
    e.preventDefault();
    setCodeErr('');
    setCodeMsg('');
    try {
      const payload = {
        type: codeForm.type,
        planId: codeForm.planId || undefined,
        count: Number(codeForm.count) || 1,
        maxActivations: Number(codeForm.maxActivations) || 1,
        expiresAt: codeForm.expiresAt ? `${codeForm.expiresAt}T23:59:59` : undefined,
        prefix: codeForm.prefix || undefined,
        code: codeForm.customCode || undefined,
        notes: codeForm.notes || undefined,
      };
      const { data } = await api.post('/membership/codes', payload);
      setCreatedCodes(data.codes || []);
      setCodeMsg(`Created ${data.codes?.length || 0} onboarding code${data.codes?.length === 1 ? '' : 's'}`);
      setCodeForm({ ...emptyCodeForm, type: codeForm.type, planId: codeForm.planId });
      load('codes');
    } catch (err) {
      setCodeErr(err.response?.data?.message || 'Could not generate codes');
    }
  };

  const disableCode = async (id, isDisabled) => {
    await api.patch(`/membership/codes/${id}`, { isDisabled });
    load('codes');
  };

  const saveCode = async (id, patch) => {
    await api.patch(`/membership/codes/${id}`, patch);
    load('codes');
  };

  const showRedemptions = async (id) => {
    if (openRedemptions === id) {
      setOpenRedemptions(null);
      return;
    }
    const { data } = await api.get(`/membership/codes/${id}/redemptions`);
    setRedemptions(data.redemptions || []);
    setOpenRedemptions(id);
  };

  const verifyClub = async (id, isVerified) => {
    await api.patch(`/admin/clubs/${id}`, { isVerified });
    load('clubs');
  };

  const loadAudit = async (day, page = 1, limit = auditLimit) => {
    setAuditDay(day);
    setAuditPage(page);
    setAuditLimit(limit);
    const [daysRes, logsRes] = await Promise.all([
      api.get('/admin/audit/days', { params: { tz: auditTz } }),
      api.get('/admin/audit', { params: { tz: auditTz, day, page, limit } }),
    ]);
    setAuditDays(daysRes.data.days || []);
    setAudit(logsRes.data.logs || []);
    setAuditTotal(logsRes.data.total || 0);
    setAuditPages(logsRes.data.pages || 1);
    if (logsRes.data.page && logsRes.data.page !== page) setAuditPage(logsRes.data.page);
  };

  const openMembership = async (id) => {
    if (selectedMembershipId === id) {
      setSelectedMembershipId(null);
      setMembershipDetail(null);
      return;
    }
    setSelectedMembershipId(id);
    setMembershipErr('');
    setMembershipDetail((await api.get(`/admin/memberships/${id}`)).data);
  };

  const patchMembership = async (id, payload, okMsg) => {
    setMembershipBusy(id);
    setMembershipErr('');
    setMembershipMsg('');
    try {
      const { data } = await api.patch(`/admin/memberships/${id}`, payload);
      const nextId = data.membership?.id || id;
      setMembershipMsg(okMsg);
      setAdminMsg(okMsg);
      await load('memberships');
      if (selectedMembershipId === id || selectedMembershipId === nextId) {
        setSelectedMembershipId(nextId);
        setMembershipDetail((await api.get(`/admin/memberships/${nextId}`)).data);
      }
      if (selectedId) await openUser(selectedId);
      return true;
    } catch (err) {
      setMembershipErr(err.response?.data?.message || 'Could not update membership');
      setAdminErr(err.response?.data?.message || 'Could not update membership');
      return false;
    } finally {
      setMembershipBusy(null);
    }
  };

  const extendMembership = (id) => {
    const day = extendDates[id];
    if (!day) {
      setMembershipErr('Choose a date to extend until');
      return;
    }
    patchMembership(id, { action: 'extend', expiresAt: day }, 'Membership extended');
  };

  const openClub = async (id) => {
    if (selectedClubId === id) {
      setSelectedClubId(null);
      setClubDetail(null);
      return;
    }
    setSelectedClubId(id);
    setClubDetail((await api.get(`/admin/clubs/${id}`)).data);
  };

  const setUserStatus = async (id, status) => {
    setAdminErr('');
    await api.patch(`/admin/users/${id}`, { status });
    load('users');
    if (selectedId === id) openUser(id);
  };

  const openUser = async (id) => {
    setSelectedId(id);
    setAdminErr('');
    setAdminMsg('');
    const { data } = await api.get(`/admin/users/${id}`);
    setDetail(data);
  };

  const syncUser = async (id) => {
    setSyncingId(id);
    setAdminErr('');
    setAdminMsg('');
    try {
      const { data } = await api.post(`/admin/users/${id}/sync`, null, { timeout: 10 * 60 * 1000 });
      const n = data.total ?? 0;
      setAdminMsg(`Synced ${n} activit${n === 1 ? 'y' : 'ies'}`);
      load('users');
      await openUser(id);
    } catch (err) {
      setAdminErr(err.response?.data?.message || 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  const addToClub = async (e) => {
    e.preventDefault();
    if (!selectedId || !clubPick) return;
    setAdminErr('');
    try {
      const { data } = await api.post(`/admin/users/${selectedId}/club`, { clubId: clubPick, role: clubRole });
      setAdminMsg(data.message);
      await openUser(selectedId);
      load('users');
    } catch (err) {
      setAdminErr(err.response?.data?.message || 'Could not add to club');
    }
  };

  const assignCoach = async (e) => {
    e.preventDefault();
    if (!selectedId || !coachPick) return;
    setAdminErr('');
    try {
      const { data } = await api.post('/admin/assign', {
        athleteId: selectedId,
        coachId: coachPick,
        clubId: clubPick || undefined,
      });
      setAdminMsg(data.message);
      await openUser(selectedId);
    } catch (err) {
      setAdminErr(err.response?.data?.message || 'Could not assign coach');
    }
  };

  const removeAssignment = async (id) => {
    await api.delete(`/admin/assign/${id}`);
    await openUser(selectedId);
  };

  const deleteUser = (id, email) => {
    setDialogError('');
    setDialog({ kind: 'delete-user', id, email });
  };

  const coaches = users.filter((u) => (u.roles || []).includes('coach'));

  const saveSettings = async () => {
    try {
      await api.put('/admin/settings', settings);
      setDialog({ kind: 'notice', title: 'Settings saved', body: 'Your changes are in effect.' });
    } catch (err) {
      setDialog({
        kind: 'notice',
        title: 'Could not save settings',
        body: err.response?.data?.message || 'Try again.',
      });
    }
  };

  const closeDialog = () => {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError('');
  };

  const runDialog = async () => {
    if (dialog?.kind === 'notice') {
      setDialog(null);
      setDialogError('');
      return;
    }
    if (dialog?.kind === 'stop-membership') {
      setDialogBusy(true);
      setDialogError('');
      try {
        const ok = await patchMembership(dialog.membership.id, { action: 'stop' }, 'Membership stopped');
        if (ok) setDialog(null);
      } catch (err) {
        setDialogError(err.response?.data?.message || 'Could not stop membership');
      } finally {
        setDialogBusy(false);
      }
      return;
    }
    if (dialog?.kind === 'delete-user') {
      setDialogBusy(true);
      setDialogError('');
      setAdminErr('');
      try {
        const { data } = await api.delete(`/admin/users/${dialog.id}`);
        setAdminMsg(data.message);
        setSelectedId(null);
        setDetail(null);
        load('users');
        setDialog(null);
      } catch (err) {
        setDialogError(err.response?.data?.message || 'Could not delete user');
      } finally {
        setDialogBusy(false);
      }
    }
  };

  const createStaff = async (e) => {
    e.preventDefault();
    setAdminErr('');
    setAdminMsg('');
    try {
      await api.post('/admin/staff', staffForm);
      setStaffForm({ firstName: '', lastName: '', email: '', password: '', role: 'admin' });
      setAdminMsg('Staff account created');
      load('staff');
    } catch (err) {
      setAdminErr(err.response?.data?.message || 'Could not create staff account');
    }
  };

  const deleteStaff = async (id) => {
    setAdminErr('');
    try {
      await api.delete(`/admin/staff/${id}`);
      setAdminMsg('Staff account deleted');
      load('staff');
    } catch (err) {
      setAdminErr(err.response?.data?.message || 'Could not delete staff account');
    }
  };

  const toggleStaffStatus = async (row) => {
    const status = row.status === 'suspended' ? 'active' : 'suspended';
    try {
      await api.patch(`/admin/staff/${row.id}`, { status });
      load('staff');
    } catch (err) {
      setAdminErr(err.response?.data?.message || 'Could not update staff account');
    }
  };

  const createClubAccount = async (e) => {
    e.preventDefault();
    setAdminErr('');
    setAdminMsg('');
    try {
      await api.post('/admin/clubs', clubForm);
      setClubForm({ name: '', location: '', email: '', password: '', firstName: '', lastName: '' });
      setAdminMsg('Club account created');
      load('clubs');
    } catch (err) {
      setAdminErr(err.response?.data?.message || 'Could not create club');
    }
  };

  const reviewCoachRequest = async (id, approve) => {
    setAdminErr('');
    try {
      await api.post(`/admin/coach-requests/${id}/${approve ? 'approve' : 'reject'}`);
      setAdminMsg(approve ? 'Athlete marked as coach' : 'Request rejected');
      load('coach-requests');
    } catch (err) {
      setAdminErr(err.response?.data?.message || 'Could not update request');
    }
  };

  return (
    <Layout>
      <h2 className="page-title">{superAdmin ? 'Super admin' : 'Admin'}</h2>
      <p className="page-sub">
        {superAdmin
          ? 'Manage staff, users, clubs, invite codes, memberships, and the app'
          : 'Manage users, clubs, and coach requests'}
      </p>
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'staff' && superAdmin && (
        <div className="space-y-4">
          {adminErr && <div className="card text-orange-300 text-sm">{adminErr}</div>}
          {adminMsg && <div className="card text-brand text-sm">{adminMsg}</div>}
          <form className="card grid md:grid-cols-2 gap-3" onSubmit={createStaff}>
            <h3 className="font-semibold md:col-span-2">Create staff account</h3>
            <input placeholder="First name" value={staffForm.firstName} onChange={(e) => setStaffForm({ ...staffForm, firstName: e.target.value })} required />
            <input placeholder="Last name" value={staffForm.lastName} onChange={(e) => setStaffForm({ ...staffForm, lastName: e.target.value })} required />
            <input type="email" placeholder="Email / login id" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} required />
            <input type="password" placeholder="Password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} required minLength={8} />
            <label className="md:col-span-2 mb-0">
              <span className="block text-sm mb-1">Role</span>
              <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}>
                <option value="admin">Admin (users and clubs)</option>
                <option value="support_admin">Support admin (tickets only)</option>
              </select>
            </label>
            <button className="btn-primary md:col-span-2" type="submit">Create account</button>
          </form>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="p-2">Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="p-2 font-semibold">{s.firstName} {s.lastName}</td>
                    <td>{s.email}</td>
                    <td><RoleBadges roles={s.roles} /></td>
                    <td><StatusBadge value={s.status} /></td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn-outline btn-sm mr-1" type="button" onClick={() => toggleStaffStatus(s)}>
                        {s.status === 'suspended' ? 'Restore' : 'Suspend'}
                      </button>
                      <button className="btn-danger btn-sm" type="button" onClick={() => deleteStaff(s.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!staff.length && <div className="text-muted text-sm p-2">No admin or support-admin accounts yet.</div>}
          </div>
        </div>
      )}

      {tab === 'overview' && overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Tile label="Users" value={overview.users} />
          <Tile label="Clubs" value={overview.clubs} />
          <Tile label="Activities" value={overview.activities} />
          <Tile label="Active memberships" value={overview.activeMemberships} />
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              load('users');
            }}
          >
            <input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="Search name or email" />
            <button className="btn-outline shrink-0" type="submit">Search</button>
          </form>
          {adminErr && <div className="card text-orange-300 text-sm">{adminErr}</div>}
          {adminMsg && <div className="card text-brand text-sm">{adminMsg}</div>}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="p-2">Name</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Strava</th>
                  <th>Activities</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={`border-t border-line ${selectedId === u.id ? 'bg-brand/10' : ''}`}>
                    <td className="p-2">
                      <div>{u.firstName} {u.lastName}</div>
                    </td>
                    <td>{u.email}</td>
                    <td className="p-2"><RoleBadges roles={u.roles} /></td>
                    <td><StravaBadge connected={u.stravaConnected} status={u.lastSyncStatus} /></td>
                    <td>{u.activityCount ?? 0}</td>
                    <td><StatusBadge value={u.status} /></td>
                    <td className="whitespace-nowrap">
                      <button className="btn-outline btn-sm mr-1" type="button" onClick={() => openUser(u.id)}>View</button>
                      <button
                        className="btn-outline btn-sm mr-1"
                        type="button"
                        disabled={!u.stravaConnected || syncingId === u.id}
                        onClick={() => syncUser(u.id)}
                      >
                        {syncingId === u.id ? 'Syncing…' : 'Sync'}
                      </button>
                      <button className="btn-outline btn-sm" type="button" onClick={() => setUserStatus(u.id, u.status === 'suspended' ? 'active' : 'suspended')}>
                        {u.status === 'suspended' ? 'Restore' : 'Suspend'}
                      </button>
                      {u.status === 'suspended' && (
                        <button className="btn-danger btn-sm ml-1" type="button" onClick={() => deleteUser(u.id, u.email)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail && (
            <div className="card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="section-title">{detail.user.firstName} {detail.user.lastName}</h3>
                  <p className="text-sm text-muted">{detail.user.email}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <RoleBadges roles={detail.user.roles} />
                    <StatusBadge value={detail.user.status} />
                    <StravaBadge connected={detail.strava?.connected} status={detail.strava?.lastSyncStatus} />
                  </div>
                  {(detail.strava?.lastSyncAt || detail.strava?.lastSyncError) && (
                    <p className="text-xs text-muted mt-1">
                      {detail.strava?.lastSyncAt ? `Last sync ${new Date(detail.strava.lastSyncAt).toLocaleString()}` : ''}
                      {detail.strava?.lastSyncError ? ` · ${detail.strava.lastSyncError}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-primary btn-sm"
                    type="button"
                    disabled={!detail.strava?.connected || syncingId === detail.user.id}
                    onClick={() => syncUser(detail.user.id)}
                  >
                    {syncingId === detail.user.id ? 'Syncing…' : 'Sync Strava'}
                  </button>
                  <button className="btn-outline btn-sm" type="button" onClick={() => setUserStatus(detail.user.id, detail.user.status === 'suspended' ? 'active' : 'suspended')}>
                    {detail.user.status === 'suspended' ? 'Restore' : 'Suspend'}
                  </button>
                  {detail.user.status === 'suspended' && (
                    <button className="btn-danger btn-sm" type="button" onClick={() => deleteUser(detail.user.id, detail.user.email)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="stat-card">
                  <div className="stat-label">Activities</div>
                  <div className="stat-value text-xl">{detail.totals?.activities || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Distance</div>
                  <div className="stat-value text-xl">{((Number(detail.totals?.distanceM) || 0) / 1000).toFixed(1)} km</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Last session</div>
                  <div className="stat-value text-sm mt-2">{detail.totals?.lastActivityAt ? formatDateTime(detail.totals.lastActivityAt) : '—'}</div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Recent</h4>
                {!detail.recent?.length ? (
                  <p className="text-sm text-muted">No activities yet. Sync if Strava is connected.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.recent.map((act) => (
                      <div key={act.id} className="flex items-center gap-3 border border-line rounded-xl px-3 py-2">
                        <span className="text-xl">{getActivityIcon(act.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{act.name}</div>
                          <div className="text-xs text-muted">{formatDateTime(act.startDate)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-display font-bold text-brand">{formatActivityPrimary(act)}</div>
                          <div className="text-xs text-muted">{formatActivitySecondary(act)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-semibold mb-2">Membership</h4>
                <div className="text-sm space-y-1 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {detail.memberships?.[0]
                      ? <StatusBadge value={detail.memberships[0].status} />
                      : <span className="text-muted">No membership</span>}
                    {detail.memberships?.[0]?.planName ? <span>{detail.memberships[0].planName}</span> : null}
                  </div>
                  <p className="text-xs text-muted mb-0">
                    Member since {detail.memberSince ? formatDate(detail.memberSince) : '—'}
                    {detail.memberships?.[0]?.expiresAt ? ` · expires ${formatDate(detail.memberships[0].expiresAt)}` : detail.memberships?.[0] ? ' · no expiry' : ''}
                  </p>
                  <p className="text-xs text-muted mb-0">
                    Code used: {detail.memberships?.[0]?.invitationCode || detail.inviteCodes?.[0]?.code || '—'}
                  </p>
                </div>
                {!!detail.inviteCodes?.length && (
                  <p className="text-xs text-muted mb-3">
                    Codes: {detail.inviteCodes.map((c) => c.code).join(', ')}
                  </p>
                )}
                {detail.memberships?.[0] && (
                  <div className="mb-3">
                    <MembershipActions
                      m={detail.memberships[0]}
                      busy={membershipBusy === detail.memberships[0].id}
                      extendDate={extendDates[detail.memberships[0].id] ?? isoDate(detail.memberships[0].expiresAt)}
                      onExtendDate={(id, value) => setExtendDates((prev) => ({ ...prev, [id]: value }))}
                      onStop={(m) => { setDialogError(''); setDialog({ kind: 'stop-membership', membership: m }); }}
                      onRenew={(m) => patchMembership(m.id, { action: 'renew' }, 'Membership renewed')}
                      onExtend={extendMembership}
                    />
                  </div>
                )}
                {!!detail.memberships?.length && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted">
                          <th className="p-2">Started</th>
                          <th>Plan</th>
                          <th>Code</th>
                          <th>Expires</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.memberships.map((m) => (
                          <tr key={m.id} className="border-t border-line">
                            <td className="p-2">{m.startsAt ? formatDate(m.startsAt) : '—'}</td>
                            <td>{m.planName || '—'}</td>
                            <td className="font-mono text-xs">{m.invitationCode || '—'}</td>
                            <td>{m.expiresAt ? formatDate(m.expiresAt) : 'Lifetime'}</td>
                            <td><StatusBadge value={m.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <form className="grid sm:grid-cols-3 gap-2 items-end" onSubmit={addToClub}>
                <div className="sm:col-span-2">
                  <label>Add to club</label>
                  <select value={clubPick} onChange={(e) => setClubPick(e.target.value)} required>
                    <option value="">Select club</option>
                    {clubs.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>As</label>
                  <select value={clubRole} onChange={(e) => setClubRole(e.target.value)}>
                    <option value="member">Athlete</option>
                    <option value="coach">Coach</option>
                    <option value="club_admin">Club admin</option>
                  </select>
                </div>
                <button className="btn-outline sm:col-span-3" type="submit">Add to club</button>
              </form>
              {!!detail.clubs?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.clubs.map((c) => (
                    <Badge key={c.id} variant="info">
                      {c.name} · {c.role === 'club_admin' ? 'Club admin' : c.role === 'coach' ? 'Coach' : 'Athlete'}
                      {c.status === 'pending' ? ' · pending' : ''}
                    </Badge>
                  ))}
                </div>
              )}

              <form className="grid sm:grid-cols-3 gap-2 items-end" onSubmit={assignCoach}>
                <div className="sm:col-span-2">
                  <label>Assign coach to this athlete</label>
                  <select value={coachPick} onChange={(e) => setCoachPick(e.target.value)} required>
                    <option value="">Select coach</option>
                    {coaches.filter((c) => c.id !== detail.user.id).map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName} · {c.email}</option>
                    ))}
                  </select>
                </div>
                <button className="btn-outline" type="submit">Assign coach</button>
              </form>
              {!!detail.coaches?.length && (
                <div className="text-sm space-y-1">
                  {detail.coaches.map((c) => (
                    <div key={c.id} className="flex justify-between gap-2">
                      <span>Coach {c.firstName} {c.lastName}{c.clubName ? ` · ${c.clubName}` : ''}</span>
                      <button className="btn-outline btn-sm" type="button" onClick={() => removeAssignment(c.id)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              {!!detail.athletes?.length && (
                <p className="text-xs text-muted">
                  Athletes coached: {detail.athletes.map((a) => `${a.firstName} ${a.lastName}`).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'clubs' && (
        <div className="space-y-4">
          {adminErr && <div className="card text-orange-300 text-sm">{adminErr}</div>}
          {adminMsg && <div className="card text-brand text-sm">{adminMsg}</div>}
          <form className="card grid md:grid-cols-2 gap-3" onSubmit={createClubAccount}>
            <h3 className="font-semibold md:col-span-2">Add club with login</h3>
            <input placeholder="Club name" value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} required />
            <input placeholder="Location" value={clubForm.location} onChange={(e) => setClubForm({ ...clubForm, location: e.target.value })} />
            <input type="email" placeholder="Club admin email (login id)" value={clubForm.email} onChange={(e) => setClubForm({ ...clubForm, email: e.target.value })} required />
            <input type="password" placeholder="Password" value={clubForm.password} onChange={(e) => setClubForm({ ...clubForm, password: e.target.value })} required minLength={8} />
            <input placeholder="Admin first name" value={clubForm.firstName} onChange={(e) => setClubForm({ ...clubForm, firstName: e.target.value })} />
            <input placeholder="Admin last name" value={clubForm.lastName} onChange={(e) => setClubForm({ ...clubForm, lastName: e.target.value })} />
            <button className="btn-primary md:col-span-2" type="submit">Create club account</button>
          </form>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="p-2">Name</th>
                  <th>Location</th>
                  <th>Athletes</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th>Verified</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clubs.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-t border-line cursor-pointer ${selectedClubId === c.id ? 'bg-brand/10' : ''}`}
                    onClick={() => openClub(c.id)}
                  >
                    <td className="p-2 font-semibold text-slate-100 whitespace-nowrap">{c.name}</td>
                    <td>{c.location || '—'}</td>
                    <td>{c.athleteCount ?? 0}</td>
                    <td>{c.memberCount ?? 0}</td>
                    <td><StatusBadge value={c.status} /></td>
                    <td>{c.isVerified ? <Badge variant="brand">Verified</Badge> : '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      <button className="btn-outline btn-sm mr-1" type="button" onClick={(e) => { e.stopPropagation(); openClub(c.id); }}>
                        View
                      </button>
                      <button
                        className="btn-outline btn-sm"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          verifyClub(c.id, !c.isVerified);
                        }}
                      >
                        {c.isVerified ? 'Unverify' : 'Verify'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!clubs.length && <div className="text-muted text-sm p-2">No clubs yet.</div>}
          </div>

          {clubDetail && (
            <div className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="section-title">{clubDetail.club.name}</h3>
                  <p className="text-sm text-muted">{clubDetail.club.location || 'No location'}</p>
                </div>
                <button className="btn-outline btn-sm" type="button" onClick={() => { setSelectedClubId(null); setClubDetail(null); }}>
                  Close
                </button>
              </div>
              <ClubAthletes
                members={clubDetail.members || []}
                onViewUser={(userId) => {
                  setTab('users');
                  openUser(userId);
                }}
              />
            </div>
          )}
        </div>
      )}

      {tab === 'coach-requests' && (
        <div className="space-y-4">
          {adminErr && <div className="card text-orange-300 text-sm">{adminErr}</div>}
          {adminMsg && <div className="card text-brand text-sm">{adminMsg}</div>}
          {!coachRequests.length ? (
            <div className="card text-sm text-muted">No pending coach requests from clubs.</div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="p-2">Athlete</th>
                    <th>Club</th>
                    <th>Requested by</th>
                    <th>When</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {coachRequests.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="p-2">
                        <div className="font-semibold">{r.firstName} {r.lastName}</div>
                        <div className="text-xs text-muted">{r.email}</div>
                      </td>
                      <td>{r.clubName}</td>
                      <td className="text-sm">
                        {r.requestedByFirstName ? `${r.requestedByFirstName} ${r.requestedByLastName}` : '—'}
                      </td>
                      <td className="text-muted whitespace-nowrap">{formatDate(r.createdAt)}</td>
                      <td className="text-right whitespace-nowrap">
                        <button className="btn-primary btn-sm mr-1" type="button" onClick={() => reviewCoachRequest(r.id, true)}>
                          Make coach
                        </button>
                        <button className="btn-outline btn-sm" type="button" onClick={() => reviewCoachRequest(r.id, false)}>
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'codes' && (
        <>
          <form className="card grid md:grid-cols-2 gap-3 mb-4" onSubmit={generate}>
            <h3 className="font-semibold md:col-span-2">Generate onboarding codes</h3>
            <div>
              <label htmlFor="codeType">For</label>
              <select id="codeType" value={codeForm.type} onChange={(e) => setCodeForm({ ...codeForm, type: e.target.value })}>
                {CODE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="codePlan">Membership plan</label>
              <select id="codePlan" value={codeForm.planId} onChange={(e) => setCodeForm({ ...codeForm, planId: e.target.value })}>
                <option value="">Default plan</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="codeCount">How many codes</label>
              <input id="codeCount" type="number" min={1} max={50} value={codeForm.count} onChange={(e) => setCodeForm({ ...codeForm, count: Number(e.target.value) })} disabled={Boolean(codeForm.customCode)} />
            </div>
            <div>
              <label htmlFor="codeUses">Uses per code</label>
              <input id="codeUses" type="number" min={1} value={codeForm.maxActivations} onChange={(e) => setCodeForm({ ...codeForm, maxActivations: Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="codeExpires">Expires</label>
              <input id="codeExpires" type="date" value={codeForm.expiresAt} onChange={(e) => setCodeForm({ ...codeForm, expiresAt: e.target.value })} />
            </div>
            <div>
              <label htmlFor="codePrefix">Prefix (optional)</label>
              <input id="codePrefix" value={codeForm.prefix} onChange={(e) => setCodeForm({ ...codeForm, prefix: e.target.value.toUpperCase() })} placeholder="ATH, CLUB…" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="customCode">Or set an exact code</label>
              <input id="customCode" value={codeForm.customCode} onChange={(e) => setCodeForm({ ...codeForm, customCode: e.target.value.toUpperCase() })} placeholder="WELCOME-2026" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="codeNotes">Notes</label>
              <input id="codeNotes" value={codeForm.notes} onChange={(e) => setCodeForm({ ...codeForm, notes: e.target.value })} placeholder="Spring athlete batch, club XYZ…" />
            </div>
            <button className="btn-primary md:col-span-2" type="submit">Generate</button>
          </form>

          {codeErr && <div className="card mb-4 text-orange-300 text-sm">{codeErr}</div>}
          {codeMsg && <div className="card mb-4 text-brand text-sm">{codeMsg}</div>}
          {!!createdCodes.length && (
            <div className="card mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="font-semibold">New codes</h3>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  onClick={() => copyText(createdCodes.map((c) => c.code).join('\n'))}
                >
                  Copy all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {createdCodes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="font-mono text-sm rounded-xl border border-line px-3 py-2 hover:border-brand"
                    onClick={() => copyText(c.code)}
                    title="Copy"
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card mb-4 grid md:grid-cols-4 gap-2">
            <select value={codeFilter.type} onChange={(e) => setCodeFilter({ ...codeFilter, type: e.target.value })}>
              <option value="all">All types</option>
              {CODE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={codeFilter.status} onChange={(e) => setCodeFilter({ ...codeFilter, status: e.target.value })}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Revoked</option>
              <option value="used_up">Used up</option>
              <option value="expired">Expired</option>
            </select>
            <form className="md:col-span-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); load('codes'); }}>
              <input placeholder="Search code or notes" value={codeFilter.q} onChange={(e) => setCodeFilter({ ...codeFilter, q: e.target.value })} />
              <button className="btn-outline" type="submit">Search</button>
            </form>
          </div>

          <div className="space-y-3">
            {codes.map((c) => (
              <div key={c.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">{c.code}</span>
                      <StatusBadge value={c.state === 'disabled' ? 'disabled' : c.state} fallback={codeStateLabel(c.state)} />
                      <CodeTypeBadge type={c.type} />
                    </div>
                    <p className="text-xs text-muted mt-1">
                      {c.activationsUsed}/{c.maxActivations} used
                      {c.planName ? ` · ${c.planName}` : ''}
                      {c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : ' · no expiry'}
                      {c.notes ? ` · ${c.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-outline btn-sm" onClick={() => copyText(c.code)}>Copy</button>
                    <button type="button" className="btn-outline btn-sm" onClick={() => showRedemptions(c.id)}>
                      {openRedemptions === c.id ? 'Hide uses' : `Uses (${c.redemptionCount || 0})`}
                    </button>
                    <button type="button" className="btn-outline btn-sm" onClick={() => disableCode(c.id, !c.isDisabled)}>
                      {c.isDisabled ? 'Enable' : 'Revoke'}
                    </button>
                  </div>
                </div>
                {openRedemptions === c.id && (
                  <div className="mt-3 pt-3 border-t border-line space-y-1 text-sm">
                    {redemptions.map((r) => (
                      <div key={r.id} className="text-muted">
                        {r.firstName ? `${r.firstName} ${r.lastName}` : 'Unknown'} · {r.email || '—'}
                        {r.clubName ? ` · ${r.clubName}` : ''}
                        {' · '}{new Date(r.redeemedAt).toLocaleString()}
                      </div>
                    ))}
                    {!redemptions.length && <p className="text-muted">No redemptions yet.</p>}
                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                      <input
                        type="number"
                        min={c.activationsUsed || 1}
                        defaultValue={c.maxActivations}
                        className="sm:max-w-[8rem]"
                        onBlur={(e) => {
                          const next = Number(e.target.value);
                          if (next && next !== c.maxActivations) saveCode(c.id, { maxActivations: next });
                        }}
                      />
                      <input
                        type="date"
                        defaultValue={c.expiresAt ? String(c.expiresAt).slice(0, 10) : ''}
                        className="sm:max-w-[11rem]"
                        onBlur={(e) => saveCode(c.id, { expiresAt: e.target.value || null })}
                      />
                      <span className="text-xs text-muted self-center">Edit uses / expiry, then click away to save</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!codes.length && <div className="card text-muted text-sm">No codes match these filters.</div>}
          </div>
        </>
      )}

      {tab === 'memberships' && (
        <div className="space-y-4">
          {membershipErr && <div className="card text-orange-300 text-sm">{membershipErr}</div>}
          {membershipMsg && <div className="card text-brand text-sm">{membershipMsg}</div>}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[960px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="p-2">Who</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Member since</th>
                  <th>Expires</th>
                  <th>Code</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-t border-line cursor-pointer ${selectedMembershipId === m.id ? 'bg-brand/10' : ''}`}
                    onClick={() => openMembership(m.id)}
                  >
                    <td className="p-2">
                      <div className="font-semibold text-slate-100">{membershipWho(m)}</div>
                      {m.email && m.firstName ? <div className="text-xs text-muted">{m.email}</div> : null}
                    </td>
                    <td>{m.planName || '—'}</td>
                    <td><StatusBadge value={m.status} /></td>
                    <td>{m.memberSince ? formatDate(m.memberSince) : '—'}</td>
                    <td>{m.expiresAt ? formatDate(m.expiresAt) : 'Lifetime'}</td>
                    <td className="font-mono text-xs">{m.invitationCode || '—'}</td>
                    <td>
                      <MembershipActions
                        m={m}
                        busy={membershipBusy === m.id}
                        extendDate={extendDates[m.id] ?? isoDate(m.expiresAt)}
                        onExtendDate={(id, value) => setExtendDates((prev) => ({ ...prev, [id]: value }))}
                        onStop={(row) => { setDialogError(''); setDialog({ kind: 'stop-membership', membership: row }); }}
                        onRenew={(row) => patchMembership(row.id, { action: 'renew' }, 'Membership renewed')}
                        onExtend={extendMembership}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!memberships.length && <div className="text-muted text-sm p-2">No memberships yet.</div>}
          </div>

          {membershipDetail && (
            <div className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="section-title">{membershipWho(membershipDetail.membership)}</h3>
                  <p className="text-sm text-muted mb-0">
                    Member since {membershipDetail.memberSince ? formatDate(membershipDetail.memberSince) : '—'}
                    {membershipDetail.membership?.invitationCode ? ` · code ${membershipDetail.membership.invitationCode}` : ''}
                  </p>
                </div>
                <button className="btn-outline btn-sm" type="button" onClick={() => { setSelectedMembershipId(null); setMembershipDetail(null); }}>
                  Close
                </button>
              </div>
              {!!membershipDetail.inviteCodes?.length && (
                <p className="text-sm text-muted mb-0">
                  Codes used: {membershipDetail.inviteCodes.map((c) => `${c.code}${c.redeemedAt ? ` (${formatDate(c.redeemedAt)})` : ''}`).join(', ')}
                </p>
              )}
              <h4 className="font-semibold">Membership history</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="p-2">Started</th>
                      <th>Plan</th>
                      <th>Code</th>
                      <th>Expires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(membershipDetail.history || []).map((row) => (
                      <tr key={row.id} className="border-t border-line">
                        <td className="p-2">{row.startsAt ? formatDate(row.startsAt) : '—'}</td>
                        <td>{row.planName || '—'}</td>
                        <td className="font-mono text-xs">{row.invitationCode || '—'}</td>
                        <td>{row.expiresAt ? formatDate(row.expiresAt) : 'Lifetime'}</td>
                        <td><StatusBadge value={row.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="card space-y-4 max-w-lg">
          <label>App name</label>
          <input value={settings.app_name || ''} onChange={(e) => setSettings({ ...settings, app_name: e.target.value })} />
          <label className="flex items-start gap-3 font-normal">
            <input
              type="checkbox"
              className="w-auto mt-1"
              checked={settings.signup_otp_paused === true}
              onChange={(e) => setSettings({ ...settings, signup_otp_paused: e.target.checked })}
            />
            <span>
              <span className="block font-medium">Pause email code on sign up</span>
              <span className="block text-xs text-muted mt-1">
                New accounts skip the 6-digit email code and finish sign up immediately. Login never uses an email
                code. Turn this on only if verification emails cannot be sent.
              </span>
            </span>
          </label>
          <button className="btn-primary" onClick={saveSettings}>Save</button>
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-outline btn-sm" type="button" onClick={() => loadAudit(shiftDay(auditDay, -1), 1)}>
                Prev
              </button>
              <button
                className="btn-outline btn-sm min-w-[7.5rem]"
                type="button"
                onClick={() => loadAudit(shiftDay(auditDay, -1), 1)}
              >
                {formatAuditDayLabel(shiftDay(auditDay, -1))}
              </button>
              <select
                className="w-auto min-w-[11rem]"
                value={auditDay}
                onChange={(e) => loadAudit(e.target.value, 1)}
              >
                {auditDropdownDays(auditDays, auditDay).map((day) => (
                  <option key={day} value={day}>{formatAuditDayLabel(day)}</option>
                ))}
              </select>
              <button
                className="btn-outline btn-sm min-w-[7.5rem]"
                type="button"
                disabled={auditDay >= shiftDay(localDayString(), 1)}
                onClick={() => loadAudit(shiftDay(auditDay, 1), 1)}
              >
                {formatAuditDayLabel(shiftDay(auditDay, 1))}
              </button>
              <button
                className="btn-outline btn-sm"
                type="button"
                disabled={auditDay >= shiftDay(localDayString(), 1)}
                onClick={() => loadAudit(shiftDay(auditDay, 1), 1)}
              >
                Next
              </button>
              <label className="flex items-center gap-2 text-sm text-muted mb-0 ml-auto">
                <span>Show</span>
                <select
                  className="w-auto py-1.5"
                  value={auditLimit}
                  onChange={(e) => loadAudit(auditDay, 1, Number(e.target.value))}
                  aria-label="Rows per page"
                >
                  {AUDIT_PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="p-2">When</th>
                  <th>User</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="p-2 whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td>
                    <td>{a.email || 'system'}</td>
                    <td>{a.action} {a.entityType || ''}</td>
                  </tr>
                ))}
                {!audit.length && (
                  <tr>
                    <td className="p-2 text-muted" colSpan={3}>No events on this day.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
              <p className="text-xs text-muted mb-0">
                Showing {auditTotal === 0 ? 0 : (auditPage - 1) * auditLimit + 1}–{Math.min(auditPage * auditLimit, auditTotal)} of {auditTotal} · Page {auditPage} of {auditPages}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button className="btn-outline btn-sm" type="button" disabled={auditPage <= 1} onClick={() => loadAudit(auditDay, auditPage - 1)}>
                  Previous
                </button>
                <button className="btn-outline btn-sm" type="button" disabled={auditPage >= auditPages} onClick={() => loadAudit(auditDay, auditPage + 1)}>
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {dialog?.kind === 'notice' && (
        <ConfirmDialog
          title={dialog.title}
          confirmLabel="OK"
          hideCancel
          onCancel={closeDialog}
          onConfirm={runDialog}
        >
          <p className="mb-0">{dialog.body}</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'delete-user' && (
        <ConfirmDialog
          title="Delete this account?"
          confirmLabel="Delete account"
          danger
          busy={dialogBusy}
          error={dialogError}
          onCancel={closeDialog}
          onConfirm={runDialog}
        >
          <p className="mb-0">
            Delete <span className="text-slate-100 font-medium">{dialog.email}</span> and all of their data? This cannot be undone.
          </p>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'stop-membership' && (
        <ConfirmDialog
          title="Stop this membership?"
          confirmLabel="Stop membership"
          danger
          busy={dialogBusy || membershipBusy === dialog.membership.id}
          error={dialogError || membershipErr}
          onCancel={closeDialog}
          onConfirm={runDialog}
        >
          <p className="mb-0">
            Stop membership for{' '}
            <span className="text-slate-100 font-medium">{membershipWho(dialog.membership)}</span>?
            They will need an admin or a new invite code to get access again.
          </p>
        </ConfirmDialog>
      )}
    </Layout>
  );
}

function isoDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function membershipWho(m) {
  if (!m) return '—';
  const name = `${m.firstName || ''} ${m.lastName || ''}`.trim();
  if (name) return name;
  if (m.email) return m.email;
  return m.clubName || '—';
}

function MembershipActions({ m, busy, extendDate, onExtendDate, onStop, onRenew, onExtend }) {
  const stopped = m.status === 'cancelled';
  return (
    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {!stopped && (
        <button className="btn-outline btn-sm" type="button" disabled={busy} onClick={() => onStop(m)}>
          Stop
        </button>
      )}
      <button className="btn-outline btn-sm" type="button" disabled={busy} onClick={() => onRenew(m)}>
        Renew
      </button>
      <input
        type="date"
        className="w-auto py-1.5"
        value={extendDate || ''}
        onChange={(e) => onExtendDate(m.id, e.target.value)}
        aria-label="Extend until"
      />
      <button className="btn-outline btn-sm" type="button" disabled={busy || !extendDate} onClick={() => onExtend(m.id)}>
        Extend till
      </button>
    </div>
  );
}

function localDayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDay(day, delta) {
  const [y, m, d] = String(day).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return localDayString(date);
}

function auditDropdownDays(activityDays, selected) {
  const today = localDayString();
  const days = new Set([today, selected]);
  (activityDays || []).forEach((d) => days.add(d.day));
  for (let i = 1; i <= 14; i += 1) days.add(shiftDay(today, -i));
  if (selected) {
    days.add(shiftDay(selected, -1));
    days.add(shiftDay(selected, 1));
  }
  return [...days].filter((day) => day <= shiftDay(today, 1)).sort().reverse();
}

function formatAuditDayLabel(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = localDayString();
  if (day === today) return 'Today';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  if (day === shiftDay(today, 1)) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function Tile({ label, value }) {
  return (
    <div className="stat-card">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-2xl font-bold text-brand">{value}</div>
    </div>
  );
}

function ClubAthletes({ members, onViewUser }) {
  const athletes = members.filter((m) => m.role === 'member');
  const staff = members.filter((m) => m.role !== 'member');

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold mb-2">Athletes ({athletes.length})</h4>
        {!athletes.length ? (
          <p className="text-sm text-muted">No athletes in this club yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="p-2">Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Strava</th>
                  <th>Activities</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {athletes.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="p-2">{m.firstName} {m.lastName}</td>
                    <td>{m.email}</td>
                    <td><StatusBadge value={m.status} /></td>
                    <td><StravaBadge connected={m.stravaConnected} /></td>
                    <td>{m.activityCount ?? 0}</td>
                    <td>
                      <button className="btn-outline btn-sm" type="button" onClick={() => onViewUser(m.userId)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!!staff.length && (
        <div>
          <h4 className="font-semibold mb-2">Coaches and club admins</h4>
          <div className="flex flex-wrap gap-1.5">
            {staff.map((m) => (
              <button key={m.id} className="text-left" type="button" onClick={() => onViewUser(m.userId)}>
                <Badge variant={m.role === 'coach' ? 'accent' : 'info'}>
                  {m.firstName} {m.lastName} · {m.role === 'club_admin' ? 'Club admin' : 'Coach'}
                  {m.status === 'pending' ? ' · pending' : ''}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
