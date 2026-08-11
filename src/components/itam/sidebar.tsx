'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useAppStore, type ActivePage } from '@/store/app-store'
import { cn } from '@/lib/utils'

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
  const { activePage, setActivePage, sidebarOpen, closeSidebar, toggleSidebar } =
    useAppStore()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const isDark = mounted && theme === 'dark'
  function toggleTheme() {
    setTheme(isDark ? 'light' : 'dark')
  }

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
        {/* Header */}
        <div
          className="px-5 pb-5 pt-5 text-center"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-lg">📦</span>
            <span className="text-base font-bold text-white">Asset Mgmt</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            IT Asset Management
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
                  'flex w-full cursor-pointer items-center border-l-[3px] px-5 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0f172a]',
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
              </button>
            )
          })}
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
          {/* Theme toggle — keeps the sidebar dark in both themes, only swaps main content */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
            title={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
            className="mx-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0f172a]"
          >
            {mounted ? (
              isDark ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )
            ) : (
              <span className="block h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </aside>
    </>
  )
}
