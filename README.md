# IT Asset Management System — Next.js

ระบบจัดการทรัพย์สินอุปกรณ์ IT สร้างบน **Next.js 16 + Prisma + TypeScript**

## ภาพรวม

ย้ายจาก Google Apps Script + Google Sheets มาเป็น Next.js + Prisma + SQLite
พร้อมฟีเจอร์ที่ดีกว่าเดิมในทุกด้าน

## เทคโนโลยี

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Database**: Prisma + SQLite (พร้อมย้าย Supabase)
- **UI**: Tailwind CSS 4 + shadcn/ui
- **Auth**: JWT + RBAC (5 roles + site-level security)
- **Real-time**: Server-Sent Events (SSE)
- **PWA**: Installable + Offline support

## ฟีเจอร์หลัก

### จาก Apps Script (ทำครบทั้งหมด):
- Device CRUD + Cascading Dropdown + Bulk Edit
- Meter Reading (list + keyboard-driven + bulk entry)
- Location Transfer + บังคับจดมิเตอร์ก่อนย้าย + AssetSiteCode auto
- Sticker Multi-template Library + Drag-Move Editor + Bulk Print
- Paper Analytics (4 tabs + drill-down + Smart Insights)
- Notifications (Email + Telegram + LINE)
- Import CSV/Excel + Export CSV/Excel/PDF
- Document/PDF Template System + Editor
- Audit Log viewer
- RBAC + Row-level Security (5 roles + Allowed_Sites)
- Custom Export (เลือกคอลัมน์ + format)

### ฟีเจอร์ใหม่ที่ GAS ทำไม่ได้:
- PWA (installable + offline + service worker)
- Real-time updates (SSE — instant sync across users)
- QR Camera Scanner (jsQR + getUserMedia)
- Virtual Scrolling (2,378+ devices smooth)
- Saved Filters (persist + auto-restore)
- Interactive Charts (recharts with hover/click/animate)
- Optimistic UI (instant feedback)
- Auto-refresh Dashboard (30s + count-up animation)

## ความเร็ว

| ระบบ | เวลา Query |
|------|-----------|
| Google Sheets (Apps Script) | 626ms |
| Prisma + SQLite (Next.js) | 57ms |
| **เร็วกว่า** | **11x** |

## การติดตั้ง

```bash
bun install
bun run db:push
bun run dev
```

## โครงสร้าง

- `prisma/schema.prisma` — 12 models (Device, MeterReading, MasterItem, etc.)
- `src/app/api/itam/` — 39 API routes
- `src/components/itam/` — 37 React components
- `src/lib/` — Auth, CSV, Audit, Notifications, Realtime helpers

## License

สงวนลิขสิทธิ์เพื่อใช้งานภายในองค์กร · PNG TEAM
