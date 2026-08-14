import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth } from '@/lib/auth-middleware'
import { demoTag } from '@/lib/demo-mode'

/** Clamp warrantyMonths to 1..120, default 12. */
function clampWarrantyMonths(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 12
  return Math.max(1, Math.min(120, Math.round(n)))
}

/** Parse a Float; returns null when missing/invalid. */
function optFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, n)
}

/** Parse an Int; returns null when missing/invalid. */
function optInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(1, Math.round(n))
}

/** Trim a string field, returning null when empty/missing. */
function optStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim()
}

/** Parse a boolean field; returns false when missing/invalid. */
function optBool(v: unknown): boolean {
  if (v === true || v === 'true' || v === 1 || v === 'TRUE' || v === 'True') return true
  return false
}

export async function GET(req: NextRequest) {
  // ── Authentication: require VIEW_DEVICES permission ──
  // Previously this route returned full device records (including
  // serialNumber, IP/MAC, vendor/contract info) with no auth check.
  // Now it enforces authentication and Site scope.
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const site = searchParams.get('site')?.trim() ?? ''
    // ── Pagination: default limit 100, max 500 (previously unbounded) ──
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
    const limit = Math.min(
      500,
      Math.max(1, Number(searchParams.get('limit') ?? '100') || 100),
    )
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { serialNumber: { contains: search } },
        { assetCode: { contains: search } },
        { name: { contains: search } },
        { brand: { contains: search } },
        { model: { contains: search } },
        { building: { contains: search } },
        { floor: { contains: search } },
        { department: { contains: search } },
        { location: { contains: search } },
        { site: { contains: search } },
        { ip: { contains: search } },
        { mac: { contains: search } },
        { remoteId: { contains: search } },
        { contractNo: { contains: search } },
        { vendor: { contains: search } },
      ]
    }
    if (status) where.status = status
    if (site) where.site = site

    // ── Site scope: non-superadmin users see only their authorized sites ──
    // This mirrors the pattern used in /api/itam/devices route.
    if (auth.user.allowedSites !== 'ALL') {
      const allowed = (auth.user.allowedSites ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (allowed.length > 0) {
        // If the user passed an explicit `site` filter, intersect with allowed
        if (site && !allowed.includes(site)) {
          return NextResponse.json({ devices: [], total: 0, page, limit })
        }
        where.site = where.site ? { in: allowed } : { in: allowed }
      }
    }

    // Run count + page in parallel for efficiency
    const [devices, total] = await Promise.all([
      db.device.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          meterReadings: {
            orderBy: { readingDate: 'desc' },
            take: 1,
            select: { readingMonth: true, readingDate: true },
          },
        },
      }),
      db.device.count({ where }),
    ])
    // Annotate each device with `lastReadingMonth` derived from its latest
    // MeterReading record (matches Apps Script's `lastReadingMonth` column).
    const devicesWithMeter = devices.map((d) => {
      const latest = d.meterReadings?.[0]
      const { meterReadings, ...rest } = d
      return {
        ...rest,
        lastReadingMonth:
          latest?.readingMonth ?? latest?.readingDate?.slice(0, 7) ?? null,
      }
    })
    return NextResponse.json({
      devices: devicesWithMeter,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    console.error('GET /api/devices', err)
    return NextResponse.json(
      { error: 'Failed to fetch devices' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  // ── Authentication: require DEVICE_EDIT permission ──
  // Previously this route treated auth as optional (fail-open), allowing
  // unauthenticated device creation. This is a Blocker security fix.
  // Demo mode is still supported: if the authenticated user is a demo user,
  // the created device is tagged with isDemo=true.
  const auth = await requireAuth(req, 'DEVICE_EDIT')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const demo = auth

  try {
    const body = await req.json()
    const required = ['assetCode', 'name', 'brand', 'model', 'type', 'status', 'site']
    for (const k of required) {
      if (body[k] === undefined || body[k] === null || body[k] === '') {
        return NextResponse.json(
          { error: `Missing required field: ${k}` },
          { status: 400 },
        )
      }
    }
    const created = await db.device.create({
      data: {
        assetCode: String(body.assetCode).trim(),
        name: String(body.name).trim(),
        brand: String(body.brand).trim(),
        model: String(body.model).trim(),
        type: String(body.type).trim(),
        serialNumber: optStr(body.serialNumber),
        status: String(body.status).trim(),
        site: String(body.site).trim(),
        assetSiteCode: optStr(body.assetSiteCode),
        department: optStr(body.department),
        departmentCode: optStr(body.departmentCode),
        parentRef: optStr(body.parentRef),
        displayLabel: optStr(body.displayLabel),
        location: optStr(body.location),
        building: optStr(body.building),
        floor: optStr(body.floor),
        room: optStr(body.room),
        ip: optStr(body.ip),
        mac: optStr(body.mac),
        remoteId: optStr(body.remoteId),
        purchaseDate: optStr(body.purchaseDate),
        warrantyMonths: clampWarrantyMonths(body.warrantyMonths),
        purchasePrice: optFloat(body.purchasePrice),
        salvageValue: optFloat(body.salvageValue) ?? 0,
        usefulLife: optInt(body.usefulLife),
        warrantyEnd: optStr(body.warrantyEnd),
        vendor: optStr(body.vendor),
        contractNo: optStr(body.contractNo),
        uninstallDate: optStr(body.uninstallDate),
        meterRequired: optBool(body.meterRequired),
        meterMode: optStr(body.meterMode),
        costCenter: optStr(body.costCenter),
        deviceGroup: optStr(body.deviceGroup),
        remark: optStr(body.remark),
        ...demoTag(demo?.user ?? null),
      },
    })
    await logAudit(
      'CREATE',
      'Device',
      created.id,
      `เพิ่มอุปกรณ์ ${created.assetCode} (${created.name})`,
      {
        assetCode: created.assetCode,
        name: created.name,
        brand: created.brand,
        type: created.type,
        site: created.site,
      },
    )
    return NextResponse.json({ device: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/devices', err)
    const message = err instanceof Error ? err.message : 'Failed to create device'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
