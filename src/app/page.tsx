'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from '@/components/itam/sidebar'
import { Footer } from '@/components/itam/footer'
import { GlobalSearch } from '@/components/itam/global-search'
import { DashboardPage } from '@/components/itam/dashboard-page'
import { DevicesPage } from '@/components/itam/devices-page'
import { MeterPage } from '@/components/itam/meter-page'
import { PaperAnalyticsPage } from '@/components/itam/paper-analytics-page'
import { SettingsPage } from '@/components/itam/settings-page'
import { ItamDashboard } from '@/components/itam/itam-dashboard'
import { ItamDevices } from '@/components/itam/itam-devices'
import { ItamMeter } from '@/components/itam/itam-meter'
import { ItamMeterKeyboard } from '@/components/itam/itam-meter-keyboard'
import { ItamStickerEditor } from '@/components/itam/itam-sticker-editor'
import { ItamDocumentEditor } from '@/components/itam/itam-document-editor'
import { ItamSettings } from '@/components/itam/itam-settings'
import { ItamAudit } from '@/components/itam/itam-audit'
import { ItamLogin } from '@/components/itam/itam-login'
import { ItamPaperAnalytics } from '@/components/itam/itam-paper-analytics'
import { RealtimeProvider } from '@/hooks/use-realtime-updates'
import { PwaInstallButton } from '@/components/itam/pwa-registration'
import { QrScannerDialog } from '@/components/itam/qr-scanner'
import { useAppStore } from '@/store/app-store'
import {
  useAuthStore,
  hydrateAuthFromStorage,
  authFetch,
} from '@/store/auth-store'
import { Loader2 } from 'lucide-react'

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
  React.useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    const patchedFetch: typeof window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input as Request).url)
      if (url.includes('/api/itam/') && !url.includes('/api/itam/auth/login')) {
        return authFetch(input, init)
      }
      return originalFetch(input, init)
    }
    window.fetch = patchedFetch
    return () => {
      window.fetch = originalFetch
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
                {activePage === 'itam-devices' && <ItamDevices />}
                {activePage === 'itam-meter' && <ItamMeter />}
                {activePage === 'itam-meter-keyboard' && <ItamMeterKeyboard />}
                {activePage === 'itam-sticker-editor' && <ItamStickerEditor />}
                {activePage === 'itam-document-editor' && <ItamDocumentEditor />}
                {activePage === 'itam-paper-analytics' && <ItamPaperAnalytics />}
                {activePage === 'itam-settings' && <ItamSettings />}
                {activePage === 'itam-audit' && <ItamAudit />}
                {activePage === 'devices' && <DevicesPage />}
                {activePage === 'meter' && <MeterPage />}
                {activePage === 'paper-analytics' && <PaperAnalyticsPage />}
                {activePage === 'settings' && <SettingsPage />}
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
