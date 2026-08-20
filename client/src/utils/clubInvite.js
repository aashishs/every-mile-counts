const KEY = 'emc_club_invite';

export function saveClubInvite({ clubId, role, code }) {
  if (!clubId || !code) return;
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      clubId,
      role: role === 'coach' ? 'coach' : 'athlete',
      code,
    })
  );
}

export function pendingClubInvite() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!parsed?.clubId || !parsed?.code) return null;
    return {
      clubId: parsed.clubId,
      role: parsed.role === 'coach' ? 'coach' : 'athlete',
      code: parsed.code,
    };
  } catch {
    return null;
  }
}

export function clearClubInvite() {
  sessionStorage.removeItem(KEY);
}

export function clubJoinPath({ clubId, role, code }) {
  const params = new URLSearchParams({
    club: clubId,
    role: role === 'coach' ? 'coach' : 'athlete',
    code,
  });
  return `/join?${params.toString()}`;
}

export function readClubInviteFromSearch(searchParams) {
  const clubId = searchParams.get('club');
  const code = searchParams.get('code');
  if (!clubId || !code) return null;
  return {
    clubId,
    role: searchParams.get('role') === 'coach' ? 'coach' : 'athlete',
    code,
  };
}
