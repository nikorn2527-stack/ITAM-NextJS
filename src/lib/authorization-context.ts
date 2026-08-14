/**
 * authorization-context.ts — Phase 1 authorization foundation.
 *
 * Builds the AuthorizationContext for every protected request, following
 * the mandatory sequence recommended in the ITAM Shared Platform doc §5.1:
 *
 *   authenticate → load active grants → check permission → resolve requested
 *   site → build scoped query → check target resource → transaction → audit
 *
 * This module is the **single source of truth** for computing effective
 * permissions and Site scope. API routes should call `buildAuthorizationContext`
 * after `requireAuth` and use the returned `ctx` to:
 *   1. Check functional permissions (`ctx.can(perm)`)
 *   2. Build Prisma where clauses (`ctx.siteWhere()`)
 *   3. Validate that a target resource's Site is in scope (`ctx.canAccessSite()`)
 *
 * Task ID: PHASE1-AUTH-FOUNDATION
 */

import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import {
  type Permission,
  type Role,
  ROLE_PERMISSIONS,
  normalizeRole,
  getRolePermissions,
  getUserPermissions,
} from '@/lib/auth-shared'
import {
  normalizeSiteCode,
  parseAllowedSites,
} from '@/lib/site-scope'
import type { AuthUser } from '@/lib/auth-shared'

// ── Types ─────────────────────────────────────────────
export interface SiteGrant {
  siteCode: string
  roleCode: string
  permissions: Permission[]
  validFrom: Date | null
  validUntil: Date | null
}

export type SiteScope =
  | { kind: 'all'; siteCodes: string[] }
  | { kind: 'sites'; siteCodes: string[] }
  | { kind: 'none'; siteCodes: string[] }

export interface AuthorizationContext {
  userId: string
  email: string
  globalRole: Role
  isSuperAdmin: boolean
  /** Active Site grants (from UserSiteGrant). Empty if falling back to legacy. */
  grants: SiteGrant[]
  /** Effective Site scope computed from grants + legacy allowedSites. */
  siteScope: SiteScope
  /** Effective permissions = global role permissions ∪ per-site permissions. */
  effectivePermissions: Permission[]
  /** True if scope was derived from legacy `allowedSites` (dual-read fallback). */
  usedLegacyFallback: boolean

  /** Check if the user has a functional permission (global or any site grant). */
  can: (perm: Permission) => boolean
  /** Check if the user can access a specific Site code. */
  canAccessSite: (siteCode: string | null | undefined) => boolean
  /** Build a Prisma `where` fragment for a `site` field based on scope. */
  siteWhere: (field?: string) => Record<string, unknown>
  /** Get the user's role at a specific Site (or global role if superadmin). */
  roleAtSite: (siteCode: string | null | undefined) => Role | null
}

// ── Permission catalog cache (in-process, refreshed on demand) ──
// In Phase 1, we cache the Role/Permission catalog in memory to avoid
// a DB hit on every request. The cache is invalidated when the catalog
// is modified through the admin API. For multi-instance deployments,
// a future phase should use a shared cache (Redis) or read on every
// request with a short TTL.
interface CatalogCache {
  rolePermissions: Map<string, Set<Permission>> // roleCode → set of permission codes
  permissions: Map<string, { resource: string; action: string }> // permissionCode → meta
  cachedAt: number
}
const CATALOG_TTL_MS = 5 * 60 * 1000 // 5 minutes
let _catalogCache: CatalogCache | null = null

async function loadCatalog(): Promise<CatalogCache> {
  if (_catalogCache && Date.now() - _catalogCache.cachedAt < CATALOG_TTL_MS) {
    return _catalogCache
  }
  const [rolePerms, perms] = await Promise.all([
    db.rolePermission.findMany({
      select: { roleCode: true, permissionCode: true },
    }),
    db.permission.findMany({
      select: { code: true, resource: true, action: true, active: true },
    }),
  ])
  const rolePermissionsMap = new Map<string, Set<Permission>>()
  for (const rp of rolePerms) {
    if (!rolePermissionsMap.has(rp.roleCode)) {
      rolePermissionsMap.set(rp.roleCode, new Set())
    }
    rolePermissionsMap.get(rp.roleCode)!.add(rp.permissionCode as Permission)
  }
  const permissionsMap = new Map<string, { resource: string; action: string }>()
  for (const p of perms) {
    if (p.active) {
      permissionsMap.set(p.code, { resource: p.resource, action: p.action })
    }
  }
  _catalogCache = {
    rolePermissions: rolePermissionsMap,
    permissions: permissionsMap,
    cachedAt: Date.now(),
  }
  return _catalogCache
}

/** Invalidate the catalog cache — call after Role/Permission changes. */
export function invalidateCatalogCache(): void {
  _catalogCache = null
}

