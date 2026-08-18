import { useEffect, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { homePath } from '../utils/roles';

export default function Membership() {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const membership = user?.membership;

  const activate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/membership/activate', { code });
      setMsg('Membership activated. Reloading…');
      setTimeout(() => window.location.assign(homePath(user)), 800);
    } catch (err) {
      setMsg(err.response?.data?.message || 'Activation failed');
    }
  };

  return (
    <Layout>
      <h2 className="page-title">Membership</h2>
      <p className="page-sub">Access is invitation-based during beta. Paid plans can plug in later.</p>
      <div className="card mb-6">
        <div className="text-sm text-muted">Current status</div>
        <div className="text-2xl font-bold text-brand capitalize">{membership?.status || 'none'}</div>
        {membership?.expiresAt && <p className="text-sm text-muted mt-1">Expires {new Date(membership.expiresAt).toLocaleDateString()}</p>}
        {membership?.planName && <p className="text-sm mt-1">{membership.planName}</p>}
      </div>
      <form className="card max-w-md space-y-3" onSubmit={activate}>
        <h3 className="font-semibold">Activate or renew with a code</h3>
        {msg && <p className="text-sm">{msg}</p>}
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invitation code" required />
        <button className="btn-primary" type="submit">Activate</button>
      </form>
    </Layout>
  );
}
