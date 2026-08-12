'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { Sun, Moon, Search } from 'lucide-react'
import { useAppStore, type ActivePage } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { NotificationsPopover } from './notifications-popover'

interface NavItemDef {
  page: ActivePage
  icon: string
  label: string
}

const NAV_ITEMS: NavItemDef[] = [
  { page: 'dashboard', icon: '📊', label: 'Dashboard' },
  { page: 'devices', icon: '💻', label: 'จัดการอุปกรณ์' },
  { page: 'meter', icon: '📈', label: 'จดมิเตอร์' },
  { page: 'paper-analytics', icon: '📊', label: 'การใช้กระดาษ' },
  { page: 'work-orders', icon: '🔧', label: 'แจ้งซ่อม' },
  { page: 'stock', icon: '📦', label: 'สต๊อก' },
  { page: 'import', icon: '📥', label: 'นำเข้าข้อมูล' },
  { page: 'templates', icon: '📄', label: 'เทมเพลต' },
  { page: 'settings', icon: '⚙️', label: 'ตั้งค่าแอป' },
]

interface CycleInfo {
  id: string
  name: string
  startDate: string
  endDate: string
  status: string
}

function useCountdown(endDate?: string) {
  return React.useMemo(() => {
    if (!endDate) return null
    const end = new Date(endDate).getTime()
    const now = Date.now()
    const diff = end - now
    if (diff <= 0) return { days: 0, hours: 0, pct: 100, ended: true }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    // progress pct over a 30-day window for visual
    const start = end - 30 * 24 * 60 * 60 * 1000
    const total = end - start
    const pct = Math.min(100, Math.max(0, ((now - start) / total) * 100))
    return { days, hours, pct, ended: false }
  }, [endDate])
}

export function Sidebar() {
  const {
    activePage,
    setActivePage,
    sidebarOpen,
    closeSidebar,
    toggleSidebar,
    searchOpen,
    setSearchOpen,
  } = useAppStore()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  // ── Organization Profile (flexible: ชื่อ/โลโก้/tagline เปลี่ยนได้) ──
  const { data: orgProfile } = useQuery({
    queryKey: ['org-profile'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/settings/org-profile')
        if (!res.ok) return null
        const j = await res.json()
        return j.profile
      } catch {
        return null
      }
    },
    staleTime: 60_000,
  })
  const appName = orgProfile?.appName || 'ระบบจัดการสินทรัพย์'
  const appTagline = orgProfile?.appTagline || 'Asset Management System'
  const logoUrl = orgProfile?.logoUrl || ''

  const isDark = mounted && theme === 'dark'
  function toggleTheme() {
    setTheme(isDark ? 'light' : 'dark')
  }

  // Global keyboard shortcut: Ctrl+K / Cmd+K — toggles the search palette
  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setSearchOpen(!searchOpen)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen, setSearchOpen])

  const { data: activeCycle } = useQuery<CycleInfo | null>({
    queryKey: ['active-cycle'],
    queryFn: async () => {
      const res = await fetch('/api/cycles?status=active')
      if (!res.ok) return null
      const json = await res.json()
      return (json.cycles?.[0] as CycleInfo | undefined) ?? null
    },
    staleTime: 60_000,
  })

  const countdown = useCountdown(activeCycle?.endDate)

  const handleNav = (page: ActivePage) => {
    setActivePage(page)
    closeSidebar()
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        aria-label="เปิดเมนู"
        onClick={toggleSidebar}
        className={cn(
          'fixed left-3 top-3 z-[200] flex h-10 w-10 items-center justify-center rounded-md bg-[#0f172a] text-xl text-white shadow-md md:hidden',
        )}
      >
        ☰
      </button>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/40 md:hidden"
          onClick={closeSidebar}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed bottom-0 left-0 top-0 z-[100] flex w-60 flex-col bg-[#0f172a] text-white transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        style={{ width: 240 }}
      >
        {/* Header — uses OrganizationProfile (flexible: เปลี่ยนชื่อ/โลโก้ได้) */}
        <div
          className="px-5 pb-5 pt-5 text-center"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="flex items-center justify-center gap-2">
            {logoUrl && logoUrl.startsWith('http') ? (
              <img src={logoUrl} alt={appName} className="h-6 w-6 rounded object-contain" />
            ) : (
              <span className="text-lg">{logoUrl || '📦'}</span>
            )}
            <span className="text-base font-bold text-white">{appName}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {appTagline}
          </div>
        </div>

        {/* Nav menu */}
        <nav
          className="flex-1 py-3"
          style={{ padding: '12px 0' }}
          aria-label="Main navigation"
        >
          {NAV_ITEMS.map((item) => {
            const active = activePage === item.page
            return (
              <button
                key={item.page}
                type="button"
                onClick={() => handleNav(item.page)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex w-full cursor-pointer items-center border-l-[3px] px-5 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0f172a]',
                  active
                    ? 'border-[#f97316] bg-[rgba(234,88,12,0.12)] text-[#fb923c]'
                    : 'border-transparent text-slate-300 hover:bg-[rgba(255,255,255,0.05)] hover:text-white',
                )}
              >
                <span
                  className="mr-3 inline-flex w-5 justify-center text-base"
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span className="flex-1 text-left">{item.label}</span>
                {/* Active/hover indicator dot at the right edge */}
                <span
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#f97316] transition-all duration-200',
                    active
                      ? 'scale-100 opacity-100 shadow-[0_0_8px_rgba(249,115,22,0.7)]'
                      : 'scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-60',
                  )}
                />
              </button>
            )
          })}

          {/* Global search button */}
          <div className="px-3 pt-2">
            <button
              type="button"
              onClick={() => {
                closeSidebar()
                setSearchOpen(true)
              }}
              aria-label="ค้นหาทั่วระบบ"
              className="group flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0f172a]"
            >
              <Search className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-white" />
              <span className="flex-1 text-left text-xs">ค้นหา...</span>
              <kbd
                className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400"
                aria-hidden
              >
                ⌘K
              </kbd>
            </button>
          </div>
        </nav>

        {/* Cycle countdown bar */}
        {activeCycle && countdown && (
          <div
            className="px-4 py-3 text-[12px] text-slate-200"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span>⏰ {countdown.ended ? 'สิ้นสุดรอบ' : `เหลืออีก ${countdown.days} วัน ${countdown.hours} ชม.`}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${countdown.pct}%`,
                  background: '#f97316',
                }}
              />
            </div>
            <div className="mt-1 truncate text-[10px] text-slate-400">
              {activeCycle.name}
            </div>
          </div>
        )}

        {/* Current user role */}
        <div
          className="px-4 py-2 text-[11px]"
          style={{ color: 'rgba(255,255,255,0.75)' }}
        >
          admin@example.com · ผู้ดูแลระบบ
        </div>

        {/* Powered footer */}
        <div
          className="px-5 pb-[18px] pt-[14px] text-center text-[11px] font-semibold tracking-[0.04em] text-slate-400"
          style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="mb-2 flex items-center justify-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#f97316]" />
            <span>Powered by PNG TEAM</span>
          </div>
          {/* Controls row — notifications + theme toggle */}
          <div className="flex items-center justify-center gap-1.5">
            <NotificationsPopover />
            {/* Theme toggle — keeps the sidebar dark in both themes, only swaps main content */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
              title={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0f172a]"
            >
              {mounted ? (
                isDark ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )
              ) : (
                <span className="block h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
