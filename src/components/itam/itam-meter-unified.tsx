'use client'

/**
 * ItamMeterUnified — หน้าจดมิเตอร์รวม (1 หน้า 2 โหมด)
 *
 * ผู้ใช้ขอให้รวมจดมิเตอร์เป็น 1 หน้า ไม่แยก — ที่นี่จึงรวม:
 *   1. โหมด "จดมิเตอร์" (Keyboard) — ป้อนเร็ว พิมพ์-Enter-เลื่อนอัตโนมัติ
 *   2. โหมด "ประวัติมิเตอร์" — ดู/แก้ไขการจดย้อนหลัง
 *
 * ใช้ Tabs ด้านบนสลับโหมด — ทั้งสองโหมดแชร์ query cache เดียวกัน (invalidate แล้วสดทั้งคู่)
 */

import * as React from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PenLine, History } from 'lucide-react'
import { ItamMeterKeyboard } from './itam-meter-keyboard'
import { ItamMeter } from './itam-meter'

export function ItamMeterUnified() {
  const [mode, setMode] = React.useState<'entry' | 'history'>('entry')

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'entry' | 'history')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="entry" className="gap-1.5">
            <PenLine className="h-4 w-4" />
            จดมิเตอร์
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" />
            ประวัติมิเตอร์
          </TabsTrigger>
        </TabsList>
        <TabsContent value="entry" className="mt-4">
          <ItamMeterKeyboard />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <ItamMeter />
        </TabsContent>
      </Tabs>
    </div>
  )
}
