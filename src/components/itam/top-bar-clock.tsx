'use client'

/**
 * TopBarClock — small live clock that floats at the top-right of the screen
 * (desktop only, md+). Renders the time + a compact Thai Buddhist date so
 * users can glance at the current time without scrolling to the footer.
 *
 * Format: "14:23:05 · วันพุธ 13 ส.ค. 68"
 *   - 14:23:05   — 24-hour time, tabular-nums for stable width
 *   - วันพุธ     — short weekday
 *   - 13 ส.ค.    — day + abbreviated month
 *   - 68         — Buddhist year modulo 100 (2568 → 68)
 *
 * SSR-safe: renders a stable placeholder until mounted (no hydration warning).
 */
import * as React from 'react'
import { useClock } from '@/hooks/use-clock'

// Compact time formatter — "14:23:05"
const TIME_FMT = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

// Compact date formatter — "พุธ 13 ส.ค. 68"
// (weekday: short drops the leading "วัน" — we add it back manually below)
const DATE_FMT = new Intl.DateTimeFormat('th-TH', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: '2-digit',
})

export function TopBarClock() {
  const now = useClock()
  if (!now) {
    // Stable placeholder so the layout width doesn't jump on mount.
    return (
      <div
        className="hidden h-9 items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-2.5 text-[11px] text-slate-400 shadow-sm backdrop-blur md:flex dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-500"
        aria-hidden
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
        <span className="font-mono tabular-nums">--:--:--</span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className="whitespace-nowrap">กำลังโหลด…</span>
      </div>
    )
  }

  const timeStr = TIME_FMT.format(now)
  // Intl weekday:short returns e.g. "พุธ" (no "วัน" prefix). Prefix with
  // "วัน" for natural Thai reading.
  const rawDate = DATE_FMT.format(now)
  const dateStr = rawDate.startsWith('วัน') ? rawDate : `วัน${rawDate}`

  return (
    <div
      className="hidden h-9 items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-2.5 text-[11px] text-slate-700 shadow-sm backdrop-blur md:flex dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-200"
      role="status"
      aria-label={`ขณะนี้เวลา ${timeStr} วันที่ ${dateStr}`}
      title={`ขณะนี้เวลา ${timeStr} วันที่ ${dateStr}`}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#f97316]"
      />
      <span className="font-mono font-semibold tabular-nums tracking-tight">
        {timeStr}
      </span>
      <span className="text-slate-300 dark:text-slate-600">·</span>
      <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
        {dateStr}
      </span>
    </div>
  )
}
