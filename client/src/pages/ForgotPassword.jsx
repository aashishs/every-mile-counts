import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [sent, setSent] = useState(false);
  const [resetUrl, setResetUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setSent(true);
      setResetUrl(data.resetUrl || '');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-ink to-slate-900">
      <div className="w-full max-w-md card p-8">
        <h1 className="text-center text-2xl font-bold mb-1">Forgot password</h1>
        <p className="text-center text-muted mb-8">We’ll send a reset link if that email is registered</p>
        {error && <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 p-3 text-sm">{error}</div>}
        {sent ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-brand/40 bg-brand/10 text-slate-100 p-3 text-sm">
              If that email is registered, we sent a reset link. Check your inbox (and spam). The link expires in 1 hour.
            </div>
            {resetUrl && (
              <p className="text-sm text-muted break-all">
                Email isn’t configured locally.{' '}
                <a href={resetUrl} className="text-brand">Open reset link</a>
              </p>
            )}
            <Link to="/login" className="btn-primary w-full">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="text-center text-muted text-sm mt-6">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
