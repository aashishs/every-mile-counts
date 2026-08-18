import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

export default function Clubs() {
  const { isClubAdmin } = useAuth();
  const [clubs, setClubs] = useState([]);
  const [mine, setMine] = useState([]);
  const [q, setQ] = useState('');

  const search = async (query = q) => {
    const [{ data: all }, { data: mineRes }] = await Promise.all([
      api.get('/clubs', { params: query ? { q: query } : {} }),
      api.get('/clubs/mine'),
    ]);
    setClubs(all.clubs);
    setMine(mineRes.clubs);
  };

  useEffect(() => { search(); }, []);

  return (
    <Layout>
      <h2 className="page-title">Clubs</h2>
      <p className="page-sub">
        {isClubAdmin
          ? 'Your club is an organization that adds coaches and assigns them to athletes. Clubs do not connect to Strava.'
          : 'Join a club to be assigned a coach. You connect Strava on your own athlete account.'}
      </p>
      {!!mine.length && (
        <div className="mb-6">
          <h3 className="font-semibold mb-3">My clubs</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {mine.map((c) => (
              <Link key={c.id} to={`/clubs/${c.id}`} className="card text-inherit no-underline hover:border-brand">
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-muted">
                  {c.role === 'club_admin' ? 'Admin' : c.role === 'coach' ? 'Coach' : 'Athlete'}
                  {c.isVerified ? ' · verified' : ''}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); search(q); }}>
        <input placeholder="Search clubs" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary">Search</button>
      </form>
      <div className="space-y-3">
        {clubs.map((c) => (
          <Link key={c.id} to={`/clubs/${c.id}`} className="card flex justify-between items-center text-inherit no-underline hover:border-brand">
            <div>
              <div className="font-semibold">{c.name} {c.isVerified ? '✓' : ''}</div>
              <div className="text-sm text-muted">{c.location || 'Location TBD'}</div>
            </div>
            <span className="badge bg-brand/15 text-brand">{c.status === 'pending_coach' ? 'needs coach' : 'club'}</span>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
