'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Lock, User as UserIcon, Eye, EyeOff, AlertCircle, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '@/store/auth-store'

/**
 * itam-login.tsx — full-screen login page.
 *
 * Layout:
 *   - Left: branded gradient panel (hidden on mobile)
 *   - Right: card with username/password + เข้าสู่ระบบ button
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
        className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[#f97316]/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative grid w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md md:grid-cols-2"
      >
        {/* Left brand panel */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-[#f97316]/95 to-[#c2410c] p-8 text-white md:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-2xl backdrop-blur">
                📦
              </div>
              <div>
                <div className="text-xl font-bold">Asset Mgmt</div>
                <div className="text-xs text-white/80">IT Asset Management</div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-bold leading-snug">
              ระบบจัดการสินทรัพย์ไอที<br />ครบวงจร ปลอดภัย
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f97316] text-xl text-white">
              📦
            </div>
            <div>
              <div className="text-base font-bold text-slate-800 dark:text-slate-100">Asset Mgmt</div>
              <div className="text-xs text-slate-500">IT Asset Management</div>
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
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:border-[#f97316] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
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
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:border-[#f97316] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]/40"
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
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#f97316] text-sm font-semibold text-white shadow-lg shadow-[#f97316]/20 transition-all hover:bg-[#ea580c] hover:shadow-[#f97316]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-900"
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

          {/* Footer hint */}
          <div className="mt-6 space-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-400 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span>🔒 ระบบบันทึกทุกการเข้าใช้งาน</span>
              <span>ล็อก 5 ครั้ง / รอ 5 นาที</span>
            </div>
            <div className="text-center">
              ติดต่อผู้ดูแลระบบหากลืมรหัสผ่าน
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
