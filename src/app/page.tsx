'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from '@/components/itam/sidebar'
import { Footer } from '@/components/itam/footer'
import { GlobalSearch } from '@/components/itam/global-search'
import { TopBarClock } from '@/components/itam/top-bar-clock'
import { RealtimeProvider } from '@/hooks/use-realtime-updates'
import { PwaInstallButton } from '@/components/itam/pwa-registration'
import { QrScannerDialog } from '@/components/itam/qr-scanner'
import { useAppStore } from '@/store/app-store'
import {
  useAuthStore,
  hydrateAuthFromStorage,
} from '@/store/auth-store'
import { Loader2 } from 'lucide-react'
import { DemoBanner } from '@/components/itam/demo-banner'

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
// Unified dashboard — merges the legacy DashboardPage into ItamDashboard.
// 'dashboard' and 'itam' both render this single component (itam kept as
// backward-compat alias for any deep links / bookmarks).
const ItamDashboard = dynamic(() =>
  import('@/components/itam/itam-dashboard').then((m) => m.ItamDashboard),
)
const ItamDevices = dynamic(() =>
  import('@/components/itam/itam-devices').then((m) => m.ItamDevices),
)
const ItamMeterUnified = dynamic(() =>
  import('@/components/itam/itam-meter-unified').then((m) => m.ItamMeterUnified),
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
const SnapshotViewer = dynamic(() =>
  import('@/components/itam/snapshot-viewer').then((m) => m.SnapshotViewer),
)
const ItamRepairs = dynamic(() =>
  import('@/components/itam/itam-repairs').then((m) => m.ItamRepairs),
)
const ItamWorkOrders = dynamic(() =>
  import('@/components/itam/itam-work-orders').then((m) => m.ItamWorkOrders),
)
const ItamStock = dynamic(() =>
  import('@/components/itam/itam-stock').then((m) => m.ItamStock),
)
// ── Additional pages restored from feat branch (were missing from main) ──
const ImportPage = dynamic(() =>
  import('@/components/itam/import-page').then((m) => m.ImportPage),
)
const TemplatesPage = dynamic(() =>
  import('@/components/itam/templates-page').then((m) => m.TemplatesPage),
)
const MonthlyReport = dynamic(() =>
  import('@/components/itam/monthly-report').then((m) => m.MonthlyReport),
)
const ReportsHub = dynamic(() =>
  import('@/components/itam/reports-hub').then((m) => m.ReportsHub),
)
const MobileShell = dynamic(() =>
  import('@/components/itam/mobile').then((m) => m.MobileShell),
)
const SettingsPageV2 = dynamic(() =>
  import('@/components/itam/settings-page-v2').then((m) => m.SettingsPageV2),
)
const WorkOrdersPage = dynamic(() =>
  import('@/components/itam/work-orders-page').then((m) => m.WorkOrdersPage),
)
const StockPage = dynamic(() =>
  import('@/components/itam/stock-page').then((m) => m.StockPage),
)
const DevicesPage = dynamic(() =>
  import('@/components/itam/devices-page').then((m) => m.DevicesPage),
)
const MeterPage = dynamic(() =>
  import('@/components/itam/meter-page').then((m) => m.MeterPage),
)
const PaperAnalyticsPage = dynamic(() =>
  import('@/components/itam/paper-analytics-page').then((m) => m.PaperAnalyticsPage),
)
// ── Auth pages (from email links: ?token={token}) ──
const AuthRegisterPage = dynamic(() =>
  import('@/components/itam/auth-register-page').then((m) => m.AuthRegisterPage),
)
const AuthResetPage = dynamic(() =>
  import('@/components/itam/auth-reset-page').then((m) => m.AuthResetPage),
)

export default function Home() {
  const activePage = useAppStore((s) => s.activePage)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isBooting = useAuthStore((s) => s.isBooting)
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const [bootDone, setBootDone] = React.useState(false)

  // ── Detect ?token= from email links (register/reset) ──
  // When present, we render the appropriate auth page directly (bypassing
  // the normal auth check) so the user can complete registration or
  // password reset without being redirected to login first.
  const [authToken, setAuthToken] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (!t) return
    const task = window.setTimeout(() => setAuthToken(t), 0)
    return () => window.clearTimeout(task)
  }, [])

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
      // ── Match any authenticated ITAM API call ──
      // Includes /api/master, /api/sites, /api/meter, /api/cycles,
      // /api/reports, /api/notifications, /api/audit, /api/settings
      // so that legacy `fetch()` calls without explicit authHeaders() also
      // get the Bearer token attached.
      const isAuthUrl =
        url.includes('/api/itam/') ||
        url.includes('/api/v1/') ||
        url.includes('/api/work-orders') ||
        url.includes('/api/devices') ||
        url.includes('/api/stock-items') ||
        url.includes('/api/dashboard') ||
        url.includes('/api/sync/preview') ||
        url.includes('/api/master') ||
        url.includes('/api/sites') ||
        url.includes('/api/meter') ||
        url.includes('/api/cycles') ||
        url.includes('/api/reports') ||
        url.includes('/api/notifications') ||
        url.includes('/api/audit') ||
        url.includes('/api/settings') ||
        url.includes('/api/search') ||
        url.includes('/api/health')
      const isLoginUrl = url.includes('/api/itam/auth/login')
      if (isAuthUrl && !isLoginUrl) {
        const token = useAuthStore.getState().token
        if (token) {
          const headers = new Headers(init?.headers || {})
          // Only add Authorization if not already present (avoid double-setting)
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`)
          }
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

  // ── If URL has ?token=xxx → render the appropriate auth page ──
  // This takes priority over both "not authenticated" (login) and
  // "authenticated" (app shell) — the user clicked an email link and
  // should land on the register/reset form, not be redirected away.
  if (authToken) {
    return <TokenRouter token={authToken} />
  }

  // Not authenticated → show login
  if (!isAuthenticated) {
    return <ItamLogin />
  }

  // Authenticated → show app shell.
  //
  // Layout strategy (Issue 5): the whole app fits in one viewport.
  // - Outer wrapper: `h-screen overflow-hidden` — clips at viewport height
  // - Inner content wrapper: `flex-1 flex flex-col overflow-hidden` — column layout
  // - <main>: `flex-1 overflow-y-auto` — page scrolls internally if too tall
  // - <Footer>: `flex-shrink-0` — always pinned at the bottom of the viewport
  //
  // Pages with long content (2,378-row device table) scroll inside <main>;
  // pages with short content fit in one screen without scrolling.
  return (
    <RealtimeProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
        <DemoBanner />
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:ml-14">
          <main className="flex-1 overflow-hidden pt-14 md:pt-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activePage}
                className="h-full"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                {activePage === 'dashboard' && <ItamDashboard />}
                {activePage === 'itam' && <ItamDashboard />}
                {(activePage === 'itam-devices' || activePage === 'devices' || activePage === 'devices-page') && <DevicesPage />}
                {(activePage === 'itam-meter' || activePage === 'meter' || activePage === 'itam-meter-keyboard') && <ItamMeterUnified />}
                {activePage === 'itam-sticker-editor' && <ItamStickerEditor />}
                {activePage === 'itam-document-editor' && <ItamDocumentEditor />}
                {(activePage === 'itam-paper-analytics' || activePage === 'paper-analytics') && <ItamPaperAnalytics />}
                {(activePage === 'itam-settings' || activePage === 'settings') && <ItamSettings />}
                {activePage === 'itam-audit' && <ItamAudit />}
                {activePage === 'itam-snapshot-viewer' && <SnapshotViewer />}
                {activePage === 'itam-repairs' && <ItamRepairs />}
                {activePage === 'itam-work-orders' && <WorkOrdersPage />}
                {activePage === 'itam-stock' && <ItamStock />}
                {/* ── Restored pages (were missing from main) ── */}
                {activePage === 'import' && <ImportPage />}
                {activePage === 'templates' && <TemplatesPage />}
                {activePage === 'monthly-report' && <MonthlyReport />}
                {activePage === 'reports-hub' && <ReportsHub />}
                {activePage === 'mobile' && <MobileShell />}
                {activePage === 'settings-v2' && <SettingsPageV2 />}
                {activePage === 'work-orders' && <WorkOrdersPage />}
                {activePage === 'stock' && <StockPage />}
                {activePage === 'meter-page' && <MeterPage />}
                {activePage === 'paper-analytics-page' && <PaperAnalyticsPage />}
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

// ─── TokenRouter ─────────────────────────────────────────────────────
// Fetches the token type from /api/auth/verify-token and renders either
// AuthRegisterPage (for 'invite'/'register' tokens) or AuthResetPage
// (for 'reset' tokens). Falls back to login on any error.
function TokenRouter({ token }: { token: string }) {
  const [route, setRoute] = React.useState<'register' | 'reset' | 'loading' | 'error'>('loading')

  React.useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch(
          `/api/auth/verify-token?token=${encodeURIComponent(token)}`,
        )
        const j = (await res.json().catch(() => ({}))) as {
          valid?: boolean
          type?: string
        }
        if (cancelled) return
        if (!j.valid) {
          setRoute('error')
          return
        }
        if (j.type === 'reset') {
          setRoute('reset')
        } else if (j.type === 'invite' || j.type === 'register') {
          setRoute('register')
        } else {
          setRoute('error')
        }
      } catch {
        if (!cancelled) setRoute('error')
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [token])

  if (route === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#f97316]" />
          <div className="text-sm text-slate-400">กำลังตรวจสอบลิงก์...</div>
        </div>
      </div>
    )
  }

  if (route === 'register') return <AuthRegisterPage token={token} />
  if (route === 'reset') return <AuthResetPage token={token} />

  // Error → fall back to login (which shows its own error UI)
  // Clear the broken token from the URL first.
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    window.history.replaceState({}, '', url.toString())
  }
  return <ItamLogin />
}
