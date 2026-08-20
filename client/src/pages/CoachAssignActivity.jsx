import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import ClubField, { coachClubList, onlyClubId } from '../components/ClubField';
import WorkoutForm, { emptyWorkout, payloadFromForm } from '../components/WorkoutForm';

export default function CoachAssignActivity() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clubs, setClubs] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  const [target, setTarget] = useState({ clubId: '', athleteId: params.get('athleteId') || '', groupId: params.get('groupId') || '' });
  const [form, setForm] = useState({ ...emptyWorkout, scheduledDate: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    api.get('/clubs/mine').then((res) => {
      const list = coachClubList(res.data.clubs || res.data);
      setClubs(list);
      const lockedClub = onlyClubId(list);
      if (lockedClub) {
        setTarget((current) => current.clubId ? current : { ...current, clubId: lockedClub });
      }
    }).catch(() => setClubs([]));
    api.get('/coaches/my-athletes', { params: { limit: 100 } }).then((res) => setAthletes(res.data.athletes || [])).catch(() => setAthletes([]));
    api.get('/training/groups').then((res) => setGroups(res.data.groups || [])).catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    const id = params.get('athleteId');
    if (!id || target.clubId) return;
    const athlete = athletes.find((a) => a.athleteId === id);
    if (athlete?.clubId) {
      setTarget((prev) => ({ ...prev, clubId: athlete.clubId, athleteId: id }));
    }
  }, [athletes, params, target.clubId]);

  const selectedGroup = groups.find((g) => g.id === target.groupId);
  const clubId = selectedGroup?.clubId || target.clubId;
  const clubAthletes = useMemo(
    () => athletes.filter((a) => !clubId || a.clubId === clubId || !a.clubId),
    [athletes, clubId]
  );
  const clubGroups = useMemo(
    () => groups.filter((g) => !target.clubId || g.clubId === target.clubId),
    [groups, target.clubId]
  );

  const save = async () => {
    setError('');
    if (!target.groupId && !target.athleteId) {
      setError('Choose an athlete or a group');
      return;
    }
    if (!selectedGroup && !target.clubId) {
      setError('Choose a club');
      return;
    }
    try {
      const payload = {
        ...payloadFromForm(form),
        clubId: selectedGroup?.clubId || target.clubId,
        groupId: target.groupId || undefined,
        athleteId: target.groupId ? undefined : target.athleteId || undefined,
      };
      const { data } = await api.post('/training/workouts', payload);
      navigate('/coaches/training', { replace: true, state: { assigned: data.count } });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not assign activity');
    }
  };

  return (
    <Layout>
      <p className="text-xs text-muted mb-2">
        <Link to="/coaches/training" className="text-brand no-underline">Training</Link>
      </p>
      <h2 className="page-title">Assign activity</h2>
      <p className="page-sub">One session for an athlete or a whole group — no full plan needed</p>
      {error && <div className="card text-rose-200 mb-4">{error}</div>}

      <div className="card grid md:grid-cols-2 gap-3 mb-4">
        <ClubField
          clubs={clubs}
          value={target.clubId}
          disabled={Boolean(selectedGroup) || clubs.length === 1}
          onChange={(clubId) => setTarget({ clubId, athleteId: '', groupId: '' })}
        />
        <select value={target.groupId} onChange={(e) => setTarget({ ...target, groupId: e.target.value, athleteId: '' })}>
          <option value="">One athlete (or pick a group)</option>
          {clubGroups.map((g) => (
            <option key={g.id} value={g.id}>{g.name} · {g.athleteCount || g.athletes?.length || 0} athletes</option>
          ))}
        </select>
        {!target.groupId && (
          <select className="md:col-span-2" value={target.athleteId} onChange={(e) => setTarget({ ...target, athleteId: e.target.value })}>
            <option value="">Athlete</option>
            {clubAthletes.map((a) => (
              <option key={a.athleteId} value={a.athleteId}>{a.firstName} {a.lastName}</option>
            ))}
          </select>
        )}
        {selectedGroup ? (
          <p className="md:col-span-2 text-sm text-muted mb-0">
            {selectedGroup.clubName} · {(selectedGroup.athletes || []).map((a) => `${a.firstName} ${a.lastName}`).join(', ') || 'No athletes yet'}
          </p>
        ) : null}
      </div>

      <div className="card">
        <WorkoutForm form={form} setForm={setForm} onSave={save} onCancel={() => navigate('/coaches/training')} submitLabel="Assign activity" />
      </div>
    </Layout>
  );
}
