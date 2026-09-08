'use client'

/**
 * MobileShell — mobile-first shell with bottom navigation.
 *
 * Hosts the 4 mobile-mode screens:
 *   1. แจ้งซ่อม   (repair)        → MobileRepairRequest   [implemented]
 *   2. งานของฉัน (my work)        → MobileMyWork          [implemented]
 *   3. จดมิเตอร์  (meter reading) → MobileMeterReading     [implemented]
 *   4. เบิกของ    (stock request) → MobileStockOut         [implemented]
 *
 * Layout:
 *  - Outer wrapper: `min-h-screen flex flex-col` — sticky footer pattern.
 *  - Top header: title + page indicator.
 *  - Main content: `flex-1` scrollable, padded to clear the bottom nav.
 *  - Bottom nav: fixed at viewport bottom, 4 large touch targets (≥44px).
 *
 * Touch targets: every nav button is h-14 (56px) — exceeds the 44px minimum.
 *
 * Color system: uses Tailwind built-in `bg-background`, `text-foreground`,
 * `bg-muted`, `text-muted-foreground`, plus an accent (`text-orange-500`)
 * consistent with the desktop "แจ้งซ่อม" page.
 *
 * Responsive: full-width on phones (max-w-md centered); on ≥sm screens the
 * shell is centered with a card-like outline so it still previews cleanly
 * on desktop.
 */

