'use client'

/**
 * Smart QR Router Page — /qr/[type]/[id]?action=xxx
 *
 * เมื่อสแกน Smart QR จะเข้ามาที่หน้านี้ แล้ว:
 *   1. Resolve short ID → full device/accessory ID
 *   2. แสดงหน้าตาม action:
 *      - repair: เปิดฟอร์มแจ้งซ่อม (เลือกอุปกรณ์อัตโนมัติ)
 *      - view: เปิด device detail sheet
 *      - meter: เปิดหน้าจดมิเตอร์ (เลือกอุปกรณ์อัตโนมัติ)
 *      - sticker: เปิดหน้าพิมพ์สติกเกอร์
 *      - transfer: เปิด dialog ย้ายอุปกรณ์
 *   3. บันทึก audit log ของการสแกน
 */

import * as React from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Loader2, AlertCircle, CheckCircle2, Wrench, Eye, Gauge, Printer, ArrowLeftRight } from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'
import { parseSmartQr, resolveQrToDevice, getActionLabel, type QrAction } from '@/lib/smart-qr'
import { toast } from 'sonner'

export default function SmartQrRouterPage() {
  const params = useParams<{ type: string; id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const setActivePage = useAppStore((s) => s.setActivePage)
  const setPendingDeviceId = useAppStore((s) => s.setPendingDeviceId)
  const token = useAuthStore((s) => s.token)

  const [status, setStatus] = React.useState<'loading' | 'success' | 'error' | 'unauthorized'>('loading')
  const [deviceInfo, setDeviceInfo] = React.useState<{
    deviceId: string
    accessoryId?: string
    assetCode?: string
    name?: string
    brand?: string
    model?: string
  } | null>(null)

  const action = (searchParams.get('action') ?? 'repair') as QrAction
  const type = params.type as 'd' | 'a' | 's' | 'w'
  const id = params.id

  React.useEffect(() => {
    async function resolve() {
      // Check auth
      if (!token) {
        setStatus('unauthorized')
        return
      }

      try {
        const payload = parseSmartQr(
          `${typeof window !== 'undefined' ? window.location.origin : ''}/qr/${type}/${id}?action=${action}`,
        )
        const result = await resolveQrToDevice(payload, token)

        if (result.notFound || !result.deviceId) {
          setStatus('error')
          return
        }

        setDeviceInfo({
          deviceId: result.deviceId,
          accessoryId: result.accessoryId,
        })
        setStatus('success')

        // Route based on action
        setTimeout(() => {
          switch (action) {
            case 'repair':
              // Go to devices page + open repair form for this device
              setPendingDeviceId(result.deviceId)
              setActivePage('itam-work-orders')
              toast.success(`สแกนสำเร็จ — เปิดหน้าแจ้งซ่อมสำหรับอุปกรณ์นี้`)
              break
            case 'view':
              // Go to devices page + open detail sheet
              setPendingDeviceId(result.deviceId)
              setActivePage('itam-devices')
              toast.success(`สแกนสำเร็จ — เปิดข้อมูลอุปกรณ์`)
              break
            case 'meter':
              // Go to meter page with this device pre-selected
              setPendingDeviceId(result.deviceId)
              setActivePage('itam-meter-keyboard')
              toast.success(`สแกนสำเร็จ — เปิดหน้าจดมิเตอร์`)
              break
            case 'sticker':
              // Go to devices page + trigger sticker print
              setPendingDeviceId(result.deviceId)
              setActivePage('itam-devices')
              toast.info(`สแกนสำเร็จ — กดปุ่มพิมพ์สติกเกอร์เพื่อพิมพ์`)
              break
            case 'transfer':
              // Go to devices page + open transfer dialog
              setPendingDeviceId(result.deviceId)
              setActivePage('itam-devices')
              toast.success(`สแกนสำเร็จ — เปิดหน้าย้ายอุปกรณ์`)
              break
            default:
              setActivePage('itam-devices')
          }
          router.push('/')
        }, 1500)
      } catch (err) {
        console.error('[Smart QR] resolve failed:', err)
        setStatus('error')
      }
    }

    resolve()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id, action, token])

  // ── Render ──
  const actionLabel = getActionLabel(action)
  const actionIcon = {
    repair: Wrench,
    view: Eye,
    meter: Gauge,
    sticker: Printer,
    transfer: ArrowLeftRight,
  }[action] ?? Eye

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-12 w-12 animate-spin text-[#f97316]" />
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
            กำลังประมวลผล QR Code...
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {actionLabel} — กำลังค้นหาอุปกรณ์
          </p>
        </div>
      </div>
    )
  }

  if (status === 'unauthorized') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
        <AlertCircle className="h-12 w-12 text-amber-500" />
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
            กรุณาเข้าสู่ระบบ
          </p>
          <p className="mt-1 text-sm text-slate-500">
            ต้องเข้าสู่ระบบก่อนสแกน QR Code
          </p>
        </div>
        <a
          href="/"
          className="mt-4 rounded-lg bg-[#f97316] px-6 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
        >
          เข้าสู่ระบบ
        </a>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
        <AlertCircle className="h-12 w-12 text-rose-500" />
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
            ไม่พบอุปกรณ์
          </p>
          <p className="mt-1 text-sm text-slate-500">
            ไม่พบอุปกรณ์สำหรับ QR Code นี้ — อาจถูกลบหรือย้ายแล้ว
          </p>
          <p className="mt-2 font-mono text-xs text-slate-400">
            ID: {id} · Action: {actionLabel}
          </p>
        </div>
        <a
          href="/"
          className="mt-4 rounded-lg border border-slate-300 px-6 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
        >
          กลับหน้าหลัก
        </a>
      </div>
    )
  }

  // Success
  const ActionIcon = actionIcon
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
        <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          สแกนสำเร็จ!
        </p>
        <p className="mt-1 text-sm text-slate-500">
          กำลังเปิด: {actionLabel}
        </p>
        {deviceInfo?.assetCode && (
          <p className="mt-2 font-mono text-xs text-slate-400">
            {deviceInfo.assetCode}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <ActionIcon className="h-3.5 w-3.5" />
        กำลังเปลี่ยนหน้า...
      </div>
    </div>
  )
}
