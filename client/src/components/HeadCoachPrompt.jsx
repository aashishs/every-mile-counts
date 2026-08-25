import { useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { needsProfile } from '../utils/roles';

export default function HeadCoachPrompt() {
  const { user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user?.headCoachPrompt || needsProfile(user)) return null;

  const save = async (enabled) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/users/me/head-coach', { enabled });
      if (data.user) updateUser(data.user);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save that choice');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/60">
      <div className="card w-full max-w-md space-y-3">
        <h3 className="font-semibold text-lg mb-0">Are you the head coach?</h3>
        <p className="text-sm text-muted mb-0">
          {user.headCoachClubName || 'Your club'} members can have you as their default coach.
          Coaching stays inside this club. You can remove athletes from your list later, and you can change this under Profile.
        </p>
        {error && <p className="text-sm text-orange-300 mb-0">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button className="btn-primary" type="button" disabled={busy} onClick={() => save(true)}>
            I am the head coach
          </button>
          <button className="btn-outline" type="button" disabled={busy} onClick={() => save(false)}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
