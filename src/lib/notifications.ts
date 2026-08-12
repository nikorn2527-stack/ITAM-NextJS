/**
 * Notification System — ระบบส่งการแจ้งเตือน 3 ช่องทาง
 *
 * ช่องทาง (channel):
 *   - line-oa   → ส่งผ่าน LINE Official Account (Push/Reply)
 *   - telegram  → ส่งผ่าน Telegram Bot
 *   - email     → ส่งผ่าน SMTP/API
 *
 * Template:
 *   เป็นรายการข้อความภาษาไทยสำเร็จรูป สำหรับเหตุการณ์ต่าง ๆ ในระบบ (แจ้งซ่อม,
 *   มอบหมาย, ปิดงาน, คำขอเบิกอะไหล่, สต็อกต่ำ ฯลฯ)
 *
 * การใช้งาน:
 *   import { sendNotification, renderTemplate } from '@/lib/notifications'
 *
 *   await sendNotification({
 *     template: 'wo_created',
 *     channels: ['line-oa', 'telegram'],
 *     data: { woNumber, subject, building, location, reporterName, tel, priority },
 *     lineUserId,
 *   })
 *
 * หมายเหตุ:
 *   - ตอนนี้ระบบจะ log ข้อความแทนการส่งจริง (console.log + AuditLog)
 *     สามารถเปิดการส่งจริงได้ภายหลังโดยตั้งค่า API keys ใน AppSetting
 *   - API keys ที่ต้องใช้ (เก็บในตาราง AppSetting):
 *       line_channel_access_token  → LINE Messaging API token
 *       line_channel_secret        → LINE channel secret (ใช้ตรวจ signature)
 *       line_admin_group_id        → LINE group/room ID สำหรับส่งแจ้งเตือนแอดมิน
 *       telegram_bot_token         → Telegram Bot API token
 *       telegram_chat_id           → Telegram chat ID เริ่มต้น (แอดมิน)
 *       smtp_host / smtp_port / smtp_user / smtp_pass
 *       email_from                 → อีเมลผู้ส่งเริ่มต้น
 */

import { db } from '@/lib/db'

// ============================================================
// Types
// ============================================================

export type NotificationChannel = 'line-oa' | 'telegram' | 'email'

export type NotificationTemplate =
  | 'wo_created' // แจ้งซ่อนใหม่
  | 'wo_assigned' // มอบหมายงาน
  | 'wo_completed' // ปิดงานแล้ว
  | 'wo_cancelled' // ยกเลิกงาน
  | 'wo_message' // ข้อความใหม่ในใบงาน
  | 'parts_requested' // มีคำขอเบิกอะไหล่
  | 'parts_approved' // อนุมัติเบิกอะไหล่แล้ว
  | 'stock_low' // สต็อกต่ำ
  | 'stock_out' // สต็อกหมด
  | 'meter_reminder' // แจ้งเตือนจดมิเตอร์

export interface NotificationData {
  template: NotificationTemplate
  channels: NotificationChannel[]
  /** Context data for template rendering */
  data: Record<string, unknown>
  /** LINE: lineUserId (optional, if known from WorkOrder reporter) */
  lineUserId?: string
  /** Telegram: chatId */
  telegramChatId?: string
  /** Email: address */
  email?: string
  /** Actor (for audit log). Default 'system' */
  actor?: string
  /** Optional entity reference for audit log */
  entityId?: string
  /** Optional entity type for audit log */
  entity?: string
}

export interface RenderedMessage {
  title: string
  body: string
}

// ============================================================
// Settings loader (AppSetting-backed)
// ============================================================

interface NotifySettings {
  lineChannelAccessToken?: string
  lineChannelSecret?: string
  lineAdminGroupId?: string
  telegramBotToken?: string
  telegramChatId?: string
  smtpHost?: string
  smtpPort?: string
  smtpUser?: string
  smtpPass?: string
  emailFrom?: string
  /** Master switch — when false, log only */
  notifyEnabled?: boolean
}

