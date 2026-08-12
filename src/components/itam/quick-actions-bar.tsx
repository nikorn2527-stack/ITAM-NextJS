'use client'

/**
 * QuickActionsBar — 1-click access to the 4 most common tasks.
 *
 * Designed from the USER's perspective:
 *   "I open the app, I see what I need to do, I click once, I'm doing it."
 *
 * The "จดมิเตอร์" button is the primary CTA — it's the most frequent task
 * (monthly, hundreds of devices). When there's an active cycle with unread
 * devices, it shows the count and pulses to draw attention.
 *
 * Layout: horizontal scroll on mobile, single row on desktop.
 */

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PenLine, ScanLine, PackageSearch, FileText, Zap } from 'lucide-react'

export interface QuickActionsBarProps {
  /** Number of devices still unread in the active cycle (0 = all done) */
  unreadCount: number
  /** Whether there's an active meter cycle */
  hasActiveCycle: boolean
  onGoMeter: () => void
  onGoDevices: () => void
  onGoPaper: () => void
  onScan: () => void
}

export function QuickActionsBar({
  unreadCount,
  hasActiveCycle,
  onGoMeter,
  onGoDevices,
  onGoPaper,
  onScan,
}: QuickActionsBarProps) {
  const meterLabel = hasActiveCycle
    ? unreadCount > 0
      ? `จดมิเตอร์ (${unreadCount} ค้าง)`
      : 'จดมิเตอร์ (ครบแล้ว ✓)'
    : 'จดมิเตอร์'

  return (
    <div
      className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:overflow-visible"
      role="toolbar"
      aria-label="Quick actions"
    >
      {/* Primary CTA: จดมิเตอร์ — pulses when there's unread work */}
      <Button
        onClick={onGoMeter}
        size="lg"
        className={cn(
          'flex-shrink-0 gap-2 font-semibold',
          hasActiveCycle && unreadCount > 0
            ? 'animate-pulse border-[#f97316] bg-[#f97316] text-white hover:bg-[#ea580c]'
            : 'bg-slate-800 text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600',
        )}
        title={
          hasActiveCycle
            ? unreadCount > 0
              ? `ยังไม่ได้จดมิเตอร์ ${unreadCount} เครื่อง — คลิกเพื่อเริ่มจด (Keyboard mode)`
              : 'จดมิเตอร์ครบทุกเครื่องแล้วในรอบนี้'
            : 'ไปหน้าจดมิเตอร์ (ยังไม่มีรอบที่เปิดอยู่)'
        }
      >
        <PenLine className="h-5 w-5" />
        {meterLabel}
        {hasActiveCycle && unreadCount > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-[#f97316]">
            {unreadCount}
          </span>
        )}
      </Button>

      {/* Scan QR — fastest way to find a specific device */}
      <Button
        onClick={onScan}
        variant="outline"
        size="lg"
        className="flex-shrink-0 gap-2 border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488]/10 dark:border-[#14b8a6] dark:text-[#14b8a6]"
        title="สแกน QR Code เพื่อค้นหาอุปกรณ์ทันที"
      >
        <ScanLine className="h-5 w-5" />
        สแกน QR
      </Button>

      {/* ค้นหาอุปกรณ์ */}
      <Button
        onClick={onGoDevices}
        variant="outline"
        size="lg"
        className="flex-shrink-0 gap-2"
        title="ค้นหา/กรอง/ดูรายการอุปกรณ์ทั้งหมด"
      >
        <PackageSearch className="h-5 w-5" />
        ค้นหาอุปกรณ์
      </Button>

      {/* วิเคราะห์กระดาษ */}
      <Button
        onClick={onGoPaper}
        variant="outline"
        size="lg"
        className="flex-shrink-0 gap-2"
        title="ดูสถิติการใช้กระดาษรายเดือน/รายสาขา"
      >
        <FileText className="h-5 w-5" />
        วิเคราะห์กระดาษ
      </Button>

      {/* Keyboard hint for power users */}
      <div className="ml-auto hidden items-center gap-1.5 px-2 text-xs text-slate-400 sm:flex">
        <Zap className="h-3 w-3" />
        <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] dark:border-slate-700 dark:bg-slate-800">
          ⌘K
        </kbd>
        <span>ค้นหาทุกอย่าง</span>
      </div>
    </div>
  )
}
