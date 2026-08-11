'use client'

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
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:ml-[240px]">
        <main className="flex-1 pt-14 md:pt-0">
          {activePage === 'dashboard' && <DashboardPage />}
          {activePage === 'devices' && <DevicesPage />}
          {activePage === 'meter' && <MeterPage />}
          {activePage === 'paper-analytics' && <PaperAnalyticsPage />}
          {activePage === 'settings' && <SettingsPage />}
        </main>
        <Footer />
      </div>
    </div>
  )
}