// ── Migration mode ────────────────────────────────────
// AUTHZ_MIGRATION_MODE controls how the system handles the transition
// from legacy allowedSites to UserSiteGrant:
//
//   - 'dual_read' (default): Read UserSiteGrant first; if no grants,
//     fall back to legacy allowedSites WITH an audit warning. Every
//     request with a target Site still checks canAccessSite(). This
//     is the ONLY mode that allows fallback.
//
//   - 'strict': No fallback. Users without UserSiteGrant rows get
//     no Site access (fail-closed). Use this after backfill is complete.
//
// 'fail_open' is NOT supported — it would bypass Site authorization
// globally, which is explicitly prohibited by the security policy.
//
// In production, startup should reject if any non-superadmin user has
// allowedSites='ALL' without an explicit migration exception (see
// validateProductionAuthzConfig below).
export type AuthzMigrationMode = 'dual_read' | 'strict'

export function getAuthzMigrationMode(): AuthzMigrationMode {
  const raw = (process.env.AUTHZ_MIGRATION_MODE ?? 'dual_read').trim()
  if (raw === 'strict') return 'strict'
  return 'dual_read' // default + only other valid value
}

/**
 * Validate that the production authorization configuration is safe.
 * Call this at startup (e.g. in a server module or health check).
 *
 * Returns a list of warnings/errors. In production, the caller should
 * reject startup if any errors are present.
 */
export interface AuthzConfigIssue {
  level: 'error' | 'warn'
  message: string
}

export async function validateProductionAuthzConfig(): Promise<AuthzConfigIssue[]> {
  const issues: AuthzConfigIssue[] = []
  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) {
    // Check for non-superadmin users with allowedSites='ALL'
    // These are security risks — they should have explicit grants instead.
    const riskyUsers = await db.user.findMany({
      where: {
        active: true,
        role: { not: { equals: 'superadmin' } },
        allowedSites: { equals: 'ALL' },
      },
      select: { id: true, email: true, username: true, role: true },
    })
    for (const u of riskyUsers) {
      issues.push({
        level: 'error',
        message: `User ${u.email} (${u.role}) has allowedSites='ALL' — convert to explicit UserSiteGrant or set AUTHZ_MIGRATION_EXCEPTIONS`,
      })
    }
  }

  return issues
}

// ── Main builder ──────────────────────────────────────
/**
 * Build the AuthorizationContext for the authenticated user.
 *
 * @param user The AuthUser from requireAuth()
 * @param userId The Prisma User.id
 * @param legacyAllowedSites The User.allowedSites string (for fallback)
 *
 * Sequence:
 *   1. superadmin → all sites, all permissions
 *   2. Load UserSiteGrant rows (active, within validFrom/validUntil)
 *   3. If no grants → fall back to legacy allowedSites (with audit warning)
 *   4. Compute effective permissions = global role ∪ per-site permissions
 *   5. Compute site scope
 */
