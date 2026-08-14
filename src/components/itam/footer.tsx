'use client'

import { useAppStore } from '@/store/app-store'

const PAGE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  devices: 'จัดการอุปกรณ์',
  meter: 'จดมิเตอร์',
  'paper-analytics': 'การใช้กระดาษ',
  settings: 'ตั้งค่าแอป',
  itam: 'ITAM Dashboard',
  'itam-devices': 'ITAM อุปกรณ์',
  'itam-meter': 'ITAM มิเตอร์',
  'itam-settings': 'ITAM ตั้งค่า',
  'itam-audit': 'ITAM ประวัติ',
}

export function Footer() {
  const activePage = useAppStore((s) => s.activePage)
  const year = new Date().getFullYear()
  // Note: the live clock now lives in the top-right floating TopBarClock
  // (desktop) and inside the expanded sidebar header. The footer keeps a
  // minimal copyright + page label so it stays short.

  return (
    <footer className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          © {year} PNG TEAM — IT Asset Management ·{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {PAGE_LABELS[activePage] ?? ''}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f97316]" />
        <span>Powered by PNG TEAM</span>
      </div>
    </footer>
  )
}
