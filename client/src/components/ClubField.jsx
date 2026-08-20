function clubKey(club) {
  return club?.id || club?.clubId || '';
}

function clubLabel(club) {
  return club?.name || club?.clubName || 'Club';
}

export function coachClubList(raw) {
  return (Array.isArray(raw) ? raw : []).filter((c) => ['coach', 'club_admin'].includes(c.role));
}

export function onlyClubId(clubs) {
  return clubs.length === 1 ? clubKey(clubs[0]) : '';
}

export default function ClubField({ clubs = [], value, onChange, disabled = false, required = true }) {
  const locked = clubs.length === 1;
  if (locked) {
    return (
      <div>
        <label>Club</label>
        <input value={clubLabel(clubs[0])} readOnly tabIndex={-1} />
      </div>
    );
  }
  return (
    <div>
      <label>Club</label>
      <select
        required={required}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="">Select club</option>
        {clubs.map((club) => (
          <option key={clubKey(club)} value={clubKey(club)}>{clubLabel(club)}</option>
        ))}
      </select>
    </div>
  );
}
