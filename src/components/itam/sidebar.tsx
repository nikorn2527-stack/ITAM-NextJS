'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { Sun, Moon, Search, LogOut, QrCode } from 'lucide-react'
import { useAppStore, type ActivePage } from '@/store/app-store'
import { useAuthStore, useNavVisibility, useRole } from '@/store/auth-store'
import { ROLE_LABELS } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { NotificationsPopover } from './notifications-popover'
import { useRealtimeStatus } from '@/hooks/use-realtime-updates'

// Map of role → Thai label (the auth store returns a normalized role string)
function roleLabel(role: string | undefined | null): string {
  if (!role) return 'ผู้ใช้'
  return ROLE_LABELS[role as Role] ?? role
}

interface NavItemDef {
  page: ActivePage
  icon: string
  label: string
  desc?: string
}

interface NavGroupDef {
  title: string
  items: NavItemDef[]
}

// Single consolidated nav — no more duplicate "ITAM" vs non-"ITAM" sets.
// Legacy page ids (devices/meter/paper-analytics/settings) are intentionally
// NOT shown here; they are kept as aliases in page.tsx for backward-compatible
// deep links from the dashboard / notifications / global search.
const NAV_GROUPS: NavGroupDef[] = [
  {
    title: 'ภาพรวม',
    items: [
      { page: 'dashboard', icon: '📊', label: 'Dashboard', desc: 'สรุปภาพรวมระบบ' },
    ],
  },
  {
    title: 'การทำงาน',
    items: [
      { page: 'itam-devices', icon: '💻', label: 'จัดการอุปกรณ์', desc: 'ครุภัณฑ์ทั้งหมด' },
      { page: 'itam-meter-keyboard', icon: '📈', label: 'จดมิเตอร์', desc: 'จดมิเตอร์ + ประวัติ' },
      { page: 'itam-work-orders', icon: '🔧', label: 'แจ้งซ่อม', desc: 'แจ้งซ่อม รับงาน ปิดงาน' },
      { page: 'itam-stock', icon: '📦', label: 'สต๊อก', desc: 'คลังสิ้นเปลือง/อะไหล่' },
      { page: 'itam-paper-analytics', icon: '📄', label: 'วิเคราะห์กระดาษ', desc: 'สถิติการใช้งาน' },
    ],
  },
  {
    title: 'เครื่องมือ',
    items: [
      { page: 'itam-sticker-editor', icon: '🎨', label: 'สติกเกอร์', desc: 'ออกแบบสติกเกอร์' },
      { page: 'itam-document-editor', icon: '📑', label: 'เอกสาร PDF', desc: 'ออกแบบเอกสาร' },
      { page: 'itam-snapshot-viewer', icon: '🔒', label: 'Snapshots', desc: 'ตรวจสอบ snapshot มิเตอร์' },
    ],
  },
  {
    title: 'ระบบ',
    items: [
      { page: 'itam-settings', icon: '⚙️', label: 'ตั้งค่าระบบ', desc: 'การตั้งค่าทั้งหมด' },
      { page: 'itam-audit', icon: '📜', label: 'ประวัติการใช้งาน', desc: 'Audit log' },
    ],
  },
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
    setQrScannerOpen,
  } = useAppStore()
  const authUser = useAuthStore((s) => s.user)
  const authLogout = useAuthStore((s) => s.logout)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const realtimeStatus = useRealtimeStatus()

  // ── App customization (appName, logo, tagline from settings) ──
  // Lets the admin change the app's display name + logo + tagline without
  // touching code. Falls back to defaults if not set.
  const { data: appSettings } = useQuery<Record<string, string>>({
    queryKey: ['app-customization'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/itam/settings')
        if (!res.ok) return {}
        const j = await res.json()
        const map: Record<string, string> = {}
        for (const s of j.settings ?? []) map[s.key] = s.value ?? ''
        return map
      } catch {
        return {}
      }
    },
    staleTime: 60_000,
  })
  const appLogo = appSettings?.appLogoUrl || '' // emoji or image URL

  async function handleLogout() {
    await authLogout()
    // After logout, the AppShell boot effect will re-render and show the login
    // page (authStore.isAuthenticated flips to false).
  }

  // ── Auth + permissions (Task ID: RBAC-DASHBOARD) ──
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const authInitialized = useAuthStore((s) => s.initialized)
  const navVisibility = useNavVisibility()
  const role = useRole()

  // Fetch /api/auth/me once on mount (silently — falls back to preview user)
  React.useEffect(() => {
    if (!authInitialized) {
      void fetchMe()
    }
  }, [authInitialized, fetchMe])

  // Filter NAV_ITEMS by permission
  const visibleNavItems = React.useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (!item.requires || item.requires.length === 0) return true
      return item.requires.some((perm) => {
        // Use the precomputed navVisibility map for known keys,
        // otherwise fall back to a direct check.
        switch (item.page) {
          case 'dashboard':
            return navVisibility.dashboard
          case 'devices':
            return navVisibility.devices
          case 'meter':
            return navVisibility.meter
          case 'paper-analytics':
            return navVisibility.paperAnalytics
          case 'work-orders':
            return navVisibility.workOrders
          case 'stock':
            return navVisibility.stock
          case 'monthly-report':
            // Uses reports:view (same as paper-analytics)
            return navVisibility.paperAnalytics
          case 'import':
            return navVisibility.import
          case 'templates':
            return navVisibility.templates
          case 'settings':
            return navVisibility.settings
          default:
            return true
        }
      })
    })
  }, [navVisibility])

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

  // Display name + role label
  const displayName =
    authUser?.name || authUser?.email || 'admin@example.com'
  const roleLabel = ROLE_LABELS[role] ?? role

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
        {/* Header — uses customizable appName/logo/tagline from settings */}
        <div
          className="px-5 pb-5 pt-5 text-center"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="flex items-center justify-center gap-2">
            {appLogo && appLogo.startsWith('http') ? (
              <img src={appLogo} alt={appName} className="h-6 w-6 rounded object-contain" />
            ) : (
              <span className="text-lg">{appLogo || '📦'}</span>
            )}
            <span className="text-base font-bold text-white">{appName}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {appTagline}
          </div>
        </div>

        {/* Nav menu */}
        <nav
          className="flex-1 overflow-y-auto py-3"
          style={{ padding: '12px 0' }}
          aria-label="Main navigation"
        >
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.title} className={gi > 0 ? 'mt-3' : ''}>
              <div
                className="px-5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
              >
                {group.title}
              </div>
              {group.items.map((item) => {
                const active = activePage === item.page
                return (
                  <button
                    key={item.page}
                    type="button"
                    onClick={() => handleNav(item.page)}
                    aria-current={active ? 'page' : undefined}
                    title={item.desc}
                    className={cn(
                      'group relative flex w-full cursor-pointer items-center border-l-[3px] px-5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0f172a]',
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
            </div>
          ))}

          {visibleNavItems.length === 0 && (
            <div className="px-5 py-6 text-center text-xs text-slate-400">
              คุณไม่มีสิทธิ์เข้าถึงเมนูใด ๆ
              <br />
              กรุณาติดต่อผู้ดูแลระบบ
            </div>
          )}

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

          {/* QR scanner + Realtime status row */}
          <div className="flex items-center gap-2 px-3 pt-2">
            <button
              type="button"
              onClick={() => {
                closeSidebar()
                setQrScannerOpen(true)
              }}
              aria-label="สแกน QR Code"
              title="สแกน QR Code"
              className="group flex flex-1 items-center gap-2 rounded-md border border-[#f97316]/40 bg-[#f97316]/10 px-3 py-2 text-xs font-medium text-[#fb923c] transition-colors hover:border-[#f97316]/70 hover:bg-[#f97316]/20 hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0f172a]"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">📱 สแกน QR</span>
            </button>
            <div
              role="status"
              aria-label={`สถานะการเชื่อมต่อสด: ${realtimeStatus === 'open' ? 'เชื่อมต่อแล้ว' : realtimeStatus === 'connecting' ? 'กำลังเชื่อมต่อ' : 'ตัดการเชื่อมต่อ'}`}
              title={
                realtimeStatus === 'open'
                  ? '🟢 เชื่อมต่อสด — ข้อมูลอัปเดตทันที'
                  : realtimeStatus === 'connecting'
                    ? '🟡 กำลังเชื่อมต่อ...'
                    : '🔴 ออฟไลน์ — ข้อมูลจะอัปเดตเมื่อรีเฟรช'
              }
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5"
            >
              <span
                className={[
                  'h-2 w-2 rounded-full',
                  realtimeStatus === 'open'
                    ? 'bg-emerald-400 itam-rt-dot'
                    : realtimeStatus === 'connecting'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-slate-500',
                ].join(' ')}
              />
            </div>
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

        {/* Current user — แสดงรูปโปรไฟล์ + ชื่อ + role (reads from auth store) */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 text-[11px]"
          style={{ color: 'rgba(255,255,255,0.75)', borderTop: '1px solid rgba(255,255,255,0.08)' }}
          title={authUser?.email ?? ''}
        >
          {/* Avatar — รูปโปรไฟล์หรือ initials */}
          {authUser?.avatarUrl && authUser.avatarUrl.startsWith('http') ? (
            <img
              src={authUser.avatarUrl}
              alt={displayName}
              className="h-8 w-8 flex-shrink-0 rounded-full object-cover ring-2 ring-white/20"
            />
          ) : (
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f97316] to-[#ea580c] text-xs font-bold text-white ring-2 ring-white/20">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-white/90">{displayName}</div>
            <div className="mt-0.5 truncate text-[10px] text-slate-400">{roleLabel}</div>
          </div>
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
