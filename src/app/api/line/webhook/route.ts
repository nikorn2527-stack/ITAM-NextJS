import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { withRetryOnUnique } from '@/lib/retry-unique'

/**
 * POST /api/line/webhook
 *
 * LINE Messaging API webhook endpoint.
 *
 * Flow:
 *   1. Verify X-Line-Signature header against HMAC-SHA256 of the raw body
 *      (using the `line_channel_secret` AppSetting).
 *   2. Parse the events array.
 *   3. For each event:
 *      - message (text):
 *          • If text matches a Device serialNumber/assetCode → find device,
 *            create a WorkOrder with device info, reply with confirmation.
 *          • If text starts with "ติดตาม" or "สถานะ" → find the user's latest
 *            WorkOrder (by lineUserId), reply with its status.
 *          • If text is "แจ้งซ่อม" / "แจ้ง" → reply with a quick-reply
 *            menu asking for the problem description.
 *          • Otherwise → create a WorkOrder with subject=text, reply
 *            "สร้างใบงานแล้ว WO-XXXX".
 *      - follow: welcome message + link to register contact.
 *      - postback: handle the chosen action (e.g. start a new WO).
 *   4. The lineUserId is stored on the WorkOrder (lineUserId field).
 *
 * Configuration (AppSetting keys):
 *   - line_channel_access_token  — required to call Reply API
 *   - line_channel_secret        — required to verify signature
 *
 * When the access token is not configured, the webhook still creates the
 * WorkOrder and logs what the reply would have been (useful for local dev).
 */

// ============================================================
// Settings
// ============================================================

interface LineSettings {
  channelAccessToken?: string
  channelSecret?: string
}

async function loadLineSettings(): Promise<LineSettings> {
  try {
    const rows = await db.appSetting.findMany({
      where: {
        key: { in: ['line_channel_access_token', 'line_channel_secret'] },
      },
    })
    const get = (k: string) =>
      rows.find((r) => r.key === k)?.value || undefined
    return {
      channelAccessToken: get('line_channel_access_token'),
      channelSecret: get('line_channel_secret'),
    }
  } catch {
    return {}
  }
}

// ============================================================
// Signature verification (HMAC-SHA256 → base64)
// ============================================================

function computeSignature(body: Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64')
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

// ============================================================
// LINE API helpers
// ============================================================

async function replyMessage(
  replyToken: string,
  messages: Array<{ type: 'text'; text: string }>,
  accessToken?: string,
): Promise<void> {
  if (!accessToken) {
    console.log(
      `[line-webhook] (log only) reply token=${replyToken.slice(0, 8)}…\n` +
        messages.map((m) => m.text).join('\n---\n'),
    )
    return
  }
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ replyToken, messages }),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error(
        `[line-webhook] reply API error ${res.status}: ${txt}`,
      )
    }
  } catch (err) {
    console.error('[line-webhook] reply failed:', err)
  }
}

// ============================================================
// Helpers — WO number generation (mirror of work-orders/route.ts)
// ============================================================

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

