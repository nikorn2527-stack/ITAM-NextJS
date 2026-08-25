# QA Test Report — 4 หน้าสุดท้าย (Snapshots + Templates + Audit Log + Mobile Mode)

| ฟิลด์ | ค่า |
|------|-----|
| **Document ID** | QA-FINAL-001 |
| **Task ID** | QA-010 |
| **Test Date** | 2026-08-24 |
| **Tester** | QA Team |
| **Feature Under Test** | Snapshots + Templates + Audit Log + Mobile Mode |
| **Test Account** | `demo_admin / demo123` (role=admin) |
| **Environment** | Next.js 16.3.2 dev + SQLite (commit `0413aa6`) |
| **Pass Rate** | 12/20 = 60% |

---

## Task ID: QA-010
**Agent:** QA Team
**Task:** ทดสอบ 4 หน้าสุดท้าย — Snapshots + Templates + Audit Log + Mobile Mode

### Results:

#### ✅ ผ่าน (12 รายการ)

##### Snapshots
- ✅ Page โหลดได้ — แสดง heading "ตรวจสอบ Snapshot มิเตอร์"
- ✅ ปุ่ม "🔒 Snapshots" แสดง

##### Templates
- ✅ Page โหลดได้ — h1 "📄 เทมเพลต" + lang="th"
- ✅ 3 tabs (สติกเกอร์/เอกสาร PDF/ใบงาน)
- ✅ รายการเทมเพลต + ปุ่ม สร้างใหม่/แก้ไข/คัดลอก
- ✅ ตัวออกแบบสติกเกอร์ + ตัวออกแบบเอกสาร PDF
- ✅ h1 + h3 ครบ (a11y ดี)

##### Audit Log
- ✅ Page โหลดได้ — h1 "📜 ประวัติการใช้งาน (Audit Log)" + lang="th"
- ✅ Table แสดงข้อมูลจริง 25+ รายการ (AUTH_FALLBACK, LOGIN, CREATE, ฯลฯ)
- ✅ Filter dropdown — 10+ action types
- ✅ Search box + date range filter
- ✅ **Export CSV ทำงาน!** — toast "ส่งออก 25 รายการ" ✨
- ✅ Mobile responsive — table scroll แนวนอนได้ (overflow-x:auto)

#### ❌ ไม่ผ่าน (8 รายการ)

##### 🔴 Critical (2 ตัว)

**BUG-MOBILE-001: Mobile Mode ไม่ทำงาน — คลิกแล้ว main content ว่าง**
- อธิบายปัญหา: คลิก "โหมดมือถือ" → main content ว่างเปล่า (ไม่มี component render)
- สาเหตุ: `src/app/page.tsx` ไม่มี case `'mobile'` ใน activePage switch
- ผลกระทบ: feature "โหมดมือถือ" ใช้ไม่ได้เลย
- Severity: 🔴 Critical — **Blocker ของ Mobile Mode**

**BUG-TEMPLATES-001: Templates Tabs คลิกไม่เปลี่ยนหัวข้อ**
- อธิบายปัญหา: คลิก tab "เอกสาร PDF" / "ใบงาน" → h3 ยังเป็น "สติกเกอร์ — รายการเทมเพลต" ตลอด
- Pattern: เดียวกับ BUG-IMPORT-001 + BUG-SETTINGS-012 + BUG-METER-004 ก่อนแก้
- Severity: 🔴 Critical — ไม่สามารถสลับประเภทเทมเพลตได้

##### 🟡 Medium (3 ตัว)

**BUG-SNAPSHOTS-001: Snapshots page ไม่มี h1 — ใช้ h3 ตรงๆ**
- อธิบายปัญหา: page แสดง `<h3>` "ตรวจสอบ Snapshot มิเตอร์" แทน `<h1>`
- ผลกระทบ: ละเมิด WCAG 2.4.6 — screen reader ไม่รู้ว่าเป็น page heading
- Severity: 🟡 Medium a11y

**BUG-AUDIT-001: Refresh ไม่มี toast**
- อธิบายปัญหา: คลิก "รีเฟรช" → API refetch แต่ไม่มี toast
- Pattern: เดียวกับทุกหน้าก่อนแก้ (Dashboard + Paper แก้แล้ว)
- Severity: 🟡 Medium UX

**BUG-TEMPLATES-002: ไม่มี h2 headings**
- อธิบายปัญหา: Templates page มี h1 + h3 แต่ไม่มี h2 → heading hierarchy ข้าม
- Severity: 🟡 Medium a11y

##### 🟢 Low (3 ตัว)

**BUG-SNAPSHOTS-002: ไม่ได้ทดสอบ Snapshots ฟีเจอร์ลึก**
- ไม่ได้ทดสอบ: create snapshot, verify snapshot, view rows
- Severity: 🟢 Low — รอแก้ BUG-SNAPSHOTS-001 + ทดสอบเพิ่ม

**BUG-TEMPLATES-003: ไม่ได้ทดสอบ Template editor ลึก**
- ไม่ได้ทดสอบ: drag-move editor, sticker render, document template render
- Severity: 🟢 Low — รอแก้ BUG-TEMPLATES-001

**BUG-AUDIT-002: Date pickers มี spinbutton = 0**
- อธิบายปัญหา: Audit Log date range filter มี spinbutton Month/Day/Year = 0
- Pattern: เดียวกันกับทุกหน้าที่ใช้ date picker
- Severity: 🟢 Low UX

### Pattern Bugs รวม:

| Pattern | ทุกหน้าที่พบ |
|---------|------------|
| **Tabs Navigation พัง (click ไม่ตอบ)** | Stock (แก้แล้ว), Paper (แก้แล้ว), Meter (แก้แล้ว), OAuth Settings, Import, **Templates** |
| **Refresh ไม่มี toast** | Devices, Meter (แก้แล้วบางส่วน), **Audit Log** |
| **ไม่มี h1** | **Snapshots** |
| **ไม่มี h2** | **Templates** |
| **Page พังทั้งหน้า** | Reports Hub, Monthly Report, **Mobile Mode** |

### Priority สำหรับ ITAM-01:
1. 🔴 **P0:** BUG-MOBILE-001 — เพิ่ม `case 'mobile'` ใน page.tsx (render MobileShell component)
2. 🔴 **P0:** BUG-TEMPLATES-001 — แก้ Tabs click handler (เหมือนที่แก้ใน Meter)
3. 🟡 **P2:** BUG-SNAPSHOTS-001 — เปลี่ยน `<h3>` → `<h1>`
4. 🟡 **P2:** BUG-AUDIT-001 — เพิ่ม toast หลัง Refresh
5. 🟡 **P2:** BUG-TEMPLATES-002 — เพิ่ม h2 headings

### Insights:
- **Audit Log เป็นหน้าที่ทำงานดีที่สุด** — export CSV ทำงาน, table scroll, filters ครบ, ข้อมูลจริง
- **Mobile Mode พังสมบูรณ์** — ไม่มี handler เลย
- **Templates Tabs** เป็น pattern bug ที่พบซ้ำในหลายหน้า — root cause คือ Radix Tabs component + click event

### หลักฐาน:
- 📸 `/home/z/my-project/qa-reports/snapshots-01.png`, `เทมเพลต.png`, `ประวัติการใช้งาน.png`, `โหมดมือถือ.png`, `mobile-mode-01.png`
- 📄 Test Report: `/home/z/my-project/qa-reports/QA-FINAL-001.md`
