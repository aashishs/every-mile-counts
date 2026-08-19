import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { afterJoinPath } from '../utils/roles';
import OtpVerify from '../components/OtpVerify';
import { VersionBadge } from '../components/Badge';
import { isBeta } from '../utils/appVersion';

const ACCOUNT_TYPES = [
  { value: 'athlete', label: 'Athlete', hint: 'Sync training and get coached' },
  { value: 'coach', label: 'Coach', hint: 'Review assigned athletes' },
  { value: 'club', label: 'Club', hint: 'Organization that assigns coaches' },
];

export default function Register() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    invitationCode: '',
    location: '',
    clubName: '',
    accountType: 'athlete',
    alsoCoach: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState(null);
  const { register, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();

  const set = (e) => {
    const { name, type, checked, value } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const roles =
        form.accountType === 'club'
          ? form.alsoCoach
            ? ['club_admin', 'coach']
            : ['club_admin']
          : [form.accountType];
      const data = await register({ ...form, roles });
      if (data.requiresOtp) {
        setOtp(data);
        return;
      }
      if (data.user) navigate(afterJoinPath(data.user));
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-ink to-slate-900">
      <div className="w-full max-w-md card p-8">
        <img src="/logo.svg" alt="Every Mile Counts" className="w-16 h-16 rounded-2xl mx-auto mb-4" />
        <h1 className="text-center text-2xl font-bold mb-1">
          Join <span className="text-brand">Every Mile Counts</span>
        </h1>
        {isBeta && (
          <div className="flex justify-center mt-2">
            <VersionBadge />
          </div>
        )}
        <p className="text-center text-muted mb-6">
          {otp ? 'Verify your email to finish' : 'Invitation-only beta. Ask an admin for a code.'}
        </p>
        {otp ? (
          <OtpVerify
            email={otp.email}
            debugCode={otp.debugCode}
            onVerify={async (code) => {
              const user = await verifyOtp(otp.challengeId, code);
              navigate(afterJoinPath(user));
            }}
            onResend={async () => {
              const next = await resendOtp(otp.challengeId);
              setOtp(next);
            }}
          />
        ) : (
          <>
            {error && <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 p-3 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="firstName">{form.accountType === 'club' ? 'Admin first name' : 'First name'}</label>
                  <input id="firstName" name="firstName" value={form.firstName} onChange={set} required />
                </div>
                <div>
                  <label htmlFor="lastName">{form.accountType === 'club' ? 'Admin last name' : 'Last name'}</label>
                  <input id="lastName" name="lastName" value={form.lastName} onChange={set} required />
                </div>
              </div>
              <div>
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" value={form.email} onChange={set} required />
                {form.accountType !== 'club' && (
                  <p className="text-xs text-muted mt-1">
                    If you can, use the same email as your Strava account. It makes connecting easier.
                  </p>
                )}
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
                <span className="block text-sm font-medium mb-1.5">Account type</span>
                <div className="space-y-2">
                  {ACCOUNT_TYPES.map((opt) => (
                    <label key={opt.value} className="flex items-start gap-2 cursor-pointer text-sm">
                      <input
                        type="radio"
                        className="w-auto mt-1"
                        name="accountType"
                        value={opt.value}
                        checked={form.accountType === opt.value}
                        onChange={set}
                      />
                      <span>
                        <span className="font-medium">{opt.label}</span>
                        <span className="block text-xs text-muted">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {form.accountType === 'club' && (
                <>
                  <div>
                    <label htmlFor="clubName">Club name</label>
                    <input id="clubName" name="clubName" value={form.clubName} onChange={set} required />
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      className="w-auto mt-1"
                      name="alsoCoach"
                      checked={form.alsoCoach}
                      onChange={set}
                    />
                    <span>
                      <span className="font-medium">I also coach at this club</span>
                      <span className="block text-xs text-muted">You can assign yourself to athletes and review their training.</span>
                    </span>
                  </label>
                </>
              )}
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Sending code…' : 'Create account'}
              </button>
            </form>
            <p className="text-center text-muted text-sm mt-6">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
