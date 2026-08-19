import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { isClubOnlyAccount } from '../utils/roles';

export default function Clubs() {
  const { user } = useAuth();
  const clubOnly = isClubOnlyAccount(user);
  const [clubs, setClubs] = useState([]);
  const [mine, setMine] = useState([]);
  const [q, setQ] = useState('');
  const [searched, setSearched] = useState(false);
  const [msg, setMsg] = useState('');
  const [joining, setJoining] = useState(null);

  const loadMine = async () => {
    const { data } = await api.get('/clubs/mine');
    setMine(data.clubs || []);
  };

  useEffect(() => {
    loadMine();
  }, []);

  const search = async (e) => {
    e?.preventDefault();
    const query = q.trim();
    if (query.length < 2) {
      setMsg('Type at least 2 characters to search');
      setClubs([]);
      setSearched(false);
      return;
    }
    setMsg('');
    const { data } = await api.get('/clubs', { params: { q: query } });
    setClubs(data.clubs || []);
    setSearched(true);
  };

  const mineIds = new Set(mine.map((c) => c.id));
  const mineStatus = Object.fromEntries(mine.map((c) => [c.id, c.membershipStatus || c.status]));

  const requestJoin = async (clubId) => {
    setJoining(clubId);
    setMsg('');
    try {
      await api.post(`/clubs/${clubId}/join`, {});
      setMsg('Request sent. A club admin will approve you.');
      await loadMine();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Could not send request');
    } finally {
      setJoining(null);
    }
  };

  return (
    <Layout>
      <h2 className="page-title">Clubs</h2>
      <p className="page-sub">
        {clubOnly
          ? 'Your club is an organization that adds coaches and assigns them to athletes.'
          : 'Search for a club, then request to join. A club admin must approve you.'}
      </p>
      {msg && <div className="card mb-4 text-sm">{msg}</div>}
      {!!mine.length && (
        <div className="mb-6">
          <h3 className="font-semibold mb-3">My clubs</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {mine.map((c) => (
              <Link key={c.id} to={`/clubs/${c.id}`} className="card text-inherit no-underline hover:border-brand">
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-muted">
                  {c.role === 'club_admin' ? 'Admin' : c.role === 'coach' ? 'Coach' : 'Athlete'}
                  {c.membershipStatus === 'pending' ? ' · pending approval' : ''}
                  {c.isVerified ? ' · verified' : ''}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {!clubOnly && (
        <>
          <form className="flex gap-2 mb-4" onSubmit={search}>
            <input placeholder="Search by club name or city" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-primary" type="submit">Search</button>
          </form>
          <div className="space-y-3">
            {clubs.map((c) => {
              const mineState = mineStatus[c.id];
              return (
                <div key={c.id} className="card flex justify-between items-center gap-3">
                  <div>
                    <div className="font-semibold">{c.name} {c.isVerified ? '✓' : ''}</div>
                    <div className="text-sm text-muted">{c.location || 'Location TBD'}</div>
                  </div>
                  {mineIds.has(c.id) ? (
                    <Link to={`/clubs/${c.id}`} className="btn-outline btn-sm no-underline">
                      {mineState === 'pending' ? 'Pending' : 'Open'}
                    </Link>
                  ) : (
                    <button
                      className="btn-primary btn-sm"
                      type="button"
                      disabled={joining === c.id || c.status === 'pending_coach'}
                      onClick={() => requestJoin(c.id)}
                    >
                      {c.status === 'pending_coach' ? 'Not open' : joining === c.id ? 'Sending…' : 'Request'}
                    </button>
                  )}
                </div>
              );
            })}
            {searched && !clubs.length && (
              <div className="card text-muted text-sm">No clubs match that search.</div>
            )}
            {!searched && (
              <div className="card text-muted text-sm">Search by name or city to find a club and send a join request.</div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
