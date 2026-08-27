/**
 * Work Orders API — list + create.
 *
 * GET /api/v1/work-orders
 *   Auth: VIEW_DEVICES  (or Bearer token for specialFee=true public filter)
 *   Query: ?status=&priority=&assignedTo=&q=search&page=1&limit=20
 *          ?specialFee=true&from=YYYY-MM-DD&to=YYYY-MM-DD  (public filter for
 *            งานพิเศษ — returns minimal projection for external apps)
 *          (also supports standard v1: ?sort=, ?filter[...]=, ?include=)
 *   Search fields: subject, building, location, reporterName, woNumber
 *   Response: { data: WorkOrder[], pagination, meta }
 *
 * POST /api/v1/work-orders
 *   Auth: DEVICE_EDIT — OR guest submission (no auth) if reporterName + tel provided.
 *   Body: { subject, building?, location?, details?, priority?,
 *           reporterName?, tel?, employeeCode?, assetNo?,
 *           externalMeta?, picBefore?, requestId?,
 *           isSpecialFee?: boolean }
 *   - Auto-generates woNumber: WO-YYYYMMDD-NNN (sequential per day)
 *   - submissionSource = 'session' if authenticated, 'guest' otherwise
 *   - trackable = !!tel
 *   - If requestId provided, check for duplicate (return existing if found)
 *   - Default status = PENDING, priority = ปกติ
 *   Response: 201 { data: WorkOrder, meta }
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireApiAuth } from '@/lib/api/auth'
import {
  parseQuery,
  buildWhere,
  buildOrderBy,
  ok,
  created,
  list,
  badRequest,
  conflict,
  serverError,
} from '@/lib/api/response'
import {
  VALID_PRIORITIES,
  generateWoNumber,
} from './_shared'

// ── Field map: API filter keys → Prisma field paths ─────────────────────
// Note: trackable is a Boolean — the v1 buildWhere helper emits string
// equality which won't match a Boolean column, so we omit it here. Use
// ?filter[trackable]=notnull / null if needed via the standard mechanism
// (also string-based, so treat that as best-effort).
const FIELD_MAP: Record<string, string> = {
  status: 'status',
  priority: 'priority',
  assignedTo: 'assignedTo',
  assetNo: 'assetNo',
  submissionSource: 'submissionSource',
}

const SEARCH_FIELDS = [
  'subject',
  'building',
  'location',
  'reporterName',
  'woNumber',
]

// ── GET ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const sp = url.searchParams

  // ── Public งานพิเศษ endpoint (Bearer token auth) ──
  // GET /api/v1/work-orders?specialFee=true&from=YYYY-MM-DD&to=YYYY-MM-DD
  // Returns a minimal projection of WOs where isSpecialFee=true, suitable for
  // external apps (e.g. billing/finance) to pull a list of paid work.
  const specialFeeParam = sp.get('specialFee')?.trim().toLowerCase()
  const wantsSpecialFee =
    specialFeeParam === 'true' || specialFeeParam === '1'
  if (wantsSpecialFee) {
    // Bearer token auth — any valid user token is accepted.
    const auth = await requireApiAuth(req).catch(() => null)
    if (!auth || !auth.ok) {
      return auth?.response ?? serverError('auth failed')
    }

    const from = sp.get('from')?.trim() || null
    const to = sp.get('to')?.trim() || null
    const page = Math.max(1, Number(sp.get('page') ?? '1') || 1)
    const limit = Math.min(
      500,
      Math.max(1, Number(sp.get('limit') ?? '200') || 200),
    )

    const where: Record<string, unknown> = { isSpecialFee: true }
    if (from || to) {
      const range: Record<string, Date> = {}
      if (from) range.gte = new Date(`${from}T00:00:00+07:00`)
      if (to) range.lte = new Date(`${to}T23:59:59+07:00`)
      where.createdAt = range
    }

    const [total, rows] = await Promise.all([
      db.workOrder.count({ where }),
      db.workOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          woNumber: true,
          subject: true,
          status: true,
          assignedTo: true,
          building: true,
          location: true,
          createdAt: true,
          closedAt: true,
          workCompletedAt: true,
          isSpecialFee: true,
        },
      }),
    ])

    // Compose a `site` field from building/location so external apps get a
    // single column. (Real site data lives on the device relation.)
    const data = rows.map((r) => {
      const site = r.building ?? r.location ?? null
      const closedAt = r.closedAt ?? r.workCompletedAt ?? null
      return {
        id: r.id,
        woNumber: r.woNumber,
        subject: r.subject,
        status: r.status,
        assignedTo: r.assignedTo,
        site,
        createdAt: r.createdAt,
        closedAt,
        isSpecialFee: r.isSpecialFee,
      }
    })

    return list(data, { page, limit, total })
  }

  // ── Standard authenticated list ──
  const auth = await requireApiAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) return auth.response

  const query = parseQuery(url)

  // Merge the shortcut query params (?status=&priority=&assignedTo=) into
  // the standard filter[] mechanism so buildWhere can process them.
  const mergedFilters: Record<string, string> = { ...query.filters }
  const statusParam = sp.get('status')?.trim()
  if (statusParam && !mergedFilters.status) mergedFilters.status = statusParam
  const priorityParam = sp.get('priority')?.trim()
  if (priorityParam && !mergedFilters.priority) mergedFilters.priority = priorityParam
  const assignedParam = sp.get('assignedTo')?.trim()
  if (assignedParam && !mergedFilters.assignedTo) mergedFilters.assignedTo = assignedParam

  const mergedQuery = { ...query, filters: mergedFilters }
  const where = buildWhere(mergedQuery, FIELD_MAP, SEARCH_FIELDS)
  const orderBy = buildOrderBy(query, FIELD_MAP, { createdAt: 'desc' })

  const [total, orders] = await Promise.all([
    db.workOrder.count({ where }),
    db.workOrder.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ])

  return list(orders, { page: query.page, limit: query.limit, total })
}

// ── POST ────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Try auth first — but allow guest submission if reporterName + tel provided.
  const auth = await requireApiAuth(req, 'DEVICE_EDIT')
  const isAuthed = auth.ok
  // If auth failed AND it's not a "missing token / forbidden" situation that
  // could be a guest submission, return the error.
  // We treat missing-token (401) as "guest attempt" and let it through if
  // guest fields are provided. A 403 (insufficient permission for a logged-in
  // user) is still returned to the user — we never silently down-grade perms.
  if (!isAuthed) {
    // Only 401 (missing/expired token) may fall through to guest. 403 stays forbidden.
    const status = auth.response.status
    if (status !== 401) return auth.response
  }

  try {
    const body = await req.json()
    const subject = String(body.subject ?? '').trim()
    const reporterName = String(body.reporterName ?? '').trim()
    const tel = String(body.tel ?? '').trim()
    const employeeCode = String(body.employeeCode ?? '').trim() || null

    // Guest submissions require reporterName + tel
    if (!isAuthed) {
      if (!reporterName || !tel) {
        return badRequest(
          'การแจ้งซ่อมโดยไม่ล็อกอินต้องระบุชื่อผู้แจ้งและเบอร์โทรศัพท์',
          { field: 'reporterName' },
        )
      }
    }

    if (!subject) {
      return badRequest('subject (ประเภทปัญหา) เป็นฟิลด์ที่ต้องการ', {
        field: 'subject',
      })
    }

    const priorityRaw = body.priority ? String(body.priority).trim() : 'ปกติ'
    if (!VALID_PRIORITIES.has(priorityRaw)) {
      return badRequest(
        `priority ต้องเป็นหนึ่งใน: ${[...VALID_PRIORITIES].join(', ')}`,
        { field: 'priority' },
      )
    }

    // Dedup by client-provided requestId
    const requestId = body.requestId ? String(body.requestId).trim() : null
    if (requestId) {
      const existing = await db.workOrder.findFirst({
        where: { requestId },
      })
      if (existing) {
        // Return existing — idempotent submission
        return ok(existing)
      }
    }

    const woNumber = await generateWoNumber()
    const submissionSource = isAuthed ? 'session' : 'guest'

    // Authed user context (if any)
    const userRow = isAuthed ? auth.ctx.user : null
    const userEmail = userRow?.email ?? null

    // reporterEmail — when authed, defaults to user's email
    const reporterEmail = body.reporterEmail
      ? String(body.reporterEmail).trim()
      : isAuthed
        ? userEmail
        : null

    // externalMeta — store as JSON string (Prisma scalar)
    let externalMeta: string | null = null
    if (body.externalMeta && typeof body.externalMeta === 'object') {
      externalMeta = JSON.stringify(body.externalMeta)
    } else if (typeof body.externalMeta === 'string' && body.externalMeta.trim()) {
      externalMeta = body.externalMeta.trim()
    }

    // ── BUG-WO-002-VERIFY FIX ───────────────────────────────────────
    // WorkOrder has no `assetCode` column (only `deviceId` relation to
    // Device). When the caller supplies an assetCode, look up the matching
    // Device and link via deviceId. This unblocks POST /api/v1/work-orders
    // which previously 500'd with "Unknown argument `assetCode`".
    let deviceId: string | null = null
    const rawAssetCode =
      typeof body.assetCode === 'string' ? body.assetCode.trim() : ''
    if (rawAssetCode) {
      const device = await db.device.findUnique({
        where: { assetCode: rawAssetCode },
        select: { id: true },
      })
      deviceId = device?.id ?? null
    }

    const order = await db.workOrder.create({
      data: {
        woNumber,
        requestId,
        subject,
        building: body.building ? String(body.building).trim() : null,
        location: body.location ? String(body.location).trim() : null,
        details: body.details ? String(body.details) : null,
        priority: priorityRaw,
        reporterName: reporterName || null,
        reporterEmail,
        tel: tel || null,
        employeeCode,
        submissionSource,
        trackable: !!tel,
        externalMeta,
        picBefore: body.picBefore ? String(body.picBefore) : null,
        status: 'PENDING',
        deviceId,
        isSpecialFee: body.isSpecialFee === true,
      },
    })

    // Audit log
    await logAudit(
      'WO_CREATE',
      'WorkOrder',
      order.id,
      `สร้างใบแจ้งซ่อม ${order.woNumber} (${order.subject}) โดย ${
        isAuthed ? userEmail : 'ผู้แจ้งภายนอก'
      }`,
      {
        woNumber: order.woNumber,
        subject: order.subject,
        priority: order.priority,
        submissionSource: order.submissionSource,
        trackable: order.trackable,
        assetCode: rawAssetCode || null,
        deviceId: order.deviceId,
      },
      userEmail,
    )

    return created(order)
  } catch (err) {
    console.error('POST /api/v1/work-orders', err)
    if (err instanceof Error && err.message.includes('unique')) {
      return conflict('woNumber ซ้ำ กรุณาลองใหม่อีกครั้ง', {
        code: 'DUPLICATE_WO_NUMBER',
      })
    }
    return serverError()
  }
}
