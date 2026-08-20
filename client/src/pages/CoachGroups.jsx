import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import SearchMultiSelect from '../components/SearchMultiSelect';
import ClubField, { coachClubList, onlyClubId } from '../components/ClubField';

export default function CoachGroups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', clubId: '', description: '', athleteIds: [] });
  const [message, setMessage] = useState({ groupId: '', title: '', body: '' });

  const load = async () => {
    const [{ data: groupData }, clubsRes, athletesRes] = await Promise.all([
      api.get('/training/groups'),
      api.get('/clubs/mine'),
      api.get('/coaches/my-athletes', { params: { limit: 100 } }),
    ]);
    const coachClubs = coachClubList(clubsRes.data.clubs || clubsRes.data);
    setGroups(groupData.groups || []);
    setClubs(coachClubs);
    setAthletes(athletesRes.data.athletes || []);
    const lockedClub = onlyClubId(coachClubs);
    if (lockedClub) {
      setForm((current) => current.clubId ? current : { ...current, clubId: lockedClub });
    }
  };

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || 'Could not load groups'));
  }, []);

  const clubAthletes = useMemo(
    () => athletes.filter((a) => !form.clubId || a.clubId === form.clubId || !a.clubId),
    [athletes, form.clubId]
  );
  const athleteOptions = useMemo(
    () => clubAthletes.map((a) => ({
      id: a.athleteId,
      label: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email,
    })),
    [clubAthletes]
  );

  const resetForm = () => {
    setEditing(null);
    setForm({
      name: '',
      clubId: onlyClubId(clubs) || (clubs.length === 1 ? form.clubId : ''),
      description: '',
      athleteIds: [],
    });
  };

  const athletesForClub = (clubId) => athletes.filter((a) => !clubId || a.clubId === clubId || !a.clubId);

  const athleteOptionsFor = (clubId) => athletesForClub(clubId).map((a) => ({
    id: a.athleteId,
    label: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email,
  }));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      if (editing) {
        await api.patch(`/training/groups/${editing}`, form);
        setNotice('Group updated');
      } else {
        await api.post('/training/groups', form);
        setNotice('Group created');
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save group');
    }
  };

  const editGroup = (group) => {
    setEditing(group.id);
    setForm({
      name: group.name,
      clubId: group.clubId,
      description: group.description || '',
      athleteIds: (group.athletes || []).map((a) => a.athleteId),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveMembers = async (group, athleteIds) => {
    setError('');
    try {
      await api.patch(`/training/groups/${group.id}`, {
        name: group.name,
        description: group.description || '',
        athleteIds,
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update athletes');
    }
  };

  const removeAthlete = (group, athleteId) => {
    const next = (group.athletes || []).map((a) => a.athleteId).filter((id) => id !== athleteId);
    return saveMembers(group, next);
  };

  const remove = async (group) => {
    if (!window.confirm(`Delete ${group.name}? Athletes stay on your roster.`)) return;
    setError('');
    try {
      await api.delete(`/training/groups/${group.id}`);
      if (editing === group.id) resetForm();
      setNotice('Group deleted');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete group');
    }
  };

  const notify = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/training/groups/${message.groupId}/notify`, {
        title: message.title,
        body: message.body,
      });
      setNotice(`Sent to ${data.sent} athlete${data.sent === 1 ? '' : 's'}`);
      setMessage({ groupId: '', title: '', body: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send message');
    }
  };

  return (
    <Layout>
      <p className="text-xs text-muted mb-2">
        <Link to="/coaches/training" className="text-brand no-underline">Training</Link>
      </p>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="page-title">Athlete groups</h2>
          <p className="page-sub">Assign plans or a single activity to a group, or send them a note</p>
        </div>
        <button className="btn-outline" type="button" onClick={() => navigate('/coaches/activities/new')}>Assign activity</button>
      </div>
      {error && <div className="card text-rose-200 mb-4">{error}</div>}
      {notice && <div className="card text-brand mb-4">{notice}</div>}

      <form className="card grid md:grid-cols-2 gap-3 mb-8" onSubmit={save}>
        <h3 className="md:col-span-2 font-semibold">{editing ? 'Edit group' : 'New group'}</h3>
        <input required placeholder="Group name (Tempo squad, Marathon, …)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <ClubField
          clubs={clubs}
          value={form.clubId}
          disabled={Boolean(editing)}
          onChange={(clubId) => setForm({ ...form, clubId, athleteIds: [] })}
        />
        <textarea className="md:col-span-2" placeholder="Optional note" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="md:col-span-2">
          <label>Athletes</label>
          <SearchMultiSelect
            options={athleteOptions}
            value={form.athleteIds}
            onChange={(athleteIds) => setForm({ ...form, athleteIds })}
            placeholder="Search and select athletes"
            searchPlaceholder="Search athletes"
            emptyText="No athletes match that search"
            disabled={!form.clubId || !clubAthletes.length}
          />
          {!clubAthletes.length ? (
            <p className="text-xs text-muted mt-2 mb-0">No assigned athletes in this club yet.</p>
          ) : (
            <p className="text-xs text-muted mt-2 mb-0">
              {form.athleteIds.length} selected
            </p>
          )}
        </div>
        <div className="md:col-span-2 flex gap-2">
          <button className="btn-primary" type="submit">{editing ? 'Save group' : 'Create group'}</button>
          {editing ? <button className="btn-outline" type="button" onClick={resetForm}>Cancel</button> : null}
        </div>
      </form>

      <section className="mb-8">
        <h3 className="section-title mb-3">Groups</h3>
        {!groups.length ? (
          <div className="card text-muted text-sm">No groups yet. Create one, then assign a plan or activity to it.</div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <article key={g.id} className="card">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{g.name}</div>
                      <div className="text-xs text-muted mt-1">{g.clubName} · {g.athleteCount || g.athletes?.length || 0} athlete{(g.athleteCount || g.athletes?.length) === 1 ? '' : 's'}</div>
                      {g.description ? <p className="text-sm text-muted mt-2 mb-0">{g.description}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button className="btn-outline btn-sm" type="button" onClick={() => editGroup(g)}>Edit</button>
                      <button className="btn-outline btn-sm" type="button" onClick={() => navigate(`/coaches/activities/new?groupId=${g.id}`)}>Assign activity</button>
                      <button className="btn-outline btn-sm" type="button" onClick={() => remove(g)}>Delete</button>
                    </div>
                  </div>
                  <div>
                    <label>Athletes</label>
                    <SearchMultiSelect
                      options={athleteOptionsFor(g.clubId)}
                      value={(g.athletes || []).map((a) => a.athleteId)}
                      onChange={(athleteIds) => saveMembers(g, athleteIds)}
                      placeholder="Search to add or remove athletes"
                      searchPlaceholder="Search athletes"
                      emptyText="No athletes match that search"
                    />
                    {!!g.athletes?.length && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {g.athletes.map((a) => (
                          <span key={a.athleteId} className="badge">
                            {a.firstName} {a.lastName}
                            <button
                              type="button"
                              className="ml-1"
                              aria-label={`Remove ${a.firstName}`}
                              onClick={() => removeAthlete(g, a.athleteId)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <form className="card grid gap-3" onSubmit={notify}>
        <h3 className="font-semibold">Message a group</h3>
        <select required value={message.groupId} onChange={(e) => setMessage({ ...message, groupId: e.target.value })}>
          <option value="">Choose group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name} ({g.athleteCount || g.athletes?.length || 0})</option>
          ))}
        </select>
        <input required placeholder="Title" value={message.title} onChange={(e) => setMessage({ ...message, title: e.target.value })} />
        <textarea placeholder="Message" value={message.body} onChange={(e) => setMessage({ ...message, body: e.target.value })} />
        <button className="btn-primary" type="submit">Send notification</button>
      </form>
    </Layout>
  );
}