import * as React from 'react'
import { Wrench, ClipboardList, Gauge, PackageOpen, LogOut, ArrowLeft, User, Menu, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { useSwipeBack } from '@/hooks/use-swipe-back'
import { useAuthStore } from '@/store/auth-store'
import { MobileRepairRequest } from './mobile-repair-request'
import { MobileMyWork } from './mobile-my-work'
import { MobileMeterReading } from './mobile-meter-reading'
import { MobileStockOut } from './mobile-stock-out'
import { MobileAccount } from './mobile-account'

export type MobileTab = 'repair' | 'my-work' | 'meter' | 'stock' | 'account'

interface NavItem {
  id: MobileTab
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { id: 'my-work',  label: 'งานของฉัน', icon: ClipboardList },
  { id: 'repair',   label: 'แจ้งซ่อม',   icon: Wrench },
  { id: 'meter',    label: 'จดมิเตอร์',  icon: Gauge },
  { id: 'stock',    label: 'เบิกของ',    icon: PackageOpen },
  { id: 'account',  label: 'บัญชี',      icon: User },
]

const HEADER_TITLE: Record<MobileTab, string> = {
  repair: 'แจ้งซ่อม',
  'my-work': 'งานของฉัน',
  meter: 'จดมิเตอร์',
  stock: 'เบิกของ',
  account: 'บัญชีของฉัน',
}

export function MobileShell() {
  const [tab, setTab] = React.useState<MobileTab>('my-work')
  const [menuOpen, setMenuOpen] = React.useState(false)
  const setActivePage = useAppStore((s) => s.setActivePage)
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const role = user?.role ?? 'viewer'

  // Fetch ALL settings — both mobileNavConfig (for MobileShell tabs) and
  // the sidebar pages config (so we can show a hamburger menu with all
  // desktop pages that the user has enabled).
  const { data: allSettings } = useQuery<{
    mobileNavConfig: Record<string, Record<string, boolean>>
    sidebarPages: Array<{ page: string; label: string }>
  }>({
    queryKey: ['mobile-nav-config'],
    queryFn: async () => {
      const token = useAuthStore.getState()?.token
      const res = await fetch('/api/settings', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return { mobileNavConfig: {}, sidebarPages: [] }
      const json = await res.json()
      const settings = Array.isArray(json.settings) ? json.settings : []

      // Parse mobileNavConfig
      const rawNav = settings.find((s: { key: string }) => s.key === 'mobileNavConfig')
      let mobileNavConfig: Record<string, Record<string, boolean>> = {}
      if (rawNav?.value) {
        try { mobileNavConfig = JSON.parse(rawNav.value) } catch { /* ignore */ }
      }

      // Parse sidebarPages (the desktop nav config)
      const rawSidebar = settings.find((s: { key: string }) => s.key === 'sidebarPages')
      let sidebarPages: Array<{ page: string; label: string }> = []
      if (rawSidebar?.value) {
        try { sidebarPages = JSON.parse(rawSidebar.value) } catch { /* ignore */ }
      }

      return { mobileNavConfig, sidebarPages }
    },
    staleTime: 30_000,
  })

  const mobileNavConfig = allSettings?.mobileNavConfig ?? {}
  const roleConfig = mobileNavConfig[role]

  // Filter MobileShell tabs by mobileapp-* config
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.id === 'account') return true
    const key = `mobileapp-${item.id}`
    if (roleConfig && typeof roleConfig[key] === 'boolean') return roleConfig[key]
    return true
  })

  // Build list of sidebar pages that are enabled for this role
  // (these are the desktop pages the user can access from the hamburger menu)
  const SIDEBAR_PAGE_LABELS: Record<string, string> = {
    dashboard: '📊 แดชบอร์ด',
    'itam-devices': '💻 จัดการอุปกรณ์',
    'itam-meter-keyboard': '📈 จดมิเตอร์',
    'itam-work-orders': '🔧 แจ้งซ่อม',
    'pm-schedules': '🗓️ ตาราง PM',
    'itam-stock': '📦 สต๊อก',
    'itam-paper-analytics': '📄 วิเคราะห์กระดาษ',
    templates: '📄 เทมเพลต',
    import: '📥 นำเข้าข้อมูล',
    'reports-hub': '📊 ศูนย์รายงาน',
    'material-cost': '💰 ต้นทุนวัสดุ',
    'monthly-report': '📅 รายงานรายเดือน',
    'itam-settings': '⚙️ ตั้งค่าระบบ',
    'itam-audit': '📜 ประวัติการใช้งาน',
    mobile: '📱 โหมดมือถือ',
  }

  const enabledSidebarPages = React.useMemo(() => {
    const pages = allSettings?.sidebarPages ?? []
    if (pages.length === 0) {
      // Default: show all if no config
      return Object.entries(SIDEBAR_PAGE_LABELS).map(([page, label]) => ({ page, label }))
    }
    // Filter by role config
    return pages.filter((p) => {
      if (roleConfig && typeof roleConfig[p.page] === 'boolean') return roleConfig[p.page]
      return true
    }).map((p) => ({ page: p.page, label: SIDEBAR_PAGE_LABELS[p.page] ?? p.page }))
  }, [allSettings?.sidebarPages, roleConfig])

  // If the current tab is hidden (admin disabled it), fall back to the
  // first visible tab to avoid showing a blank page.
  React.useEffect(() => {
    if (visibleNavItems.length > 0 && !visibleNavItems.some((i) => i.id === tab)) {
      setTab(visibleNavItems[0].id)
    }
  }, [visibleNavItems, tab])

  const handleExit = () => {
    setActivePage('dashboard')
  }

  const handleLogout = () => {
    logout()
    window.location.href = '/'
  }

  // Swipe gesture: swipe right from left edge → exit mobile mode (back to dashboard)
  // This gives users a native-feeling "back" gesture on mobile.
  useSwipeBack({ onBack: handleExit })

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* Centered phone-frame for desktop preview, full-width on phones */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col bg-background shadow-sm">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-14 flex-shrink-0 items-center justify-between border-b bg-background px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
              <Wrench className="h-4 w-4" />
            </div>
            <h1 className="text-base font-semibold leading-none">
              {HEADER_TITLE[tab]}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {/* Hamburger menu — opens drawer with all sidebar pages */}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="เมนูทั้งหมด"
              title="เมนูทั้งหมด"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="mr-1 text-xs text-muted-foreground">ITAM</span>
            {/* Exit mobile mode → back to desktop */}
            <button
              type="button"
              onClick={handleExit}
              aria-label="ออกจากโหมดมือถือ"
              title="ออกจากโหมดมือถือ"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="leading-none">ออก</span>
            </button>
            {/* Real logout — clear token */}
            <button
              type="button"
              onClick={handleLogout}
              aria-label="ออกจากระบบ"
              title="ออกจากระบบ"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* ── Hamburger drawer — all sidebar pages ── */}
        {menuOpen && (
          <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMenuOpen(false)}
            />
            {/* Drawer panel */}
            <div className="relative z-10 flex h-full w-72 max-w-[80vw] flex-col bg-background shadow-xl">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-semibold">เมนูทั้งหมด</h2>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {enabledSidebarPages.map((p) => (
                  <button
                    key={p.page}
                    type="button"
                    onClick={() => {
                      setActivePage(p.page)
                      setMenuOpen(false)
                    }}
                    className="flex w-full items-center px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-orange-50 hover:text-orange-700 dark:text-slate-300 dark:hover:bg-orange-950/30 dark:hover:text-orange-300"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="border-t px-4 py-3">
                <button
                  type="button"
                  onClick={() => { handleExit(); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                  ออกจากโหมดมือถือ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main content — scrolls; bottom padding clears the fixed nav */}
        <main className="flex-1 overflow-y-auto px-3 pb-24 pt-3">
          {/* Keep-alive tabs: render once, hide inactive with CSS.
              Preserves form state (search, draft inputs) when switching tabs. */}
          <MobileKeepAliveTab active={tab === 'repair'}>
            <MobileRepairRequest />
          </MobileKeepAliveTab>
          <MobileKeepAliveTab active={tab === 'my-work'}>
            <MobileMyWork />
          </MobileKeepAliveTab>
          <MobileKeepAliveTab active={tab === 'meter'}>
            <MobileMeterReading />
          </MobileKeepAliveTab>
          <MobileKeepAliveTab active={tab === 'stock'}>
            <MobileStockOut />
          </MobileKeepAliveTab>
          <MobileKeepAliveTab active={tab === 'account'}>
            <MobileAccount />
          </MobileKeepAliveTab>
        </main>
      </div>

      {/* Bottom navigation — fixed, full-width on phones, centered on desktop */}
      <nav
        aria-label="เมนูหลัก"
        className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md items-stretch border-t bg-background shadow-[0_-1px_3px_rgba(0,0,0,0.04)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {visibleNavItems.map((item) => {
          const active = tab === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                active
                  ? 'text-orange-500'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="leading-none">{item.label}</span>
              {active && (
                <span className="absolute top-0 h-0.5 w-10 rounded-full bg-orange-500" />
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// ── MobileKeepAliveTab ────────────────────────────────────────────────
// Renders children once (lazy mount on first activation), then keeps
// them mounted but hidden when inactive. Preserves form state when
// switching between mobile tabs (งานของฉัน / แจ้งซ่อม / จดมิเตอร์ / เบิกของ).
//
function MobileKeepAliveTab({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  const [mounted, setMounted] = React.useState(active)
  React.useEffect(() => {
    if (active && !mounted) setMounted(true)
  }, [active, mounted])

  if (!mounted) return null
  return (
    <div style={{ display: active ? 'block' : 'none' }} aria-hidden={!active}>
      {children}
    </div>
  )
}
