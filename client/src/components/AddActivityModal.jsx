import { useState } from 'react';
import api from '../api/client';
import { DurationPicker, TimePicker, ymd } from './MonthCalendar';
import { activityMetric, visibleActivityTypeOptions } from '../utils/format';
import { useAuth } from '../context/AuthContext';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function nowTime() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function defaultName(type, time) {
  const h = Number(String(time || '12:00').slice(0, 2));
  const when = h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return `${when} ${type}`;
}

const emptyManual = () => ({
  type: 'Run',
  name: '',
  date: ymd(new Date()),
  time: nowTime(),
  duration: '00:30:00',
  distanceKm: '',
  elevationGain: '',
  avgHeartrate: '',
  calories: '',
  description: '',
});

export default function AddActivityModal({ onClose, onSaved }) {
  const { user } = useAuth();
  const typeOptions = visibleActivityTypeOptions(user);
  const [tab, setTab] = useState('manual');
  const [form, setForm] = useState(() => {
    const seed = emptyManual();
    const first = typeOptions[0]?.value || 'Run';
    return { ...seed, type: typeOptions.some((opt) => opt.value === seed.type) ? seed.type : first };
  });
  const [file, setFile] = useState(null);
  const [fileMeta, setFileMeta] = useState({ name: '', type: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const metric = activityMetric(form.type, form.type, form.distanceKm ? Number(form.distanceKm) * 1000 : 5000);

  const saveManual = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const startDate = new Date(`${form.date}T${form.time || '12:00'}:00`);
      const distInput = form.distanceKm === '' ? 0 : Number(form.distanceKm);
      const { data } = await api.post('/activities', {
        name: form.name.trim() || defaultName(form.type, form.time),
        type: form.type,
        startDate: startDate.toISOString(),
        duration: form.duration,
        distance: metric === 'swim' ? distInput : distInput * 1000,
        elevationGain: form.elevationGain === '' ? 0 : Number(form.elevationGain),
        avgHeartrate: form.avgHeartrate === '' ? null : Number(form.avgHeartrate),
        calories: form.calories === '' ? null : Number(form.calories),
        description: form.description.trim(),
      });
      onSaved(data.id);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save activity');
    } finally {
      setSaving(false);
    }
  };

  const saveFile = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Choose a .gpx or .tcx file');
      return;
    }
    setSaving(true);
    try {
      const content = await file.text();
      const { data } = await api.post('/activities/import', {
        filename: file.name,
        content,
        name: fileMeta.name.trim() || undefined,
        type: fileMeta.type || undefined,
        description: fileMeta.description.trim() || undefined,
      }, { timeout: 60000 });
      onSaved(data.id);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not import that file');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center p-4 z-50 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-md space-y-3 my-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-lg">Add activity</h3>
        <div className="flex gap-2">
          <button type="button" className={tab === 'manual' ? 'chip-active' : 'chip'} onClick={() => { setTab('manual'); setError(''); }}>
            Manual
          </button>
          <button type="button" className={tab === 'file' ? 'chip-active' : 'chip'} onClick={() => { setTab('file'); setError(''); }}>
            Import file
          </button>
        </div>

        {error && <p className="text-sm text-orange-300 mb-0">{error}</p>}

        {tab === 'manual' ? (
          <form className="space-y-3" onSubmit={saveManual}>
            <div>
              <label htmlFor="actType">Sport</label>
              <select id="actType" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {typeOptions.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="actName">Title</label>
              <input
                id="actName"
                placeholder={defaultName(form.type, form.time)}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="actDate">Date</label>
                <input id="actDate" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <TimePicker value={form.time} onChange={(time) => setForm({ ...form, time })} label="Start time" />
            </div>
            <DurationPicker value={form.duration} onChange={(duration) => setForm({ ...form, duration })} label="Duration" />
            {metric !== 'duration' && (
              <div>
                <label htmlFor="actKm">{metric === 'swim' ? 'Distance (m)' : 'Distance (km)'}</label>
                <input
                  id="actKm"
                  type="number"
                  min="0"
                  step={metric === 'swim' ? '1' : '0.01'}
                  placeholder={metric === 'swim' ? 'e.g. 1500' : 'e.g. 10.5'}
                  value={form.distanceKm}
                  onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {metric !== 'duration' && (
                <div>
                  <label htmlFor="actElev">Elevation (m)</label>
                  <input id="actElev" type="number" min="0" step="1" placeholder="optional" value={form.elevationGain} onChange={(e) => setForm({ ...form, elevationGain: e.target.value })} />
                </div>
              )}
              <div>
                <label htmlFor="actHr">Avg HR</label>
                <input id="actHr" type="number" min="0" step="1" placeholder="optional" value={form.avgHeartrate} onChange={(e) => setForm({ ...form, avgHeartrate: e.target.value })} />
              </div>
              <div>
                <label htmlFor="actCal">Calories</label>
                <input id="actCal" type="number" min="0" step="1" placeholder="optional" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} />
              </div>
            </div>
            <div>
              <label htmlFor="actNotes">Notes</label>
              <textarea id="actNotes" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={saveFile}>
            <p className="text-sm text-muted mb-0">
              Upload a .gpx or .tcx file from Strava, Garmin, or your watch. FIT is not supported yet.
            </p>
            <div>
              <label htmlFor="actFile">File</label>
              <input
                id="actFile"
                type="file"
                accept=".gpx,.tcx,.fit,application/gpx+xml,application/xml,text/xml"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file && <p className="text-xs text-muted mt-1 mb-0">{file.name}</p>}
            </div>
            <div>
              <label htmlFor="fileType">Sport (optional)</label>
              <select id="fileType" value={fileMeta.type} onChange={(e) => setFileMeta({ ...fileMeta, type: e.target.value })}>
                <option value="">From file</option>
                {typeOptions.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fileName">Title (optional)</label>
              <input id="fileName" placeholder="Uses the name in the file" value={fileMeta.name} onChange={(e) => setFileMeta({ ...fileMeta, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="fileNotes">Notes</label>
              <textarea id="fileNotes" rows={2} value={fileMeta.description} onChange={(e) => setFileMeta({ ...fileMeta, description: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Importing…' : 'Import'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
