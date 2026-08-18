import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isClubOnlyAccount } from '../utils/roles';

const athleteLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/activities', label: 'Activities', icon: '⚡' },
  { to: '/analysis', label: 'Analysis', icon: '📈' },
  { to: '/events', label: 'Events', icon: '📅' },
  { to: '/goals', label: 'Goals', icon: '🎯' },
];

const sharedLinks = [
  { to: '/clubs', label: 'Clubs', icon: '🏅' },
  { to: '/notifications', label: 'Notifications', icon: '🔔' },
  { to: '/profile', label: 'Profile', icon: '👤' },
  { to: '/support', label: 'Support', icon: '💬' },
];

export default function Layout({ children }) {
  const { user, logout, isAppAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const membership = user.membership;
  const expiring = membership?.status === 'expiring_soon';
  const clubOnly = isClubOnlyAccount(user);

  const links = [
    ...(!clubOnly ? athleteLinks : []),
    ...(!clubOnly ? [{ to: '/coaches', label: 'Coaching', icon: '👥' }] : []),
    ...(clubOnly ? [{ to: '/clubs', label: 'Club', icon: '🏅' }] : []),
    ...sharedLinks.filter((l) => !(clubOnly && l.to === '/clubs')),
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const nav = (
    <>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          onClick={() => setOpen(false)}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span>{l.icon}</span> {l.label}
        </NavLink>
      ))}
      {isAppAdmin && (
        <NavLink to="/admin" onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span>🛡️</span> Admin
        </NavLink>
      )}
    </>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-card border-r border-line p-6 sticky top-0 h-screen">
        <div className="flex items-center gap-3 pb-6 mb-4 border-b border-line">
          <span className="text-2xl">🏃</span>
          <h1 className="text-base font-bold leading-tight">
            Every <span className="text-brand">Mile</span> Counts
          </h1>
        </div>
        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">{nav}</nav>
        <div className="pt-4 border-t border-line mt-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-brand grid place-items-center font-bold">{initials}</div>
            <div>
              <div className="font-semibold text-sm">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-xs text-muted">
                {clubOnly ? 'Club admin' : user.roles?.join(' · ')}
              </div>
            </div>
          </div>
          <button className="btn-outline btn-sm w-full" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-line bg-card sticky top-0 z-20">
          <strong>Every Mile Counts</strong>
          <button className="btn-outline btn-sm" onClick={() => setOpen((v) => !v)}>
            Menu
          </button>
        </header>
        {open && (
          <div className="md:hidden bg-card border-b border-line p-4 flex flex-col gap-1">
            {nav}
            <button className="btn-outline btn-sm mt-2" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        )}
        <main className="p-4 md:p-8 max-w-6xl">
          {expiring && (
            <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 text-orange-200 px-4 py-3 text-sm">
              Membership expiring soon
              {membership.expiresAt ? ` on ${new Date(membership.expiresAt).toLocaleDateString()}` : ''}.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
