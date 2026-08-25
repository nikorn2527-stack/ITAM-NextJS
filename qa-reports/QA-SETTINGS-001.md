# QA Test Report — หน้าตั้งค่าระบบ (Settings) — DEEP TEST

| ฟิลด์ | ค่า |
|------|-----|
| **Document ID** | QA-SETTINGS-001 (v2 — Deep Test) |
| **Task ID** | QA-006 (updated) |
| **Test Date** | 2026-08-23 |
| **Tester** | QA Team |
| **Feature Under Test** | หน้าตั้งค่าระบบ (Settings) — 15 sections + CRUD + Tabs |
| **Test Account** | `demo_admin / demo123` (role=admin) |
| **Environment** | Next.js 16.3.2 dev + SQLite (commit 35d4f1c) |
| **Viewports** | 1280×800 · 390×844 |
| **Pass Rate** | 13/22 = 59% — **❌ ไม่ผ่าน** (ลดลงเพราะเทสลึกขึ้นเจอ bug เพิ่ม) |

---

## Task ID: QA-006 (Deep Test)
**Agent:** QA Team
**Task:** ทดสอบหน้าตั้งค่าระบบ (Settings) — ละเอียดลึก CRUD ทุก section

### Results:

#### ✅ ผ่าน (13 รายการ)

##### Section 1: ข้อมูลมาตรฐาน (Master Data)
- ✅ Table แสดง master items (Brand HP, Type PRINTER, ฯลฯ)
- ✅ **"เพิ่ม"** dialog เปิด + form fields ครบ (หมวดหมู่, ค่า, Display Label, รหัส)
- ✅ **Validation** — กดบันทึกเปล่า → toast "กรุณากรอกหมวดหมู่และค่า" + ไม่มี POST
- ✅ **"แก้ไข"** (pencil) — dialog เปิด + pre-filled ค่าเดิม
- ✅ Row buttons (edit + delete) มี onClick handler

##### Section 2: จัดการสาขา (Sites)
- ✅ Table แสดง UDH site + paper rates (฿0.50/฿2)
- ✅ **"เพิ่มสาขา"** dialog เปิด + form ครบ
- ✅ **"Sync ไป Master Data"** — ทำงาน + toast "Sync เสร็จ — สร้างใหม่ 1 | อัปเดต 0 | ข้าม 0 (รวม 1 สาขา)"

##### Section 3: รูปแบบเลขทะเบียน (Asset Patterns)
- ✅ แสดง 3 patterns (ง่าย 5 หลัก, โรงพยาบาล 4-3-3-2, ปี-เดือน 4 หลัก)
- ✅ **"ใช้รูปแบบนี้"** — activate ทำงาน + toast "เปลี่ยนรูปแบบเลขทะเบียนเรียบร้อยแล้ว"

##### Section 4: เลขใบงาน (WO Number Patterns)
- ✅ แสดง 2 patterns (PPIT มี/ไม่มี dash)

##### Section 5: ตัวเลือกใบงาน (WO Options)
- ✅ แสดง problem types หลายตัว + ปุ่ม "ลบ" แต่ละตัว

##### Section 6: สมุดผู้ติดต่อ (Contact Directory)
- ✅ Table + search box + "เพิ่มผู้ติดต่อ"
- ✅ **"เพิ่มผู้ติดต่อ"** dialog เปิด + form ครบ (ชื่อ, เบอร์, รหัส, แผนก, หมายเหตุ, switch เปิดใช้งาน)
- ✅ **Validation** — กดบันทึกเปล่า → toast "กรุณาระบุชื่อ-นามสกุล"

##### Section 7: ปรับแต่งแอป (Org Profile)
- ✅ Form ครบ (appName, tagline, logoUrl, primaryColor, accentColor, industryType, language)
- ✅ **"บันทึก"** — ทำงาน + toast "บันทึกการตั้งค่าแอปแล้ว — sidebar จะอัปเดตทันที"

