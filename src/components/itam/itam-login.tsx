'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldAlert,
  UserPlus,
  KeyRound,
  Mail,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth-store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface OrgProfile {
  appName?: string
  appTagline?: string
  logoUrl?: string | null
  primaryColor?: string
  accentColor?: string
}

/** Decide whether logoUrl is an emoji (single short string) or a URL/path. */
function isEmoji(s: string): boolean {
  // Heuristic: short length, no '/' or 'http' — treat as emoji/text
  return s.length <= 4 && !/https?:|\//i.test(s)
}

/** Darken a hex color by a percentage (for gradient end). */
function darkenHex(hex: string, pct = 0.18): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const num = parseInt(m[1], 16)
  let r = (num >> 16) & 0xff
  let g = (num >> 8) & 0xff
  let b = num & 0xff
  r = Math.max(0, Math.round(r * (1 - pct)))
  g = Math.max(0, Math.round(g * (1 - pct)))
  b = Math.max(0, Math.round(b * (1 - pct)))
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/**
 * itam-login.tsx — full-screen login page.
 *
 * Layout:
 *   - Left: branded gradient panel (hidden on mobile)
 *   - Right: card with username/password + เข้าสู่ระบบ button
 *   - Below the form: 3 action buttons
 *       1. "ขอเข้าใช้งาน" → opens registration dialog (Method 1)
 *       2. "ลืมรหัสผ่าน" → opens forgot-password dialog
 *       3. "รับลิงก์ลงทะเบียนทางอีเมล" → opens invite request dialog (Method 2)
 *
 * URL params:
 *   - ?register=1 → auto-open the registration dialog on mount
 *
 * Features:
 *   - Enter-to-submit
 *   - Show/hide password
 *   - Loading state during fetch
 *   - Error message for invalid creds
 *   - Lockout banner when API returns 429 (rate-limited)
 *   - After success: store token via auth-store.login() → AppShell auto-redirects
 */
