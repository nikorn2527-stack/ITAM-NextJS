import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/cron/sync-legacy
 *
 * Daily sync from legacy Google Sheets app → ITAM NextJS database.
 * Runs at 2:00 AM Bangkok time (schedule in vercel.json).
 *
 * Syncs:
 *   1. Devices (from IT-Asset-Management Google Sheet)
 *   2. Work Orders (from Services Google Sheet)
 *   3. Stock Items (from Stock Google Sheet)
 *
 * Rate-limited: processes 50 records per batch, 1s delay between batches.
 * Stays within Supabase free tier limits (15 connections, 500MB storage).
 *
 * Auth: CRON_SECRET (Vercel cron auto-sends this)
 */

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const startTime = Date.now()
  const results = {
    devices: { fetched: 0, updated: 0, created: 0, errors: 0 },
    workOrders: { fetched: 0, updated: 0, created: 0, errors: 0 },
    stock: { fetched: 0, updated: 0, created: 0, errors: 0 },
  }

  try {
    // ── 1. Sync Devices from Google Sheets ──
    // Fetch from Google Sheets (if configured)
    const sheetsId = process.env.GOOGLE_SHEETS_ID_ITAM
    if (sheetsId) {
      try {
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetsId}/gviz/tq?tqx=out:csv&sheet=All_Devices`
        const res = await fetch(sheetUrl, { signal: AbortSignal.timeout(15000) })
        if (res.ok) {
          const csv = await res.text()
          const lines = csv.split('\n').filter(Boolean)
          results.devices.fetched = lines.length - 1 // minus header

          // Process in batches of 50
          const batchSize = 50
          for (let i = 1; i < lines.length; i += batchSize) {
            const batch = lines.slice(i, i + batchSize)
            for (const line of batch) {
              try {
                const cols = parseCSVLine(line)
                if (cols.length < 5) continue

                const assetCode = cols[0]?.trim()
                if (!assetCode) continue

                // Upsert device
                const existing = await db.device.findFirst({
                  where: { assetCode },
                  select: { id: true },
                })

                const deviceData = {
                  assetCode,
                  name: cols[1]?.trim() || null,
                  brand: cols[2]?.trim() || null,
                  model: cols[3]?.trim() || null,
                  serialNumber: cols[4]?.trim() || null,
                  site: cols[5]?.trim() || null,
                  status: cols[6]?.trim()?.toLowerCase() || 'active',
                }

                if (existing) {
                  await db.device.update({ where: { id: existing.id }, data: deviceData })
                  results.devices.updated++
                } else {
                  await db.device.create({ data: deviceData })
                  results.devices.created++
                }
              } catch (err) {
                results.devices.errors++
                console.warn('[sync-legacy] device error:', err)
              }
            }
            // Small delay between batches to avoid connection exhaustion
            await new Promise((r) => setTimeout(r, 500))
          }
        }
      } catch (err) {
        console.error('[sync-legacy] devices fetch failed:', err)
      }
    }

    // ── 2. Sync Work Orders ──
    const woSheetsId = process.env.GOOGLE_SHEETS_ID_SERVICES
    if (woSheetsId) {
      try {
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${woSheetsId}/gviz/tq?tqx=out:csv&sheet=All_WO`
        const res = await fetch(sheetUrl, { signal: AbortSignal.timeout(15000) })
        if (res.ok) {
          const csv = await res.text()
          const lines = csv.split('\n').filter(Boolean)
          results.workOrders.fetched = lines.length - 1

          const batchSize = 50
          for (let i = 1; i < lines.length; i += batchSize) {
            const batch = lines.slice(i, i + batchSize)
            for (const line of batch) {
              try {
                const cols = parseCSVLine(line)
                if (cols.length < 3) continue

                const woNumber = cols[0]?.trim()
                if (!woNumber) continue

                const existing = await db.workOrder.findFirst({
                  where: { woNumber },
                  select: { id: true },
                })

                const woData = {
                  woNumber,
                  subject: cols[1]?.trim() || 'ไม่ระบุ',
                  status: mapWOStatus(cols[2]?.trim() || ''),
                  reporterName: cols[3]?.trim() || null,
                  tel: cols[4]?.trim() || null,
                }

                if (existing) {
                  await db.workOrder.update({ where: { id: existing.id }, data: woData })
                  results.workOrders.updated++
                } else {
                  await db.workOrder.create({ data: woData })
                  results.workOrders.created++
                }
              } catch (err) {
                results.workOrders.errors++
              }
            }
            await new Promise((r) => setTimeout(r, 500))
          }
        }
      } catch (err) {
        console.error('[sync-legacy] WO fetch failed:', err)
      }
    }

    // ── 3. Sync Stock Items ──
    const stockSheetsId = process.env.GOOGLE_SHEETS_ID_STOCK
    if (stockSheetsId) {
      try {
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${stockSheetsId}/gviz/tq?tqx=out:csv`
        const res = await fetch(sheetUrl, { signal: AbortSignal.timeout(15000) })
        if (res.ok) {
          const csv = await res.text()
          const lines = csv.split('\n').filter(Boolean)
          results.stock.fetched = lines.length - 1

          const batchSize = 50
          for (let i = 1; i < lines.length; i += batchSize) {
            const batch = lines.slice(i, i + batchSize)
            for (const line of batch) {
              try {
                const cols = parseCSVLine(line)
                if (cols.length < 3) continue

                const productCode = cols[0]?.trim()
                if (!productCode) continue

                const existing = await db.stockItem.findFirst({
                  where: { productCode },
                  select: { id: true },
                })

                const stockData = {
                  productCode,
                  productName: cols[1]?.trim() || null,
                  quantity: parseInt(cols[2]?.trim() ?? '0', 10) || 0,
                  minQuantity: parseInt(cols[3]?.trim() ?? '0', 10) || 0,
                }

                if (existing) {
                  await db.stockItem.update({ where: { id: existing.id }, data: stockData })
                  results.stock.updated++
                } else {
                  await db.stockItem.create({ data: stockData })
                  results.stock.created++
                }
              } catch (err) {
                results.stock.errors++
              }
            }
            await new Promise((r) => setTimeout(r, 500))
          }
        }
      } catch (err) {
        console.error('[sync-legacy] stock fetch failed:', err)
      }
    }

    await logAudit(
      'SYNC',
      'Device',
      undefined,
      `Legacy sync: devices ${results.devices.created}+/${results.devices.updated}~/${results.devices.errors}err, WO ${results.workOrders.created}+/${results.workOrders.updated}~, stock ${results.stock.created}+/${results.stock.updated}~`,
      JSON.stringify(results),
    ).catch(() => {})

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startTime,
      results,
    })
  } catch (err) {
    console.error('[sync-legacy] fatal:', err)
    return NextResponse.json(
      { error: 'Sync failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/** Parse CSV line (simple — doesn't handle quoted commas) */
function parseCSVLine(line: string): string[] {
  return line.split(',').map((c) => c.replace(/^"|"$/g, '').trim())
}

/** Map legacy WO status to ITAM status */
function mapWOStatus(legacy: string): string {
  const lower = legacy.toLowerCase()
  if (lower.includes('รอ') || lower.includes('pending')) return 'PENDING'
  if (lower.includes('กำลัง') || lower.includes('progress')) return 'IN_PROGRESS'
  if (lower.includes('เสร็จ') || lower.includes('complete')) return 'COMPLETED'
  if (lower.includes('ยกเลิก') || lower.includes('cancel')) return 'CANCELLED'
  return 'PENDING'
}
