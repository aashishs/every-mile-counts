import { useState } from 'react';

export default function OtpVerify({ email, debugCode, onVerify, onResend, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onVerify(code.trim());
    } catch (err) {
      setError(err.response?.data?.message || 'Could not verify that code');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError('');
    setResending(true);
    try {
      await onResend();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resend the code');
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">
        {debugCode
          ? 'Email is not sending yet on this server. Use the on-screen code below.'
          : <>Enter the 6-digit code we sent to <span className="text-slate-100">{email}</span></>}
      </p>
      {debugCode && (
        <p className="text-sm text-accent">
          Dev code: <span className="font-semibold tracking-[0.3em]">{debugCode}</span>
        </p>
      )}
      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 p-3 text-sm">{error}</div>}
      <div>
        <label htmlFor="otp">Verification code</label>
        <input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
        />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={loading || code.length !== 6}>
        {loading ? 'Verifying…' : 'Verify and continue'}
      </button>
      <div className="flex justify-between text-sm">
        <button type="button" className="text-brand bg-transparent p-0" onClick={resend} disabled={resending}>
          {resending ? 'Sending…' : 'Resend code'}
        </button>
        {onBack && (
          <button type="button" className="text-muted bg-transparent p-0" onClick={onBack}>
            Back
          </button>
        )}
      </div>
    </form>
  );
}
