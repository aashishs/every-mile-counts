import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { isAthleteAccount } from '../utils/roles';

export default function Clubs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const athlete = isAthleteAccount(user);
  const clubHome = user?.roles?.includes('club_admin') && !athlete;
  const [clubs, setClubs] = useState([]);
  const [mine, setMine] = useState([]);
  const [maxClubs, setMaxClubs] = useState(3);
  const [q, setQ] = useState('');
  const [searched, setSearched] = useState(false);
  const [msg, setMsg] = useState('');
  const [joining, setJoining] = useState(null);

  const loadMine = async () => {
    const { data } = await api.get('/clubs/mine');
    setMine(data.clubs || []);
    setMaxClubs(data.max || 3);
  };

  useEffect(() => {
    loadMine();
  }, []);

  useEffect(() => {
    if (!clubHome || mine.length !== 1) return;
    const club = mine[0];
    if (club.role === 'club_admin' && club.membershipStatus === 'active') {
      navigate(`/clubs/${club.id}`, { replace: true });
    }
  }, [clubHome, mine, navigate]);

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
    const mineIdsNow = new Set(mine.map((c) => c.id));
    setClubs((data.clubs || []).filter((c) => !mineIdsNow.has(c.id)));
    setSearched(true);
  };

  const mineIds = new Set(mine.map((c) => c.id));
  const visibleClubs = clubs.filter((c) => !mineIds.has(c.id));
  const athleteClubCount = mine.filter((c) => c.role === 'member' || c.role === 'coach').length;
  const canJoinClub = athleteClubCount < maxClubs;

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

  const requestCoach = async (clubId) => {
    setJoining(`coach-${clubId}`);
    setMsg('');
    try {
      await api.post(`/clubs/${clubId}/request-coach`);
      setMsg('Club admin has been asked to assign a coach.');
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
        {clubHome
          ? 'Your club is an organization that adds coaches and assigns them to athletes.'
          : 'Search for a club, then request to join. A club admin must approve you.'}
      </p>
      {msg && <div className="card mb-4 text-sm">{msg}</div>}
      {!!mine.length && (
        <div className="mb-6">
          <h3 className="font-semibold mb-3">My clubs</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {mine.map((c) => {
              const coaches = c.coaches || [];
              const canRequestCoach = athlete && c.role === 'member' && c.membershipStatus === 'active';
              return (
                <div key={c.id} className="card">
                  <Link to={`/clubs/${c.id}`} className="font-semibold text-inherit no-underline hover:text-brand">
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted mt-1">
                    {c.role === 'club_admin' ? 'Admin' : c.role === 'coach' ? 'Coach' : 'Athlete'}
                    {c.membershipStatus === 'pending' ? ' · pending approval' : ''}
                    {c.isVerified ? ' · verified' : ''}
                  </div>
                  {canRequestCoach && (
                    <div className="mt-3">
                      {coaches.length ? (
                        <p className="text-sm text-muted mb-0">
                          Coach{coaches.length === 1 ? '' : 'es'}: {coaches.map((x) => `${x.firstName} ${x.lastName}`).join(', ')}
                        </p>
                      ) : c.coachRequested ? (
                        <p className="text-sm text-muted mb-0">Request sent. Waiting for a club admin to assign a coach.</p>
                      ) : (
                        <button
                          className="btn-outline btn-sm mt-1"
                          type="button"
                          disabled={joining === `coach-${c.id}`}
                          onClick={() => requestCoach(c.id)}
                        >
                          {joining === `coach-${c.id}` ? 'Sending…' : 'Request a coach'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {athlete && (
        <>
          {canJoinClub ? (
          <>
          <form className="flex gap-2 mb-4" onSubmit={search}>
            <input placeholder="Search by club name or city" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-primary" type="submit">Search</button>
          </form>
          <div className="space-y-3">
            {visibleClubs.map((c) => (
                <div key={c.id} className="card flex justify-between items-center gap-3">
                  <div>
                    <div className="font-semibold">{c.name} {c.isVerified ? '✓' : ''}</div>
                    <div className="text-sm text-muted">{c.location || 'Location TBD'}</div>
                  </div>
                  <button
                    className="btn-primary btn-sm"
                    type="button"
                    disabled={joining === c.id || c.status === 'pending_coach'}
                    onClick={() => requestJoin(c.id)}
                  >
                    {c.status === 'pending_coach' ? 'Not open' : joining === c.id ? 'Sending…' : 'Request'}
                  </button>
                </div>
              ))}
            {searched && !visibleClubs.length && (
              <div className="card text-muted text-sm">No clubs match that search.</div>
            )}
            {!searched && (
              <div className="card text-muted text-sm">Search by name or city to find a club and send a join request.</div>
            )}
          </div>
          </>
          ) : (
            <div className="card text-muted text-sm">You already belong to {maxClubs} clubs. Leave one to join another.</div>
          )}
        </>
      )}
    </Layout>
  );
}
