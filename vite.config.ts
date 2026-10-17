import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: { host: true }, // reachable from a phone on the same Wi-Fi
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/pwa.ts
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'textures/*', 'sounds/*', 'fonts/*'],
      manifest: {
        name: 'Stitch Four',
        short_name: 'Stitch Four',
        description: 'Connect Four, embroidered. Play the computer, a friend, or online.',
        theme_color: '#f3f1eb',
        background_color: '#f3f1eb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,mp3,m4a,ogg}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/parties\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