async function loadSettings(): Promise<NotifySettings> {
  try {
    const rows = await db.appSetting.findMany()
    const get = (key: string) =>
      rows.find((r) => r.key === key)?.value || undefined
    return {
      lineChannelAccessToken: get('line_channel_access_token'),
      lineChannelSecret: get('line_channel_secret'),
      lineAdminGroupId: get('line_admin_group_id'),
      telegramBotToken: get('telegram_bot_token'),
      telegramChatId: get('telegram_chat_id'),
      smtpHost: get('smtp_host'),
      smtpPort: get('smtp_port'),
      smtpUser: get('smtp_user'),
      smtpPass: get('smtp_pass'),
      emailFrom: get('email_from'),
      notifyEnabled: get('notify_enabled') !== 'false',
    }
  } catch (err) {
    console.error('[notifications] loadSettings failed:', err)
    return {}
  }
}

// ============================================================
// Template rendering — Thai messages with variable interpolation
// ============================================================

/**
 * Replace {var} placeholders with values from data.
 * Missing values resolve to '—' so the message is still readable.
 */
function interpolate(tpl: string, data: Record<string, unknown>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = data[key]
    if (v === undefined || v === null || v === '') return '—'
    return String(v)
  })
}

const TEMPLATES: Record<NotificationTemplate, { title: string; body: string }> = {
  wo_created: {
    title: 'แจ้งซ่อนใหม่',
    body: '🔧 แจ้งซ่อนใหม่ {woNumber}\nหัวข้อ: {subject}\nสถานที่: {building} {location}\nผู้แจ้ง: {reporterName}\nเบอร์: {tel}\nความเร่งด่วน: {priority}',
  },
  wo_assigned: {
    title: 'มอบหมายงาน',
    body: '📋 มอบหมายงาน {woNumber}\nมอบหมายให้: {assignedTo}\nหัวข้อ: {subject}',
  },
  wo_completed: {
    title: 'ปิดงานแล้ว',
    body: '✅ ปิดงานแล้ว {woNumber}\nหัวข้อ: {subject}\nผลการแก้ไข: {resolution}\nหมายเหตุ: {detailsAdmin}',
  },
  wo_cancelled: {
    title: 'ยกเลิกงาน',
    body: '❌ ยกเลิกงาน {woNumber}\nเหตุผล: {cancelReason}',
  },
  wo_message: {
    title: 'ข้อความใหม่ในใบงาน',
    body: '💬 ข้อความใหม่ในใบงาน {woNumber}\nจาก: {author}\nข้อความ: {message}',
  },
  parts_requested: {
    title: 'มีคำขอเบิกอะไหล่',
    body: '📦 มีคำขอเบิกอะไหล่\nใบงาน: {woNumber}\nสินค้า: {productName} × {quantity}\nรออนุมัติ',
  },
  parts_approved: {
    title: 'อนุมัติเบิกอะไหล่แล้ว',
    body: '✅ อนุมัติเบิกอะไหล่แล้ว\nสินค้า: {productName} × {quantity}\nคงเหลือ: {balanceAfter}',
  },
  stock_low: {
    title: 'สต็อกต่ำ',
    body: '⚠️ สต็อกต่ำ\nสินค้า: {productName} ({productCode})\nคงเหลือ: {quantity} {unit}\nจุดสั่งซื้อ: {minQuantity}',
  },
  stock_out: {
    title: 'สต็อกหมด',
    body: '🔴 สต็อกหมด\nสินค้า: {productName} ({productCode})',
  },
  meter_reminder: {
    title: 'แจ้งเตือนจดมิเตอร์',
    body: '📈 แจ้งเตือนจดมิเตอร์\nยังไม่ได้จด: {deviceName} ({assetCode})\nรอบ: {cycleName}',
  },
}

/**
 * Render a Thai message for the given template + data.
 */
export function renderTemplate(
  template: NotificationTemplate,
  data: Record<string, unknown>,
): RenderedMessage {
  const tpl = TEMPLATES[template]
  if (!tpl) {
    return {
      title: 'การแจ้งเตือน',
      body: `ไม่พบ template: ${template}`,
    }
  }
  return {
    title: tpl.title,
    body: interpolate(tpl.body, data),
  }
}

// ============================================================
// Audit helper — records every notification send (non-fatal)
// ============================================================