export function ItamLogin() {
  const login = useAuthStore((s) => s.login)
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPwd, setShowPwd] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = React.useState<number | null>(null)

  // ── Organization profile (dynamic branding) ───────────────────────
  const { data: profile } = useQuery<OrgProfile>({
    queryKey: ['org-profile'],
    queryFn: () =>
      fetch('/api/settings/org-profile')
        .then((r) => r.json())
        .then((d) => d.profile as OrgProfile),
    staleTime: 5 * 60 * 1000,
  })

  const appName = profile?.appName || 'ระบบจัดการสินทรัพย์'
  const appTagline = profile?.appTagline || 'Asset Management System'
  const primaryColor = profile?.primaryColor || '#f97316'
  const accentColor = profile?.accentColor || '#0d9488'
  const brandGradientFrom = primaryColor
  const brandGradientTo = darkenHex(primaryColor, 0.22)

  // Logo: URL/path → render <img>; emoji/short → render text; null → fallback 📦
  const rawLogo = profile?.logoUrl
  const logoIsUrl = !!rawLogo && !isEmoji(rawLogo)
  const logoEmoji = rawLogo && isEmoji(rawLogo) ? rawLogo : '📦'
  const LogoMark = (
    <>
      {logoIsUrl ? (
        <img
          src={rawLogo as string}
          alt={appName}
          className="h-full w-full rounded-xl object-cover"
        />
      ) : (
        <span className="text-2xl">{logoEmoji}</span>
      )}
    </>
  )

  // ── Dialogs ──────────────────────────────────────────────────────
  const [registerOpen, setRegisterOpen] = React.useState(false)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [forgotOpen, setForgotOpen] = React.useState(false)

  // Auto-open registration dialog when ?register=1 is in the URL
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('register') === '1') {
        setRegisterOpen(true)
        // Clean the URL so the dialog doesn't reopen on refresh
        const url = new URL(window.location.href)
        url.searchParams.delete('register')
        window.history.replaceState({}, '', url.toString())
      }
    } catch {
      /* SSR / no window */
    }
  }, [])

  // Countdown for lockout
  const [remaining, setRemaining] = React.useState(0)
  React.useEffect(() => {
    if (lockedUntil == null) return
    const t = setInterval(() => {
      const ms = Math.max(0, lockedUntil - Date.now())
      setRemaining(Math.ceil(ms / 1000))
      if (ms <= 0) {
        setLockedUntil(null)
        setError(null)
      }
    }, 500)
    return () => clearInterval(t)
  }, [lockedUntil])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading || lockedUntil != null) return
    if (!username.trim() || !password) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน')
      return
    }
    setLoading(true)
    setError(null)
    const res = await login(username, password)
    setLoading(false)
    if (!res.ok) {
      // detect lockout — login route returns 429 with retryAfterMs in body
      setError(res.error || 'เข้าสู่ระบบไม่สำเร็จ')
      // Heuristic: if the error message mentions waiting, set a 5-min lockout
      if (res.error && /รอ|locked|attempt/i.test(res.error)) {
        setLockedUntil(Date.now() + 5 * 60 * 1000)
      }
    }
  }

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: `${primaryColor}33` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: `${accentColor}1f` }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative grid w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md md:grid-cols-2"
      >
        {/* Left brand panel */}
        <div
          className="relative hidden flex-col justify-between p-8 text-white md:flex"
          style={{
            backgroundImage: `linear-gradient(to bottom right, ${brandGradientFrom}F2, ${brandGradientTo}F2)`,
          }}
        >
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white/15 backdrop-blur">
                {LogoMark}
              </div>
              <div>
                <div className="text-xl font-bold">{appName}</div>
                <div className="text-xs text-white/80">{appTagline}</div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-bold leading-snug">
              {appName}
              <br />ครบวงจร ปลอดภัย
            </h2>
            <ul className="space-y-2 text-sm text-white/85">
              <li className="flex items-center gap-2"><span>✓</span> ควบคุมสิทธิ์ 5 ระดับ (RBAC)</li>
              <li className="flex items-center gap-2"><span>✓</span> แยกข้อมูลตามสาขา (Row-level)</li>
              <li className="flex items-center gap-2"><span>✓</span> จดมิเตอร์รายเดือน + ประวัติการย้าย</li>
              <li className="flex items-center gap-2"><span>✓</span> ประวัติการใช้งานครบทุกการทำรายการ</li>
            </ul>
          </div>
          <div className="text-xs text-white/60">
            Powered by PNG TEAM · v1.0
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex flex-col justify-center bg-white p-8 dark:bg-slate-900">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <div
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg text-xl text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {LogoMark}
            </div>
            <div>
              <div className="text-base font-bold text-slate-800 dark:text-slate-100">{appName}</div>
              <div className="text-xs text-slate-500">{appTagline}</div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            กรุณาใส่ชื่อผู้ใช้และรหัสผ่านของคุณ
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                ชื่อผู้ใช้ / อีเมล
              </label>
              <div className="relative">
                <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading || lockedUntil != null}
                  placeholder="username หรือ email@example.com"
                  style={{ ['--brand' as string]: primaryColor }}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:border-[var(--brand)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                รหัสผ่าน
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || lockedUntil != null}
                  placeholder="••••••••"
                  style={{ ['--brand' as string]: primaryColor }}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:border-[var(--brand)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error / Lockout */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                >
                  {lockedUntil != null ? (
                    <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  )}
                  <div>
                    <div>{error}</div>
                    {lockedUntil != null && remaining > 0 && (
                      <div className="mt-0.5 text-xs font-medium text-rose-800 dark:text-rose-200">
                        กรุณารอ {minutes}:{seconds.toString().padStart(2, '0')} นาที
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || lockedUntil != null}
              style={{
                backgroundColor: primaryColor,
                ['--brand' as string]: primaryColor,
                boxShadow: `0 10px 25px -5px ${primaryColor}40`,
              }}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white shadow-lg transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-900"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : lockedUntil != null ? (
                <>
                  <Lock className="h-4 w-4" />
                  ถูกล็อกชั่วคราว
                </>
              ) : (
                <>เข้าสู่ระบบ</>
              )}
            </button>
          </form>

          {/* Action buttons — register / forgot / invite link */}
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => setRegisterOpen(true)}
              style={{
                ['--brand' as string]: primaryColor,
                borderColor: `${primaryColor}66`,
                backgroundColor: `${primaryColor}0d`,
                color: primaryColor,
              }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors hover:brightness-95"
            >
              <UserPlus className="h-4 w-4" />
              ขอเข้าใช้งาน
            </button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                style={{ ['--brand' as string]: primaryColor }}
                className="flex items-center gap-1.5 text-slate-500 transition-colors hover:text-[var(--brand)] dark:text-slate-400"
              >
                <KeyRound className="h-3.5 w-3.5" />
                ลืมรหัสผ่าน
              </button>
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                style={{ ['--brand' as string]: primaryColor }}
                className="flex items-center gap-1.5 text-slate-500 transition-colors hover:text-[var(--brand)] dark:text-slate-400"
              >
                <Mail className="h-3.5 w-3.5" />
                รับลิงก์ลงทะเบียนทางอีเมล
              </button>
            </div>
          </div>

          {/* Footer hint */}
          <div className="mt-6 space-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-400 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span>🔒 ระบบบันทึกทุกการเข้าใช้งาน</span>
              <span>ล็อก 5 ครั้ง / รอ 5 นาที</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      <RegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  )
}

