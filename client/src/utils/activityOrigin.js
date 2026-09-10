export function activityOriginLabel(activity) {
  if (activity?.origin?.label) return activity.origin.label;
  const source = String(activity?.source || '').toLowerCase();
  const id = String(activity?.sourceActivityId || '');
  const format = String(activity?.origin?.key || activity?.raw?.format || '').toLowerCase();
  if (source === 'strava') return 'Strava';
  if (source === 'garmin') return 'Garmin';
  if (id.startsWith('file-') || format === 'fit' || format === 'gpx' || format === 'tcx') {
    if (format === 'fit') return 'FIT file';
    if (format === 'tcx') return 'TCX file';
    if (format === 'gpx') return 'GPX file';
    return 'Imported file';
  }
  if (source === 'manual' || source) return 'Manual';
  return '';
}
