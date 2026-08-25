import {
  activityMetric,
  effortKind,
  formatDate,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatEffort,
} from './format.js';
import { formatSplitClock, normalizeSplits } from './splits.js';

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

function splitsTable(splits, kind) {
  if (!Array.isArray(splits) || !splits.length) return '';
  const effortHeader = kind === 'speed' ? 'Speed' : 'Pace';
  const rows = splits.slice(0, 50).map((split, i) => {
    const km = split.distance != null ? (Number(split.distance) / 1000).toFixed(2) : i + 1;
    const time = formatSplitTime(split.movingTime || split.moving_time);
    const paceSec = Number(split.pace);
    let effort = '—';
    if (paceSec > 0) {
      if (kind === 'speed') effort = `${(3600 / paceSec).toFixed(1)} km/h`;
      else if (kind === 'swim') effort = `${formatSplitPace(paceSec / 10).replace(' /km', '')} /100m`;
      else if (kind === 'row') effort = `${formatSplitPace(paceSec / 2).replace(' /km', '')} /500m`;
      else effort = formatSplitPace(paceSec);
    }
    const hr = split.hr != null ? Math.round(Number(split.hr)) : '—';
    return `| ${km} | ${time} | ${effort} | ${hr} |`;
  });
  const extra = splits.length > 50 ? `\n\n_${splits.length - 50} more splits omitted._` : '';
  return [`| km | Time | ${effortHeader} | HR |`, '| --- | --- | --- | --- |', ...rows].join('\n') + extra;
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
  const metric = activityMetric(activity.type, activity.sportType);
  const kind = effortKind(activity.type, activity.sportType);
  const distance = metric === 'swim'
    ? `${Math.round(Number(activity.distance) || 0)} m`
    : metric === 'distance'
      ? formatDistance(activity.distance)
      : null;
  const weatherTemp = activity.weather?.temp ?? activity.weather?.temperature;
  const effortLabel = kind === 'speed' ? 'Speed' : kind === 'duration' ? null : 'Pace';

  const numbers = table([
    row('Distance', distance),
    row('Moving time', formatDuration(activity.movingTime)),
    row('Elapsed time', activity.elapsedTime && activity.elapsedTime !== activity.movingTime
      ? formatDuration(activity.elapsedTime)
      : null),
    row(effortLabel, effortLabel ? formatEffort(activity) : null),
    row('Elevation', metric !== 'duration' && Number(activity.elevationGain) > 0
      ? `${Math.round(Number(activity.elevationGain))} m`
      : null),
    row('Avg HR', activity.avgHeartrate != null ? `${Math.round(Number(activity.avgHeartrate))} bpm` : null),
    row('Max HR', activity.maxHeartrate != null ? `${Math.round(Number(activity.maxHeartrate))} bpm` : null),
    row('Avg cadence', metric !== 'duration' && activity.avgCadence != null ? `${Math.round(Number(activity.avgCadence))} ${kind === 'speed' ? 'rpm' : 'spm'}` : null),
    row('Avg power', activity.avgPower != null ? `${Math.round(Number(activity.avgPower))} W` : null),
    row('Calories', activity.calories != null ? `${Math.round(Number(activity.calories))} kcal` : null),
    row('Temperature', weatherTemp != null ? `${weatherTemp} °C` : null),
  ]);

  const sessionRead = insightLines(insights);
  const splits = splitsTable(activity.splits, kind);
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

export function formatKmSplitsLine(splits, type, sportType) {
  const kind = effortKind(type, sportType);
  const rows = normalizeSplits(splits);
  if (!rows.length) return null;
  const parts = rows.slice(0, 50).map((row) => {
    let effort = '—';
    if (kind === 'speed' && row.speedKmh) effort = row.speedKmh.toFixed(1);
    else if (kind === 'swim' && row.paceSec) effort = `${formatSplitClock(row.paceSec / 10)}/100m`;
    else if (row.paceSec) effort = formatSplitClock(row.paceSec);
    const hr = row.hr ? ` (${row.hr})` : '';
    return `${row.kmLabel} ${effort}${hr}`;
  });
  const unit = kind === 'speed' ? ' km/h' : '';
  const extra = rows.length > 50 ? ` · +${rows.length - 50} more` : '';
  return `Per-km${unit}: ${parts.join(' · ')}${extra}`;
}

export function buildComparePrompt(payload) {
  const sessions = payload?.sessions || [];
  const sport = String(payload?.sport || 'session').toLowerCase();
  if (sessions.length < 2) return '';
  const blocks = sessions.map((session, i) => {
    const bits = [
      session.formatted?.distance,
      session.formatted?.time,
      session.formatted?.pace,
      session.avgHeartrate ? `HR ${Math.round(session.avgHeartrate)}` : null,
      session.maxHeartrate ? `max ${Math.round(session.maxHeartrate)}` : null,
      session.formatted?.elevation && session.formatted.elevation !== '—'
        ? `${session.formatted.elevation} climb`
        : null,
    ].filter(Boolean);
    const km = formatKmSplitsLine(session.splits, session.type, session.sportType || session.sport)
      || 'Per-km: not available';
    return [
      `${i + 1}. ${session.name || 'Session'} — ${formatDate(session.startDate)}`,
      bits.join(' · '),
      km,
    ].join('\n');
  });
  return [
    `Compare these ${sessions.length} ${sport}s. What improved, what didn't, and one next-session cue. Use only these numbers, including per-km splits.`,
    '',
    ...blocks,
    '',
  ].join('\n');
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
