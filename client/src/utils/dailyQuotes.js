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

const MOTIVATE_QUOTES = [
  'The session you skip today is the one you wish you had tomorrow.',
  'You do not need a perfect window. You need twenty honest minutes.',
  'Start easy. Starting is the whole battle.',
  'Lace up before the excuses finish the sentence.',
  'Fitness is built on the days you almost did not go.',
  'A short run still counts. Zero does not.',
  'The door is the hardest kilometre. After that, you are already training.',
  'Do not wait to feel motivated. Movement is what creates it.',
  'Today is still open. Put something on it.',
  'Missed mornings are not a full day lost. Go now.',
  'Your future self is watching this choice.',
  'One easy session beats another blank square on the calendar.',
  'You have shown up before. Show up again.',
  'Make today count. Every mile counts.',
  'If it is messy, go anyway. Messy miles still add up.',
];

function hash(text) {
  let value = 0;
  for (const ch of String(text)) {
    value = (value * 31 + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(value);
}

export function quoteForDay(userId, ymd, kind = 'done') {
  const pool = kind === 'motivate' ? MOTIVATE_QUOTES : QUOTES;
  if (!pool.length) return '';
  const index = hash(`${kind}:${userId || 'emc'}:${ymd || ''}`) % pool.length;
  return pool[index];
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

export { QUOTES, MOTIVATE_QUOTES };
