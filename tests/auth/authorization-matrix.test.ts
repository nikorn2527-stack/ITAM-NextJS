/**
 * Authorization Matrix Tests
 *
 * Task ID: PHASE1-AUTH-MATRIX-TESTS
 *
 * Tests the authorization context for the following scenarios:
 *   1. superadmin → all sites, all permissions
 *   2. single-Site admin → only their Site
 *   3. multi-Site admin → only their Sites
 *   4. viewer → read-only permissions
 *   5. expired grant → no access (treated as no grant)
 *   6. no grant (non-superadmin) → no access (fail-closed)
 *   7. cross-Site denial → cannot access Site outside scope
 *
 * Run with: npx tsx tests/auth/authorization-matrix.test.ts
 *
 * These tests use the actual database (SQLite in sandbox) with
 * test users created in setUp and cleaned up in tearDown.
 */

import { db } from '../../src/lib/db'
import {
  buildAuthorizationContext,
  getAuthzMigrationMode,
} from '../../src/lib/authorization-context'
import { hashNewPassword } from '../../src/lib/auth'
import type { AuthUser } from '../../src/lib/auth-shared'
import { normalizeSiteCode } from '../../src/lib/site-scope'

// ── Test helpers ──────────────────────────────────────
interface TestUser {
  id: string
  email: string
  authUser: AuthUser
  cleanup: () => Promise<void>
}

let testCounter = 0
function testEmail(): string {
  testCounter++
  return `test-authz-${Date.now()}-${testCounter}@itam-test.local`
}

async function createTestUser(opts: {
  role: string
  allowedSites?: string | null
  permissions?: string[]
  grants?: Array<{ siteCode: string; roleCode: string; active?: boolean; validFrom?: Date; validUntil?: Date }>
}): Promise<TestUser> {
  const email = testEmail()
  const { hash, salt } = hashNewPassword('test-pass-123')
  const user = await db.user.create({
    data: {
      email,
      username: `testuser${testCounter}`,
      name: `Test User ${testCounter}`,
      role: opts.role,
      allowedSites: opts.allowedSites ?? null,
      passwordHash: hash,
      passwordSalt: salt,
      active: true,
      permissions: opts.permissions ? JSON.stringify(opts.permissions) : null,
    },
  })

  // Create grants if specified
  if (opts.grants) {
    for (const g of opts.grants) {
      // Ensure the Site exists
      const existingSite = await db.site.findUnique({ where: { code: g.siteCode } })
      if (!existingSite) {
        await db.site.create({
          data: { code: g.siteCode, name: `Test Site ${g.siteCode}` },
        })
      }
      await db.userSiteGrant.create({
        data: {
          userId: user.id,
          siteCode: g.siteCode,
          roleCode: g.roleCode,
          active: g.active ?? true,
          validFrom: g.validFrom ?? null,
          validUntil: g.validUntil ?? null,
          createdBy: 'test-setup',
        },
      })
    }
  }

  const authUser: AuthUser = {
    email,
    role: opts.role as AuthUser['role'],
    name: user.name,
    username: user.username,
    allowedSites: (opts.allowedSites ?? '') as string | 'ALL',
    permissions: (opts.permissions ?? []) as AuthUser['permissions'],
    isDemo: false,
  }

  return {
    id: user.id,
    email,
    authUser,
    cleanup: async () => {
      await db.userSiteGrant.deleteMany({ where: { userId: user.id } }).catch(() => {})
      await db.user.delete({ where: { id: user.id } }).catch(() => {})
    },
  }
}

// ── Test runner ───────────────────────────────────────
let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    failures.push(message)
    console.log(`  ✗ ${message}`)
  }
}

