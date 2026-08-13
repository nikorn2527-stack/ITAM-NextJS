'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { Sun, Moon, Search, LogOut, QrCode } from 'lucide-react'
import { useAppStore, type ActivePage } from '@/store/app-store'
import { useAuthStore, useNavVisibility, useRole } from '@/store/auth-store'
import { ROLE_LABELS, type Role } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { NotificationsPopover } from './notifications-popover'
import { useRealtimeStatus } from '@/hooks/use-realtime-updates'
import {
  useClock,
  formatThaiTime,
  formatThaiDate,
} from '@/hooks/use-clock'

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
      { page: 'templates', icon: '📄', label: 'เทมเพลต', desc: 'จัดการเทมเพลต (สติกเกอร์/เอกสาร/ใบงาน)' },
      { page: 'import', icon: '📥', label: 'นำเข้าข้อมูล', desc: 'Import CSV/Excel' },
      { page: 'monthly-report', icon: '📅', label: 'รายงานรายเดือน', desc: 'สรุปการใช้งานรายเดือน' },
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

  // ── Hover-expand state (desktop only) ──
  // Collapsed (56px) by default → expands to 240px on mouseenter.
  // Mirrors Supabase's sidebar behavior: overlays content, doesn't push it.
  const [hovered, setHovered] = React.useState(false)

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

  // Flatten NAV_GROUPS for visibility checks
  const visibleNavItems = React.useMemo(() => {
    return NAV_GROUPS.flatMap((g) => g.items)
  }, [])

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

  // Live clock — updates every second. Used by the expanded sidebar header
  // to show a "HH:MM:SS · วันพุท ที่ 13 สิงหาคม 2568" line below the app tagline.
  // Renders nothing until mounted (avoids hydration mismatch).
  const now = useClock()
  const timeStr = formatThaiTime(now)
  const dateStr = formatThaiDate(now)

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
  const roleLabelText = ROLE_LABELS[role] ?? role

  // ── Shared content renderer ──
  // Used by BOTH the desktop hover-expand aside and the mobile drawer aside.
  // `expanded` controls whether labels / section titles / descriptions are
  // visible. On desktop it follows the `hovered` state; on mobile it's always
  // true (drawer is full-width when open).
  //
  // COMPACT LAYOUT (Issue 2):
  // - Group titles → thin divider line (saves vertical space)
  // - Nav item padding reduced (py-1.5)
  // - Quick actions (search, QR, realtime dot) moved into the header row
  // - Cycle countdown → compact single-line bar inside user area
  // - Footer: theme toggle + notifications only (no "Powered by" text when collapsed)
  //
  // COLLAPSED LAYOUT (Issue 1):
  // - Every element is centered horizontally with justify-center
  // - Icon span: w-7 h-7 (28px) when collapsed
  // - No left/right padding when collapsed (px-0)
  // - Touch target: h-10 (40px)
  // - Icons larger: text-lg when collapsed
  const renderContent = (expanded: boolean) => (
    <>
      {/* ── Header (top section) ──
          Logo + app name + bell (notifications) + theme toggle.
          These are small icon buttons that fit nicely in 56px when collapsed.
          When collapsed, icons stack vertically; when expanded they sit in a row. */}
      <div
        className={cn(
          'flex flex-col gap-2 border-b border-slate-200 dark:border-white/10',
          expanded ? 'px-3 py-3' : 'px-0 py-2',
        )}
      >
        {/* Logo + app name row */}
        <div
          className={cn(
            'flex items-center gap-2',
            expanded ? '' : 'justify-center',
          )}
        >
          {logoUrl && logoUrl.startsWith('http') ? (
            <img
              src={logoUrl}
              alt={appName}
              className="h-7 w-7 flex-shrink-0 rounded object-contain"
            />
          ) : (
            <span
              className={cn(
                'flex-shrink-0',
                expanded ? 'text-lg' : 'text-xl',
              )}
              aria-hidden
            >
              {logoUrl || '📦'}
            </span>
          )}
          <div
            className={cn(
              'min-w-0 flex-1 transition-opacity duration-150',
              expanded ? 'opacity-100' : 'pointer-events-none absolute opacity-0',
            )}
          >
            <div className="truncate text-sm font-bold leading-tight text-slate-900 dark:text-white">
              {appName}
            </div>
            <div className="truncate text-[10px] leading-tight text-slate-500 dark:text-slate-400">
              {appTagline}
            </div>
            {/* Live clock + Thai Buddhist date — visible only when sidebar is
                expanded. Shows "HH:MM:SS" prominently with the date below.
                Helps users see the current time without leaving the app. */}
            {timeStr && (
              <div
                className="mt-1.5 rounded-md bg-slate-100 px-2 py-1 text-slate-700 dark:bg-white/5 dark:text-slate-200"
                aria-label={`ขณะนี้เวลา ${timeStr} วันที่ ${dateStr}`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#f97316]"
                  />
                  <span className="font-mono text-sm font-semibold tabular-nums tracking-tight">
                    {timeStr}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                  {dateStr}
                </div>
              </div>
            )}
          </div>
          {/* Realtime status dot — small indicator next to logo (always visible) */}
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
            className={cn(
              'flex flex-shrink-0 items-center justify-center',
              expanded
                ? 'h-8 w-8 rounded-md border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5'
                : 'hidden',
            )}
          >
            <span
              className={[
                'rounded-full',
                expanded ? 'h-2 w-2' : 'h-2.5 w-2.5',
                realtimeStatus === 'open'
                  ? 'bg-emerald-400 itam-rt-dot'
                  : realtimeStatus === 'connecting'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-slate-500',
              ].join(' ')}
            />
          </div>
        </div>

        {/* Quick action icons row — bell + theme toggle (small icon buttons
            that fit nicely in 56px collapsed width). When expanded they sit
            at the right side of the header; when collapsed they stack centered. */}
        <div
          className={cn(
            'flex items-center gap-1.5',
            expanded ? 'justify-end' : 'flex-col justify-center',
          )}
        >
          <NotificationsPopover />
          {/* Theme toggle — switches between light/dark (sidebar follows theme) */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
            title={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-offset-[#0f172a]"
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

      {/* Nav menu — navigation items only (no search/QR here anymore) */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden py-2"
        aria-label="Main navigation"
      >
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title}>
            {/* Thin divider between groups instead of section title */}
            {gi > 0 && (
              <div
                className={cn(
                  'mx-3 my-1.5 border-t border-slate-200 dark:border-white/10',
                )}
                aria-hidden
              />
            )}
            {group.items.map((item) => {
              const active = activePage === item.page
              return (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => handleNav(item.page)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  title={expanded ? undefined : `${item.label}${item.desc ? ' — ' + item.desc : ''}`}
                  className={cn(
                    'group relative flex w-full cursor-pointer items-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0f172a]',
                    expanded
                      ? 'gap-3 px-4 py-1.5'
                      : 'h-10 w-full justify-center px-0',
                    active
                      ? 'bg-[#f97316]/10 text-[#f97316] dark:bg-[#f97316]/20'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white',
                  )}
                >
                  {/* Active indicator — left edge bar */}
                  <span
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r bg-[#f97316] transition-all duration-200',
                      active ? 'w-[3px] opacity-100' : 'w-0 opacity-0',
                    )}
                  />
                  <span
                    className={cn(
                      'inline-flex flex-shrink-0 items-center justify-center',
                      expanded ? 'h-5 w-5 text-base' : 'h-7 w-7 text-lg',
                    )}
                    aria-hidden
                  >
                    {item.icon}
                  </span>
                  <span
                    className={cn(
                      'flex-1 whitespace-nowrap text-left transition-opacity duration-150',
                      expanded ? 'opacity-100' : 'pointer-events-none absolute opacity-0',
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        ))}

        {visibleNavItems.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
            คุณไม่มีสิทธิ์เข้าถึงเมนูใด ๆ
            <br />
            กรุณาติดต่อผู้ดูแลระบบ
          </div>
        )}
      </nav>

      {/* ── Cycle countdown — compact single-line bar (only when expanded) ──
          When collapsed, hide entirely (the user can hover to see it). */}
      {activeCycle && countdown && expanded && (
        <div
          className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"
          title={`${countdown.ended ? 'สิ้นสุดรอบ' : `เหลืออีก ${countdown.days} วัน ${countdown.hours} ชม.`} — ${activeCycle.name}`}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 truncate whitespace-nowrap">
              <span aria-hidden>⏰</span>
              <span className="truncate">
                {countdown.ended
                  ? 'สิ้นสุดรอบ'
                  : `เหลือ ${countdown.days} วัน ${countdown.hours} ชม.`}
              </span>
            </span>
            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
              {Math.round(countdown.pct)}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${countdown.pct}%`,
                background: '#f97316',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Bottom action section — Global Search + QR Scanner ──
          Moved here from the top so wider buttons have room when expanded.
          When collapsed: two small icon buttons stacked centered.
          When expanded: full-width search input + QR button row. */}
      <div
        className={cn(
          'border-t border-slate-200 dark:border-white/10',
          expanded ? 'px-3 py-2.5' : 'px-0 py-2',
        )}
      >
        {expanded ? (
          <div className="flex flex-col gap-1.5">
            {/* Global search button — full width */}
            <button
              type="button"
              onClick={() => {
                closeSidebar()
                setSearchOpen(true)
              }}
              aria-label="ค้นหาทั่วระบบ"
              title="ค้นหาทั่วระบบ (Ctrl+K)"
              className="group flex w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-offset-[#0f172a]"
            >
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-colors group-hover:text-slate-900 dark:group-hover:text-white" />
              <span className="flex-1 whitespace-nowrap text-left text-xs">ค้นหา...</span>
              <kbd
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:border-white/10 dark:bg-white/5"
                aria-hidden
              >
                ⌘K
              </kbd>
            </button>

            {/* QR scanner — full width */}
            <button
              type="button"
              onClick={() => {
                closeSidebar()
                setQrScannerOpen(true)
              }}
              aria-label="สแกน QR Code"
              title="สแกน QR Code"
              className="group flex w-full items-center gap-2 rounded-md border border-[#f97316]/40 bg-[#f97316]/10 px-2.5 py-1.5 text-xs font-medium text-[#fb923c] transition-colors hover:border-[#f97316]/70 hover:bg-[#f97316]/20 hover:text-orange-600 dark:hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0f172a]"
            >
              <QrCode className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="whitespace-nowrap text-left">📱 สแกน QR</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            {/* Search icon (collapsed) */}
            <button
              type="button"
              onClick={() => {
                closeSidebar()
                setSearchOpen(true)
              }}
              aria-label="ค้นหาทั่วระบบ"
              title="ค้นหาทั่วระบบ (Ctrl+K)"
              className="group flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-offset-[#0f172a]"
            >
              <Search className="h-4 w-4" />
            </button>
            {/* QR icon (collapsed) */}
            <button
              type="button"
              onClick={() => {
                closeSidebar()
                setQrScannerOpen(true)
              }}
              aria-label="สแกน QR Code"
              title="สแกน QR Code"
              className="group flex h-9 w-9 items-center justify-center rounded-md border border-[#f97316]/40 bg-[#f97316]/10 text-[#fb923c] transition-colors hover:border-[#f97316]/70 hover:bg-[#f97316]/20 hover:text-orange-600 dark:hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0f172a]"
            >
              <QrCode className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Footer — current user: avatar + name + role + logout ── */}
      <div
        className={cn(
          'flex items-center gap-2 border-t border-slate-200 py-2 dark:border-white/10',
          expanded ? 'px-3' : 'justify-center px-0',
        )}
        title={authUser?.email ?? ''}
      >
        {/* Avatar — รูปโปรไฟล์หรือ initials */}
        {authUser?.avatarUrl && authUser.avatarUrl.startsWith('http') ? (
          <img
            src={authUser.avatarUrl}
            alt={displayName}
            className="h-8 w-8 flex-shrink-0 rounded-full object-cover ring-2 ring-slate-200 dark:ring-white/20"
          />
        ) : (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f97316] to-[#ea580c] text-xs font-bold text-white ring-2 ring-slate-200 dark:ring-white/20">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div
          className={cn(
            'min-w-0 flex-1 transition-opacity duration-150',
            expanded ? 'opacity-100' : 'pointer-events-none absolute opacity-0',
          )}
        >
          <div className="truncate text-[11px] font-medium leading-tight text-slate-900 dark:text-white/90">
            {displayName}
          </div>
          <div className="mt-0.5 truncate text-[10px] leading-tight text-slate-500 dark:text-slate-400">
            {roleLabelText}
          </div>
        </div>
        {/* Logout button — only shown when expanded */}
        <button
          type="button"
          onClick={handleLogout}
          aria-label="ออกจากระบบ"
          title={expanded ? undefined : `ออกจากระบบ (${displayName})`}
          className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-red-400 dark:focus-visible:ring-offset-[#0f172a]',
            expanded ? 'opacity-100' : 'opacity-0 pointer-events-none absolute',
          )}
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        aria-label="เปิดเมนู"
        onClick={toggleSidebar}
        className="fixed left-3 top-3 z-[200] flex h-10 w-10 items-center justify-center rounded-md bg-[#0f172a] text-xl text-white shadow-md dark:bg-[#f97316] md:hidden"
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

      {/* Desktop sidebar — collapsed (56px) by default, expands to 240px on hover.
          Overlays content (fixed + z-100); main content keeps md:ml-14. */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="Main navigation (desktop)"
        className={cn(
          'fixed bottom-0 left-0 top-0 z-[100] hidden flex-col overflow-hidden border-r border-slate-200 bg-white text-slate-900 transition-all duration-200 ease-out md:flex dark:border-white/10 dark:bg-[#0f172a] dark:text-white',
          hovered ? 'w-60 shadow-2xl' : 'w-14',
        )}
      >
        {renderContent(hovered)}
      </aside>

      {/* Mobile sidebar — full-width drawer (240px), slides in/out.
          Always renders content in expanded mode when open. */}
      <aside
        aria-label="Main navigation (mobile)"
        className={cn(
          'fixed bottom-0 left-0 top-0 z-[100] flex w-60 flex-col border-r border-slate-200 bg-white text-slate-900 transition-transform duration-300 md:hidden dark:border-white/10 dark:bg-[#0f172a] dark:text-white',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {renderContent(true)}
      </aside>
    </>
  )
}
