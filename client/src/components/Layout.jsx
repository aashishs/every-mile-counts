import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAppAdminAccount, isClubOnlyAccount } from '../utils/roles';
import { VersionBadge } from './Badge';
import { isBeta } from '../utils/appVersion';

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

const athleteTabs = [
  { to: '/dashboard', label: 'Home', icon: '📊' },
  { to: '/activities', label: 'Log', icon: '⚡' },
  { to: '/analysis', label: 'Stats', icon: '📈' },
  { to: '/events', label: 'Events', icon: '📅' },
];

function pathActive(pathname, to) {
  if (to === '/dashboard') return pathname === '/dashboard';
  if (to === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/');
  if (to === '/clubs') return pathname === '/clubs' || pathname.startsWith('/clubs/');
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const membership = user.membership;
  const expiring = membership?.status === 'expiring_soon';
  const clubOnly = isClubOnlyAccount(user);
  const appAdmin = isAppAdminAccount(user);
  const isAthlete = !appAdmin && (user?.roles?.includes('athlete'));
  const isCoachUser = !appAdmin && (user?.roles?.includes('coach'));
  const clubHome = !appAdmin && (clubOnly || (user?.roles?.includes('club_admin') && !isAthlete));
  const adminTabs = [
    { to: '/admin', label: 'Admin', icon: '🛡️' },
    { to: '/support', label: 'Support', icon: '💬' },
    { to: '/profile', label: 'Profile', icon: '👤' },
  ];
  const tabs = appAdmin
    ? adminTabs
    : clubHome
      ? [
          { to: '/clubs', label: 'Club', icon: '🏅' },
          ...(isCoachUser ? [{ to: '/coaches', label: 'Coach', icon: '👥' }] : [{ to: '/notifications', label: 'Alerts', icon: '🔔' }]),
          { to: '/profile', label: 'Profile', icon: '👤' },
          { to: '/support', label: 'Help', icon: '💬' },
        ]
      : athleteTabs;

  const links = appAdmin
    ? adminTabs
    : [
        ...(isAthlete && !clubOnly ? athleteLinks : []),
        ...(isCoachUser && !clubOnly ? [{ to: '/coaches', label: 'Coaching', icon: '👥' }] : []),
        ...(clubOnly ? [{ to: '/clubs', label: 'Club', icon: '🏅' }] : []),
        ...sharedLinks.filter((l) => !(clubOnly && l.to === '/clubs')),
      ];

  const tabHit = tabs.some((t) => pathActive(location.pathname, t.to));

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  const nav = (
    <>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span className="text-lg leading-none w-6 text-center">{l.icon}</span>
          {l.label}
        </NavLink>
      ))}
    </>
  );

  const brand = (
    <div className="flex items-center gap-2 min-w-0">
      <img src="/logo.svg" alt="" className="w-9 h-9 rounded-xl shrink-0" />
      <span className="font-bold leading-tight truncate">
        Every <span className="text-brand">Mile</span> Counts
      </span>
      {isBeta && <VersionBadge className="shrink-0" />}
    </div>
  );

  const account = (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-brand grid place-items-center font-bold shrink-0">{initials}</div>
      <div className="min-w-0">
        <div className="font-semibold text-sm truncate">
          {user.firstName} {user.lastName}
        </div>
        <div className="flex flex-wrap items-center gap-1 mt-0.5">
          <span className="text-xs text-muted truncate">
            {appAdmin ? 'App admin' : clubOnly ? 'Club admin' : user.roles?.join(' · ')}
          </span>
          <VersionBadge />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-card/80 border-r border-white/5 p-6 sticky top-0 h-screen backdrop-blur">
        <div className="flex items-center gap-3 pb-6 mb-4 border-b border-line">
          <img src="/logo.svg" alt="" className="w-11 h-11 rounded-2xl shrink-0" />
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight">
              Every <span className="text-brand">Mile</span> Counts
            </h1>
            {isBeta && <div className="mt-1"><VersionBadge /></div>}
          </div>
        </div>
        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">{nav}</nav>
        <div className="pt-4 border-t border-line mt-4">
          <div className="mb-3">{account}</div>
          <button className="btn-outline btn-sm w-full" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className={`md:hidden sticky top-0 z-50 items-center gap-3 px-3 py-2.5 border-b border-white/5 bg-[#0b1118]/80 backdrop-blur-md safe-top ${open ? 'hidden' : 'flex'}`}>
          <button
            type="button"
            className="grid place-items-center w-11 h-11 rounded-xl border border-line text-slate-100"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Hamburger open={open} />
          </button>
          <div className="min-w-0 flex-1">{brand}</div>
          <NavLink
            to="/profile"
            className="w-9 h-9 rounded-full bg-brand grid place-items-center text-xs font-bold shrink-0 no-underline text-white"
            aria-label="Profile"
          >
            {initials}
          </NavLink>
        </header>

        <div className={`md:hidden fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`}>
          <button
            type="button"
            aria-label="Close menu"
            className={`absolute inset-0 bg-black/60 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setOpen(false)}
          />
          <aside
            className={`absolute top-0 left-0 h-full w-[min(19rem,88vw)] bg-card border-r border-line flex flex-col shadow-card transition-transform duration-200 ease-out ${
              open ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-line safe-top">
              {brand}
              <button
                type="button"
                className="grid place-items-center w-10 h-10 rounded-xl border border-line"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <Hamburger open />
              </button>
            </div>
            <nav className="flex flex-col gap-1 flex-1 overflow-y-auto p-3">{nav}</nav>
            <div className="p-4 border-t border-line safe-bottom">
              <div className="mb-3">{account}</div>
              <button className="btn-outline btn-sm w-full" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </aside>
        </div>

        <main className="p-4 md:p-8 max-w-6xl pb-24 md:pb-8">
          {expiring && !appAdmin && (
            <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 text-orange-200 px-4 py-3 text-sm">
              Membership expiring soon
              {membership.expiresAt ? ` on ${new Date(membership.expiresAt).toLocaleDateString()}` : ''}.
            </div>
          )}
          {children}
        </main>

        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0b1118]/90 backdrop-blur-md border-t border-white/5 safe-bottom">
          <div className={`grid ${appAdmin ? 'grid-cols-3' : clubHome ? 'grid-cols-4' : 'grid-cols-5'}`}>
            {tabs.map((tab) => {
              const active = pathActive(location.pathname, tab.to);
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={`tab-item ${active ? 'active' : ''}`}
                >
                  <span className="tab-icon">{tab.icon}</span>
                  {tab.label}
                </NavLink>
              );
            })}
            {!clubHome && !appAdmin && (
              <button
                type="button"
                className={`tab-item ${open || !tabHit ? 'active' : ''}`}
                onClick={() => setOpen(true)}
              >
                <span className="tab-icon">☰</span>
                More
              </button>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}

function Hamburger({ open }) {
  return (
    <span className="relative block w-4 h-3.5" aria-hidden>
      <span className={`absolute left-0 h-0.5 w-4 rounded bg-current transition-all ${open ? 'top-1.5 rotate-45' : 'top-0'}`} />
      <span className={`absolute left-0 top-1.5 h-0.5 w-4 rounded bg-current transition-opacity ${open ? 'opacity-0' : 'opacity-100'}`} />
      <span className={`absolute left-0 h-0.5 w-4 rounded bg-current transition-all ${open ? 'top-1.5 -rotate-45' : 'top-3'}`} />
    </span>
  );
}
