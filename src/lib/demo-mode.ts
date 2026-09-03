/**
 * demo-mode.ts — Demo Mode helpers (Task ID: DEMO-MODE-E2E-TESTS).
 *
 * Demo users (`User.isDemo === true`) can use the full app without
 * affecting real data:
 *   • READ  — they see the same data as their real-role counterpart
 *             (no row-level filtering; the demoFilter() helper returns
 *             an empty object on purpose so demo users can browse the
 *             real dataset for an authentic preview).
 *   • WRITE — every record they create is tagged with `isDemo: true`
 *             via demoTag(). This makes it trivial to wipe all demo
 *             data later (POST /api/itam/demo/reset deletes every row
 *             where isDemo = true) without ever touching real rows.
 *
 * These helpers are tiny on purpose: demo behaviour is enforced at the
 * route layer (each POST endpoint calls demoTag() when building the
 * Prisma `data` payload), not via Prisma middleware. That keeps the
 * isolation logic co-located with the write sites and easy to audit.
 */

/** Minimal user shape needed by the helpers. */
export interface DemoAwareUser {
  isDemo?: boolean | null
}

/**
 * Returns `true` when the supplied user is a demo user.
 * Tolerates `null`/`undefined` for callers that pass an optional user.
 */
export function isDemoUser(user: DemoAwareUser | null | undefined): boolean {
  return user?.isDemo === true
}

/**
 * Build a Prisma `where` fragment that filters data based on demo status.
 *
 * - Demo users: see everything (real + demo data) for authentic preview
 * - Real users: see ONLY real data (isDemo != true) — demo data is HIDDEN
 *
 * Use this on every list endpoint to enforce demo data isolation:
 *   const where = { ...filters, ...demoFilter(auth.user) }
 */
export function demoFilter(user: DemoAwareUser | null | undefined): Record<string, unknown> {
  // Demo users see everything (no filter)
  if (isDemoUser(user)) return {}
  // Real users see ONLY non-demo data (isDemo = false OR null)
  return {
    OR: [
      { isDemo: false },
      { isDemo: null },
    ],
  }
}

/**
 * Build a Prisma `data` fragment that tags a created/updated record as
 * belonging to the demo scope. Returns `{ isDemo: true }` for demo users,
 * `{}` for real users (so the column keeps its DB default of `false`).
 *
 * Spread this into every create payload:
 *   `await db.device.create({ data: { ...payload, ...demoTag(user) } })`
 */
export function demoTag(user: DemoAwareUser | null | undefined): { isDemo?: true } {
  if (!isDemoUser(user)) return {}
  return { isDemo: true }
}