async function runTests() {
  console.log('=== Authorization Matrix Tests ===')
  console.log(`Migration mode: ${getAuthzMigrationMode()}`)
  console.log('')

  // ── Test 1: superadmin → all sites, all permissions ──
  console.log('Test 1: superadmin → all sites, all permissions')
  {
    const u = await createTestUser({ role: 'superadmin', allowedSites: 'ALL' })
    try {
      const ctx = await buildAuthorizationContext(u.authUser, u.id, 'ALL')
      assert(ctx.isSuperAdmin === true, 'isSuperAdmin should be true')
      assert(ctx.siteScope.kind === 'all', 'siteScope should be "all"')
      assert(ctx.can('VIEW_DASHBOARD'), 'should have VIEW_DASHBOARD')
      assert(ctx.can('USER_MANAGE'), 'should have USER_MANAGE')
      assert(ctx.can('DEVICE_EDIT'), 'should have DEVICE_EDIT')
      assert(ctx.canAccessSite('UDH'), 'should access UDH')
      assert(ctx.canAccessSite('NKP'), 'should access NKP')
      assert(ctx.canAccessSite('ANYTHING'), 'should access any Site')
      assert(ctx.siteWhere() === undefined || Object.keys(ctx.siteWhere()).length === 0, 'siteWhere should be empty (all sites)')
    } finally {
      await u.cleanup()
    }
  }
  console.log('')

  // ── Test 2: single-Site admin → only their Site ──
  console.log('Test 2: single-Site admin → only their Site')
  {
    const u = await createTestUser({
      role: 'admin',
      grants: [{ siteCode: 'UDH', roleCode: 'admin' }],
    })
    try {
      const ctx = await buildAuthorizationContext(u.authUser, u.id, null)
      assert(!ctx.isSuperAdmin, 'should not be superadmin')
      assert(ctx.siteScope.kind === 'sites', 'siteScope should be "sites"')
      assert(ctx.siteScope.siteCodes.includes('UDH'), 'should include UDH')
      assert(ctx.siteScope.siteCodes.length === 1, 'should have exactly 1 Site')
      assert(ctx.canAccessSite('UDH'), 'should access UDH')
      assert(!ctx.canAccessSite('NKP'), 'should NOT access NKP')
      assert(!ctx.canAccessSite(null), 'should NOT access null Site')
      assert(ctx.can('DEVICE_EDIT'), 'should have DEVICE_EDIT (from admin role)')
      assert(ctx.can('WO_ASSIGN'), 'should have WO_ASSIGN')
    } finally {
      await u.cleanup()
    }
  }
  console.log('')

  // ── Test 3: multi-Site admin → only their Sites ──
  console.log('Test 3: multi-Site admin → only their Sites')
  {
    const u = await createTestUser({
      role: 'admin',
      grants: [
        { siteCode: 'UDH', roleCode: 'admin' },
        { siteCode: 'NKP', roleCode: 'viewer' },
      ],
    })
    try {
      const ctx = await buildAuthorizationContext(u.authUser, u.id, null)
      assert(ctx.siteScope.kind === 'sites', 'siteScope should be "sites"')
      assert(ctx.siteScope.siteCodes.length === 2, 'should have 2 Sites')
      assert(ctx.canAccessSite('UDH'), 'should access UDH')
      assert(ctx.canAccessSite('NKP'), 'should access NKP')
      assert(!ctx.canAccessSite('PPIT'), 'should NOT access PPIT')
      // Effective permissions should include both admin and viewer perms
      assert(ctx.can('DEVICE_EDIT'), 'should have DEVICE_EDIT (from UDH admin)')
      assert(ctx.can('VIEW_DASHBOARD'), 'should have VIEW_DASHBOARD (from both)')
    } finally {
      await u.cleanup()
    }
  }
  console.log('')

  // ── Test 4: viewer → read-only permissions ──
  console.log('Test 4: viewer → read-only permissions')
  {
    const u = await createTestUser({
      role: 'viewer',
      grants: [{ siteCode: 'UDH', roleCode: 'viewer' }],
    })
    try {
      const ctx = await buildAuthorizationContext(u.authUser, u.id, null)
      assert(ctx.can('VIEW_DASHBOARD'), 'should have VIEW_DASHBOARD')
      assert(ctx.can('VIEW_DEVICES'), 'should have VIEW_DEVICES')
      assert(!ctx.can('DEVICE_EDIT'), 'should NOT have DEVICE_EDIT')
      assert(!ctx.can('DEVICE_DELETE'), 'should NOT have DEVICE_DELETE')
      assert(!ctx.can('WO_ASSIGN'), 'should NOT have WO_ASSIGN')
      assert(!ctx.can('STOCK_APPROVE'), 'should NOT have STOCK_APPROVE')
      assert(ctx.canAccessSite('UDH'), 'should access UDH')
    } finally {
      await u.cleanup()
    }
  }
  console.log('')

  // ── Test 5: expired grant → no access ──
  console.log('Test 5: expired grant → no access')
  {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // yesterday
    const u = await createTestUser({
      role: 'admin',
      grants: [
        { siteCode: 'UDH', roleCode: 'admin', validUntil: pastDate },
      ],
    })
    try {
      const ctx = await buildAuthorizationContext(u.authUser, u.id, null)
      // Expired grant should not count
      assert(ctx.siteScope.kind === 'none', 'siteScope should be "none" (expired grant)')
      assert(!ctx.canAccessSite('UDH'), 'should NOT access UDH (expired)')
      assert(ctx.siteScope.siteCodes.length === 0, 'should have 0 Sites')
    } finally {
      await u.cleanup()
    }
  }
  console.log('')

  // ── Test 6: no grant (non-superadmin) → fail-closed ──
  console.log('Test 6: no grant (non-superadmin) → fail-closed')
  {
    const u = await createTestUser({
      role: 'viewer',
      allowedSites: null, // no allowedSites, no grants
    })
    try {
      const ctx = await buildAuthorizationContext(u.authUser, u.id, null)
      // In dual_read mode with no allowedSites, should be fail-closed
      if (getAuthzMigrationMode() === 'strict') {
        assert(ctx.siteScope.kind === 'none', 'strict mode: should be "none"')
        assert(!ctx.canAccessSite('UDH'), 'strict mode: should NOT access any Site')
      } else {
        // dual_read mode: empty allowedSites → no sites (fail-closed after fix)
        assert(ctx.siteScope.kind === 'none', 'dual_read: empty allowedSites should be "none"')
        assert(!ctx.canAccessSite('UDH'), 'dual_read: should NOT access UDH')
      }
    } finally {
      await u.cleanup()
    }
  }
  console.log('')

  // ── Test 7: cross-Site denial ──
  console.log('Test 7: cross-Site denial')
  {
    const u = await createTestUser({
      role: 'admin',
      grants: [{ siteCode: 'UDH', roleCode: 'admin' }],
    })
    try {
      const ctx = await buildAuthorizationContext(u.authUser, u.id, null)
      assert(ctx.canAccessSite('UDH'), 'should access UDH (in scope)')
      assert(!ctx.canAccessSite('NKP'), 'should NOT access NKP (cross-Site)')
      assert(!ctx.canAccessSite('PPIT'), 'should NOT access PPIT (cross-Site)')
      assert(!ctx.canAccessSite(''), 'should NOT access empty string')
      assert(!ctx.canAccessSite(null), 'should NOT access null')
      assert(!ctx.canAccessSite(undefined), 'should NOT access undefined')
      // siteWhere should filter to UDH only
      const where = ctx.siteWhere()
      assert('site' in where, 'siteWhere should have site field')
      const siteFilter = (where as Record<string, unknown>).site as Record<string, unknown>
      assert(Array.isArray(siteFilter.in), 'siteWhere should use in: [...]')
      assert((siteFilter.in as string[]).includes('UDH'), 'siteWhere should include UDH')
      assert((siteFilter.in as string[]).length === 1, 'siteWhere should have exactly 1 Site')
    } finally {
      await u.cleanup()
    }
  }
  console.log('')

  // ── Test 8: future grant (not yet valid) → no access ──
  console.log('Test 8: future grant (not yet valid) → no access')
  {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // next week
    const u = await createTestUser({
      role: 'admin',
      grants: [
        { siteCode: 'UDH', roleCode: 'admin', validFrom: futureDate },
      ],
    })
    try {
      const ctx = await buildAuthorizationContext(u.authUser, u.id, null)
      assert(ctx.siteScope.kind === 'none', 'siteScope should be "none" (future grant)')
      assert(!ctx.canAccessSite('UDH'), 'should NOT access UDH (not yet valid)')
    } finally {
      await u.cleanup()
    }
  }
  console.log('')

  // ── Test 9: inactive grant → no access ──
  console.log('Test 9: inactive grant → no access')
  {
    const u = await createTestUser({
      role: 'admin',
      grants: [
        { siteCode: 'UDH', roleCode: 'admin', active: false },
      ],
    })
    try {
      const ctx = await buildAuthorizationContext(u.authUser, u.id, null)
      assert(ctx.siteScope.kind === 'none', 'siteScope should be "none" (inactive grant)')
      assert(!ctx.canAccessSite('UDH'), 'should NOT access UDH (inactive)')
    } finally {
      await u.cleanup()
    }
  }
  console.log('')

  // ── Test 10: roleAtSite returns correct role ──
  console.log('Test 10: roleAtSite returns correct role')
  {
    const u = await createTestUser({
      role: 'admin',
      grants: [
        { siteCode: 'UDH', roleCode: 'admin' },
        { siteCode: 'NKP', roleCode: 'viewer' },
      ],
    })
    try {
      const ctx = await buildAuthorizationContext(u.authUser, u.id, null)
      assert(ctx.roleAtSite('UDH') === 'admin', 'roleAtSite(UDH) should be admin')
      assert(ctx.roleAtSite('NKP') === 'viewer', 'roleAtSite(NKP) should be viewer')
      assert(ctx.roleAtSite('PPIT') === null, 'roleAtSite(PPIT) should be null (not in scope)')
      assert(ctx.roleAtSite(null) === null, 'roleAtSite(null) should be null')
    } finally {
      await u.cleanup()
    }
  }
  console.log('')

  // ── Summary ──
  console.log('=== Summary ===')
  console.log(`Passed: ${passed}`)
  console.log(`Failed: ${failed}`)
  if (failures.length > 0) {
    console.log('')
    console.log('Failures:')
    for (const f of failures) {
      console.log(`  - ${f}`)
    }
    process.exit(1)
  } else {
    console.log('')
    console.log('All tests passed! ✅')
    process.exit(0)
  }
}

runTests()
  .catch((e) => {
    console.error('Test runner failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
