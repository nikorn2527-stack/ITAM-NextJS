import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================
// Public QR Scan → Device Info API (NO AUTH REQUIRED)
//   GET /api/public/devices/[shortId]
//   GET /api/public/devices/[shortId]?action=repair
//
// Returns a SANITIZED subset of device fields safe for public
// consumption (no serials, no IP/MAC, no purchase info, no PII).
//
// `shortId` may be:
//   • last 8 chars of a Device.id (cuid) — primary (Smart QR)
//   • a full Device.id (cuid) — accepted too
//   • a Device.assetCode (e.g. "1081" or "DEMO-DEV-001") — legacy
//
// Query params:
//   ?action=repair|view|meter|sticker|transfer
//     The caller's intended action. We return which actions are
//     ALLOWED for this device (always 'view'; 'repair' is denied
//     when the device is Disposed or replaced; etc.).
//
// Cache: `no-store` — device state changes often (status, WOs).
// ============================================================

export const dynamic = 'force-dynamic'

// Public-safe statuses only — internal statuses (e.g. 'Reserved',
// 'Pending Disposal') are hidden.
const PUBLIC_STATUS_ALLOWLIST = new Set([
  'Active',
  'In Repair',
  'Disposed',
])

// WorkOrder statuses that count as "open" for the public counter.
const OPEN_WO_STATUSES = ['PENDING', 'IN_PROGRESS', 'WAITING_PARTS']

// All actions the UI may request via ?action=... — these are the
// labels used by Smart QR (see src/lib/smart-qr.ts).
type QrAction = 'repair' | 'view' | 'meter' | 'sticker' | 'transfer'
const ALL_ACTIONS: QrAction[] = ['repair', 'view', 'meter', 'sticker', 'transfer']

/**
 * Resolve a short ID (last 8 chars of cuid) OR an assetCode to a Device.
 * Uses Prisma `OR` so we hit the DB once.
 */
