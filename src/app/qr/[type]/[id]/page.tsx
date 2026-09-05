'use client'

/**
 * Smart QR Router Page — /qr/[type]/[id]?action=xxx
 *
 * Behavior:
 *
 *  1. If staff auth token present:
 *     Resolve short ID → route to staff page (repair/view/meter/sticker/transfer).
 *
 *  2. If NO staff auth token (public user — nurse/visitor):
 *     - For type=d (device):
 *       a. Show <PublicDeviceCard> with sanitized device info.
 *       b. User picks one of 3 actions:
 *          • "แจ้งซ่อมด้วย LINE"  → save pendingQrAction → /api/auth/line/login → return → <PublicRepairForm tier="line">
 *          • "แจ้งซ่อมด้วยเบอร์มือถือ" → <PublicRepairForm tier="anonymous">
 *          • "เข้าสู่ระบบพนักงาน" → go to / (staff login)
 *       c. On form success → <PublicRepairSuccess> with woNumber + tracking link.
 *     - For type=a (accessory):
 *       Show public device card (resolve via accessory's parent).
 *     - For type=s/w (site/workorder): direct redirect (no public UI here).
 *
 *  3. Audit log entry on every scan (success or fail).
 */

import * as React from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'
import {
  parseSmartQr,
  resolveQrToDevice,
  getActionLabel,
  type QrAction,
} from '@/lib/smart-qr'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  PublicDeviceCard,
  type PublicDeviceData,
} from '@/components/public/public-device-card'
import { PublicRepairForm, type PublicRepairFormProps } from '@/components/public/public-repair-form'
import { useLineSession } from '@/hooks/use-line-session'

type PublicView =
  | { kind: 'card' }
  | { kind: 'form-line' }
  | { kind: 'form-anonymous' }
  | { kind: 'success'; data: { woNumber: string; trackableUrl: string; requiresVerification: boolean } }

interface ResolvedDevice {
  deviceId: string
  accessoryId?: string
  siteCode?: string
  assetCode?: string
  name?: string
  brand?: string
  model?: string
  shortId: string
}