async function generateWoNumber(): Promise<string | null> {
  const now = new Date()
  const ymd =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, '0')}` +
    `${String(now.getDate()).padStart(2, '0')}`
  const prefix = `WO-${ymd}-`
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await db.workOrder.findFirst({
      where: { woNumber: { startsWith: prefix } },
      orderBy: { woNumber: 'desc' },
      select: { woNumber: true },
    })
    let nextSeq = 1
    if (last?.woNumber) {
      const m = last.woNumber.match(/(\d+)$/)
      if (m) nextSeq = parseInt(m[1], 10) + 1
    }
    nextSeq += attempt
    const candidate = `${prefix}${pad3(nextSeq)}`
    const exists = await db.workOrder.findUnique({
      where: { woNumber: candidate },
      select: { id: true },
    })
    if (!exists) return candidate
  }
  return null
}

// ============================================================
// Helpers — LineBinding upsert (records that this LINE user exists)
// ============================================================

async function upsertLineBinding(
  lineUserId: string,
  displayName?: string,
): Promise<void> {
  try {
    await db.lineBinding.upsert({
      where: { lineUserId },
      create: {
        lineUserId,
        lineDisplayName: displayName ?? null,
      },
      update: {
        lineDisplayName: displayName ?? undefined,
      },
    })
  } catch (err) {
    console.error('[line-webhook] upsertLineBinding failed:', err)
  }
}

async function bumpLineBindingWoCount(lineUserId: string): Promise<void> {
  try {
    await db.lineBinding.update({
      where: { lineUserId },
      data: { workOrderCount: { increment: 1 } },
    })
  } catch {
    // ignore — the upsert above may have failed in dev
  }
}

// ============================================================
// Helpers — text classification
// ============================================================

const STATUS_KEYWORDS = ['ติดตาม', 'สถานะ', 'status', 'Status', 'STATUS']
const REPORT_KEYWORDS = ['แจ้งซ่อม', 'แจ้ง']

function startsWithAny(text: string, prefixes: string[]): boolean {
  return prefixes.some((p) => text.startsWith(p))
}

/**
 * Try to find a device by serialNumber or assetCode (exact match, case-insensitive).
 */
async function findDeviceByCode(
  text: string,
): Promise<{ id: string; assetCode: string; name: string; site: string; building: string | null; location: string | null; department: string | null } | null> {
  const code = text.trim()
  if (!code) return null
  // Try assetCode (case-insensitive — SQLite default is case-insensitive for ASCII)
  const byAsset = await db.device.findUnique({
    where: { assetCode: code },
    select: {
      id: true,
      assetCode: true,
      name: true,
      site: true,
      building: true,
      location: true,
      department: true,
    },
  })
  if (byAsset) return byAsset
  // Try serialNumber — findFirst because serialNumber is not unique
  const bySerial = await db.device.findFirst({
    where: { serialNumber: code },
    select: {
      id: true,
      assetCode: true,
      name: true,
      site: true,
      building: true,
      location: true,
      department: true,
    },
  })
  return bySerial ?? null
}

/**
 * Format a WorkOrder's status in Thai for LINE reply.
 */
function formatWoStatus(wo: {
  woNumber: string | null
  subject: string
  status: string
  assignedTo: string | null
  resolution: string | null
}): string {
  const statusMap: Record<string, string> = {
    PENDING: 'รอรับเรื่อน',
    IN_PROGRESS: 'กำลังดำเนินการ',
    WAITING_PARTS: 'รออะไหล่',
    COMPLETED: 'เสร็จเรียบร้อย',
    CANCELLED: 'ยกเลิกแล้ว',
  }
  const s = statusMap[wo.status] ?? wo.status
  let msg =
    `📋 ใบงาน ${wo.woNumber ?? '-'}\n` +
    `หัวข้อ: ${wo.subject}\n` +
    `สถานะ: ${s}`
  if (wo.assignedTo) msg += `\nมอบหมายให้: ${wo.assignedTo}`
  if (wo.status === 'COMPLETED' && wo.resolution) {
    msg += `\nผลการแก้ไข: ${wo.resolution}`
  }
  return msg
}

// ============================================================
// Helpers — audit
// ============================================================

async function logAuditLine(
  action: string,
  entityId: string | null,
  summary: string,
  detail: Record<string, unknown>,
  lineUserId: string,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action,
        entity: 'WorkOrder',
        entityId,
        summary,
        detail: JSON.stringify({ ...detail, lineUserId }),
        actor: `line:${lineUserId}`,
      },
    })
  } catch (err) {
    console.error('[line-webhook] audit log failed:', err)
  }
}

// ============================================================
// Main handler
// ============================================================

export async function POST(req: NextRequest) {
  // 1. Read raw body for signature verification.
  const rawBody = Buffer.from(await req.arrayBuffer())

  // 2. Verify signature.
  // SECURITY FIX: Previously, if line_channel_secret was not configured,
  // the webhook accepted requests without signature verification (fail-open).
  // Now, in production, missing secret = reject. In development
  // (NODE_ENV !== 'production'), we allow it with a warning for local testing.
  const settings = await loadLineSettings()
  const signature = req.headers.get('x-line-signature') ?? ''
  if (!settings.channelSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[line-webhook] line_channel_secret not configured — rejecting request (production mode)')
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 503 },
      )
    }
    console.warn(
      '[line-webhook] line_channel_secret not configured — accepting request without verification (DEV MODE ONLY)',
    )
  } else {
    if (!signature) {
      return NextResponse.json(
        { error: 'missing X-Line-Signature' },
        { status: 401 },
      )
    }
    const computed = computeSignature(rawBody, settings.channelSecret)
    if (!safeEqual(computed, signature)) {
      console.error('[line-webhook] signature mismatch')
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
  }

  // 3. Parse the payload.
  let payload: {
    events?: Array<Record<string, unknown>>
  }
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const events = Array.isArray(payload.events) ? payload.events : []
  if (events.length === 0) {
    return NextResponse.json({ ok: true, handled: 0 })
  }

  let handled = 0
  for (const evt of events) {
    try {
      const type = String(evt.type ?? '')
      const source = (evt.source ?? {}) as Record<string, unknown>
      const lineUserId = String(source.userId ?? '')
      const replyToken = String(evt.replyToken ?? '')

      if (!lineUserId) continue

      if (type === 'follow') {
        // ── Welcome message ──
        await upsertLineBinding(
          lineUserId,
          (evt as { profile?: { displayName?: string } }).profile
            ?.displayName,
        )
        const welcome =
          'ยินดีต้อนรับสู่ระบบแจ้งซ่อม 🙌\n\n' +
          'คุณสามารถ:\n' +
          '• พิมพ์ "แจ้งซ่อม" เพื่อเริ่มแจ้งงานใหม่\n' +
          '• พิมพ์ "ติดตาม" หรือ "สถานะ" เพื่อดูสถานะใบงานล่าสุด\n' +
          '• พิมพ์รหัสทรัพย์สิน (เช่น ASSET-00001) เพื่อแจ้งซ่อมเฉพาะเครื่อง\n' +
          '• หรือพิมพ์ปัญหาตรง ๆ ระบบจะสร้างใบงานให้ทันที'
        if (replyToken) {
          await replyMessage(
            replyToken,
            [{ type: 'text', text: welcome }],
            settings.channelAccessToken,
          )
        }
        await logAuditLine(
          'LINE_FOLLOW',
          null,
          `ผู้ใช้ LINE ใหม่เพิ่มเป็นเพื่อน`,
          { displayName: 'unknown' },
          lineUserId,
        )
        handled++
        continue
      }

      if (type === 'message') {
        const msg = (evt.message ?? {}) as Record<string, unknown>
        if (msg.type !== 'text') {
          // Sticker/image/audio → ignore for now
          continue
        }
        const text = String(msg.text ?? '').trim()
        if (!text) continue
        const messageId = String(msg.id ?? '')

        // ── Deduplicate LINE messages by messageId ──
        // LINE may retry webhook delivery if it doesn't receive a 200 in time,
        // which can cause duplicate WorkOrder creation. We check if a WO with
        // this lineMessageId already exists before processing.
        if (messageId) {
          const existing = await db.workOrder.findFirst({
            where: { lineMessageId: messageId },
            select: { id: true, woNumber: true },
          })
          if (existing) {
            // Already processed — skip silently (LINE expects 200)
            console.log(`[line-webhook] skipping duplicate messageId=${messageId} (WO ${existing.woNumber ?? existing.id})`)
            continue
          }
        }

        // Persist LineBinding (so we know this user exists)
        await upsertLineBinding(lineUserId)

        // ── Branch 1: status lookup ──
        if (startsWithAny(text, STATUS_KEYWORDS)) {
          const latestWo = await db.workOrder.findFirst({
            where: { lineUserId },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              woNumber: true,
              subject: true,
              status: true,
              assignedTo: true,
              resolution: true,
            },
          })
          if (!latestWo) {
            const reply =
              'คุณยังไม่มีใบงานในระบบ\nพิมพ์ "แจ้งซ่อม" หรือบอกอาการเครื่องเพื่อเริ่มแจ้งซ่อมได้เลยครับ'
            if (replyToken) {
              await replyMessage(
                replyToken,
                [{ type: 'text', text: reply }],
                settings.channelAccessToken,
              )
            }
          } else {
            if (replyToken) {
              await replyMessage(
                replyToken,
                [{ type: 'text', text: formatWoStatus(latestWo) }],
                settings.channelAccessToken,
              )
            }
          }
          handled++
          continue
        }

        // ── Branch 2: report keyword → send quick-reply menu ──
        if (REPORT_KEYWORDS.includes(text)) {
          const menu =
            'กรุณาเลือกประเภทปัญหา หรือพิมพ์บอกรายละเอียดเพิ่มเติม:\n\n' +
            '• พิมพ์รหัสทรัพย์สิน (เช่น ASSET-00001) เพื่อแจ้งซ่อมเฉพาะเครื่อง\n' +
            '• พิมพ์ "ติดตาม" เพื่อดูสถานะใบงานล่าสุด\n' +
            '• หรือพิมพ์ปัญหา เช่น "เครื่องพิมพ์ไม่ติด ที่ฝ่ายบัญชี"'
          if (replyToken) {
            await replyMessage(
              replyToken,
              [{ type: 'text', text: menu }],
              settings.channelAccessToken,
            )
          }
          handled++
          continue
        }

        // ── Branch 3: text matches a device code ──
        const device = await findDeviceByCode(text)
        let createdWo:
          | (Pick<
              {
                id: string
                woNumber: string | null
                subject: string
                building: string | null
                location: string | null
              },
              'id' | 'woNumber' | 'subject' | 'building' | 'location'
            > & { reporterName: string | null; tel: string | null })
          | null = null
        if (device) {
          const woNumber = await generateWoNumber()
          if (woNumber) {
            // Pull reporter info from LineBinding if available
            const binding = await db.lineBinding.findFirst({
              where: { lineUserId },
              select: { reporterName: true, tel: true, employeeCode: true },
            })
            // FIX-024: wrap create with retry-on-P2002 — re-generate the
            // woNumber on each attempt so concurrent LINE submissions that
            // both compute the same WO number resolve cleanly.
            createdWo = await withRetryOnUnique(async () => {
              const freshWoNumber = await generateWoNumber()
              if (!freshWoNumber) {
                throw new Error('unable to generate woNumber')
              }
              return db.workOrder.create({
                data: {
                  woNumber: freshWoNumber,
                  subject: `แจ้งซ่อมอุปกรณ์: ${device.name} (${device.assetCode})`,
                  building: device.building,
                  location: device.location,
                  details: `แจ้งผ่าน LINE — รหัสทรัพย์สิน: ${device.assetCode}\nอุปกรณ์: ${device.name}\nสาขา: ${device.site}${device.department ? `\nแผนก: ${device.department}` : ''}`,
                  priority: 'ปกติ',
                  reporterName: binding?.reporterName ?? null,
                  tel: binding?.tel ?? null,
                  employeeCode: binding?.employeeCode ?? null,
                  submissionSource: 'line',
                  deviceId: device.id,
                  lineUserId,
                  lineMessageId: messageId,
                  status: 'PENDING',
                },
                select: {
                  id: true,
                  woNumber: true,
                  subject: true,
                  building: true,
                  location: true,
                  reporterName: true,
                  tel: true,
                },
              })
            })
            await bumpLineBindingWoCount(lineUserId)
            await db.workOrderMessage.create({
              data: {
                workOrderId: createdWo.id,
                message: `แจ้งซ่อมผ่าน LINE: ${text}`,
                author: binding?.reporterName ?? `line:${lineUserId}`,
                authorRole: 'reporter',
              },
            })
            await logAuditLine(
              'WO_CREATE',
              createdWo.id,
              `สร้างใบแจ้งซ่อม ${createdWo.woNumber} ผ่าน LINE (device ${device.assetCode})`,
              {
                woNumber: createdWo.woNumber,
                subject: createdWo.subject,
                assetCode: device.assetCode,
              },
              lineUserId,
            )
          }
          if (replyToken) {
            const reply = createdWo
              ? `✅ สร้างใบงานแล้ว ${createdWo.woNumber}\n` +
                `อุปกรณ์: ${device.name} (${device.assetCode})\n` +
                `ที่ตั้ง: ${device.building ?? '-'} ${device.location ?? ''}\n\n` +
                `เจ้าหน้าที่จะติดต่อกลับโดยเร็วครับ`
              : `ไม่สามารถสร้างใบงานได้ กรุณาลองอีกครั้ง`
            await replyMessage(
              replyToken,
              [{ type: 'text', text: reply }],
              settings.channelAccessToken,
            )
          }
          handled++
          continue
        }

        // ── Branch 4: default → create a WO with the text as subject ──
        const woNumber = await generateWoNumber()
        if (woNumber) {
          const binding = await db.lineBinding.findFirst({
            where: { lineUserId },
            select: { reporterName: true, tel: true, employeeCode: true },
          })
          // FIX-024: wrap create with retry-on-P2002 — re-generate the
          // woNumber on each attempt so concurrent LINE submissions that
          // both compute the same WO number resolve cleanly.
          createdWo = await withRetryOnUnique(async () => {
            const freshWoNumber = await generateWoNumber()
            if (!freshWoNumber) {
              throw new Error('unable to generate woNumber')
            }
            return db.workOrder.create({
              data: {
                woNumber: freshWoNumber,
                subject: text.slice(0, 200),
                details: `แจ้งผ่าน LINE: ${text}`,
                priority: 'ปกติ',
                reporterName: binding?.reporterName ?? null,
                tel: binding?.tel ?? null,
                employeeCode: binding?.employeeCode ?? null,
                submissionSource: 'line',
                lineUserId,
                lineMessageId: messageId,
                status: 'PENDING',
              },
              select: {
                id: true,
                woNumber: true,
                subject: true,
                building: true,
                location: true,
                reporterName: true,
                tel: true,
              },
            })
          })
          await bumpLineBindingWoCount(lineUserId)
          await db.workOrderMessage.create({
            data: {
              workOrderId: createdWo.id,
              message: text,
              author: binding?.reporterName ?? `line:${lineUserId}`,
              authorRole: 'reporter',
            },
          })
          await logAuditLine(
            'WO_CREATE',
            createdWo.id,
            `สร้างใบแจ้งซ่อม ${createdWo.woNumber} ผ่าน LINE`,
            {
              woNumber: createdWo.woNumber,
              subject: createdWo.subject,
            },
            lineUserId,
          )
        }
        if (replyToken) {
          const reply = createdWo
            ? `✅ สร้างใบงานแล้ว ${createdWo.woNumber}\nหัวข้อ: ${createdWo.subject}\n\nเจ้าหน้าที่จะติดต่อกลับโดยเร็วครับ`
            : `ไม่สามารถสร้างใบงานได้ กรุณาลองอีกครั้ง`
          await replyMessage(
            replyToken,
            [{ type: 'text', text: reply }],
            settings.channelAccessToken,
          )
        }
        handled++
        continue
      }

      if (type === 'postback') {
        // Postback events come from template buttons / rich menu.
        // For now we just acknowledge and log.
        const data = String((evt.postback as { data?: string })?.data ?? '')
        await logAuditLine(
          'LINE_POSTBACK',
          null,
          `ได้รับ postback จาก LINE: ${data}`,
          { data },
          lineUserId,
        )
        if (replyToken) {
          await replyMessage(
            replyToken,
            [
              {
                type: 'text',
                text: `ได้รับเรียบร้อย (postback: ${data || '-'})`,
              },
            ],
            settings.channelAccessToken,
          )
        }
        handled++
        continue
      }
    } catch (err) {
      console.error('[line-webhook] event handling failed:', err)
    }
  }

  return NextResponse.json({ ok: true, handled })
}
