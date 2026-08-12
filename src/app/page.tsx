'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from '@/components/itam/sidebar'
import { Footer } from '@/components/itam/footer'
import { GlobalSearch } from '@/components/itam/global-search'
import { RealtimeProvider } from '@/hooks/use-realtime-updates'
import { PwaInstallButton } from '@/components/itam/pwa-registration'
import { QrScannerDialog } from '@/components/itam/qr-scanner'
import { useAppStore } from '@/store/app-store'
import {
  useAuthStore,
  hydrateAuthFromStorage,
} from '@/store/auth-store'
import { Loader2 } from 'lucide-react'

// Capture the native fetch ONCE and store it on globalThis so it survives
// Fast Refresh module re-evaluations. Without this, each Fast Refresh would
// capture the already-patched fetch as "native", creating a chain of nested
// patched-fetches → stack overflow.
const G = globalThis as unknown as {
  __nativeFetch?: typeof fetch
  __itamFetchPatched?: boolean
}

// ── Lazy-load every page component so the initial compile only builds the
//    active page. This drastically reduces peak RAM during first compile
//    (prevents OOM crashes in the sandbox) and also speeds up navigation
//    because each page is compiled on demand and cached.
const ItamLogin = dynamic(() =>
  import('@/components/itam/itam-login').then((m) => m.ItamLogin),
)
const DashboardPage = dynamic(() =>
  import('@/components/itam/dashboard-page').then((m) => m.DashboardPage),
)
const ItamDashboard = dynamic(() =>
  import('@/components/itam/itam-dashboard').then((m) => m.ItamDashboard),
)
const ItamDevices = dynamic(() =>
  import('@/components/itam/itam-devices').then((m) => m.ItamDevices),
)
const ItamMeter = dynamic(() =>
  import('@/components/itam/itam-meter').then((m) => m.ItamMeter),
)
const ItamMeterKeyboard = dynamic(() =>
  import('@/components/itam/itam-meter-keyboard').then((m) => m.ItamMeterKeyboard),
)
const ItamStickerEditor = dynamic(() =>
  import('@/components/itam/itam-sticker-editor').then((m) => m.ItamStickerEditor),
)
const ItamDocumentEditor = dynamic(() =>
  import('@/components/itam/itam-document-editor').then((m) => m.ItamDocumentEditor),
)
const ItamPaperAnalytics = dynamic(() =>
  import('@/components/itam/itam-paper-analytics').then((m) => m.ItamPaperAnalytics),
)
const ItamSettings = dynamic(() =>
  import('@/components/itam/itam-settings').then((m) => m.ItamSettings),
)
const ItamAudit = dynamic(() =>
  import('@/components/itam/itam-audit').then((m) => m.ItamAudit),
)

export default function Home() {
  const activePage = useAppStore((s) => s.activePage)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isBooting = useAuthStore((s) => s.isBooting)
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const [bootDone, setBootDone] = React.useState(false)

  // Boot: hydrate from localStorage then verify token validity with /me
  React.useEffect(() => {
    let cancelled = false
    async function boot() {
      hydrateAuthFromStorage()
      // Only verify if we found a token in storage; otherwise skip the network call
      const hasToken = !!useAuthStore.getState().token
      if (hasToken) {
        await checkAuth()
      } else {
        useAuthStore.setState({ isBooting: false })
      }
      if (!cancelled) setBootDone(true)
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [checkAuth])

  // ── Global fetch interceptor: attach Bearer token to every /api/itam/* call
  //    so the existing components (which use raw `fetch`) don't need rewriting.
  //
  //    CRITICAL: We capture the NATIVE fetch ONCE at module load (not inside the
  //    effect) so that Fast Refresh re-runs of the effect don't create a chain
  //    of patched-fetches calling each other (which causes stack overflow).
  React.useEffect(() => {
    // Capture the true native fetch ONCE — stored on globalThis so it survives
    // Fast Refresh module re-evaluations. Without this guard, each re-eval
    // would capture the already-patched fetch, creating a chain of nested
    // patched-fetches → "Maximum call stack size exceeded".
    if (!G.__nativeFetch) {
      G.__nativeFetch = window.fetch.bind(window)
    }
    const nativeFetch = G.__nativeFetch
    // Don't double-patch: if already patched (e.g. by a previous mount that
    // wasn't cleaned up), just restore to native first.
    if (G.__itamFetchPatched) {
      window.fetch = nativeFetch
      G.__itamFetchPatched = false
    }
    const patchedFetch: typeof window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input as Request).url)
      if (url.includes('/api/itam/') && !url.includes('/api/itam/auth/login')) {
        const token = useAuthStore.getState().token
        if (token) {
          const headers = new Headers(init?.headers || {})
          headers.set('Authorization', `Bearer ${token}`)
          if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
            headers.set('Content-Type', 'application/json')
          }
          return nativeFetch(input, { ...init, headers })
        }
      }
      return nativeFetch(input, init)
    }
    window.fetch = patchedFetch
    G.__itamFetchPatched = true
    return () => {
      window.fetch = nativeFetch
      G.__itamFetchPatched = false
    }
  }, [])

  // Boot screen
  if (!bootDone || isBooting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#f97316]" />
          <div className="text-sm text-slate-400">กำลังตรวจสอบเซสชัน...</div>
        </div>
      </div>
    )
  }

  // Not authenticated → show login
  if (!isAuthenticated) {
    return <ItamLogin />
  }

  // Authenticated → show app shell
  return (
    <RealtimeProvider>
      <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col md:ml-[240px]">
          <main className="flex-1 pt-14 md:pt-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activePage}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                {activePage === 'dashboard' && <DashboardPage />}
                {activePage === 'itam' && <ItamDashboard />}
                {(activePage === 'itam-devices' || activePage === 'devices') && <ItamDevices />}
                {(activePage === 'itam-meter' || activePage === 'meter') && <ItamMeter />}
                {activePage === 'itam-meter-keyboard' && <ItamMeterKeyboard />}
                {activePage === 'itam-sticker-editor' && <ItamStickerEditor />}
                {activePage === 'itam-document-editor' && <ItamDocumentEditor />}
                {(activePage === 'itam-paper-analytics' || activePage === 'paper-analytics') && <ItamPaperAnalytics />}
                {(activePage === 'itam-settings' || activePage === 'settings') && <ItamSettings />}
                {activePage === 'itam-audit' && <ItamAudit />}
              </motion.div>
            </AnimatePresence>
          </main>
          <Footer />
        </div>
        <GlobalSearch />
        {/* QR scanner dialog — singleton, opened from sidebar/devices page */}
        <QrScannerDialog />
        {/* PWA install prompt — floating, only shows when installable */}
        <PwaInstallButton />
      </div>
    </RealtimeProvider>
  )
}
