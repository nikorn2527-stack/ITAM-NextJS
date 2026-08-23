# ITAM-NextJS — Sandbox Handover Worklog

> ไฟล์นี้ใช้สำหรับติดตามสถานะการย้ายและพัฒนาโปรเจ็ค ITAM-NextJS ใน sandbox นี้
> โปรเจ็คต้นฉบับ: https://github.com/nikorn2527-stack/ITAM-NextJS (private repo)

---

## Task ID: MIGRATE-001
Agent: orchestrator (main)
Task: ย้ายโปรเจ็ค ITAM-NextJS จาก GitHub repo มารันใน sandbox Next.js 16 SQLite

Work Log:
- โคลน repo `nikorn2527-stack/ITAM-NextJS` ผ่าน GitHub API tarball (PAT token)
- ลบ sandbox template เดิม (src/prisma/public/tests/docs/scripts/...)
- rsync โค้ด ITAM-NextJS ทั้งหมดมาที่ root `/home/z/my-project/`
- แปลง `prisma/schema.prisma` `provider: postgresql → sqlite` (32 models, 905 lines)
- ลบ `prisma/migrations/` (PG-specific SQL) — ใช้ `db:push` แทน
- ตั้ง `.env`: `DATABASE_URL=file:/home/z/my-project/db/custom.db` (sandbox shell env บังคับ path นี้)
- สร้าง `JWT_SECRET`, `CRON_SECRET`, `NEXTAUTH_SECRET` สำหรับ sandbox
- `bun install` → 934 packages
- `bun run db:push` → สร้าง schema ลง SQLite ครบ 32 models
- รัน `node scripts/create-demo-users.js` → สร้าง 3 demo users:
  - `demo_admin / demo123` (role=admin, isDemo=true)
  - `demo_staff / demo123` (role=editor, isDemo=true)
  - `demo_viewer / demo123` (role=viewer, isDemo=true)
- รัน `bun scripts/seed-authorization-catalog.ts` → 5 roles + 28 permissions + 79 role-permissions
- เพิ่ม `allowedDevOrigins` ใน `next.config.ts` (preview host)
- `bun run dev` → server ready บน port 3000

Bugs พบและแก้:
- **Bug #1**: `/api/sites`, `/api/master`, `/api/meter`, `/api/cycles`, `/api/reports`, `/api/notifications`, `/api/audit`, `/api/settings` (org-profile OK แต่ตัวอื่นไม่ OK), `/api/users`, `/api/templates`, `/api/import`, `/api/search`, `/api/site-rates`, `/api/cost-analytics`, `/api/seed`, `/api/site-attributes`, `/api/health/authz`, `/api/auth/me`, `/api/auth/logout`, `/api/auth/verify-token` คืน 401 — fetch interceptor ใน `src/app/page.tsx` ไม่ครอบคลุม path เหล่านี้
  - **แก้**: ขยาย patch list ใน `page.tsx` ให้ครอบคลุมทุก ITAM API endpoint (ยกเว้น login/register/forgot/reset)
- **Bug #2**: `/api/itam/sites` คืน 500 — `orderBy: { siteCode: 'asc' }` (lowercase) แต่ SiteAttribute model field คือ `SiteCode` (capital) → กรณีนี้น่าจะพังใน production ด้วยแต่ไม่มีใครสังเกตเห็นเพราะ endpoint นี้ไม่ค่อยถูกเรียก
  - **แก้**: เปลี่ยน `siteCode → SiteCode`, `siteName → SiteName` ใน `src/app/api/itam/sites/route.ts`

Verification (agent-browser):
- ✅ `/` load → Login page แสดงผล
- ✅ Login ด้วย `demo_admin / demo123` → เข้า Dashboard สำเร็จ
- ✅ Dashboard: 11 API routes คืน 200 ครบ (dashboard, insights, devices/lifecycle, devices/depreciation, devices/warranty, cycles, reports, meter/reminders, settings/org-profile, notifications)
- ✅ Navigate ไปหน้า "จัดการอุปกรณ์" → แสดงผล, `/api/sites`, `/api/master` คืน 200
- ✅ Navigate ไปหน้า "แจ้งซ่อม" → แสดงผล
- ✅ Navigate ไปหน้า "สต๊อก" → แสดงผล "📦 คลังสต็อก"
- ✅ Navigate ไปหน้า "วิเคราะห์กระดาษ" → แสดงผล "ITAM กระดาษ"
- ✅ Navigate ไปหน้า "ตั้งค่าระบบ" → แสดงผล + `/api/itam/sites` คืน 200

Stage Summary:
- ✅ โปรเจ็ค ITAM-NextJS รันใน sandbox ได้ครบทุกหน้า (login, dashboard, devices, work-orders, stock, paper-analytics, settings)
- ✅ ใช้ `demo_admin / demo123` สำหรับทดสอบ (ตามที่ user ระบุ)
- ✅ ฐานข้อมูล SQLite ใหม่ — ไม่มีข้อมูล devices/stock/work-orders จริง (ต้อง import ทีหลังถ้าต้องการทดสอบข้อมูลจริง)
- ⚠️ Sandbox shell env `DATABASE_URL` บังคับ path `custom.db` — ไม่สามารถเปลี่ยนเป็น `dev.db` ได้
- ⚠️ Cron webDevReview ยังไม่ได้ตั้ง — จะตั้งในขั้นตอนถัดไป

Unresolved:
- ยังไม่มีข้อมูล master (sites, master-items, devices) — ระบบจะแสดง "ยังไม่มีข้อมูล" ทุกที่
- ต้อง import ข้อมูลตัวอย่างเพื่อให้เห็น dashboard ที่สมบูรณ์ (ผ่าน `/api/seed` หรือ `scripts/import-master-item-v3.ts`)
- `/api/itam/events` SSE ใช้เวลา 2.5-3.5 min ต่อ connection (normal สำหรับ SSE long-poll)
