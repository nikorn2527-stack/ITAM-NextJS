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
import { Wrench, ClipboardList, Gauge, PackageOpen, LogOut, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { useSwipeBack } from '@/hooks/use-swipe-back'
import { useAuthStore } from '@/store/auth-store'
import { MobileRepairRequest } from './mobile-repair-request'
import { MobileMyWork } from './mobile-my-work'
import { MobileMeterReading } from './mobile-meter-reading'
import { MobileStockOut } from './mobile-stock-out'

export type MobileTab = 'repair' | 'my-work' | 'meter' | 'stock'

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
]

const HEADER_TITLE: Record<MobileTab, string> = {
  repair: 'แจ้งซ่อม',
  'my-work': 'งานของฉัน',
  meter: 'จดมิเตอร์',
  stock: 'เบิกของ',
}

export function MobileShell() {
  const [tab, setTab] = React.useState<MobileTab>('my-work')
  const setActivePage = useAppStore((s) => s.setActivePage)
  const logout = useAuthStore((s) => s.logout)

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
            <span className="mr-1 text-xs text-muted-foreground">ITAM Mobile</span>
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
        </main>
      </div>

      {/* Bottom navigation — fixed, full-width on phones, centered on desktop */}
      <nav
        aria-label="เมนูหลัก"
        className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md items-stretch border-t bg-background shadow-[0_-1px_3px_rgba(0,0,0,0.04)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV_ITEMS.map((item) => {
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