##### Section 8: การแจ้งเตือน (Notifications)
- ✅ 9 switches (notification types) + Email/Telegram/LINE bot token + บันทึก/ส่งทดสอบ/รีเฟรช

##### Section 9: เทมเพลตข้อความ (Message Templates)
- ✅ Table + "เพิ่มเทมเพลต" + empty state

##### Section 10: สมุดผู้ติดต่อ empty state
- ✅ "ไม่พบรายการ" empty state

##### Section 11: รออนุมัติ empty state
- ✅ "🎉ไม่มีคำขอรออนุมัติ — ทุกคำขอได้รับการพิจารณาแล้ว" empty state ดี

##### Section 12: OAuth/External Login (Tabs)
- ✅ 3 tabs (Google/LINE/Telegram) + form per tab (client ID, secret, redirect URL)
- ✅ **Keyboard navigation** — focus + Enter เปลี่ยน tab ได้

##### อื่นๆ
- ✅ Dark mode toggle
- ✅ Mobile responsive (390px) — sections เป็น vertical stack

#### ❌ ไม่ผ่าน (9 รายการ — เพิ่มจาก 6 เป็น 9 เพราะเทสลึกขึ้น)

##### 🔴 Critical (5 ตัว)

**BUG-SETTINGS-001**: `/api/itam/sites` คืน 500 — case-sensitive field name (`siteCode` vs `SiteCode`)
- ไฟล์: `src/app/api/itam/sites/route.ts:14`
- Pattern: เดิมจาก MIGRATE-001 — ITAM-01 push ทับ

**BUG-SETTINGS-002**: "จัดการผู้ใช้" + "สิทธิ์ผู้ใช้" ติด USER_MANAGE — admin ไม่มีสิทธิ์
- Pattern: เดียวกับ BUG-WO-002 (admin permission)

**BUG-SETTINGS-003**: "🧪 สาธิตระบบ" แสดง "ยังไม่มีบัญชีสาธิต" ทั้งที่ DB มี demo users
- สาเหตุ: API ไม่ส่ง demo users มา (filter issue)

**BUG-SETTINGS-009 (ใหม่)**: "สาขา (ภาพรวม)" แสดง "ยังไม่มีข้อมูลสาขา" ทั้งที่ DB มี UDH
- สาเหตุ: น่าจะเกี่ยวข้องกับ BUG-SETTINGS-001 (sites API พัง)

**BUG-SETTINGS-011 (ใหม่)**: สมุดผู้ติดต่อ — กรอกชื่อแล้ว toast ยังบอก "กรุณาระบุชื่อ-นามสกุล"
- สาเหตุ: state ไม่ sync เข้า React state (อาจจะเป็น controlled/uncontrolled component issue)
- Pattern: เดียวกับ BUG-METER-001 (form state sync)

##### 🟠 High (1 ตัว)

**BUG-SETTINGS-004**: `/api/itam/auth/pending` คืน 403 — admin ไม่มีสิทธิ์ดู pending users

##### 🟡 Medium (3 ตัว)

**BUG-SETTINGS-005**: ไม่มี h2/h3 headings ใน section content (a11y)
- มี h1 "ตั้งค่าระบบ" แต่ไม่มี h2/h3 → screen reader ข้าม section headers

**BUG-SETTINGS-006**: Mobile — settings sections sidebar (366px) ทับ main content
- viewport 390px — main nav 239px + sections sidebar 366px → content แคบ

**BUG-SETTINGS-007 (ใหม่)**: Add master item form — ปุ่ม "บันทึก" enabled แม้กรอกไม่ครบ + inputs ไม่มี id/name/aria-label/placeholder
- 3 inputs ที่ไม่มี placeholder/aria-label เลย

**BUG-SETTINGS-008 (ใหม่)**: Row buttons (pencil=edit, trash=delete) ไม่มี title/aria-label
- Pattern: เดียวกับ BUG-STK-004 (Stock row buttons ก่อนแก้)

