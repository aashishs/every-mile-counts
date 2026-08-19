export const APP_STAGE = String(import.meta.env.VITE_APP_STAGE || 'beta').toLowerCase();
export const isBeta = APP_STAGE !== 'live' && APP_STAGE !== 'production';
export const versionLabel = isBeta ? 'Beta' : String(import.meta.env.VITE_APP_VERSION || '1.0');
