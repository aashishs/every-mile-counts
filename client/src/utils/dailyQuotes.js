const QUOTES = [
  'Show up. The miles take care of the rest.',
  'Easy days make the hard days possible.',
  'One honest session beats a perfect plan you skip.',
  'Stack small days. That is how fitness arrives.',
  'You do not need to feel ready. You need to start.',
  'Consistency is the workout you repeat when nobody is watching.',
  'Leave a little in the tank. Tomorrow still counts.',
  'Pace is a choice. Effort is the truth.',
  'The body adapts to what you do again, not what you do once.',
  'Rest is training. Treat it like a session.',
  'Hills do not get shorter. You get stronger.',
  'Keep the long game longer than the bad day.',
  'A quiet kilometre still moves the needle.',
  'Train the athlete you will need on race day.',
  'Finish with pride, not with nothing left for tomorrow.',
  'The work you did last month is racing with you today.',
  'Slow is not lazy when slow is the point.',
  'You cannot out-supplement a skipped week.',
  'Weather is a detail. The habit is the plan.',
  'Make the next 20 minutes count. Then the next.',
  'Strong is built on days that look ordinary.',
  'Do not chase yesterday. Run the day in front of you.',
  'If it is on the calendar, it is a promise to yourself.',
  'Every mile counts. Especially the ones that felt small.',
  'Recovery is how the session becomes fitness.',
  'You are not late. You are here.',
  'Let the warm-up be boring. Let the work be honest.',
  'A ride, a run, a walk — showing up is the standard.',
  'Keep the ego off the easy days.',
  'The scoreboard is weeks, not one workout.',
  'Fuel the work. Then do the work.',
  'Your future race pace is hiding in today’s discipline.',
  'When it feels flat, keep the form. The spark returns.',
  'Train. Race. Repeat.',
];

function hash(text) {
  let value = 0;
  for (const ch of String(text)) {
    value = (value * 31 + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(value);
}

export function quoteForDay(userId, ymd) {
  if (!QUOTES.length) return '';
  const index = hash(`${userId || 'emc'}:${ymd || ''}`) % QUOTES.length;
  return QUOTES[index];
}

export function checkinStorageKey(userId, ymd) {
  return `emc-checkin:${userId || 'user'}:${ymd}`;
}

export function hasSeenCheckin(userId, ymd) {
  try {
    return localStorage.getItem(checkinStorageKey(userId, ymd)) === '1';
  } catch {
    return false;
  }
}

export function markCheckinSeen(userId, ymd) {
  try {
    localStorage.setItem(checkinStorageKey(userId, ymd), '1');
  } catch {
    /* ignore */
  }
}

export { QUOTES };
