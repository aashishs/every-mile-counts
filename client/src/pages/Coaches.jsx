import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDistance } from '../utils/format';

export default function Coaches() {
  const { isCoach } = useAuth();
  const [coaches, setCoaches] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [selected, setSelected] = useState(null);
  const [athleteActs, setAthleteActs] = useState([]);

  const load = async () => {
    const c = await api.get('/coaches/my-coaches');
    setCoaches(c.data.coaches || []);
    if (isCoach) {
      const [a, i] = await Promise.all([api.get('/coaches/my-athletes'), api.get('/reviews/inbox')]);
      setAthletes(a.data.athletes || []);
      setInbox(i.data.requests || []);
    }
  };

  useEffect(() => { load(); }, [isCoach]);

  const openAthlete = async (athleteId) => {
    setSelected(athleteId);
    const { data } = await api.get(`/activities/athlete/${athleteId}`);
    setAthleteActs(data.activities || []);
  };

  return (
    <Layout>
      <h2 className="page-title">Coaching</h2>
      <p className="page-sub">Athletes may have up to three coaches. Coaches only see assigned athletes.</p>

      <h3 className="font-semibold mb-2">My coaches</h3>
      <div className="grid md:grid-cols-3 gap-3 mb-8">
        {coaches.map((c) => (
          <div key={c.id || c.coachId} className="card">
            <div className="font-semibold">{c.firstName} {c.lastName}</div>
            <div className="text-xs text-muted">{c.email} {c.clubName ? `· ${c.clubName}` : ''}</div>
          </div>
        ))}
        {!coaches.length && <div className="card text-muted text-sm">No coaches assigned yet. Join a club to get matched.</div>}
      </div>

      {isCoach && (
        <>
          <h3 className="font-semibold mb-2">Review requests</h3>
          <div className="space-y-2 mb-8">
            {inbox.map((r) => (
              <Link key={r.id} to={`/activities/${r.activityId}`} className="card flex justify-between text-inherit no-underline hover:border-brand">
                <span>{r.firstName} {r.lastName} · {r.activityName}</span>
                <span className="text-xs text-muted">{formatDate(r.startDate)}</span>
              </Link>
            ))}
            {!inbox.length && <div className="card text-muted text-sm">No pending requests. You can still open an athlete activity and review it.</div>}
          </div>

          <h3 className="font-semibold mb-2">Assigned athletes</h3>
          <div className="grid md:grid-cols-2 gap-3 mb-6">
            {athletes.map((a) => (
              <button key={a.athleteId || a.id} className="card text-left hover:border-brand" onClick={() => openAthlete(a.athleteId)}>
                <div className="font-semibold">{a.firstName} {a.lastName}</div>
                <div className="text-xs text-muted">{a.activityCount} activities</div>
              </button>
            ))}
          </div>
          {selected && (
            <div className="space-y-2">
              {athleteActs.map((act) => (
                <Link key={act.id} to={`/activities/${act.id}`} className="card flex justify-between text-inherit no-underline">
                  <span>{act.name}</span>
                  <span className="text-brand">{formatDistance(act.distance)}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
