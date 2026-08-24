# IT Asset Management System — Next.js

ระบบจัดการทรัพย์สินอุปกรณ์ IT สร้างบน **Next.js 16 + Prisma + TypeScript**

## ภาพรวม

ย้ายจาก Google Apps Script + Google Sheets มาเป็น Next.js + Prisma + PostgreSQL บน Supabase
พร้อมฟีเจอร์ที่ดีกว่าเดิมในทุกด้าน โดยไม่พึ่งพา filesystem สำหรับเก็บข้อมูล production

## เทคโนโลยี

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Database**: Prisma + PostgreSQL (Supabase)
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
| Prisma + PostgreSQL (Next.js) | 57ms* |
| **เร็วกว่า** | **11x*** |

\* ค่าจาก benchmark เดิมของแอป ใช้เพื่อเปรียบเทียบแนวโน้มเท่านั้น ไม่ใช่ SLA ของ Supabase

## การติดตั้ง

```bash
bun install
cp .env.example .env
# แก้ DATABASE_URL และ JWT_SECRET ใน .env ก่อนใช้งาน
bun run db:push
bun run dev
```

## การ Deploy บน Vercel + Supabase

แอป production ต้องใช้ PostgreSQL ภายนอก เช่น Supabase เท่านั้น เพราะ Vercel ไม่รับประกัน filesystem ถาวรสำหรับไฟล์ SQLite. ตั้งค่า `DATABASE_URL` เป็น connection string ของ Supabase โดย URL-encode อักขระพิเศษในรหัสผ่าน และตั้งค่า `JWT_SECRET` เป็นค่าสุ่มยาวที่ไม่ซ้ำกับ development.

ใน Vercel ให้เพิ่มตัวแปรทั้งสองสำหรับ Environment ที่ต้องการ deploy จากนั้น sync schema ไปยังฐานข้อมูลครั้งแรกด้วยคำสั่งต่อไปนี้จากเครื่องที่ตั้งค่า `DATABASE_URL` แล้ว:

```bash
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require" \
  pnpm exec prisma db push
```

ไม่ควร commit ไฟล์ `.env` หรือใส่ credential จริงไว้ใน `vercel.json`; ใช้ `.env.example` เป็นแม่แบบเท่านั้น. หากมีการเปลี่ยน schema ในอนาคต ควรตรวจสอบผลกระทบก่อนใช้ `prisma db push` กับ production database.

## โครงสร้าง

- `prisma/schema.prisma` — 12 models (Device, MeterReading, MasterItem, etc.)
- `src/app/api/itam/` — 39 API routes
- `src/components/itam/` — 37 React components
- `src/lib/` — Auth, CSV, Audit, Notifications, Realtime helpers

## License

สงวนลิขสิทธิ์เพื่อใช้งานภายในองค์กร · PNG TEAM
