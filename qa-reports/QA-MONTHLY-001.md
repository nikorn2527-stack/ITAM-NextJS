# QA Test Report — หน้ารายงานรายเดือน (Monthly Report)

| ฟิลด์ | ค่า |
|------|-----|
| **Document ID** | QA-MONTHLY-001 |
| **Task ID** | QA-009 |
| **Test Date** | 2026-08-24 |
| **Tester** | QA Team |
| **Feature Under Test** | หน้ารายงานรายเดือน (Monthly Report) — Deep Test |
| **Test Account** | `demo_admin / demo123` (role=admin) |
| **Environment** | Next.js 16.3.2 dev + SQLite (commit `0413aa6`) |
| **Viewports** | 1280×800 · 390×844 |
| **Pass Rate** | 1/6 = 17% — **❌ พังทั้งหน้า!** |

---

## Task ID: QA-009
**Agent:** QA Team
**Task:** ทดสอบหน้ารายงานรายเดือน (Monthly Report) — Deep Test

### Results:

#### ✅ ผ่าน (1 รายการ)
- ✅ Recovery buttons — "Reload" + "Back" ทำงาน (Back กลับไปหน้าก่อนหน้า)

#### ❌ ไม่ผ่าน (5 รายการ)

##### 🔴 Critical (4 ตัว)

**BUG-MONTHLY-001: หน้า Monthly Report พังทั้งหน้า — Syntax error ในโค้ด!**
- อธิบายปัญหา: คลิก "รายงานรายเดือน" → "This page couldn't load"
- สาเหตุ: **Syntax error ใน `src/components/itam/monthly-report.tsx:713`**:
  ```ts
  // ❌ ผิด (ปัจจุบัน):
  const onth, setMonth] = React.useState(currentMonthValue())
  
  // ✅ ถูก (ควรเป็น):
  const [month, setMonth] = React.useState(currentMonthValue())
  ```
- ไฟล์ compile ไม่ผ่าน → หน้า crash
- Severity: 🔴 Critical — **Blocker ของทั้งหน้า**
- **แก้ง่ายมาก** — เพิ่ม `[` ตัวเดียว + เปลี่ยน `onth` → `month`

**BUG-MONTHLY-002: API ทำงานปกติ แต่ frontend ใช้ไม่ได้**
- อธิบายปัญหา: API `/api/reports/monthly?month=2026-08&type=all&site=all` คืนข้อมูลครบ (workOrders, stock, devices, meta)
- แต่ frontend crash เพราะ syntax error → ไม่สามารถแสดงข้อมูลได้
- Severity: 🔴 Critical — รอแก้ BUG-MONTHLY-001

**BUG-MONTHLY-003: `lang=""` attribute หายไปเมื่อ error**
- อธิบายปัญหา: เมื่อหน้าแสดง "This page couldn't load" → `document.documentElement.lang` เป็นค่าว่าง
- ผลกระทบ: screen reader ไม่รู้ภาษา — ละเมิด WCAG 3.1.1 Language of Page
- Pattern: เดียวกับ BUG-REPORTS-004
- Severity: 🔴 Critical a11y

**BUG-MONTHLY-004: ไม่มี h2/h3 headings เมื่อ error (a11y)**
- อธิบายปัญหา: หน้า error มีแค่ h1 "This page couldn't load" ไม่มี h2/h3
- Pattern: เดียวกับ BUG-REPORTS-005
- Severity: 🔴 Critical a11y

##### 🟡 Medium (1 ตัว)

**BUG-MONTHLY-005: ไม่ได้ทดสอบฟีเจอร์ Monthly Report (เพราะพังทั้งหน้า)**
- ไม่สามารถทดสอบ:
  - Month picker + site filter
  - Summary sections (devices, WO, stock, meter)
  - Charts + tables + drill-down
  - Export PDF/CSV/Excel
  - Mobile + dark mode
- Severity: 🟡 Medium — รอแก้ BUG-MONTHLY-001 ก่อน

### Priority สำหรับ ITAM-01:
1. 🔴🔴 **P0 (ด่วนที่สุด — แก้ง่ายมาก):** BUG-MONTHLY-001 — แก้ syntax error ใน `monthly-report.tsx:713`:
   ```diff
   - const onth, setMonth] = React.useState(currentMonthValue())
   + const [month, setMonth] = React.useState(currentMonthValue())
   ```
2. 🔴 **P0:** BUG-MONTHLY-002 — แก้ตาม BUG-MONTHLY-001 (API ทำงานอยู่แล้ว)
3. 🔴 **P0:** BUG-MONTHLY-003 + BUG-MONTHLY-004 — ตั้ง `lang="th"` ใน html ตลอดเวลา (เหมือน BUG-REPORTS-004)

### Insights:
- **Bug นี้ไม่น่าจะผ่าน pre-commit hook** — syntax error ควรจะถูก TypeScript compiler จับก่อน
- **สาเหตุที่ผ่านมาได้:** ITAM-01 อาจจะใช้ `git commit --no-verify` หรือ pre-commit hook ยังไม่ตรวจ TypeScript syntax
- **แนะนำ:** เพิ่ม `npx tsc --noEmit` ใน pre-commit hook (นอกเหนือจาก Prisma field check)
- **Pattern:** BUG-MONTHLY-001 เป็น syntax error ที่ไม่ควรเกิดขึ้น — อาจจะเกิดจาก copy-paste ผิดหรือ merge conflict

### หลักฐาน:
- 📸 `/home/z/my-project/qa-reports/monthly-01-initial.png` — error state
- 📄 Test Report: `/home/z/my-project/qa-reports/QA-MONTHLY-001.md`
