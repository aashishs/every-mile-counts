import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'logo.svg',
        'logo-mark.svg',
        'logo.png',
        'apple-touch-icon.png',
        'pwa-192.png',
        'pwa-512.png',
        'pwa-192-maskable.png',
        'pwa-512-maskable.png',
        'push-handler.js',
      ],
      manifest: {
        id: '/',
        name: 'EveryMileCounts',
        short_name: 'EveryMileCounts',
        description: 'Endurance app for athletes, coaches, and clubs. Sync Strava, track training, and get coached.',
        theme_color: '#0d9488',
        background_color: '#0f1419',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['sports', 'health', 'fitness'],
        prefer_related_applications: false,
        icons: [
          { src: '/pwa-192.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-192-maskable.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-512-maskable.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ['push-handler.js'],
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            options: {
              cacheName: 'emc-api',
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'tile.openstreetmap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'emc-osm-tiles',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
