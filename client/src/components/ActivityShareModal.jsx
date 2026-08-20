import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { generatePoster } from '../utils/posterCanvas';
import {
  availableTemplates,
  buildPosterModel,
  DEFAULT_OPTIONS,
  defaultTemplate,
  POSTER_STYLES,
  posterFilename,
} from '../utils/posterPayload';
import { buildShareRoute } from '../utils/routePath';
import { downloadBlob, shareOrDownload } from '../utils/shareFile';

export default function ActivityShareModal({ activity, athleteName, onClose }) {
  const [shareContext, setShareContext] = useState(null);
  const [template, setTemplate] = useState('performance');
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [previewUrl, setPreviewUrl] = useState('');
  const [posterBlob, setPosterBlob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(`/activities/${activity.id}/share-context`).then((res) => {
      if (cancelled) return;
      setShareContext(res.data);
      setTemplate(defaultTemplate(res.data));
    }).catch(() => {
      if (!cancelled) setShareContext({});
    });
    return () => { cancelled = true; };
  }, [activity.id]);

  const templates = useMemo(() => availableTemplates(shareContext || {}), [shareContext]);
  const route = useMemo(
    () => buildShareRoute(activity.polyline, activity.gpsPoints),
    [activity.polyline, activity.gpsPoints]
  );
  const publicActivity = useMemo(() => ({
    name: activity.name,
    type: activity.type,
    sportType: activity.sportType,
    distance: activity.distance,
    movingTime: activity.movingTime,
    elapsedTime: activity.elapsedTime,
    avgSpeed: activity.avgSpeed,
    avgHeartrate: activity.avgHeartrate,
    elevationGain: activity.elevationGain,
    startDate: activity.startDate,
    startDateLocal: activity.startDateLocal,
  }), [activity]);

  const model = useMemo(
    () => buildPosterModel({
      activity: publicActivity,
      athleteName,
      shareContext: shareContext || {},
      template,
      options,
      route,
    }),
    [publicActivity, athleteName, shareContext, template, options, route]
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setError('');
    generatePoster(model).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPosterBlob(blob);
      setPreviewUrl(objectUrl);
    }).catch((err) => {
      if (!cancelled) setError(err.message || 'Could not create poster');
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [model]);

  const makeBlob = () => generatePoster(model);

  const save = async () => {
    setBusy(true);
    setHint('');
    try {
      const blob = posterBlob || await makeBlob();
      downloadBlob(blob, posterFilename(activity));
      setHint('Poster saved. You can upload it to WhatsApp Status, Instagram, or any other app.');
    } catch (err) {
      setError(err.message || 'Could not save poster');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    setHint('');
    try {
      const blob = posterBlob || await makeBlob();
      const result = await shareOrDownload({
        blob,
        filename: posterFilename(activity),
        title: 'Every Mile Counts',
        text: activity.name || 'Activity',
      });
      if (result.method === 'download') {
        setHint('Sharing is not available here. The image was downloaded — share it on WhatsApp, Instagram, or another app.');
      }
    } catch (err) {
      setError(err.message || 'Could not share poster');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key) => setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[60] overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="min-h-full md:grid md:place-items-center p-0 md:p-4"
        role="presentation"
      >
        <div
          className="bg-card border border-line md:rounded-2xl w-full max-w-lg min-h-full md:min-h-0 md:my-6 shadow-card"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-poster-title"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-line bg-card/95 backdrop-blur md:rounded-t-2xl">
            <div>
              <h3 id="share-poster-title" className="font-display text-xl font-bold mb-0">Create your poster</h3>
              <p className="text-xs text-muted mb-0">Preview, then share or save</p>
            </div>
            <button type="button" className="btn-outline btn-sm" onClick={onClose}>Close</button>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={template === t.id ? 'chip-active shrink-0' : 'chip shrink-0'}
                  onClick={() => setTemplate(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl bg-ink border border-line overflow-hidden grid place-items-center p-3">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Activity poster preview"
                  className="w-full max-w-[280px] h-auto rounded-xl shadow-card"
                />
              ) : (
                <p className="text-muted text-sm py-16 mb-0">Building poster…</p>
              )}
            </div>

            <div>
              <div className="stat-label mb-2">Style</div>
              <div className="flex gap-2">
                {POSTER_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={options.style === s.id ? 'chip-active' : 'chip'}
                    onClick={() => setOptions((prev) => ({ ...prev, style: s.id }))}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Toggle label="Pace" checked={options.showPace} onChange={() => toggle('showPace')} />
              <Toggle label="Heart rate" checked={options.showHr} onChange={() => toggle('showHr')} />
              <Toggle label="Elevation" checked={options.showElevation} onChange={() => toggle('showElevation')} />
              <Toggle label="Duration" checked={options.showDuration} onChange={() => toggle('showDuration')} />
              <Toggle label="Your name" checked={options.showName} onChange={() => toggle('showName')} />
              {route && (
                <Toggle label="Route map" checked={options.showMap !== false} onChange={() => toggle('showMap')} />
              )}
            </div>

            {error && <p className="text-sm text-orange-300 mb-0">{error}</p>}
            {hint && <p className="text-sm text-brand mb-0">{hint}</p>}

            <div className="grid grid-cols-2 gap-2 pb-4">
              <button type="button" className="btn-primary" disabled={busy || !previewUrl} onClick={share}>
                {busy ? 'Please wait…' : 'Share'}
              </button>
              <button type="button" className="btn-outline" disabled={busy || !previewUrl} onClick={save}>
                Save image
              </button>
            </div>
            <p className="text-[11px] text-muted text-center pb-2">
              Share opens WhatsApp, Instagram, and other apps on this device when the browser allows it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      className={`rounded-xl border px-3 py-2 text-left ${checked ? 'border-brand bg-brand/15 text-slate-100' : 'border-line text-muted'}`}
      onClick={onChange}
    >
      {label}
    </button>
  );
}
