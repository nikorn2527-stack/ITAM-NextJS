'use client'

/**
 * use-webauthn.ts — React hook สำหรับ WebAuthn / Passkey.
 *
 * Usage:
 *   const { isSupported, register, login, listCredentials, removeCredential } = useWebAuthn()
 *
 * - register(): ลงทะเบียนลายนิ้วมือปัจจุบันให้ผู้ใช้ที่ login แล้ว
 * - login(email): ล็อกอินด้วยลายนิ้วมือ (ต้องการ email เพื่อหา credential)
 * - isSupported: boolean (รองรับ browser/อุปกรณ์ไหม)
 */

import * as React from 'react'
import {
  startRegistration,
  startAuthentication,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/browser'

export interface WebAuthnCredential {
  id: string
  deviceType: string | null
  name: string | null
  createdAt: string
  lastUsedAt: string | null
}

export function useWebAuthn() {
  const [isSupported, setIsSupported] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    // Check if browser supports WebAuthn
    setIsSupported(
      typeof window !== 'undefined' &&
        'PublicKeyCredential' in window &&
        typeof navigator !== 'undefined' &&
        !!navigator.credentials,
    )
  }, [])

  const getToken = (): string | null => {
    if (typeof window === 'undefined') return null
    try {
      return localStorage.getItem('itam.token')
    } catch {
      return null
    }
  }

  async function register(name?: string): Promise<{ verified: boolean; name?: string } | null> {
    if (!isSupported) {
      setError('เบราว์เซอร์นี้ไม่รองรับลายนิ้วมือ — กรุณาใช้ Chrome/Safari/Edge เวอร์ชันใหม่')
      return null
    }
    setLoading(true)
    setError(null)
    try {
      const token = getToken()
      // Step 1: begin
      const beginRes = await fetch('/api/auth/webauthn/register/begin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name }),
      })
      if (!beginRes.ok) {
        const j = await beginRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'เริ่มการลงทะเบียนล้มเหลว')
      }
      const { options } = await beginRes.json()

      // Step 2: browser prompt
      const credential = await startRegistration({ optionsJSON: options })

      // Step 3: finish (verify)
      const finishRes = await fetch('/api/auth/webauthn/register/finish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          credential,
          deviceType: detectDeviceType(),
          name: name ?? null,
        }),
      })
      if (!finishRes.ok) {
        const j = await finishRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'ยืนยันลายนิ้วมือล้มเหลว')
      }
      const result = await finishRes.json()
      return { verified: true, name: result.name }
    } catch (e) {
      // User cancellation is expected — don't show error toast for that
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort')) {
        setError(null)
      } else {
        setError(msg)
      }
      return null
    } finally {
      setLoading(false)
    }
  }

  async function login(email: string): Promise<{ token: string; user: unknown } | null> {
    if (!isSupported) {
      setError('เบราว์เซอร์นี้ไม่รองรับลายนิ้วมือ')
      return null
    }
    setLoading(true)
    setError(null)
    try {
      // Step 1: begin
      const beginRes = await fetch('/api/auth/webauthn/login/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!beginRes.ok) {
        const j = await beginRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'เริ่มการยืนยันตัวตนล้มเหลว')
      }
      const { options } = await beginRes.json()

      // Step 2: browser prompt (Touch ID / Face ID / Windows Hello)
      const credential = (await startAuthentication({ optionsJSON: options })) as AuthenticationResponseJSON

      // Step 3: finish (verify + get JWT)
      const finishRes = await fetch('/api/auth/webauthn/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, credential }),
      })
      if (!finishRes.ok) {
        const j = await finishRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'ยืนยันลายนิ้วมือล้มเหลว')
      }
      const result = await finishRes.json()
      return { token: result.token, user: result.user }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort')) {
        setError(null)
      } else {
        setError(msg)
      }
      return null
    } finally {
      setLoading(false)
    }
  }

  async function listCredentials(): Promise<WebAuthnCredential[]> {
    const token = getToken()
    if (!token) return []
    const res = await fetch('/api/auth/webauthn/credentials', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const j = await res.json()
    return j.credentials ?? []
  }

  async function removeCredential(id: string): Promise<boolean> {
    const token = getToken()
    if (!token) return false
    const res = await fetch(`/api/auth/webauthn/credentials?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok
  }

  return {
    isSupported,
    loading,
    error,
    register,
    login,
    listCredentials,
    removeCredential,
    clearError: () => setError(null),
  }
}

/** Detect device type from user agent (for nicer labels). */
function detectDeviceType(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios-touchid-faceid'
  if (/mac/.test(ua)) return 'macos-touchid'
  if (/windows/.test(ua)) return 'windows-hello'
  if (/android/.test(ua)) return 'android-fingerprint'
  return 'webauthn'
}