// ─── Register dialog (Method 1) ─────────────────────────────────
function RegisterDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    roleRequest: 'viewer',
    password: '',
    confirmPassword: '',
  })
  const [loading, setLoading] = React.useState(false)
  const [done, setDone] = React.useState(false)

  function reset() {
    setForm({
      name: '',
      email: '',
      phone: '',
      department: '',
      roleRequest: 'viewer',
      password: '',
      confirmPassword: '',
    })
    setDone(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      toast.error('กรุณากรอกชื่อ, อีเมล และรหัสผ่าน')
      return
    }
    if (form.password.length < 6) {
      toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }
    if (form.password !== form.confirmPassword) {
      toast.error('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || undefined,
          department: form.department.trim() || undefined,
          roleRequest: form.roleRequest,
          password: form.password,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        testLink?: string
      }
      if (!res.ok || !j.ok) {
        throw new Error(j.error || 'ส่งคำขอไม่สำเร็จ')
      }
      setDone(true)
      toast.success('ส่งคำขอแล้ว รอผู้ดูแลอนุมัติ')
      if (j.testLink) {
        toast.info(`SMTP ไม่ได้ตั้งค่า — ทดสอบได้ที่ลิงก์ (เช็ค console)`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ส่งคำขอไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ขอเข้าใช้งานระบบ ITAM</DialogTitle>
          <DialogDescription>
            กรอกข้อมูลด้านล่างเพื่อส่งคำขอใช้งาน — รอผู้ดูแลอนุมัติ
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-6 text-center">
            <div className="mb-3 text-5xl">✅</div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              ส่งคำขอแล้ว รอผู้ดูแลอนุมัติ
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              ทางเราจะส่งอีเมลแจ้งเตือนไปยัง {form.email} เมื่อบัญชีของคุณได้รับการอนุมัติ
            </p>
            <Button className="mt-4" onClick={() => onOpenChange(false)}>
              ปิด
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reg-name">
                ชื่อ-นามสกุล <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="reg-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={loading}
                placeholder="สมชาย ใจดี"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">
                อีเมล <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="reg-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={loading}
                placeholder="you@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="reg-phone">เบอร์โทร</Label>
                <Input
                  id="reg-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  disabled={loading}
                  placeholder="081-234-5678"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-dept">แผนก</Label>
                <Input
                  id="reg-dept"
                  value={form.department}
                  onChange={(e) =>
                    setForm({ ...form, department: e.target.value })
                  }
                  disabled={loading}
                  placeholder="ไอที"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>สิทธิ์ที่ขอ</Label>
              <Select
                value={form.roleRequest}
                onValueChange={(v) => setForm({ ...form, roleRequest: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">ผู้ดูรายงาน (Viewer)</SelectItem>
                  <SelectItem value="staff">เจ้าหน้าที่ (Staff)</SelectItem>
                  <SelectItem value="coordinator">ประสานงาน (Coordinator)</SelectItem>
                  <SelectItem value="manager">ผู้จัดการ (Manager)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-pwd">
                รหัสผ่าน <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="reg-pwd"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                disabled={loading}
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-confirm">
                ยืนยันรหัสผ่าน <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="reg-confirm"
                type="password"
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm({ ...form, confirmPassword: e.target.value })
                }
                disabled={loading}
                placeholder="ยืนยันรหัสผ่าน"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    กำลังส่ง...
                  </>
                ) : (
                  'ส่งคำขอ'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Invite request dialog (Method 2) ───────────────────────────
function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [email, setEmail] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [testLink, setTestLink] = React.useState<string | null>(null)

  function reset() {
    setEmail('')
    setDone(false)
    setTestLink(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('กรุณาระบุอีเมลที่ถูกต้อง')
      return
    }
    setLoading(true)
    setTestLink(null)
    try {
      const res = await fetch('/api/auth/request-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        testLink?: string
      }
      if (!res.ok || !j.ok) {
        throw new Error(j.error || 'ส่งลิงก์ไม่สำเร็จ')
      }
      setDone(true)
      toast.success('ส่งลิงก์ไปยังอีเมลแล้ว กรุณาตรวจสอบกล่องอีเมล')
      if (j.testLink) {
        setTestLink(j.testLink)
        toast.warning(`SMTP ไม่ได้ตั้งค่า — ลิงก์สำหรับทดสอบ: ${j.testLink}`, {
          duration: 8000,
        })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ส่งลิงก์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>รับลิงก์ลงทะเบียนทางอีเมล</DialogTitle>
          <DialogDescription>
            สำหรับผู้ใช้ใหม่ที่ยังไม่มีบัญชี — เราจะส่งลิงก์ลงทะเบียนไปยังอีเมลของคุณ (หมดอายุใน 24 ชั่วโมง)
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-6 text-center">
            <div className="mb-3 text-5xl">📧</div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              ส่งลิงก์ไปยังอีเมลแล้ว
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              กรุณาตรวจสอบกล่องอีเมล {email} และคลิกลิงก์เพื่อลงทะเบียน
            </p>
            {testLink && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                <div className="mb-1 font-semibold">
                  ⚠️ SMTP ยังไม่ได้ตั้งค่า — ลิงก์สำหรับทดสอบ:
                </div>
                <a
                  href={testLink}
                  className="break-all underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {testLink}
                </a>
              </div>
            )}
            <Button className="mt-4" onClick={() => onOpenChange(false)}>
              ปิด
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">
                อีเมล <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="you@example.com"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    กำลังส่ง...
                  </>
                ) : (
                  'ส่งลิงก์'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Forgot password dialog ─────────────────────────────────────
function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [email, setEmail] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [testLink, setTestLink] = React.useState<string | null>(null)

  function reset() {
    setEmail('')
    setDone(false)
    setTestLink(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('กรุณาระบุอีเมลที่ถูกต้อง')
      return
    }
    setLoading(true)
    setTestLink(null)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        testLink?: string
      }
      if (!res.ok || !j.ok) {
        throw new Error(j.error || 'ส่งลิงก์รีเซ็ตไม่สำเร็จ')
      }
      setDone(true)
      toast.success('หากอีเมลมีอยู่ในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้')
      if (j.testLink) {
        setTestLink(j.testLink)
        toast.warning(`SMTP ไม่ได้ตั้งค่า — ลิงก์สำหรับทดสอบ: ${j.testLink}`, {
          duration: 8000,
        })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ส่งลิงก์รีเซ็ตไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ลืมรหัสผ่าน</DialogTitle>
          <DialogDescription>
            กรอกอีเมลที่ใช้สมัคร — เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้ (หมดอายุใน 1 ชั่วโมง)
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-6 text-center">
            <div className="mb-3 text-5xl">🔐</div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              ตรวจสอบอีเมลของคุณ
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              หากอีเมล {email} มีอยู่ในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้
            </p>
            {testLink && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                <div className="mb-1 font-semibold">
                  ⚠️ SMTP ยังไม่ได้ตั้งค่า — ลิงก์สำหรับทดสอบ:
                </div>
                <a
                  href={testLink}
                  className="break-all underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {testLink}
                </a>
              </div>
            )}
            <Button className="mt-4" onClick={() => onOpenChange(false)}>
              ปิด
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">
                อีเมล <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="you@example.com"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    กำลังส่ง...
                  </>
                ) : (
                  'ส่งลิงก์รีเซ็ต'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
