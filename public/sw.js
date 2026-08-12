// ITAM Service Worker — basic offline cache for the app shell + GET API responses.
//
// Strategy:
//   • Pre-cache the app shell (manifest, icons) on install.
//   • Runtime caching: GET /api/itam/* → stale-while-revalidate (network-first
//     with cache fallback so the user can read data offline).
//   • Navigation requests → network-first, fallback to cached "/".
//   • Never cache POST/PUT/DELETE — those need the live server.
//
// Versioned cache name so a bump in CACHE_VERSION invalidates old caches.

const CACHE_VERSION = 'v1'
const SHELL_CACHE = `itam-shell-${CACHE_VERSION}`
const API_CACHE = `itam-api-${CACHE_VERSION}`

const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
  '/logo.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // Use addAll but tolerate individual failures (one bad asset shouldn't
      // abort the install).
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null),
        ),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Only handle GET — never intercept mutations.
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Skip cross-origin requests (e.g. fonts from Google).
  if (url.origin !== self.location.origin) return

  // Skip Next.js dev/HMR endpoints.
  if (url.pathname.startsWith('/_next/webpack-hmr')) return

  // Navigation requests → network-first, fallback to cached "/".
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          const cache = await caches.open(SHELL_CACHE)
          cache.put('/', fresh.clone()).catch(() => null)
          return fresh
        } catch {
          const cache = await caches.open(SHELL_CACHE)
          const cached = (await cache.match('/')) || (await cache.match(req))
          if (cached) return cached
          return new Response('ออฟไลน์ — ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }
      })(),
    )
    return
  }

  // API GET requests → stale-while-revalidate (read offline, refresh in bg).
  if (url.pathname.startsWith('/api/itam/') && !url.pathname.startsWith('/api/itam/events')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE)
        const cached = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            // Only cache successful responses (skip 401/403/500).
            if (res && res.ok && res.status === 200) {
              cache.put(req, res.clone()).catch(() => null)
            }
            return res
          })
          .catch(() => null)
        // Return cached immediately if available; otherwise wait for network.
        if (cached) {
          // Refresh in background — don't await.
          network.catch(() => null)
          return cached
        }
        const fresh = await network
        if (fresh) return fresh
        return new Response(
          JSON.stringify({ error: 'offline', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        )
      })(),
    )
    return
  }

  // Static assets (icons, manifest, _next/static) → cache-first.
  if (
    url.pathname.startsWith('/_next/static') ||
    SHELL_ASSETS.includes(url.pathname) ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE)
        const cached = await cache.match(req)
        if (cached) return cached
        try {
          const fresh = await fetch(req)
          if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => null)
          return fresh
        } catch {
          return new Response('', { status: 504 })
        }
      })(),
    )
  }
})

// Allow the page to trigger an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
