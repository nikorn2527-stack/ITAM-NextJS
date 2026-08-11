'use client'

import { motion } from 'framer-motion'
import { Sidebar } from '@/components/itam/sidebar'
import { Footer } from '@/components/itam/footer'
import { DashboardPage } from '@/components/itam/dashboard-page'
import { DevicesPage } from '@/components/itam/devices-page'
import { MeterPage } from '@/components/itam/meter-page'
import { PaperAnalyticsPage } from '@/components/itam/paper-analytics-page'
import { SettingsPage } from '@/components/itam/settings-page'
import { useAppStore } from '@/store/app-store'

export default function Home() {
  const activePage = useAppStore((s) => s.activePage)

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:ml-[240px]">
        <main className="flex-1 pt-14 md:pt-0">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {activePage === 'dashboard' && <DashboardPage />}
            {activePage === 'devices' && <DevicesPage />}
            {activePage === 'meter' && <MeterPage />}
            {activePage === 'paper-analytics' && <PaperAnalyticsPage />}
            {activePage === 'settings' && <SettingsPage />}
          </motion.div>
        </main>
        <Footer />
      </div>
    </div>
  )
}
