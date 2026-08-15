import { useEffect, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';

const TABS = ['overview', 'users', 'clubs', 'codes', 'memberships', 'settings', 'audit'];

export default function Admin() {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [codes, setCodes] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [settings, setSettings] = useState({});
  const [audit, setAudit] = useState([]);
  const [plans, setPlans] = useState([]);
  const [codeForm, setCodeForm] = useState({ type: 'universal', count: 1, maxActivations: 1, notes: '' });

  const load = async (next = tab) => {
    if (next === 'overview') setOverview((await api.get('/admin/overview')).data);
    if (next === 'users') setUsers((await api.get('/admin/users')).data.users);
    if (next === 'clubs') setClubs((await api.get('/admin/clubs')).data.clubs);
    if (next === 'codes') {
      setCodes((await api.get('/membership/codes')).data.codes);
      setPlans((await api.get('/membership/plans')).data.plans);
    }
    if (next === 'memberships') setMemberships((await api.get('/admin/memberships')).data.memberships);
    if (next === 'settings') setSettings((await api.get('/admin/settings')).data.settings);
    if (next === 'audit') setAudit((await api.get('/admin/audit')).data.logs);
  };

  useEffect(() => { load(tab); }, [tab]);

  const generate = async (e) => {
    e.preventDefault();
    await api.post('/membership/codes', codeForm);
    load('codes');
  };

  const disableCode = async (id, isDisabled) => {
    await api.patch(`/membership/codes/${id}`, { isDisabled });
    load('codes');
  };

  const verifyClub = async (id, isVerified) => {
    await api.patch(`/admin/clubs/${id}`, { isVerified });
    load('clubs');
  };

  const setUserStatus = async (id, status) => {
    await api.patch(`/admin/users/${id}`, { status });
    load('users');
  };

  const saveSettings = async () => {
    await api.put('/admin/settings', settings);
    alert('Settings saved');
  };

  return (
    <Layout>
      <h2 className="page-title">Platform admin</h2>
      <p className="page-sub">Users, clubs, invitation codes, memberships, and audit logs</p>
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Tile label="Users" value={overview.users} />
          <Tile label="Clubs" value={overview.clubs} />
          <Tile label="Activities" value={overview.activities} />
          <Tile label="Active memberships" value={overview.activeMemberships} />
        </div>
      )}

      {tab === 'users' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="p-2">Name</th><th>Email</th><th>Roles</th><th>Status</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="p-2">{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td>{(u.roles || []).join(', ')}</td>
                  <td>{u.status}</td>
                  <td>
                    <button className="btn-outline btn-sm" onClick={() => setUserStatus(u.id, u.status === 'suspended' ? 'active' : 'suspended')}>
                      {u.status === 'suspended' ? 'Restore' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'clubs' && (
        <div className="space-y-2">
          {clubs.map((c) => (
            <div key={c.id} className="card flex justify-between items-center">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-muted">{c.status} · {c.memberCount} members {c.isVerified ? '· verified' : ''}</div>
              </div>
              <button className="btn-outline btn-sm" onClick={() => verifyClub(c.id, !c.isVerified)}>
                {c.isVerified ? 'Unverify' : 'Verify'}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'codes' && (
        <>
          <form className="card grid md:grid-cols-5 gap-2 mb-4" onSubmit={generate}>
            <select value={codeForm.type} onChange={(e) => setCodeForm({ ...codeForm, type: e.target.value })}>
              {['athlete', 'coach', 'club', 'universal'].map((t) => <option key={t}>{t}</option>)}
            </select>
            <select value={codeForm.planId || ''} onChange={(e) => setCodeForm({ ...codeForm, planId: e.target.value })}>
              <option value="">Default plan</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" min={1} value={codeForm.count} onChange={(e) => setCodeForm({ ...codeForm, count: Number(e.target.value) })} placeholder="Count" />
            <input type="number" min={1} value={codeForm.maxActivations} onChange={(e) => setCodeForm({ ...codeForm, maxActivations: Number(e.target.value) })} placeholder="Max uses" />
            <button className="btn-primary" type="submit">Generate</button>
          </form>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="p-2">Code</th><th>Type</th><th>Used</th><th>Status</th><th /></tr></thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="p-2 font-mono">{c.code}</td>
                    <td>{c.type}</td>
                    <td>{c.activationsUsed}/{c.maxActivations}</td>
                    <td>{c.isDisabled ? 'disabled' : 'active'}</td>
                    <td>
                      <button className="btn-outline btn-sm" onClick={() => disableCode(c.id, !c.isDisabled)}>
                        {c.isDisabled ? 'Enable' : 'Revoke'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'memberships' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="p-2">Who</th><th>Plan</th><th>Status</th><th>Expires</th></tr></thead>
            <tbody>
              {memberships.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="p-2">{m.email || m.clubName || '—'}</td>
                  <td>{m.planName}</td>
                  <td>{m.status}</td>
                  <td>{m.expiresAt ? new Date(m.expiresAt).toLocaleDateString() : 'lifetime'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'settings' && (
        <div className="card space-y-3 max-w-lg">
          <label>App name</label>
          <input value={settings.app_name || ''} onChange={(e) => setSettings({ ...settings, app_name: e.target.value })} />
          <button className="btn-primary" onClick={saveSettings}>Save</button>
        </div>
      )}

      {tab === 'audit' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="p-2">When</th><th>User</th><th>Action</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="p-2">{new Date(a.createdAt).toLocaleString()}</td>
                  <td>{a.email || 'system'}</td>
                  <td>{a.action} {a.entityType || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}

function Tile({ label, value }) {
  return (
    <div className="stat-card">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-2xl font-bold text-brand">{value}</div>
    </div>
  );
}
