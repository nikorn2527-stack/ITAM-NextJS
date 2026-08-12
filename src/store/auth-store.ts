/**
 * auth-store.ts — client-side Zustand auth state.
 *
 * Responsibilities:
 *   • Persist the JWT + safe user profile in localStorage.
 *   • Provide `login(username, password)` that calls /api/itam/auth/login.
 *   • Provide `logout()` that calls /api/itam/auth/logout and clears state.
 *   • Provide `checkAuth()` that pings /api/itam/auth/me to verify the token
 *     is still valid (used on app boot).
 *
 * API clients elsewhere read `useAuthStore.getState().token` to add the
 * `Authorization: Bearer ...` header — see `authFetch()` below.
 */

import { create } from 'zustand'

export interface AuthStoreUser {
  email: string
  role: 'superadmin' | 'admin' | 'editor' | 'meter' | 'viewer'
  name: string | null
  username: string | null
  allowedSites: string | 'ALL'
  permissions: string[]
}

interface AuthState {
  token: string | null
  user: AuthStoreUser | null
  isAuthenticated: boolean
  isBooting: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  checkAuth: () => Promise<boolean>
  setSession: (token: string, user: AuthStoreUser) => void
  clear: () => void
}

const TOKEN_KEY = 'itam.token'
const USER_KEY = 'itam.user'

function readStored(): { token: string | null; user: AuthStoreUser | null } {
  if (typeof window === 'undefined') return { token: null, user: null }
  try {
    const token = window.localStorage.getItem(TOKEN_KEY)
    const userRaw = window.localStorage.getItem(USER_KEY)
    const user = userRaw ? (JSON.parse(userRaw) as AuthStoreUser) : null
    return { token, user }
  } catch {
    return { token: null, user: null }
  }
}

function writeStored(token: string, user: AuthStoreUser) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
    window.localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    /* ignore quota errors */
  }
}

function clearStored() {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isBooting: true,

  setSession: (token, user) => {
    writeStored(token, user)
    set({ token, user, isAuthenticated: true, isBooting: false })
  },

  clear: () => {
    clearStored()
    set({ token: null, user: null, isAuthenticated: false, isBooting: false })
  },

  login: async (username, password) => {
    try {
      const res = await fetch('/api/itam/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.token || !data.user) {
        return { ok: false, error: (data && data.error) || `เข้าสู่ระบบไม่สำเร็จ (${res.status})` }
      }
      get().setSession(data.token as string, data.user as AuthStoreUser)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'network error' }
    }
  },

  logout: async () => {
    const token = get().token
    try {
      if (token) {
        // Fire-and-forget — even on failure we clear local state
        await fetch('/api/itam/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
      }
    } catch {
      /* ignore */
    } finally {
      get().clear()
    }
  },

  checkAuth: async () => {
    const { token } = get()
    if (!token) {
      set({ isBooting: false })
      return false
    }
    try {
      const res = await fetch('/api/itam/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        get().clear()
        return false
      }
      const data = await res.json()
      if (data.user) {
        // refresh stored user (in case role/sites changed on server)
        writeStored(token, data.user as AuthStoreUser)
        set({ user: data.user as AuthStoreUser, isAuthenticated: true, isBooting: false })
        return true
      }
      get().clear()
      return false
    } catch {
      set({ isBooting: false })
      return false
    }
  },
}))

/**
 * Hydrate the store from localStorage on first client render. Called once
 * from the AppShell mount effect.
 */
export function hydrateAuthFromStorage(): void {
  if (typeof window === 'undefined') return
  const { token, user } = readStored()
  if (token && user) {
    useAuthStore.setState({ token, user, isAuthenticated: true, isBooting: true })
  } else {
    useAuthStore.setState({ isBooting: false })
  }
}

/**
 * Wrapper around `fetch` that auto-injects the Bearer token. Returns the
 * original Response so callers can use res.json()/res.ok as usual.
 *
 * If a 401 is returned, the auth store is cleared (the UI will redirect to
 * the login screen via its boot effect).
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token
  const headers = new Headers(init.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(input, { ...init, headers })
  if (res.status === 401) {
    // Token invalid/expired — clear local state so the app redirects to login
    useAuthStore.getState().clear()
  }
  return res
}
