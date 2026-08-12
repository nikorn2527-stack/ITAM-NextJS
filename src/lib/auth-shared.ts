/**
 * auth-shared.ts — pure RBAC types & constants (NO Node.js deps).
 *
 * Safe to import from client components. Server-only code lives in
 * `auth.ts` which re-exports everything from here.
 */

// ─── Types ────────────────────────────────────────────────────────────
export type Permission =
  | 'VIEW_DASHBOARD'
  | 'VIEW_DEVICES'
  | 'VIEW_ANALYTICS'
  | 'METER_WRITE'
  | 'DEVICE_EDIT'
  | 'DEVICE_DELETE'
  | 'DEVICE_TRANSFER'
  | 'LIFECYCLE_EDIT'
  | 'MASTER_DATA_EDIT'
  | 'EXPORT_PRINT'
  | 'PRINT'
  | 'ADMIN'
  | 'USER_MANAGE'
  | 'SYSTEM_CONFIG'

export type Role = 'superadmin' | 'admin' | 'editor' | 'meter' | 'viewer'

/** Shape returned to the frontend (no secrets). */
export interface AuthUser {
  email: string
  role: Role
  name: string | null
  username: string | null
  allowedSites: string | 'ALL'
  permissions: Permission[]
}

/** Internal — the user record as stored in `user_permissions`. */
export interface UserPermissionRow {
  id: string
  email: string
  role: string
  active: boolean
  name: string | null
  username: string | null
  passwordHash: string | null
  passwordSalt: string | null
  remark?: string | null
  lastLoginAt: string | null
  allowedSites: string | null
}

// ─── Role ↔ permission map (mirror of Code.gs ROLE_PERMISSIONS) ───────
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: [
    'VIEW_DASHBOARD', 'VIEW_DEVICES', 'VIEW_ANALYTICS', 'METER_WRITE',
    'DEVICE_EDIT', 'DEVICE_DELETE', 'DEVICE_TRANSFER', 'LIFECYCLE_EDIT',
    'MASTER_DATA_EDIT', 'EXPORT_PRINT', 'PRINT', 'ADMIN',
    'USER_MANAGE', 'SYSTEM_CONFIG',
  ],
  admin: [
    'VIEW_DASHBOARD', 'VIEW_DEVICES', 'VIEW_ANALYTICS', 'METER_WRITE',
    'DEVICE_EDIT', 'DEVICE_DELETE', 'DEVICE_TRANSFER', 'LIFECYCLE_EDIT',
    'MASTER_DATA_EDIT', 'EXPORT_PRINT', 'PRINT', 'ADMIN',
  ],
  editor: [
    'VIEW_DASHBOARD', 'VIEW_DEVICES', 'VIEW_ANALYTICS', 'METER_WRITE',
    'DEVICE_EDIT', 'DEVICE_TRANSFER', 'LIFECYCLE_EDIT',
    'EXPORT_PRINT', 'PRINT',
  ],
  meter: [
    'VIEW_DASHBOARD', 'VIEW_DEVICES', 'VIEW_ANALYTICS', 'METER_WRITE',
    'PRINT',
  ],
  viewer: [
    'VIEW_DASHBOARD', 'VIEW_DEVICES', 'VIEW_ANALYTICS', 'PRINT',
  ],
}

const ROLE_ALIASES: Record<string, Role> = {
  superadmin: 'superadmin',
  'super admin': 'superadmin',
  'super-admin': 'superadmin',
  admin: 'admin',
  administrator: 'admin',
  ผู้ดูแล: 'admin',
  แอดมิน: 'admin',
  ผู้ดูแลระบบ: 'admin',
  editor: 'editor',
  edit: 'editor',
  manager: 'editor',
  เจ้าหน้าที่: 'editor',
  ผู้แก้ไข: 'editor',
  meter: 'meter',
  meterreader: 'meter',
  meter_reader: 'meter',
  จดมิเตอร์: 'meter',
  viewer: 'viewer',
  read: 'viewer',
  readonly: 'viewer',
  view: 'viewer',
  ผู้ชม: 'viewer',
  ผู้ดูรายงาน: 'viewer',
}

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'ผู้ดูแลสูงสุด',
  admin: 'ผู้ดูแลระบบ',
  editor: 'เจ้าหน้าที่จัดการข้อมูล',
  meter: 'ผู้จดมิเตอร์',
  viewer: 'ผู้ดูรายงาน',
}

export function normalizeRole(role: string | null | undefined): Role {
  const key = String(role ?? '').trim().toLowerCase()
  if (key in ROLE_PERMISSIONS) return key as Role
  return ROLE_ALIASES[key] ?? 'viewer'
}

export function getRolePermissions(role: string | null | undefined): Permission[] {
  return ROLE_PERMISSIONS[normalizeRole(role)] ?? ROLE_PERMISSIONS.viewer
}

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  return getRolePermissions(role).includes(permission)
}

export function isAdminRole(role: string | null | undefined): boolean {
  const r = normalizeRole(role)
  return r === 'admin' || r === 'superadmin'
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'superadmin'
}

// ─── Site access (mirror of Auth.gs parseAllowedSitesValue + canAccessSite) ─
export function getAllowedSites(user: Pick<UserPermissionRow, 'role' | 'allowedSites'>): string[] | 'ALL' {
  if (isSuperAdminRole(user.role)) return 'ALL'
  const raw = String(user.allowedSites ?? '').trim()
  if (!raw || raw.toUpperCase() === 'ALL') return 'ALL'
  const arr = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return arr.length ? arr : 'ALL'
}

export function canAccessSite(
  user: Pick<UserPermissionRow, 'role' | 'allowedSites'>,
  site: string | null | undefined,
): boolean {
  const allowed = getAllowedSites(user)
  if (allowed === 'ALL') return true
  const t = String(site ?? '').trim()
  if (!t) return false
  return allowed.includes(t)
}

/**
 * Build a Prisma `where` fragment that restricts `Device.site` to the user's
 * allowed sites. Returns an empty object when the user has 'ALL'.
 */
export function siteFilterForUser(
  user: Pick<UserPermissionRow, 'role' | 'allowedSites'>,
  field: 'site' = 'site',
): Record<string, unknown> {
  const allowed = getAllowedSites(user)
  if (allowed === 'ALL') return {}
  return { [field]: { in: allowed } }
}

/** Convert a DB row → safe AuthUser (no hashes/salts leak). */
export function toAuthUser(row: UserPermissionRow): AuthUser {
  const role = normalizeRole(row.role)
  return {
    email: row.email,
    role,
    name: row.name,
    username: row.username,
    allowedSites: isSuperAdminRole(role) ? 'ALL' : (row.allowedSites ?? 'ALL'),
    permissions: ROLE_PERMISSIONS[role],
  }
}
