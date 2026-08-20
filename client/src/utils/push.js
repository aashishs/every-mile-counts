import api from '../api/client';
import { isClubOnlyAccount, isStaffAccount } from './roles';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerPush(user) {
  if (!user) return;
  if (user.roles?.includes('app_admin') || isStaffAccount(user) || isClubOnlyAccount(user)) return;
  if (user.notificationPrefs?.push === false) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

  try {
    const { data } = await api.get('/push/vapid-public-key');
    if (!data?.key) return;
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'default') {
      if (localStorage.getItem('emc-push-asked')) return;
      localStorage.setItem('emc-push-asked', '1');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      });
    }
    await api.post('/push/subscribe', sub.toJSON());
  } catch {
    // Push is optional; ignore unsupported browsers or missing VAPID keys.
  }
}
