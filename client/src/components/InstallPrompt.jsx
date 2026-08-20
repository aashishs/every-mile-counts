import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const DISMISS_KEY = 'emc-install-dismissed';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || window.navigator.standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InstallPrompt() {
  const location = useLocation();
  const [deferred, setDeferred] = useState(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1' || isStandalone();
    } catch {
      return isStandalone();
    }
  });

  useEffect(() => {
    if (isStandalone()) {
      setHidden(true);
      return undefined;
    }
    const onPrompt = (event) => {
      event.preventDefault();
      setDeferred(event);
      setIosHint(false);
    };
    const onInstalled = () => {
      setDeferred(null);
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (isIos() && !isStandalone()) setIosHint(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden || (!deferred && !iosHint)) return null;

  const publicPage = ['/login', '/register', '/forgot-password', '/reset-password', '/join'].includes(location.pathname);
  const bottom = publicPage ? 'bottom-4' : 'bottom-20 md:bottom-4';

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    setDeferred(null);
    if (choice?.outcome === 'accepted') setHidden(true);
  };

  return (
    <div className={`fixed inset-x-3 ${bottom} z-[55] max-w-lg mx-auto`}>
      <div className="card flex items-start gap-3 shadow-card py-3 px-4">
        <img src="/pwa-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">Install Every Mile Counts</div>
          <p className="text-xs text-muted mt-0.5 mb-0">
            {deferred
              ? 'Add it to your app list for quicker access, like a native app.'
              : 'On iPhone, tap Share, then Add to Home Screen.'}
          </p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {deferred && (
            <button type="button" className="btn-primary btn-sm" onClick={install}>
              Install
            </button>
          )}
          <button type="button" className="btn-outline btn-sm" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
