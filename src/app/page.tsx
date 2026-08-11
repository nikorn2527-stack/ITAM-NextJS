'use client'

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
import { ItamSettings } from '@/components/itam/itam-settings'
import { ItamAudit } from '@/components/itam/itam-audit'
import { useAppStore } from '@/store/app-store'

export default function Home() {
  const activePage = useAppStore((s) => s.activePage)

  return (
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
    </div>
  )
}

