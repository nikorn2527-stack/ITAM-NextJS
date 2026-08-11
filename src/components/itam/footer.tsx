'use client'

import { useAppStore } from '@/store/app-store'

const PAGE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  devices: 'จัดการอุปกรณ์',
  meter: 'จดมิเตอร์',
  'paper-analytics': 'การใช้กระดาษ',
  settings: 'ตั้งค่าแอป',
}

export function Footer() {
  const activePage = useAppStore((s) => s.activePage)
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-100 px-4 py-3 text-xs text-slate-500">
      <div>
        © {year} PNG TEAM — IT Asset Management ·{' '}
        <span className="font-medium text-slate-700">
          {PAGE_LABELS[activePage] ?? ''}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f97316]" />
        <span>Powered by PNG TEAM</span>
      </div>
    </footer>
  )
}
