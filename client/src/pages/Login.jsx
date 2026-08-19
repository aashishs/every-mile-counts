import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePath } from '../utils/roles';
import OtpVerify from '../components/OtpVerify';
import { VersionBadge } from '../components/Badge';
import { isBeta } from '../utils/appVersion';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState(null);
  const { login, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = location.state?.notice;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.requiresOtp) {
        setOtp(data);
        return;
      }
      if (data.user) navigate(homePath(data.user));
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-ink to-slate-900">
      <div className="w-full max-w-md card p-8">
        <img src="/logo.svg" alt="Every Mile Counts" className="w-20 h-20 rounded-3xl mx-auto mb-4" />
        <h1 className="text-center font-display text-4xl font-bold mb-1 tracking-tight">
          Every <span className="text-brand">Mile</span> Counts
        </h1>
        {isBeta && (
          <div className="flex justify-center mt-2 mb-1">
            <VersionBadge />
          </div>
        )}
        <p className="text-center text-muted mb-8">{otp ? 'Verify your email' : 'Train. Race. Repeat.'}</p>
        {notice && !otp && <div className="mb-4 rounded-xl border border-brand/40 bg-brand/10 text-slate-100 p-3 text-sm">{notice}</div>}
        {otp ? (
          <OtpVerify
            email={otp.email}
            debugCode={otp.debugCode}
            onVerify={async (code) => {
              const user = await verifyOtp(otp.challengeId, code);
              navigate(homePath(user));
            }}
            onResend={async () => {
              const next = await resendOtp(otp.challengeId);
              setOtp(next);
            }}
            onBack={() => setOtp(null)}
          />
        ) : (
          <>
            {error && <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 p-3 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="password" className="mb-1.5">Password</label>
                  <Link
                    to={email ? `/forgot-password?email=${encodeURIComponent(email)}` : '/forgot-password'}
                    className="text-xs text-brand mb-1.5 no-underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Sending code…' : 'Sign in'}
              </button>
            </form>
            <p className="text-center text-muted text-sm mt-6">
              Don&apos;t have an account? <Link to="/register">Create one</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
