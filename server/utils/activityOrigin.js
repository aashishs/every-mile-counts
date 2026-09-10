export function activityOrigin(activity) {
  const source = String(activity?.source || '').toLowerCase();
  const id = String(activity?.sourceActivityId || activity?.source_activity_id || '');
  const raw = activity?.raw && typeof activity.raw === 'object' ? activity.raw : {};
  const format = String(activity?.importFormat || raw.format || '').toLowerCase();
  const filename = String(raw.filename || '').trim();
  const ext = filename.toLowerCase();
  const rawSource = String(activity?.importSource || raw.source || '').toLowerCase();

  if (source === 'strava') return { key: 'strava', label: 'Strava' };
  if (source === 'garmin') return { key: 'garmin', label: 'Garmin' };

  const isFile = rawSource === 'file'
    || id.startsWith('file-')
    || /\.(fit|gpx|tcx)$/i.test(filename)
    || ['fit', 'gpx', 'tcx'].includes(format);

  if (isFile) {
    if (format === 'fit' || ext.endsWith('.fit')) {
      return { key: 'fit', label: 'FIT file', filename: filename || null };
    }
    if (format === 'tcx' || ext.endsWith('.tcx')) {
      return { key: 'tcx', label: 'TCX file', filename: filename || null };
    }
    if (format === 'gpx' || ext.endsWith('.gpx')) {
      return { key: 'gpx', label: 'GPX file', filename: filename || null };
    }
    return { key: 'file', label: 'Imported file', filename: filename || null };
  }

  return { key: 'manual', label: 'Manual' };
}

export function withActivityOrigin(activity) {
  if (!activity) return activity;
  return { ...activity, origin: activityOrigin(activity) };
}
