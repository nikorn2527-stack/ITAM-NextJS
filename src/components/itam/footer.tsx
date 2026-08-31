'use client'

import { useAppStore } from '@/store/app-store'
import { useQuery } from '@tanstack/react-query'

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
  'itam-audit': 'บันทึกการตรวจสอบ',
  // ── Additional page labels (Task ID: UX-HIGH-POLISH-FIXES) ──
  'work-orders': 'ใบงาน',
  stock: 'สต๊อกสินค้า',
  import: 'นำเข้าข้อมูล',
  'reports-hub': 'รายงาน',
  'material-cost': 'ต้นทุนวัสดุ',
  'pm-schedules': 'ตาราง PM',
  templates: 'เทมเพลต',
  'monthly-report': 'รายงานรายเดือน',
  'settings-v2': 'ตั้งค่า',
  'paper-analytics-page': 'วิเคราะห์กระดาษ',
  'meter-page': 'มิเตอร์',
  'itam-repairs': 'ซ่อมบำรุง',
  'itam-sticker-editor': 'แก้ไขสติกเกอร์',
  'itam-document-editor': 'แก้ไขเอกสาร',
  'itam-snapshot-viewer': 'สแนปช็อต',
}

export function Footer() {
  const activePage = useAppStore((s) => s.activePage)
  const year = new Date().getFullYear()

  // Dynamic org name from OrgProfile (fallback to generic "องค์กร")
  const { data: orgProfile } = useQuery({
    queryKey: ['org-profile'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/settings/org-profile')
        if (!res.ok) return null
        const j = await res.json()
        return j.profile ?? null
      } catch {
        return null
      }
    },
    staleTime: 60_000,
  })
  const orgName = orgProfile?.appName || 'องค์กร'
  // Note: the live clock now lives in the top-right floating TopBarClock
  // (desktop) and inside the expanded sidebar header. The footer keeps a
  // minimal copyright + page label so it stays short.

  return (
    <footer className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          © {year} {orgName} — IT Asset Management
          {PAGE_LABELS[activePage] && (
            <>
              {' · '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {PAGE_LABELS[activePage]}
              </span>
            </>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f97316]" />
        <span>ขับเคลื่อนโดย {orgName}</span>
      </div>
    </footer>
  )
}