**BUG-SETTINGS-010 (ใหม่)**: Contact form — 4/6 inputs ไม่มี placeholder/aria-label
- มีแค่ "เบอร์โทร" (08xxxxxxxx) + "หมายเหตุ"

**BUG-SETTINGS-012 (ใหม่)**: OAuth Tabs — คลิกไม่ตอบ (selected ยังเป็น Google ตลอด)
- Pattern: เดียวกับ BUG-METER-004 ก่อนแก้ (Tabs Navigation พัง)
- Keyboard navigation (focus + Enter) ทำงาน แต่ click ไม่ทำงาน

### Pattern Bugs (สำคัญ):

| Pattern | Bugs ที่เกี่ยวข้อง |
|---------|---------------|
| **admin ไม่มีสิทธิ์** | BUG-WO-002, BUG-SETTINGS-002, BUG-SETTINGS-004 |
| **case-sensitive field name** | MIGRATE-001 #2, BUG-SETTINGS-001 |
| **Tabs Navigation พัง** | BUG-METER-004 (แก้แล้ว), BUG-SETTINGS-012 (ใหม่) |
| **Form state sync** | BUG-METER-001, BUG-SETTINGS-011 (ใหม่) |
| **a11y: row buttons ไม่มี aria-label** | BUG-STK-004 (แก้แล้ว), BUG-SETTINGS-008 (ใหม่) |
| **a11y: form inputs ไม่มี id/name/aria-label** | BUG-003 (Devices), BUG-SETTINGS-007 (ใหม่), BUG-SETTINGS-010 (ใหม่) |
| **a11y: ไม่มี h2/h3 headings** | BUG-DASH-003 (แก้แล้ว), BUG-PAPER-007 (แก้แล้ว), BUG-METER-011, BUG-SETTINGS-005 |

### Priority สำหรับ ITAM-01:
1. 🔴 **P0:** BUG-SETTINGS-001 — แก้ `siteCode` → `SiteCode` (1 บรรทัด)
2. 🔴 **P0:** BUG-SETTINGS-002 — admin role = all permissions (จะแก้ BUG-SETTINGS-004 ด้วย)
3. 🔴 **P0:** BUG-SETTINGS-003 — ตรวจ API ที่ส่ง demo users
4. 🔴 **P0:** BUG-SETTINGS-011 — ตรวจ controlled component ใน contact form
5. 🔴 **P0:** BUG-SETTINGS-009 — แก้ตาม BUG-SETTINGS-001 (sites API)
6. 🟠 **P1:** BUG-SETTINGS-004 — แก้พร้อม BUG-SETTINGS-002
7. 🟡 **P2:** BUG-SETTINGS-005, 006, 007, 008, 010, 012

### ไม่ได้ทดสอบลึก (เพราะ permission):
- ❌ User CRUD (เพิ่ม/แก้ไข/ลบ user) — ติด BUG-SETTINGS-002
- ❌ Role assignment — ติด BUG-SETTINGS-002
- ❌ Site grants management — ติด BUG-SETTINGS-002
- ❌ Pending user approval — ติด BUG-SETTINGS-004
- ❌ Demo data cleanup — ติด BUG-SETTINGS-003

### Insights:
- **ส่วนที่ทำงานดี:** master data, sites, asset patterns, WO patterns, WO options, org profile, notifications, message templates
- **ส่วนที่พัง:** user management (permission), demo users (filter), contact form (state sync), OAuth tabs (click)
- **Pattern BUG ใหม่ที่พบ:** Tabs Navigation พังใน OAuth (BUG-SETTINGS-012) — ใช้วิธีเดียวกับที่แก้ใน Meter

### 📁 หลักฐาน:
- 📸 `/home/z/my-project/qa-reports/settings-*.png` (7 รูป)
- 📄 Test Report: `/home/z/my-project/qa-reports/QA-SETTINGS-001.md` (v2 — Deep Test)
