import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import ClubField, { coachClubList, onlyClubId } from '../components/ClubField';
import { SearchSelect } from '../components/SearchMultiSelect';
import WorkoutForm, { emptyWorkout, payloadFromForm } from '../components/WorkoutForm';
import { ymdToday } from '../utils/training';

export default function CoachAssignActivity() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clubs, setClubs] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(params.get('groupId') ? 'group' : 'athlete');
  const [target, setTarget] = useState({
    clubId: '',
    athleteId: params.get('athleteId') || '',
    groupId: params.get('groupId') || '',
  });
  const [form, setForm] = useState({ ...emptyWorkout, scheduledDate: ymdToday() });

  useEffect(() => {
    api.get('/clubs/mine').then((res) => {
      const list = coachClubList(res.data.clubs || res.data);
      setClubs(list);
      const lockedClub = onlyClubId(list);
      if (lockedClub) {
        setTarget((current) => (current.clubId ? current : { ...current, clubId: lockedClub }));
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
  const athleteOptions = useMemo(
    () => clubAthletes.map((a) => ({
      id: a.athleteId,
      label: `${a.firstName || ''} ${a.lastName || ''}`.trim() || 'Athlete',
    })),
    [clubAthletes]
  );
  const groupOptions = useMemo(
    () => clubGroups.map((g) => ({
      id: g.id,
      label: `${g.name} · ${g.athleteCount || g.athletes?.length || 0} athletes`,
    })),
    [clubGroups]
  );

  const setModeAndClear = (next) => {
    setMode(next);
    setError('');
    setTarget((current) => ({
      ...current,
      athleteId: next === 'athlete' ? current.athleteId : '',
      groupId: next === 'group' ? current.groupId : '',
    }));
  };

  const save = async () => {
    setError('');
    if (mode === 'athlete' && !target.athleteId) {
      setError('Choose an athlete');
      return;
    }
    if (mode === 'group' && !target.groupId) {
      setError('Choose a group');
      return;
    }
    if (mode === 'group' && selectedGroup && !(selectedGroup.athletes || []).length && !selectedGroup.athleteCount) {
      setError('This group has no athletes yet. Add members on Groups first.');
      return;
    }
    if (!selectedGroup && !target.clubId) {
      setError('Choose a club');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...payloadFromForm(form),
        clubId: selectedGroup?.clubId || target.clubId,
        groupId: mode === 'group' ? target.groupId : undefined,
        athleteId: mode === 'athlete' ? target.athleteId : undefined,
      };
      const { data } = await api.post('/training/workouts', payload);
      navigate('/coaches/training', { replace: true, state: { assigned: data.count } });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not schedule this session');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <p className="text-xs text-muted mb-2">
        <Link to="/coaches/training" className="text-brand no-underline">Training</Link>
      </p>
      <h2 className="page-title">Schedule a session</h2>
      <p className="page-sub">One workout for an athlete or a group. No full plan needed.</p>
      {error && <div className="card text-rose-200 mb-4">{error}</div>}

      <div className="card mb-4">
        <h3 className="section-title">1. Who is this for?</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <ClubField
            clubs={clubs}
            value={target.clubId}
            disabled={Boolean(selectedGroup) || clubs.length === 1}
            onChange={(nextClubId) => setTarget({ clubId: nextClubId, athleteId: '', groupId: '' })}
          />
          <div>
            <label>Assign to</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={mode === 'athlete' ? 'btn-primary flex-1' : 'btn-outline flex-1'}
                onClick={() => setModeAndClear('athlete')}
              >
                One athlete
              </button>
              <button
                type="button"
                className={mode === 'group' ? 'btn-primary flex-1' : 'btn-outline flex-1'}
                onClick={() => setModeAndClear('group')}
              >
                A group
              </button>
            </div>
          </div>
          {mode === 'athlete' ? (
            <div className="md:col-span-2">
              <label>Athlete</label>
              <SearchSelect
                options={athleteOptions}
                value={target.athleteId}
                onChange={(athleteId) => setTarget((current) => ({ ...current, athleteId, groupId: '' }))}
                placeholder={clubAthletes.length ? 'Search athlete' : 'No athletes in this club'}
                searchPlaceholder="Type a name"
                emptyText="No matching athlete"
                disabled={!clubAthletes.length}
              />
            </div>
          ) : (
            <div className="md:col-span-2">
              <label>Group</label>
              <SearchSelect
                options={groupOptions}
                value={target.groupId}
                onChange={(groupId) => setTarget((current) => ({ ...current, groupId, athleteId: '' }))}
                placeholder={clubGroups.length ? 'Search group' : 'No groups yet'}
                searchPlaceholder="Type a group name"
                emptyText="No matching group"
                disabled={!clubGroups.length}
              />
              {!clubGroups.length ? (
                <p className="text-sm text-muted mt-2 mb-0">
                  <Link to="/coaches/groups" className="text-brand no-underline">Create a group</Link> first if you want to assign to several athletes at once.
                </p>
              ) : selectedGroup ? (
                <p className="text-sm text-muted mt-2 mb-0">
                  {selectedGroup.clubName ? `${selectedGroup.clubName} · ` : ''}
                  {(selectedGroup.athletes || []).map((a) => `${a.firstName} ${a.lastName}`).join(', ') || 'No athletes in this group yet'}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">2. Session details</h3>
        <WorkoutForm
          form={form}
          setForm={setForm}
          busy={busy}
          onSave={save}
          onCancel={() => navigate('/coaches/training')}
          submitLabel="Schedule session"
        />
      </div>
    </Layout>
  );
}