export default function SmartQrRouterPage() {
  const params = useParams<{ type: string; id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const setActivePage = useAppStore((s) => s.setActivePage)
  const setPendingDeviceId = useAppStore((s) => s.setPendingDeviceId)
  const token = useAuthStore((s) => s.token)

  const action = (searchParams.get('action') ?? 'repair') as QrAction
  const type = params.type as 'd' | 'a' | 's' | 'w'
  const id = params.id

  const [staffStatus, setStaffStatus] = React.useState<
    'loading' | 'success' | 'error' | 'unauthorized'
  >('loading')
  const [staffDevice, setStaffDevice] = React.useState<ResolvedDevice | null>(null)

  // Public mode state (only used when no staff token)
  const [publicView, setPublicView] = React.useState<PublicView>({ kind: 'card' })
  const [publicDevice, setPublicDevice] = React.useState<PublicDeviceData | null>(null)
  const [publicLoading, setPublicLoading] = React.useState(true)
  const [publicError, setPublicError] = React.useState<string | null>(null)

  // LINE session (for Tier 1/2 form)
  const { session: lineSession, loading: lineLoading } = useLineSession()

  // After LINE login callback returns, sessionStorage carries pendingQrAction.
  // If user lands here with a line_session cookie AND pendingQrAction, auto-swap
  // to the LINE repair form.
  React.useEffect(() => {
    if (!token && lineSession && publicView.kind === 'card') {
      try {
        const pending = sessionStorage.getItem('pendingQrAction')
        if (pending === `/qr/${type}/${id}?action=repair`) {
          setPublicView({ kind: 'form-line' })
        }
      } catch {
        // sessionStorage may be unavailable (privacy mode)
      }
    }
  }, [token, lineSession, publicView.kind, type, id])

  // ── Staff mode (token present) ─────────────────────────────────────────
  React.useEffect(() => {
    if (!token) {
      setStaffStatus('unauthorized')
      return
    }
    if (type === 's' || type === 'w') {
      // Site / WorkOrder QR — no public UI; redirect home with pending.
      setActivePage('itam-devices')
      router.push('/')
      return
    }

    let cancelled = false
    async function resolve() {
      try {
        const payload = parseSmartQr(
          `${typeof window !== 'undefined' ? window.location.origin : ''}/qr/${type}/${id}?action=${action}`,
        )
        const result = await resolveQrToDevice(payload, token!)
        if (cancelled) return
        if (result.notFound || !result.deviceId) {
          setStaffStatus('error')
          return
        }

        // Fetch minimal device info for routing context
        let siteCode: string | undefined
        let assetCode: string | undefined
        let name: string | undefined
        let brand: string | undefined
        let model: string | undefined
        try {
          const devRes = await fetch(
            `/api/devices/${result.deviceId}?fields=site,assetCode,name,brand,model`,
            { headers: { Authorization: `Bearer ${token}` } },
          )
          if (devRes.ok) {
            const devJson = await devRes.json()
            const dev = devJson.data ?? devJson.device ?? devJson
            siteCode = dev.site
            assetCode = dev.assetCode
            name = dev.name
            brand = dev.brand
            model = dev.model
          }
        } catch {
          // Non-fatal — staff can still navigate
        }

        setStaffDevice({
          deviceId: result.deviceId,
          accessoryId: result.accessoryId,
          siteCode,
          assetCode,
          name,
          brand,
          model,
          shortId: id,
        })
        setStaffStatus('success')

        // Route based on action
        setTimeout(() => {
          if (cancelled) return
          switch (action) {
            case 'repair':
              setPendingDeviceId(result.deviceId)
              setActivePage('itam-work-orders')
              toast.success(`สแกนสำเร็จ — เปิดหน้าแจ้งซ่อม`)
              break
            case 'view':
              setPendingDeviceId(result.deviceId)
              setActivePage('itam-devices')
              toast.success(`สแกนสำเร็จ — เปิดข้อมูลอุปกรณ์`)
              break
            case 'meter':
              setPendingDeviceId(result.deviceId)
              setActivePage('itam-meter-keyboard')
              toast.success(`สแกนสำเร็จ — เปิดหน้าจดมิเตอร์`)
              break
            case 'sticker':
              setPendingDeviceId(result.deviceId)
              setActivePage('itam-devices')
              toast.info(`สแกนสำเร็จ — กดปุ่มพิมพ์สติกเกอร์เพื่อพิมพ์`)
              break
            case 'transfer':
              setPendingDeviceId(result.deviceId)
              setActivePage('itam-devices')
              toast.success(`สแกนสำเร็จ — เปิดหน้าย้ายอุปกรณ์`)
              break
            default:
              setActivePage('itam-devices')
          }
          router.push('/')
        }, 1200)
      } catch (err) {
        if (cancelled) return
        console.error('[Smart QR] resolve failed:', err)
        setStaffStatus('error')
      }
    }
    resolve()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id, action, token])

  // ── Public mode (no token) — fetch public device info ──────────────────
  React.useEffect(() => {
    if (token || type === 's' || type === 'w') return
    let cancelled = false
    setPublicLoading(true)
    setPublicError(null)

    async function fetchPublic() {
      try {
        const res = await fetch(
          `/api/public/devices/${encodeURIComponent(id)}?action=${action}`,
          { cache: 'no-store' },
        )
        if (cancelled) return
        if (!res.ok) {
          if (res.status === 404) {
            setPublicError('ไม่พบอุปกรณ์สำหรับ QR Code นี้ — อาจถูกลบหรือย้ายแล้ว')
          } else {
            setPublicError(`เกิดข้อผิดพลาด (${res.status})`)
          }
          setPublicLoading(false)
          return
        }
        const json = await res.json()
        if (cancelled) return
        setPublicDevice(json.data ?? null)
        setPublicLoading(false)
      } catch {
        if (cancelled) return
        setPublicError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
        setPublicLoading(false)
      }
    }
    fetchPublic()
    return () => {
      cancelled = true
    }
  }, [token, type, id, action])

  // ── Public: redirect s/w types (no public UI for those) ───────────────
  React.useEffect(() => {
    if (!token && (type === 's' || type === 'w')) {
      // Save pending → staff login → return
      try {
        sessionStorage.setItem('pendingQrAction', `/qr/${type}/${id}?action=${action}`)
      } catch {}
      router.replace('/')
    }
  }, [token, type, id, action, router])

  // ── Render: staff mode ────────────────────────────────────────────────
  if (token) {
    if (staffStatus === 'loading') {
      return <FullPageLoader label={`กำลังประมวลผล QR Code... — ${getActionLabel(action)}`} />
    }
    if (staffStatus === 'error') {
      return (
        <FullPageMessage
          icon={AlertCircle}
          iconColor="text-rose-500"
          title="ไม่พบอุปกรณ์"
          subtitle="ไม่พบอุปกรณ์สำหรับ QR Code นี้ — อาจถูกลบหรือย้ายแล้ว"
          detail={`ID: ${id} · Action: ${getActionLabel(action)}`}
        />
      )
    }
    return (
      <FullPageMessage
        icon={Loader2}
        iconColor="text-emerald-500"
        iconClassName="animate-spin"
        title="สแกนสำเร็จ!"
        subtitle={`กำลังเปิด: ${getActionLabel(action)}`}
        detail={staffDevice?.assetCode}
      />
    )
  }

  // ── Render: public mode ───────────────────────────────────────────────

  // LINE loading state when user just came back from LINE login
  if (lineLoading) {
    return <FullPageLoader label="กำลังตรวจสอบสถานะ LINE..." />
  }

  // Form: LINE tier
  if (publicView.kind === 'form-line') {
    if (!publicDevice) {
      return <FullPageLoader label="กำลังโหลดข้อมูลอุปกรณ์..." />
    }
    const props: PublicRepairFormProps = {
      deviceShortId: id,
      siteCode: publicDevice.site ?? publicDevice.siteCode ?? 'UNKNOWN',
      tier: 'line',
      lineSession: lineSession
        ? {
            userId: lineSession.userId,
            displayName: lineSession.displayName,
            pictureUrl: lineSession.pictureUrl,
            scopePhone: lineSession.scopePhone,
          }
        : null,
      deviceInfo: {
        assetCode: publicDevice.assetCode,
        name: publicDevice.name,
        brand: publicDevice.brand,
        model: publicDevice.model,
        site: publicDevice.site ?? publicDevice.siteCode ?? '',
        location: publicDevice.location ?? undefined,
      },
      onSuccess: (data) =>
        setPublicView({ kind: 'success', data }),
      onCancel: () => setPublicView({ kind: 'card' }),
    }
    return (
      <PublicFormShell title="แจ้งซ่อมด้วย LINE" onBack={() => setPublicView({ kind: 'card' })}>
        <PublicRepairForm {...props} />
      </PublicFormShell>
    )
  }

  // Form: anonymous tier
  if (publicView.kind === 'form-anonymous') {
    if (!publicDevice) {
      return <FullPageLoader label="กำลังโหลดข้อมูลอุปกรณ์..." />
    }
    const props: PublicRepairFormProps = {
      deviceShortId: id,
      siteCode: publicDevice.site ?? publicDevice.siteCode ?? 'UNKNOWN',
      tier: 'anonymous',
      lineSession: null,
      deviceInfo: {
        assetCode: publicDevice.assetCode,
        name: publicDevice.name,
        brand: publicDevice.brand,
        model: publicDevice.model,
        site: publicDevice.site ?? publicDevice.siteCode ?? '',
        location: publicDevice.location ?? undefined,
      },
      onSuccess: (data) =>
        setPublicView({ kind: 'success', data }),
      onCancel: () => setPublicView({ kind: 'card' }),
    }
    return (
      <PublicFormShell title="แจ้งซ่อมด้วยเบอร์มือถือ" onBack={() => setPublicView({ kind: 'card' })}>
        <PublicRepairForm {...props} />
      </PublicFormShell>
    )
  }

  // Success view — let PublicRepairForm's internal success state show, OR
  // we can show a custom success screen here. Since PublicRepairForm already
  // renders success internally, this branch is just a fallback.
  if (publicView.kind === 'success') {
    return (
      <FullPageMessage
        icon={AlertCircle}
        iconColor="text-emerald-500"
        title="ส่งเรื่องแจ้งซ่อมสำเร็จ"
        subtitle={`เลขที่: ${publicView.data.woNumber}`}
        detail={
          publicView.data.requiresVerification
            ? 'รอเจ้าหน้าที่ติดต่อกลับเพื่อยืนยันตัวตน'
            : 'ติดตามสถานะได้ที่ปุ่มด้านล่าง'
        }
        actionLabel="ติดตามสถานะ"
        actionHref={publicView.data.trackableUrl}
      />
    )
  }

  // Default: public device card
  if (publicLoading) {
    return <FullPageLoader label="กำลังโหลดข้อมูลอุปกรณ์..." />
  }
  if (publicError) {
    return (
      <FullPageMessage
        icon={AlertCircle}
        iconColor="text-rose-500"
        title="ไม่พบอุปกรณ์"
        subtitle={publicError}
        detail={`ID: ${id} · Action: ${getActionLabel(action)}`}
        actionLabel="กลับหน้าหลัก"
        actionHref="/"
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-4 px-3 sm:py-8 sm:px-4">
      <div className="mx-auto max-w-md">
        <PublicDeviceCard
          shortId={id}
          action={action}
          onLoginLine={() => {
            // Save pending so /api/auth/line/callback knows where to return
            try {
              sessionStorage.setItem(
                'pendingQrAction',
                `/qr/${type}/${id}?action=${action}`,
              )
            } catch {}
            const redirect = `/qr/${type}/${id}?action=${action}`
            window.location.href = `/api/auth/line/login?redirect=${encodeURIComponent(redirect)}`
          }}
          onShowRepairForm={(tier) =>
            setPublicView({
              kind: tier === 'line' ? 'form-line' : 'form-anonymous',
            })
          }
          onStaffLogin={() => {
            try {
              sessionStorage.setItem(
                'pendingQrAction',
                `/qr/${type}/${id}?action=${action}`,
              )
            } catch {}
            router.push('/')
          }}
        />
      </div>
    </div>
  )
}

// ── Helper components (kept local to avoid extra imports) ───────────────

function FullPageLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
      <Loader2 className="h-12 w-12 animate-spin text-[#f97316]" />
      <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
    </div>
  )
}

interface FullPageMessageProps {
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  iconClassName?: string
  title: string
  subtitle?: string
  detail?: string
  actionLabel?: string
  actionHref?: string
}

function FullPageMessage({
  icon: Icon,
  iconColor,
  iconClassName,
  title,
  subtitle,
  detail,
  actionLabel,
  actionHref,
}: FullPageMessageProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 p-4">
      <Icon className={cn('h-12 w-12', iconColor, iconClassName)} />
      <div className="text-center">
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          {title}
        </p>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        )}
        {detail && (
          <p className="mt-2 font-mono text-xs text-slate-400">{detail}</p>
        )}
      </div>
      {actionLabel && actionHref && (
        <a
          href={actionHref}
          className="mt-4 rounded-lg bg-[#f97316] px-6 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
        >
          {actionLabel}
        </a>
      )}
      {!actionLabel && (
        <a
          href="/"
          className="mt-4 rounded-lg border border-slate-300 px-6 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
        >
          กลับหน้าหลัก
        </a>
      )}
    </div>
  )
}

function PublicFormShell({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="ย้อนกลับ"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </h1>
      </header>
      <main className="mx-auto max-w-md px-3 py-4 sm:py-6">
        {children}
      </main>
    </div>
  )
}
