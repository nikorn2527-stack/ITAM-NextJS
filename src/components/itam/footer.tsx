'use client'

import { useAppStore } from '@/store/app-store'
import { useClock, formatThaiTime, formatThaiDate } from '@/hooks/use-clock'

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
  // Live clock — updates every second. Renders an empty placeholder on the
  // server / first paint to avoid hydration mismatch.
  const now = useClock()
  const timeStr = formatThaiTime(now)
  const dateStr = formatThaiDate(now)

  return (
    <footer className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          © {year} PNG TEAM — IT Asset Management ·{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {PAGE_LABELS[activePage] ?? ''}
          </span>
        </span>
        {/* Live clock + Thai Buddhist date — always visible */}
        {timeStr && (
          <span
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
            aria-label={`ขณะนี้เวลา ${timeStr} วันที่ ${dateStr}`}
            title={dateStr}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#f97316]"
            />
            <span className="tabular-nums">{timeStr}</span>
            <span className="hidden text-slate-400 dark:text-slate-500 sm:inline">
              · {dateStr}
            </span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f97316]" />
        <span>Powered by PNG TEAM</span>
      </div>
    </footer>
  )
}
