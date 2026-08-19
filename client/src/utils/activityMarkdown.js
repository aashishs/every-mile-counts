import {
  activityMetric,
  formatDate,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatPace,
} from './format';

function hasValue(value) {
  return value != null && value !== '' && value !== '—';
}

function row(label, value) {
  if (!hasValue(value)) return null;
  return `| ${label} | ${value} |`;
}

function table(rows) {
  const body = rows.filter(Boolean);
  if (!body.length) return '';
  return ['| Metric | Value |', '| --- | --- |', ...body].join('\n');
}

function formatSplitPace(secondsPerKm) {
  const sec = Number(secondsPerKm);
  if (!sec || sec <= 0) return '—';
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}:${String(rem).padStart(2, '0')} /km`;
}

function formatSplitTime(seconds) {
  const sec = Number(seconds);
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function splitsTable(splits) {
  if (!Array.isArray(splits) || !splits.length) return '';
  const rows = splits.slice(0, 50).map((split, i) => {
    const km = split.distance != null ? (Number(split.distance) / 1000).toFixed(2) : i + 1;
    const time = formatSplitTime(split.movingTime || split.moving_time);
    const pace = split.pace != null ? formatSplitPace(split.pace) : '—';
    const hr = split.hr != null ? Math.round(Number(split.hr)) : '—';
    return `| ${km} | ${time} | ${pace} | ${hr} |`;
  });
  const extra = splits.length > 50 ? `\n\n_${splits.length - 50} more splits omitted._` : '';
  return ['| km | Time | Pace | HR |', '| --- | --- | --- | --- |', ...rows].join('\n') + extra;
}

function insightLines(insights) {
  if (!insights) return [];
  const zone = insights.heartRateZone;
  const lines = [
    insights.paceConsistency && insights.paceConsistency !== 'unknown'
      ? `- Pace consistency: ${insights.paceConsistency}`
      : null,
    zone?.label ? `- Heart-rate zone: Z${zone.zone} ${zone.label}` : null,
    insights.mafCheck
      ? `- MAF (${insights.mafCheck.mafHeartRate} bpm): avg HR ${insights.mafCheck.avgHeartrate} (${insights.mafCheck.label})`
      : null,
    insights.trainingLoad != null ? `- Training load: ${Math.round(Number(insights.trainingLoad))}` : null,
    insights.cadenceEfficiency ? `- Cadence: ${insights.cadenceEfficiency}` : null,
    insights.elevationImpact ? `- Terrain: ${insights.elevationImpact}` : null,
    insights.recoveryRecommendation ? `- Recovery note: ${insights.recoveryRecommendation}` : null,
  ].filter(Boolean);
  return lines;
}

export function buildActivityMarkdown(activity, insights) {
  const metric = activityMetric(activity.type, activity.sportType, activity.distance);
  const distance = metric === 'swim'
    ? `${Math.round(Number(activity.distance) || 0)} m`
    : metric === 'distance'
      ? formatDistance(activity.distance)
      : null;
  const weatherTemp = activity.weather?.temp ?? activity.weather?.temperature;

  const numbers = table([
    row('Distance', distance),
    row('Moving time', formatDuration(activity.movingTime)),
    row('Elapsed time', activity.elapsedTime && activity.elapsedTime !== activity.movingTime
      ? formatDuration(activity.elapsedTime)
      : null),
    row('Pace', metric !== 'duration' ? formatPace(activity.avgSpeed) : null),
    row('Elevation', activity.elevationGain != null ? `${Math.round(Number(activity.elevationGain))} m` : null),
    row('Avg HR', activity.avgHeartrate != null ? `${Math.round(Number(activity.avgHeartrate))} bpm` : null),
    row('Max HR', activity.maxHeartrate != null ? `${Math.round(Number(activity.maxHeartrate))} bpm` : null),
    row('Avg cadence', activity.avgCadence != null ? `${Math.round(Number(activity.avgCadence))} spm` : null),
    row('Avg power', activity.avgPower != null ? `${Math.round(Number(activity.avgPower))} W` : null),
    row('Calories', activity.calories != null ? `${Math.round(Number(activity.calories))} kcal` : null),
    row('Temperature', weatherTemp != null ? `${weatherTemp} °C` : null),
  ]);

  const sessionRead = insightLines(insights);
  const splits = splitsTable(activity.splits);
  return [
    '# Coach review request',
    '',
    'Please review this endurance session as an experienced coach. Be specific and practical. Cover:',
    '',
    '1. What went well',
    '2. What to work on (pacing, effort, load)',
    '3. Technique notes if the data supports them',
    '4. Recovery advice',
    '5. A suggested next session',
    '',
    'Do not invent numbers that are not listed below. Keep the review concise.',
    '',
    '---',
    '',
    '## Session',
    '',
    `- **Name:** ${activity.name || 'Untitled activity'}`,
    `- **When:** ${formatDateTime(activity.startDateLocal || activity.startDate) || formatDate(activity.startDate)}`,
    `- **Sport:** ${activity.sportType || activity.type}`,
    activity.source ? `- **Source:** ${activity.source}` : null,
    '',
    '## Numbers',
    '',
    numbers,
    sessionRead.length ? ['', '## Session read', '', ...sessionRead].join('\n') : null,
    activity.description ? ['', '## Athlete notes', '', activity.description.trim()].join('\n') : null,
    splits ? ['', '## Splits', '', splits].join('\n') : null,
    '',
  ].filter((block) => block != null).join('\n').trim() + '\n';
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }
}
