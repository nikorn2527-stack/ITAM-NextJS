# NOTIFY-LINE — Work Record

## Summary
Built the Notification system (3 channels + Thai templates) and LINE Official Account integration (webhook + reply) for the Next.js ITAM project at `/home/z/my-project`.

## Files Created
- `src/lib/notifications.ts` — abstract notification sender (LINE/Telegram/email) + 10 Thai templates + per-channel audit logging
- `src/app/api/notifications/send/route.ts` — POST endpoint to trigger notifications
- `src/app/api/line/webhook/route.ts` — LINE Messaging API webhook (signature-verified, message/follow/postback handling, creates WorkOrder from LINE messages)
- `src/app/api/line/reply/route.ts` — POST endpoint for staff to push replies to LINE users

## Files Modified
- `prisma/schema.prisma` — added `WorkOrder.lineUserId` + `WorkOrder.lineMessageId`; added new `LineBinding` model
- `src/lib/db.ts` — extended dev-mode staleness probe to include `lineBinding`
- `src/app/api/work-orders/route.ts` — trigger `wo_created` notification on POST
- `src/app/api/work-orders/[id]/assign/route.ts` — trigger `wo_assigned`
- `src/app/api/work-orders/[id]/complete/route.ts` — trigger `wo_completed` (reporter LINE preferred)
- `src/app/api/work-orders/[id]/cancel/route.ts` — trigger `wo_cancelled`
- `src/app/api/work-orders/[id]/messages/route.ts` — trigger `wo_message`; push staff replies to reporter's LINE
- `src/app/api/work-orders/[id]/parts/route.ts` — trigger `parts_requested` (per item)
- `src/app/api/stock-items/[id]/pending/[txnId]/approve/route.ts` — trigger `parts_approved` (look up WO to find assignee + lineUserId)

## AppSetting Keys (for future configuration)
- `line_channel_access_token` — LINE Messaging API token
- `line_channel_secret` — for webhook signature verification
- `line_admin_group_id` — default LINE group for admin notifications
- `telegram_bot_token` — Telegram Bot API token
- `telegram_chat_id` — default Telegram chat ID
- `smtp_host` / `smtp_port` / `smtp_user` / `smtp_pass` / `email_from` — for email
- `notify_enabled` — master switch (set to `false` to disable real sending)

## PART 3 — Single User System
Added `// NOTE (PART 3 — Single User System):` comments at every actor/approver fallback. The `User` model already exists in the schema; once NextAuth integration lands, replace the body-supplied `actor`/`approver`/`author` fields with the session user's email/id.

## Verification
- `bun run db:push` succeeded; Prisma Client regenerated with new fields + `LineBinding` model
- `bun run lint` ran clean (no errors)
- Dev server log shows no compile/runtime errors after changes

## Notes for Future Agents
- The notification system logs to console + AuditLog when no API keys are configured. This is intentional — it makes the system fully functional in dev. Real sending is automatically enabled once the relevant AppSetting keys are populated.
- The LINE webhook accepts requests without signature verification when `line_channel_secret` is not configured (dev mode). When deploying to production, ALWAYS set this key.
- The `WorkOrder.submissionSource` field now has a third valid value: `line` (alongside `session` and `guest`). Existing client code does not need to change — the default is still `guest`.
- The `findDeviceByCode` helper in the webhook uses `findUnique({ where: { assetCode } })` and `findFirst({ where: { serialNumber } })`. SQLite is case-insensitive for ASCII by default, so `ASSET-00001` and `asset-00001` both match.
