// ============================================================
// Auth Store (Task ID: RBAC-DASHBOARD)
// ============================================================
// จัดการ state ของ user ปัจจุบัน + permissions ฝั่ง client
// - ดึงข้อมูลจาก /api/auth/me ตอน mount
// - ค้างค่าไว้ใน localStorage เพื่อให้ refresh ไม่หาย
// - ใน sandbox/preview mode หากไม่มี user จะใช้ default admin permissions
// ============================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  DEFAULT_PREVIEW_PERMISSIONS,
  computeNavVisibility,
  hasPermission as rbacHasPermission,
  hasAnyPermission as rbacHasAnyPermission,
  canAccessSite as rbacCanAccessSite,
  type NavVisibility,
} from '@/lib/rbac'

export interface CurrentUser {
  id: string
  email: string
  username?: string | null
  name?: string | null
  role: string
  department?: string | null
  permissions: string[]
  allowedSites: string | null
  active: boolean
}

interface AuthState {
  user: CurrentUser | null
  /** โหลดจาก /api/auth/me แล้วหรือยัง */
  initialized: boolean
  /** กำลังโหลดอยู่หรือไม่ */
  loading: boolean
  /** ข้อความ error (ถ้ามี) */
  error: string | null
  setUser: (user: CurrentUser | null) => void
  setInitialized: (v: boolean) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  /** โหลดข้อมูล user จาก server ครั้งแรก */
  fetchMe: () => Promise<void>
  /** Logout — เคลียร์ state */
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      initialized: false,
      loading: false,
      error: null,
      setUser: (user) => set({ user, error: null }),
      setInitialized: (initialized) => set({ initialized }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      fetchMe: async () => {
        set({ loading: true, error: null })
        try {
          const res = await fetch('/api/auth/me', { cache: 'no-store' })
          if (!res.ok) {
            // ไม่ authenticated — ใช้ default preview user
            set({
              user: makePreviewUser(),
              loading: false,
              initialized: true,
              error: null,
            })
            return
          }
          const json = await res.json()
          const user = json?.user as CurrentUser | undefined
          if (user) {
            set({
              user: {
                ...user,
                permissions:
                  Array.isArray(user.permissions) && user.permissions.length > 0
                    ? user.permissions
                    : DEFAULT_PREVIEW_PERMISSIONS,
              },
              loading: false,
              initialized: true,
              error: null,
            })
          } else {
            set({
              user: makePreviewUser(),
              loading: false,
              initialized: true,
              error: null,
            })
          }
        } catch {
          set({
            user: makePreviewUser(),
            loading: false,
            initialized: true,
            error: null,
          })
        }
      },
      logout: () => set({ user: null, initialized: true }),
    }),
    {
      name: 'itam-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user }),
    },
  ),
)

function makePreviewUser(): CurrentUser {
  return {
    id: 'preview',
    email: 'admin@example.com',
    username: 'admin',
    name: 'ผู้ดูแลระบบ (พรีวิว)',
    role: 'admin',
    department: null,
    permissions: DEFAULT_PREVIEW_PERMISSIONS,
    allowedSites: 'ALL',
    active: true,
  }
}

// ---- Selectors / helpers ----

/** คืนค่า permissions ของ user ปัจจุบัน (หรือ default preview ถ้ายังไม่ login) */
export function usePermissions(): string[] {
  return useAuthStore((s) => s.user?.permissions ?? DEFAULT_PREVIEW_PERMISSIONS)
}

/** คืนค่า role ของ user ปัจจุบัน (default 'admin' สำหรับ preview) */
export function useRole(): string {
  return useAuthStore((s) => s.user?.role ?? 'admin')
}

/** คืนค่า allowedSites ของ user ปัจจุบัน */
export function useAllowedSites(): string | null {
  return useAuthStore((s) => s.user?.allowedSites ?? 'ALL')
}

/** เช็ก permission เดี่ยว */
export function useHasPermission(permission: string): boolean {
  const perms = usePermissions()
  return rbacHasPermission(perms, permission)
}

/** เช็ก permission หลายตัว (OR) */
export function useHasAnyPermission(permissions: string[]): boolean {
  const perms = usePermissions()
  return rbacHasAnyPermission(perms, permissions)
}

/** เช็กว่าเข้าถึง site ได้หรือไม่ */
export function useCanAccessSite(site: string): boolean {
  const allowed = useAllowedSites()
  return rbacCanAccessSite(allowed, site)
}

/** คำนวณ visibility ของ nav items ตาม permissions */
export function useNavVisibility(): NavVisibility {
  const perms = usePermissions()
  return computeNavVisibility(perms)
}
