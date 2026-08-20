import { Link } from 'react-router-dom';
import { PoweredByStrava } from '../components/StravaBrand';

export default function Privacy() {
  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-ink to-slate-900">
      <div className="max-w-2xl mx-auto card p-6 md:p-8">
        <Link to="/login" className="text-sm text-brand no-underline">Every Mile Counts</Link>
        <h1 className="page-title mt-3">Privacy</h1>
        <p className="page-sub">How Every Mile Counts uses training data, including data imported from Strava.</p>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="section-title">Who we are</h2>
          <p className="text-muted mb-0">
            Every Mile Counts is a coaching and club training app. It is not an official Strava product and is not endorsed by Strava.
          </p>

          <h2 className="section-title">What we collect from Strava</h2>
          <p className="text-muted mb-0">
            If you choose Connect with Strava, we import activity data you authorize: session name, sport, date, distance, time,
            pace or speed, heart rate, elevation, and route when available. We do this so you can keep a training log, see stats,
            and (only if you opt in) let assigned coaches review those sessions.
          </p>

          <h2 className="section-title">Coach sharing</h2>
          <p className="text-muted mb-0">
            Strava-imported activities stay private to you unless you explicitly allow assigned coaches to view them. You can turn
            that permission on or off in Profile → Strava at any time.
          </p>

          <h2 className="section-title">How to withdraw consent</h2>
          <p className="text-muted mb-0">
            Disconnect Strava in Profile → Strava. That revokes Every Mile Counts’ access and removes Strava-imported activities
            from this app. You can also revoke access from your Strava settings. Manual or file-imported sessions are not deleted.
          </p>

          <h2 className="section-title">How to request deletion</h2>
          <p className="text-muted mb-0">
            Disconnect as above, or contact us from Support in the app. We will delete Strava-imported activity data tied to your account.
          </p>

          <h2 className="section-title">Strava’s terms</h2>
          <p className="text-muted mb-0">
            Use of Strava data is also subject to the{' '}
            <a href="https://www.strava.com/legal/privacy" target="_blank" rel="noreferrer">Strava Privacy Policy</a>
            {' '}and{' '}
            <a href="https://www.strava.com/legal/api" target="_blank" rel="noreferrer">Strava API Agreement</a>.
            If those conflict with this page, Strava’s policy controls for Strava data.
          </p>
        </section>

        <div className="mt-8">
          <PoweredByStrava />
        </div>
      </div>
    </div>
  );
}
