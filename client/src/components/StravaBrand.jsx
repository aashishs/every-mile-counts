/** Official Connect / Powered by files live in /public/strava. Replace placeholders with the Strava brand kit before API review. */
export function stravaActivityUrl(activity) {
  const source = String(activity?.source || '').toLowerCase();
  if (source !== 'strava') return null;
  const id = activity?.sourceActivityId || activity?.source_activity_id || activity?.raw?.id;
  if (id == null || id === '') return null;
  const key = String(id);
  if (key.startsWith('manual-') || key.startsWith('file-')) return null;
  return `https://www.strava.com/activities/${encodeURIComponent(key)}`;
}

export function ViewOnStrava({ activity, className = '' }) {
  const href = stravaActivityUrl(activity);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`strava-view-link ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      View on Strava
    </a>
  );
}

export function PoweredByStrava({ className = '' }) {
  return (
    <a
      href="https://www.strava.com"
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center no-underline ${className}`}
      aria-label="Powered by Strava"
    >
      <img src="/strava/powered-by-strava.svg" alt="Powered by Strava" height={28} className="h-7 w-auto" />
    </a>
  );
}

export function ConnectWithStravaButton({ onClick, disabled, busy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="bg-transparent border-0 p-0 leading-none disabled:opacity-50"
      aria-label="Connect with Strava"
    >
      <img
        src="/strava/btn-connect-with-strava.svg"
        alt="Connect with Strava"
        width={248}
        height={48}
        className="h-12 w-auto"
      />
    </button>
  );
}
