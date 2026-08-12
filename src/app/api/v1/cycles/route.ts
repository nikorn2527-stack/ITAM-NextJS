/**
 * /api/v1/cycles — list + create meter cycles (v1 standardized shape).
 *
 * ════════════════════════════════════════════════════════════════════════
 * GET /api/v1/cycles
 * ════════════════════════════════════════════════════════════════════════
 *   Auth: VIEW_DASHBOARD
 *
 *   Standard query params:
 *     ?page=1&limit=20             — pagination
 *     ?sort=-startDate             — sort (prefix - for desc)
 *     ?filter[status]=OPEN         — exact match
 *     ?filter[cycleMonth]=2026-08
 *
 *   No site filter — cycles are global.
 *
 *   Response: { data: Cycle[], pagination, meta }
 *
 * ════════════════════════════════════════════════════════════════════════
 * POST /api/v1/cycles
 * ════════════════════════════════════════════════════════════════════════
 *   Auth: METER_WRITE
 *
 *   Body: { name, startDate, endDate, status?, cycleMonth?,
 *           deadlineDate?, remarks? }
 *
 *   • name, startDate, endDate required (else 400 BAD_REQUEST with field).
 *   • Default status: 'OPEN'.
 *   • If status === 'OPEN' or 'active': any existing OPEN/active cycles are
 *     flipped to CLOSED/ended first (only one active cycle at a time).
 *   • Set startedAt = now() when status is OPEN/active.
 *   • AuditLog: action='CYCLE_START'.
 *
 *   Response: 201 { data: Cycle, meta }
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  parseQuery,
  buildWhere,
  buildOrderBy,
  list,
  created,
  badRequest,
  serverError,
} from '@/lib/api/response'
import { requireApiAuth } from '@/lib/api/auth'

// ── GET field map ──────────────────────────────────────────────────────
const FIELD_MAP: Record<string, string> = {
  status: 'status',
  cycleMonth: 'cycleMonth',
}

// ── GET ────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, 'VIEW_DASHBOARD')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const query = parseQuery(url)

  // No site filter — cycles are global
  const where = buildWhere(query, FIELD_MAP)
  const orderBy = buildOrderBy(query, FIELD_MAP, { startDate: 'desc' })

  const [total, cycles] = await Promise.all([
    db.cycle.count({ where }),
    db.cycle.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ])

  return list(cycles, { page: query.page, limit: query.limit, total })
}

// ── POST ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, 'METER_WRITE')
  if (!auth.ok) return auth.response
  const { user } = auth.ctx

  try {
    const body = await req.json()

    // ── Validate required fields ──────────────────────────────────────
    if (!body?.name) {
      return badRequest('name เป็นฟิลด์ที่ต้องการ', { field: 'name' })
    }
    if (!body?.startDate) {
      return badRequest('startDate เป็นฟิลด์ที่ต้องการ', { field: 'startDate' })
    }
    if (!body?.endDate) {
      return badRequest('endDate เป็นฟิลด์ที่ต้องการ', { field: 'endDate' })
    }

    // ── Normalize status (default OPEN) ───────────────────────────────
    const status = String(body.status ?? 'OPEN').trim()

    // ── If starting an OPEN/active cycle, close any existing ones ──────
    // Apps Script invariant: only one OPEN cycle at a time.
    const isActive = status === 'OPEN' || status === 'active'
    if (isActive) {
      // Flip OPEN → CLOSED AND active → ended (covers both V5 + legacy)
      await db.cycle.updateMany({
        where: { status: { in: ['OPEN', 'active'] } },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
        },
      })
    }

    // ── Create the Cycle record ───────────────────────────────────────
    const cycle = await db.cycle.create({
      data: {
        name: String(body.name).trim(),
        startDate: String(body.startDate),
        endDate: String(body.endDate),
        status,
        cycleMonth: body.cycleMonth ? String(body.cycleMonth) : null,
        deadlineDate: body.deadlineDate ? String(body.deadlineDate) : null,
        remarks: body.remarks ? String(body.remarks) : null,
        startedAt: isActive ? new Date() : null,
      },
    })

    // ── Audit log (best-effort) ───────────────────────────────────────
    try {
      await db.auditLog.create({
        data: {
          timestamp: new Date().toISOString(),
          action: 'CYCLE_START',
          user: user.email,
          details: JSON.stringify({
            name: cycle.name,
            startDate: cycle.startDate,
            endDate: cycle.endDate,
            cycleMonth: cycle.cycleMonth,
            status: cycle.status,
            cycleId: cycle.id,
          }),
        },
      })
    } catch {
      /* audit never blocks the mutation */
    }

    return created(cycle)
  } catch (err) {
    console.error('POST /api/v1/cycles', err)
    return serverError()
  }
}