async function resolveDevice(shortId: string) {
  // Trim + lowercase for case-insensitive match. Prisma's default
  // collation on PostgreSQL is case-sensitive, so we use mode:insensitive.
  const trimmed = shortId.trim()
  if (!trimmed) return null

  return db.device.findFirst({
    where: {
      OR: [
        { id: { endsWith: trimmed, mode: 'insensitive' } },
        { assetCode: { equals: trimmed, mode: 'insensitive' } },
      ],
    },
    include: {
      replacedBy: {
        select: {
          id: true,
          assetCode: true,
          name: true,
          brand: true,
          model: true,
          status: true,
        },
      },
      accessories: {
        where: { status: 'Active' },
        select: { id: true },
      },
      workOrders: {
        where: {
          status: { in: OPEN_WO_STATUSES },
        },
        select: {
          id: true,
          woNumber: true,
          subject: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        // Latest 3 only — fetch a few extra in case some are filtered
        // out client-side; we'll trim to 3 below.
        take: 3,
      },
    },
  })
}

/**
 * Mask a serial number for public display: show only last 4 chars,
 * rest as asterisks. e.g. "PHCFD06265" → "****6265".
 */
function maskSerial(sn: string | null | undefined): string | null {
  if (!sn) return null
  const s = String(sn)
  if (s.length <= 4) return '****'
  return '****' + s.slice(-4)
}

/**
 * Sanitize a device status for public consumption.
 * Internal statuses (anything not in the allowlist) are hidden —
 * the public sees "Active" by default.
 */
function publicStatus(status: string | null | undefined): string {
  if (!status) return 'Active'
  return PUBLIC_STATUS_ALLOWLIST.has(status) ? status : 'Active'
}

/**
 * Build the list of allowed actions for this device, given its
 * public status and replacement state.
 *
 *   - 'view' is ALWAYS allowed (everyone can view public info)
 *   - 'repair' allowed when device is not Disposed AND not replaced
 *   - 'meter' allowed when device is Active (not In Repair/Disposed)
 *     AND device.meterRequired is true
 *   - 'sticker' allowed for Active devices (for reprinting)
 *   - 'transfer' allowed for Active devices (public may initiate,
 *     but actual transfer requires staff approval)
 */
function buildAllowedActions(
  device: {
    status: string | null
    meterRequired: boolean | null
    replacedById: string | null
  },
  requestedAction: QrAction | null,
): { allowed: QrAction[]; requested: QrAction | null; allowedRequested: boolean } {
  const pub = publicStatus(device.status)
  const replaced = !!device.replacedById

  const allowed: QrAction[] = ['view']
  if (pub !== 'Disposed' && !replaced) allowed.push('repair')
  if (pub === 'Active' && device.meterRequired) allowed.push('meter')
  if (pub === 'Active') allowed.push('sticker')
  if (pub === 'Active' && !replaced) allowed.push('transfer')

  return {
    allowed,
    requested: requestedAction,
    allowedRequested: requestedAction ? allowed.includes(requestedAction) : false,
  }
}

/**
 * Lookup site contact info (Hotline, LineOA, SiteName) for the
 * device's site. Returns null if the site has no SiteAttribute row.
 */
async function lookupSiteContact(siteCode: string) {
  const siteAttr = await db.siteAttribute.findUnique({
    where: { SiteCode: siteCode },
    select: {
      SiteCode: true,
      SiteName: true,
      Hotline: true,
      LineOA: true,
      LiffId: true,
    },
  })
  if (!siteAttr) return null
  return {
    siteCode: siteAttr.SiteCode,
    siteName: siteAttr.SiteName,
    hotline: siteAttr.Hotline,
    lineOA: siteAttr.LineOA,
    liffId: siteAttr.LiffId,
  }
}

function formatThaiDate(iso: Date | string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shortId: string }> },
) {
  try {
    const { shortId } = await params
    if (!shortId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const url = new URL(req.url)
    const actionParam = url.searchParams.get('action')?.trim().toLowerCase()
    const requestedAction: QrAction | null =
      actionParam && (ALL_ACTIONS as string[]).includes(actionParam)
        ? (actionParam as QrAction)
        : null

    const device = await resolveDevice(shortId)
    if (!device) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // ── Open WO count (separate query — we want ALL open WOs, not just
    // the latest 3 that the include returned).
    const openWoCount = await db.workOrder.count({
      where: {
        deviceId: device.id,
        status: { in: OPEN_WO_STATUSES },
      },
    })

    const siteContact = await lookupSiteContact(device.site)

    // ── Sanitized public payload ──
    // NEVER expose: serialNumber (raw), ip, mac, remoteId, purchasePrice,
    // salvageValue, vendor, contractNo, departmentCode, costCenter,
    // currentAssignee, parentDeviceId, replacedById (cuid).
    const data = {
      // Identity (public-safe)
      assetCode: device.assetCode,
      name: device.name,
      brand: device.brand,
      model: device.model,
      type: device.type,
      // Status — public-safe subset only
      status: publicStatus(device.status),
      // Location (public)
      site: device.site,
      building: device.building,
      floor: device.floor,
      room: device.room,
      location: device.location,
      department: device.department,
      assetSiteCode: device.assetSiteCode,
      displayLabel: device.displayLabel,
      // Serial number — masked (last 4 only)
      serialMasked: maskSerial(device.serialNumber),
      // Assignment — boolean only, never the assignee name
      assigned: !!device.currentAssignee,
      // Meter support
      meterRequired: !!device.meterRequired,
      meterMode: device.meterMode,
      // Warranty info — only end date (no vendor/contract)
      warrantyEnd: device.warrantyEnd,
      // Replacement info — if replaced, point to the new device
      replacedBy: device.replacedBy
        ? {
            assetCode: device.replacedBy.assetCode,
            name: device.replacedBy.name,
            brand: device.replacedBy.brand,
            model: device.replacedBy.model,
            status: publicStatus(device.replacedBy.status),
          }
        : null,
      replacedAt: device.replacedAt ? formatThaiDate(device.replacedAt) : null,
      // WorkOrders — open count + latest 3 (sanitized, no internal notes)
      openWorkOrderCount: openWoCount,
      latestWorkOrders: device.workOrders.slice(0, 3).map((wo) => ({
        woNumber: wo.woNumber,
        subject: wo.subject,
        status: wo.status,
        createdAt: formatThaiDate(wo.createdAt),
      })),
      // Site contact
      siteContact,
      // Accessories — count only (not details)
      accessoriesCount: device.accessories.length,
      // Allowed actions for this device
      actions: buildAllowedActions(device, requestedAction),
    }

    return NextResponse.json(
      { data },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      },
    )
  } catch (err) {
    console.error('GET /api/public/devices/[shortId]', err)
    const message = err instanceof Error ? err.message : String(err)
    // Include the error message in the response so we can debug production
    // runtime errors (Vercel logs are hard to access via API).
    return NextResponse.json(
      { error: 'Internal error', detail: message },
      { status: 500 },
    )
  }
}