async function logNotificationAudit(
  channel: NotificationChannel,
  template: NotificationTemplate,
  rendered: RenderedMessage,
  target: { lineUserId?: string; telegramChatId?: string; email?: string },
  actor: string,
  entityId?: string,
  entity?: string,
  error?: string,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: 'NOTIFY_SENT',
        entity: entity ?? 'Notification',
        entityId: entityId ?? null,
        summary: `[${channel}] ${rendered.title} — ${rendered.body
          .split('\n')[0]
          .slice(0, 80)}`,
        detail: JSON.stringify({
          channel,
          template,
          title: rendered.title,
          body: rendered.body,
          target,
          error: error ?? null,
        }),
        actor,
      },
    })
  } catch (err) {
    console.error('[notifications] audit log failed:', err)
  }
}

// ============================================================
// Channel senders
// ============================================================

/**
 * Send a LINE message via Push API.
 * - If `lineUserId` is provided → Push to that user.
 * - Otherwise → Push to the admin group/room configured in AppSetting.
 *
 * NOTE: For now this just logs (no API keys configured). When keys are
 * configured in AppSetting, real sending will be attempted.
 */
export async function sendLINE(
  message: string,
  lineUserId?: string,
): Promise<void> {
  const settings = await loadSettings()
  const target = lineUserId ?? settings.lineAdminGroupId
  if (!target) {
    console.warn(
      '[notifications][line-oa] no target (lineUserId or line_admin_group_id) — log only',
    )
    console.log('[notifications][line-oa] message:\n' + message)
    return
  }

  if (!settings.lineChannelAccessToken || !settings.notifyEnabled) {
    console.log(
      `[notifications][line-oa] (log only) → ${target}\n${message}`,
    )
    return
  }

  // ── Real LINE Push API call ──
  // When API keys are configured, perform the actual HTTP request.
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.lineChannelAccessToken}`,
      },
      body: JSON.stringify({
        to: target,
        messages: [{ type: 'text', text: message }],
      }),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error(
        `[notifications][line-oa] LINE API error ${res.status}: ${txt}`,
      )
    }
  } catch (err) {
    console.error('[notifications][line-oa] send failed:', err)
  }
}

/**
 * Send a Telegram message via Bot API.
 * - If `chatId` is provided → send to that chat.
 * - Otherwise → send to the default admin chat from AppSetting.
 */
export async function sendTelegram(
  message: string,
  chatId?: string,
): Promise<void> {
  const settings = await loadSettings()
  const target = chatId ?? settings.telegramChatId
  if (!target) {
    console.warn(
      '[notifications][telegram] no chatId (telegram_chat_id) — log only',
    )
    console.log('[notifications][telegram] message:\n' + message)
    return
  }

  if (!settings.telegramBotToken || !settings.notifyEnabled) {
    console.log(
      `[notifications][telegram] (log only) → ${target}\n${message}`,
    )
    return
  }

  // ── Real Telegram Bot API call ──
  try {
    const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: target,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error(
        `[notifications][telegram] API error ${res.status}: ${txt}`,
      )
    }
  } catch (err) {
    console.error('[notifications][telegram] send failed:', err)
  }
}

/**
 * Send an email. For now this just logs; when SMTP settings are
 * configured it would perform a real send (e.g. via nodemailer).
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const settings = await loadSettings()
  if (!settings.smtpHost || !settings.notifyEnabled) {
    console.log(
      `[notifications][email] (log only) → ${to}\nSubject: ${subject}\n${body}`,
    )
    return
  }

  // ── Real SMTP send would go here ──
  // (Implementation deferred — requires a nodemailer dependency.)
  console.log(
    `[notifications][email] SMTP configured but not implemented → ${to}\nSubject: ${subject}\n${body}`,
  )
}

// ============================================================
// Top-level orchestrator
// ============================================================

/**
 * Send a notification to all specified channels.
 * Renders the template, then dispatches to each channel in parallel.
 * Each channel's result is audited independently (non-fatal).
 */
export async function sendNotification(data: NotificationData): Promise<void> {
  const { template, channels, data: ctx, lineUserId, telegramChatId, email } =
    data

  if (!channels.length) {
    console.warn('[notifications] no channels specified — skipping')
    return
  }

  const rendered = renderTemplate(template, ctx)
  const actor = data.actor ?? 'system'

  // Build the combined message (title + body) for channel senders
  const fullMessage = `${rendered.title}\n${rendered.body}`

  await Promise.all(
    channels.map(async (channel) => {
      try {
        switch (channel) {
          case 'line-oa':
            await sendLINE(fullMessage, lineUserId)
            break
          case 'telegram':
            await sendTelegram(fullMessage, telegramChatId)
            break
          case 'email':
            if (!email) {
              console.warn(
                '[notifications][email] no email address — skipping',
              )
            } else {
              await sendEmail(email, rendered.title, rendered.body)
            }
            break
        }
        await logNotificationAudit(
          channel,
          template,
          rendered,
          { lineUserId, telegramChatId, email },
          actor,
          data.entityId,
          data.entity,
        )
      } catch (err) {
        console.error(`[notifications][${channel}] dispatch failed:`, err)
        await logNotificationAudit(
          channel,
          template,
          rendered,
          { lineUserId, telegramChatId, email },
          actor,
          data.entityId,
          data.entity,
          err instanceof Error ? err.message : String(err),
        )
      }
    }),
  )
}

// ============================================================
// Convenience helpers — for common workflows
// ============================================================

/**
 * Notify on new work order creation.
 * Sends to LINE admin group + Telegram admin chat by default.
 */
export async function notifyWorkOrderCreated(
  wo: {
    id: string
    woNumber?: string | null
    subject: string
    building?: string | null
    location?: string | null
    reporterName?: string | null
    tel?: string | null
    priority: string
    lineUserId?: string | null
  },
  opts: { channels?: NotificationChannel[]; actor?: string } = {},
): Promise<void> {
  await sendNotification({
    template: 'wo_created',
    channels: opts.channels ?? ['line-oa', 'telegram'],
    data: {
      woNumber: wo.woNumber ?? '—',
      subject: wo.subject,
      building: wo.building ?? '',
      location: wo.location ?? '',
      reporterName: wo.reporterName ?? '—',
      tel: wo.tel ?? '—',
      priority: wo.priority,
    },
    lineUserId: wo.lineUserId ?? undefined,
    actor: opts.actor,
    entityId: wo.id,
    entity: 'WorkOrder',
  })
}

/**
 * Notify the assigned technician of a new assignment.
 */
export async function notifyWorkOrderAssigned(
  wo: {
    id: string
    woNumber?: string | null
    subject: string
    assignedTo?: string | null
  },
  opts: { channels?: NotificationChannel[]; actor?: string } = {},
): Promise<void> {
  await sendNotification({
    template: 'wo_assigned',
    channels: opts.channels ?? ['line-oa', 'telegram'],
    data: {
      woNumber: wo.woNumber ?? '—',
      assignedTo: wo.assignedTo ?? '—',
      subject: wo.subject,
    },
    actor: opts.actor,
    entityId: wo.id,
    entity: 'WorkOrder',
  })
}

/**
 * Notify the reporter that their work order is completed.
 * Prefers LINE if the reporter's lineUserId is known.
 */
export async function notifyWorkOrderCompleted(
  wo: {
    id: string
    woNumber?: string | null
    subject: string
    resolution?: string | null
    detailsAdmin?: string | null
    lineUserId?: string | null
    reporterEmail?: string | null
  },
  opts: { channels?: NotificationChannel[]; actor?: string } = {},
): Promise<void> {
  await sendNotification({
    template: 'wo_completed',
    channels: opts.channels ?? (wo.lineUserId ? ['line-oa'] : ['line-oa']),
    data: {
      woNumber: wo.woNumber ?? '—',
      subject: wo.subject,
      resolution: wo.resolution ?? '—',
      detailsAdmin: wo.detailsAdmin ?? '—',
    },
    lineUserId: wo.lineUserId ?? undefined,
    email: wo.reporterEmail ?? undefined,
    actor: opts.actor,
    entityId: wo.id,
    entity: 'WorkOrder',
  })
}

/**
 * Notify that a work order has been cancelled.
 */
export async function notifyWorkOrderCancelled(
  wo: {
    id: string
    woNumber?: string | null
    cancelReason?: string | null
    lineUserId?: string | null
  },
  opts: { channels?: NotificationChannel[]; actor?: string } = {},
): Promise<void> {
  await sendNotification({
    template: 'wo_cancelled',
    channels: opts.channels ?? ['line-oa', 'telegram'],
    data: {
      woNumber: wo.woNumber ?? '—',
      cancelReason: wo.cancelReason ?? '—',
    },
    lineUserId: wo.lineUserId ?? undefined,
    actor: opts.actor,
    entityId: wo.id,
    entity: 'WorkOrder',
  })
}

/**
 * Notify the other party of a new chat message in a work order.
 */
export async function notifyWorkOrderMessage(
  wo: {
    id: string
    woNumber?: string | null
    author?: string | null
    message: string
  },
  opts: { channels?: NotificationChannel[]; actor?: string } = {},
): Promise<void> {
  await sendNotification({
    template: 'wo_message',
    channels: opts.channels ?? ['line-oa', 'telegram'],
    data: {
      woNumber: wo.woNumber ?? '—',
      author: wo.author ?? '—',
      message: wo.message,
    },
    actor: opts.actor,
    entityId: wo.id,
    entity: 'WorkOrder',
  })
}

/**
 * Notify the stock admin of a new parts request.
 */
export async function notifyPartsRequested(
  wo: {
    id: string
    woNumber?: string | null
  },
  item: { productName: string; quantity: number },
  opts: { channels?: NotificationChannel[]; actor?: string } = {},
): Promise<void> {
  await sendNotification({
    template: 'parts_requested',
    channels: opts.channels ?? ['line-oa', 'telegram'],
    data: {
      woNumber: wo.woNumber ?? '—',
      productName: item.productName,
      quantity: item.quantity,
    },
    actor: opts.actor,
    entityId: wo.id,
    entity: 'WorkOrder',
  })
}

/**
 * Notify the WO assignee that a parts request has been approved.
 */
export async function notifyPartsApproved(
  item: {
    productName: string
    quantity: number
    balanceAfter: number
  },
  opts: {
    channels?: NotificationChannel[]
    actor?: string
    lineUserId?: string
    telegramChatId?: string
    entityId?: string
  } = {},
): Promise<void> {
  await sendNotification({
    template: 'parts_approved',
    channels: opts.channels ?? ['line-oa', 'telegram'],
    data: {
      productName: item.productName,
      quantity: item.quantity,
      balanceAfter: item.balanceAfter,
    },
    lineUserId: opts.lineUserId,
    telegramChatId: opts.telegramChatId,
    actor: opts.actor,
    entityId: opts.entityId,
    entity: 'WorkOrder',
  })
}

/**
 * Notify that a stock item has dropped to/below its reorder point.
 */
export async function notifyStockLow(
  item: {
    id: string
    productCode: string
    productName: string
    quantity: number
    unit: string
    minQuantity: number
  },
  opts: { channels?: NotificationChannel[]; actor?: string } = {},
): Promise<void> {
  await sendNotification({
    template: 'stock_low',
    channels: opts.channels ?? ['line-oa', 'telegram'],
    data: {
      productName: item.productName,
      productCode: item.productCode,
      quantity: item.quantity,
      unit: item.unit,
      minQuantity: item.minQuantity,
    },
    actor: opts.actor,
    entityId: item.id,
    entity: 'StockItem',
  })
}

/**
 * Notify that a stock item has run out.
 */
export async function notifyStockOut(
  item: {
    id: string
    productCode: string
    productName: string
  },
  opts: { channels?: NotificationChannel[]; actor?: string } = {},
): Promise<void> {
  await sendNotification({
    template: 'stock_out',
    channels: opts.channels ?? ['line-oa', 'telegram'],
    data: {
      productName: item.productName,
      productCode: item.productCode,
    },
    actor: opts.actor,
    entityId: item.id,
    entity: 'StockItem',
  })
}

/**
 * Notify that a device meter has not been read in the current cycle.
 */
export async function notifyMeterReminder(
  ctx: {
    deviceId: string
    deviceName: string
    assetCode: string
    cycleName: string
  },
  opts: { channels?: NotificationChannel[]; actor?: string } = {},
): Promise<void> {
  await sendNotification({
    template: 'meter_reminder',
    channels: opts.channels ?? ['line-oa', 'telegram'],
    data: {
      deviceName: ctx.deviceName,
      assetCode: ctx.assetCode,
      cycleName: ctx.cycleName,
    },
    actor: opts.actor,
    entityId: ctx.deviceId,
    entity: 'Device',
  })
}
