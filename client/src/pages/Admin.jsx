import { useEffect, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';

const TABS = ['overview', 'users', 'clubs', 'codes', 'memberships', 'settings', 'audit'];

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

function copyText(value) {
  return navigator.clipboard.writeText(value);
}

function codeStateLabel(state) {
  if (state === 'used_up') return 'used up';
  return state || 'active';
}

export default function Admin() {
  const [tab, setTab] = useState('codes');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [codes, setCodes] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [settings, setSettings] = useState({});
  const [audit, setAudit] = useState([]);
  const [plans, setPlans] = useState([]);
  const [codeForm, setCodeForm] = useState(emptyCodeForm);
  const [codeFilter, setCodeFilter] = useState({ type: 'all', status: 'all', q: '' });
  const [createdCodes, setCreatedCodes] = useState([]);
  const [codeMsg, setCodeMsg] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [openRedemptions, setOpenRedemptions] = useState(null);
  const [redemptions, setRedemptions] = useState([]);

  const load = async (next = tab) => {
    if (next === 'overview') setOverview((await api.get('/admin/overview')).data);
    if (next === 'users') setUsers((await api.get('/admin/users')).data.users);
    if (next === 'clubs') setClubs((await api.get('/admin/clubs')).data.clubs);
    if (next === 'codes') {
      const params = {};
      if (codeFilter.type !== 'all') params.type = codeFilter.type;
      if (codeFilter.status !== 'all') params.status = codeFilter.status;
      if (codeFilter.q) params.q = codeFilter.q;
      setCodes((await api.get('/membership/codes', { params })).data.codes);
      setPlans((await api.get('/membership/plans')).data.plans);
    }
    if (next === 'memberships') setMemberships((await api.get('/admin/memberships')).data.memberships);
    if (next === 'settings') setSettings((await api.get('/admin/settings')).data.settings);
    if (next === 'audit') setAudit((await api.get('/admin/audit')).data.logs);
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
      <p className="page-sub">Generate onboarding codes for athletes, coaches, and clubs</p>
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
                      <span className={`badge ${c.state === 'active' ? 'bg-brand/15 text-brand' : 'bg-hover text-muted'}`}>
                        {codeStateLabel(c.state)}
                      </span>
                      <span className="badge bg-accent/15 text-accent normal-case">{c.type}</span>
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
