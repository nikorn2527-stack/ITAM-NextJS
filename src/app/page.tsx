'use client'

import { motion } from 'framer-motion'
import { Sidebar } from '@/components/itam/sidebar'
import { Footer } from '@/components/itam/footer'
import { GlobalSearch } from '@/components/itam/global-search'
import { DashboardPage } from '@/components/itam/dashboard-page'
import { DevicesPage } from '@/components/itam/devices-page'
import { MeterPage } from '@/components/itam/meter-page'
import { PaperAnalyticsPage } from '@/components/itam/paper-analytics-page'
import { WorkOrdersPage } from '@/components/itam/work-orders-page'
import { StockPage } from '@/components/itam/stock-page'
import { ImportPage } from '@/components/itam/import-page'
import { TemplatesPage } from '@/components/itam/templates-page'
import { SettingsPageV2 } from '@/components/itam/settings-page-v2'
import { MonthlyReport } from '@/components/itam/monthly-report'
import { QrScannerDialog } from '@/components/itam/qr-scanner-dialog'
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
            {activePage === 'work-orders' && <WorkOrdersPage />}
            {activePage === 'stock' && <StockPage />}
            {activePage === 'import' && <ImportPage />}
            {activePage === 'templates' && <TemplatesPage />}
            {activePage === 'settings' && <SettingsPageV2 />}
            {activePage === 'monthly-report' && <MonthlyReport />}
          </motion.div>
        </main>
        <Footer />
      </div>
      <GlobalSearch />
      <QrScannerDialog />
    </div>
  )
}