export async function buildAuthorizationContext(
  user: AuthUser,
  userId: string,
  legacyAllowedSites?: string | null,
): Promise<AuthorizationContext> {
  const globalRole = normalizeRole(user.role)
  const isSuperAdmin = globalRole === 'superadmin'

  // superadmin bypasses Site grants — has access to everything
  if (isSuperAdmin) {
    const globalPerms = getRolePermissions(globalRole)
    return {
      userId,
      email: user.email,
      globalRole,
      isSuperAdmin: true,
      grants: [],
      siteScope: { kind: 'all', siteCodes: [] },
      effectivePermissions: globalPerms,
      usedLegacyFallback: false,
      can: (perm) => globalPerms.includes(perm),
      canAccessSite: () => true,
      siteWhere: () => ({}),
      roleAtSite: () => globalRole,
    }
  }

  // Load catalog (cached) for permission lookup
  const catalog = await loadCatalog()

  // 1) Load active UserSiteGrant rows
  const now = new Date()
  const grantRows = await db.userSiteGrant.findMany({
    where: {
      userId,
      active: true,
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
      ],
    },
    select: {
      siteCode: true,
      roleCode: true,
      validFrom: true,
      validUntil: true,
    },
  })

  let grants: SiteGrant[]
  let usedLegacyFallback = false

  if (grantRows.length > 0) {
    // Use explicit grants
    grants = grantRows.map((g) => {
      const normalizedSite = normalizeSiteCode(g.siteCode)!
      const roleCode = g.roleCode as Role
      // Get permissions from catalog (DB) or fall back to ROLE_PERMISSIONS
      const catalogPerms = catalog.rolePermissions.get(g.roleCode)
      let perms: Permission[]
      if (catalogPerms && catalogPerms.size > 0) {
        perms = Array.from(catalogPerms)
      } else {
        // Fall back to in-code ROLE_PERMISSIONS if catalog isn't seeded yet
        perms = getRolePermissions(roleCode)
      }
      return {
        siteCode: normalizedSite,
        roleCode: g.roleCode,
        permissions: perms,
        validFrom: g.validFrom,
        validUntil: g.validUntil,
      }
    })
  } else {
    // 2) Fall back to legacy allowedSites — ONLY in dual_read mode
    // In 'strict' mode, no grants = no access (fail-closed).
    const migrationMode = getAuthzMigrationMode()
    if (migrationMode === 'strict') {
      // No fallback — return no-access context
      return {
        userId,
        email: user.email,
        globalRole,
        isSuperAdmin: false,
        grants: [],
        siteScope: { kind: 'none', siteCodes: [] },
        effectivePermissions: [],
        usedLegacyFallback: false,
        can: () => false,
        canAccessSite: () => false,
        siteWhere: (field = 'site') => ({ [field]: { in: [] } }),
        roleAtSite: () => null,
      }
    }

    // dual_read mode — fall back with audit warning
    usedLegacyFallback = true
    const parsed = parseAllowedSites(legacyAllowedSites)

    // Audit the fallback so we can track migration progress
    await logAudit(
      'AUTH_FALLBACK',
      'User',
      userId,
      `User ${userId} has no UserSiteGrant rows; fell back to allowedSites='${legacyAllowedSites ?? ''}' (dual_read mode). ` +
        `Add explicit grants to retire this fallback.`,
      { userId, allowedSites: legacyAllowedSites ?? '', migrationMode },
    ).catch(() => {
      // best-effort; don't fail the request
    })

    if (parsed.isAll) {
      // Legacy ALL → treat as all-sites with viewer-equivalent permissions
      // from the global role (this is the old behavior)
      // NOTE: This path is a known migration risk. In production with
      // AUTHZ_MIGRATION_MODE=strict, this would not happen.
      const globalPerms = getUserPermissions(
        globalRole,
        user.permissions as unknown as string,
      )
      return {
        userId,
        email: user.email,
        globalRole,
        isSuperAdmin: false,
        grants: [],
        siteScope: { kind: 'all', siteCodes: [] },
        effectivePermissions: globalPerms,
        usedLegacyFallback: true,
        can: (perm) => globalPerms.includes(perm),
        canAccessSite: () => true,
        siteWhere: () => ({}),
        roleAtSite: () => globalRole,
      }
    }

    // Convert legacy site list to grant-like entries using the global role
    grants = parsed.codes.map((siteCode) => ({
      siteCode,
      roleCode: globalRole,
      permissions: getUserPermissions(
        globalRole,
        user.permissions as unknown as string,
      ),
      validFrom: null,
      validUntil: null,
    }))
  }

  // Compute site scope from grants
  const siteCodes = grants.map((g) => g.siteCode)
  const siteScope: SiteScope =
    siteCodes.length === 0
      ? { kind: 'none', siteCodes: [] }
      : { kind: 'sites', siteCodes }

  // Compute effective permissions = global role perms ∪ all per-site perms
  const globalPerms = getUserPermissions(
    globalRole,
    user.permissions as unknown as string,
  )
  const permSet = new Set<Permission>(globalPerms)
  for (const g of grants) {
    for (const p of g.permissions) {
      permSet.add(p)
    }
  }
  const effectivePermissions = Array.from(permSet)

  // Build grant lookup by siteCode
  const grantsBySite = new Map<string, SiteGrant>()
  for (const g of grants) {
    grantsBySite.set(g.siteCode, g)
  }

  return {
    userId,
    email: user.email,
    globalRole,
    isSuperAdmin: false,
    grants,
    siteScope,
    effectivePermissions,
    usedLegacyFallback,
    can: (perm) => effectivePermissions.includes(perm),
    canAccessSite: (siteCode) => {
      if (!siteCode) return false
      const normalized = normalizeSiteCode(siteCode)
      if (!normalized) return false
      return grantsBySite.has(normalized)
    },
    siteWhere: (field = 'site') => {
      if (siteScope.kind === 'all') return {}
      if (siteScope.kind === 'none') return { [field]: { in: [] } }
      return { [field]: { in: siteCodes } }
    },
    roleAtSite: (siteCode) => {
      if (!siteCode) return null
      const normalized = normalizeSiteCode(siteCode)
      if (!normalized) return null
      return (grantsBySite.get(normalized)?.roleCode ?? null) as Role | null
    },
  }
}

// ── Helper: check permission + site scope in one call ──
/**
 * Convenience wrapper for API routes that need to check both a functional
 * permission AND Site scope in one shot.
 *
 * Usage:
 *   const guard = await requirePermissionAndScope(req, 'DEVICE_EDIT', 'UDH')
 *   if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
 *   const ctx = guard.ctx
 */
export async function requirePermissionAndScope(
  user: AuthUser,
  userId: string,
  permission: Permission,
  targetSiteCode?: string | null,
  legacyAllowedSites?: string | null,
): Promise<
  | { ok: true; ctx: AuthorizationContext }
  | { ok: false; status: number; error: string }
> {
  const ctx = await buildAuthorizationContext(user, userId, legacyAllowedSites)

  if (!ctx.can(permission)) {
    return {
      ok: false,
      status: 403,
      error: `ไม่มีสิทธิ์ (${permission}) สำหรับบัญชีนี้`,
    }
  }

  // If a target Site is specified, verify the user has access to it
  if (targetSiteCode && !ctx.canAccessSite(targetSiteCode)) {
    // Return 404 (not 403) to avoid revealing the existence of out-of-scope records
    return {
      ok: false,
      status: 404,
      error: 'ไม่พบรายการที่ระบุ หรือคุณไม่มีสิทธิ์เข้าถึง',
    }
  }

  return { ok: true, ctx }
}
