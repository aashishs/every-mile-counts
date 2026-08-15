import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    invitationCode: '',
    location: '',
    clubName: '',
    roles: ['athlete'],
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleRole = (role) => {
    setForm((prev) => {
      let roles = prev.roles.includes(role) ? prev.roles.filter((r) => r !== role) : [...prev.roles, role];
      if (!roles.length) roles = ['athlete'];
      return { ...prev, roles };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-ink to-slate-900">
      <div className="w-full max-w-md card p-8">
        <h1 className="text-center text-2xl font-bold mb-1">
          Join <span className="text-brand">Every Mile Counts</span>
        </h1>
        <p className="text-center text-muted mb-6">Invitation-only beta. Ask an admin for a code.</p>
        {error && <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 p-3 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName">First name</label>
              <input id="firstName" name="firstName" value={form.firstName} onChange={set} required />
            </div>
            <div>
              <label htmlFor="lastName">Last name</label>
              <input id="lastName" name="lastName" value={form.lastName} onChange={set} required />
            </div>
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" value={form.email} onChange={set} required />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" value={form.password} onChange={set} required minLength={8} />
          </div>
          <div>
            <label htmlFor="invitationCode">Invitation code</label>
            <input id="invitationCode" name="invitationCode" value={form.invitationCode} onChange={set} required placeholder="WELCOME-EMC" />
          </div>
          <div>
            <label htmlFor="location">Location</label>
            <input id="location" name="location" value={form.location} onChange={set} />
          </div>
          <div>
            <span className="block text-sm font-medium mb-1.5">I am a…</span>
            <div className="flex flex-wrap gap-4 text-sm">
              {['athlete', 'coach', 'club_admin'].map((role) => (
                <label key={role} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} className="w-auto" />
                  {role.replace('_', ' ')}
                </label>
              ))}
            </div>
          </div>
          {form.roles.includes('club_admin') && (
            <div>
              <label htmlFor="clubName">Club name</label>
              <input id="clubName" name="clubName" value={form.clubName} onChange={set} required />
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="text-center text-muted text-sm mt-6">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
