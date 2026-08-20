import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { afterJoinPath, homePath, isClubOnlyAccount, isStaffAccount } from '../utils/roles';
import { clearClubInvite, pendingClubInvite, readClubInviteFromSearch, saveClubInvite } from '../utils/clubInvite';

export default function JoinClub() {
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(() => readClubInviteFromSearch(searchParams) || pendingClubInvite());
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromUrl = readClubInviteFromSearch(searchParams);
    if (fromUrl) {
      saveClubInvite(fromUrl);
      setInvite(fromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!invite?.code) {
      setError('This join link is missing a club invite.');
      return;
    }
    let cancelled = false;
    api
      .get('/clubs/invite-preview', {
        params: { code: invite.code, club: invite.clubId, role: invite.role },
      })
      .then(({ data }) => {
        if (cancelled) return;
        setPreview(data);
        saveClubInvite({ clubId: data.clubId, role: data.role, code: invite.code });
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'This club invite is no longer valid');
      });
    return () => {
      cancelled = true;
    };
  }, [invite?.code, invite?.clubId, invite?.role]);

  const join = async () => {
    if (!invite || !preview) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/clubs/${preview.clubId}/join`, {
        invitationCode: invite.code,
        role: preview.role,
      });
      clearClubInvite();
      navigate(`/clubs/${preview.clubId}`);
    } catch (err) {
      const message = err.response?.data?.message || 'Could not join this club';
      if (message === 'Already a member' && preview?.clubId) {
        clearClubInvite();
        navigate(`/clubs/${preview.clubId}`);
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-ink to-slate-900">
      <div className="w-full max-w-md card p-8">
        <img src="/logo.svg" alt="Every Mile Counts" className="w-16 h-16 rounded-2xl mx-auto mb-4" />
        <h1 className="text-center text-2xl font-bold mb-1">Join this club</h1>
        {preview ? (
          <p className="text-center text-muted mb-6">
            {preview.clubName} · {preview.role === 'coach' ? 'Coach' : 'Athlete'}
          </p>
        ) : (
          <p className="text-center text-muted mb-6">Checking this invite…</p>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 p-3 text-sm">{error}</div>
        )}
        {preview && !error && (
          <p className="text-sm text-muted mb-4">
            {preview.remaining} use{preview.remaining === 1 ? '' : 's'} left
            {preview.expiresAt ? ` · expires ${new Date(preview.expiresAt).toLocaleDateString()}` : ''}
          </p>
        )}
        {loading ? (
          <p className="text-center text-muted">Loading…</p>
        ) : user ? (
          isStaffAccount(user) || isClubOnlyAccount(user) ? (
            <p className="text-sm text-muted">Staff and club admin accounts cannot join with this QR.</p>
          ) : (
            <button className="btn-primary w-full" type="button" disabled={busy || !preview || Boolean(error)} onClick={join}>
              {busy ? 'Joining…' : `Join as ${preview?.role === 'coach' ? 'coach' : 'athlete'}`}
            </button>
          )
        ) : (
          <div className="space-y-2">
            <Link className="btn-primary w-full no-underline text-center block" to="/register" state={invite ? { clubInvite: invite } : undefined}>
              Create account
            </Link>
            <Link className="btn-outline w-full no-underline text-center block" to="/login">
              Sign in
            </Link>
          </div>
        )}
        {user && (
          <p className="text-center text-muted text-sm mt-6">
            <button
              type="button"
              className="bg-transparent border-0 text-brand p-0"
              onClick={() => navigate(homePath(user) || afterJoinPath(user))}
            >
              Not now
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
