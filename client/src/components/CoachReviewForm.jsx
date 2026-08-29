import { useState } from 'react';
import api from '../api/client';

const FIELDS = [
  { key: 'performanceSummary', label: 'Performance summary' },
  { key: 'strengths', label: 'Strengths' },
  { key: 'improvements', label: 'Work on' },
  { key: 'technique', label: 'Technique' },
  { key: 'recommendations', label: 'Training' },
  { key: 'recoveryAdvice', label: 'Recovery' },
  { key: 'comments', label: 'Comments' },
];

function emptyForm() {
  return {
    performanceSummary: '',
    strengths: '',
    improvements: '',
    technique: '',
    recommendations: '',
    recoveryAdvice: '',
    comments: '',
    rating: 5,
  };
}

export default function CoachReviewForm({
  activityId,
  requestId,
  programId,
  plannedWorkoutId,
  title = 'Write review',
  onPublished,
}) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await api.post('/reviews', {
        activityId,
        requestId,
        programId,
        plannedWorkoutId,
        ...form,
        status: 'published',
      });
      setForm(emptyForm());
      setMessage('Review published');
      onPublished?.();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not save review');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card space-y-3" onSubmit={submit}>
      {title ? <h3 className="section-title">{title}</h3> : null}
      {message && <p className={`text-sm mb-0 ${/published/i.test(message) ? 'text-emerald-200' : 'text-orange-200'}`}>{message}</p>}
      {FIELDS.map((field) => (
        <div key={field.key}>
          <label htmlFor={`review-${field.key}`}>{field.label}</label>
          <textarea
            id={`review-${field.key}`}
            rows={2}
            value={form[field.key]}
            onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
          />
        </div>
      ))}
      <div>
        <label htmlFor="review-rating">Rating</label>
        <select
          id="review-rating"
          value={form.rating}
          onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
          className="max-w-xs"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <button className="btn-primary w-full" type="submit" disabled={busy}>
        {busy ? 'Publishing…' : 'Publish review'}
      </button>
    </form>
  );
}

export function PublishedReviews({ reviews }) {
  if (!reviews?.length) return null;
  return (
    <section className="mb-6">
      <h3 className="section-title mb-3">Coach notes</h3>
      {reviews.map((r) => (
        <div key={r.id} className="card mb-3 text-sm space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{r.coachFirstName} {r.coachLastName}{r.clubName ? ` · ${r.clubName}` : ''}</span>
            {r.rating ? <span className="text-accent">{'★'.repeat(r.rating)}</span> : null}
          </div>
          {r.performanceSummary && <p className="mb-0">{r.performanceSummary}</p>}
          {r.strengths && <p className="mb-0 text-muted"><span className="text-slate-100 font-medium">Strengths.</span> {r.strengths}</p>}
          {r.improvements && <p className="mb-0 text-muted"><span className="text-slate-100 font-medium">Work on.</span> {r.improvements}</p>}
          {r.technique && <p className="mb-0 text-muted"><span className="text-slate-100 font-medium">Technique.</span> {r.technique}</p>}
          {r.recommendations && <p className="mb-0 text-muted"><span className="text-slate-100 font-medium">Training.</span> {r.recommendations}</p>}
          {r.recoveryAdvice && <p className="mb-0 text-muted"><span className="text-slate-100 font-medium">Recovery.</span> {r.recoveryAdvice}</p>}
          {r.comments && <p className="mb-0 text-muted">{r.comments}</p>}
        </div>
      ))}
    </section>
  );
}
