export const GROUP_SESSION_SPORTS = ['run', 'ride', 'swim', 'walk', 'other'];
export const GROUP_SESSION_RSVP = ['going', 'maybe', 'not_going'];

export function sportLabel(sport) {
  const map = { run: 'Run', ride: 'Ride', swim: 'Swim', walk: 'Walk', other: 'Other' };
  return map[String(sport || '').toLowerCase()] || 'Session';
}

export function rsvpLabel(status) {
  if (status === 'going') return 'In';
  if (status === 'maybe') return 'Maybe';
  if (status === 'not_going') return "Can't";
  return '';
}

export function summarizeRsvps(rows = [], userId) {
  const going = [];
  const maybe = [];
  const notGoing = [];
  let myRsvp = null;
  for (const row of rows) {
    const person = {
      userId: row.userId || row.user_id,
      firstName: row.firstName || row.first_name || '',
      lastName: row.lastName || row.last_name || '',
    };
    if (row.status === 'going') going.push(person);
    else if (row.status === 'maybe') maybe.push(person);
    else if (row.status === 'not_going') notGoing.push(person);
    if (userId && person.userId === userId) myRsvp = row.status;
  }
  return {
    myRsvp,
    going,
    maybe,
    notGoing,
    counts: {
      going: going.length,
      maybe: maybe.length,
      notGoing: notGoing.length,
    },
  };
}

export function clockTime(value) {
  if (!value) return null;
  return String(value).slice(0, 5);
}
