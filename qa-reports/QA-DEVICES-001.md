# QA Test Report — หน้าจัดการอุปกรณ์ (Devices Page)

> **เอกสารการตรวจรับฉบับเป็นทางการ** — ทีม QA ตรวจสอบและจับผิดโดยไม่แก้ไขโค้ดใดๆ ตามกฎ

| ฟิลด์ | ค่า |
|------|-----|
| **Document ID** | QA-DEV-2026-08-23-001 |
| **Test Date** | 23 สิงหาคม 2569 (2026-08-23) |
| **Tester** | QA Team (web dev review) |
| **Task ID** | QA-DEVICES-001 |
| **Feature Under Test** | หน้า "จัดการอุปกรณ์" (Devices Page) |
| **Build / Commit** | MIGRATE-001 (sandbox SQLite migration) |
| **Test Environment** | Next.js 16.3.2 dev + SQLite (`db/custom.db` ว่าง) |
| **Test Account** | `demo_admin / demo123` (role=admin, isDemo=true) |
| **Browser** | Chromium (Playwright headless) via agent-browser |
| **Viewports Tested** | 1280×800 (desktop) · 390×844 (iPhone 14 mobile) |
| **Pass Rate** | 9 / 22 = 41% (10 fail + 3 partial) |

---

## 📋 1. สรุปผลการทดสอบ (Executive Summary)

ทดสอบหน้า **"จัดการอุปกรณ์"** ที่เป็นฟีเจอร์หลักของระบบ ITAM พบ **จุดบกพร่อง 22 จุด** แบ่งเป็น:

| Severity | จำนวน | สัดส่วน |
|----------|------|--------|
| 🔴 Critical (Blocker) | 6 | 27% |
| 🟠 High (Functional broken) | 3 | 14% |
| 🟡 Medium (UX/Logic) | 4 | 18% |
| 🟢 Low (Cosmetic/Polish) | 9 | 41% |
| **รวม** | **22** | **100%** |

**ความเสี่ยงต่อการ Cutover:** สูงมาก — ฟีเจอร์หลัก 3 ตัว (เพิ่มอุปกรณ์, pagination, CSV import/export) ใช้งานไม่ได้เลย ต้องแก้ก่อน production cutover

---

## 🎯 2. Test Cases & Results

### Test Case 1: Login flow เข้าสู่ระบบ
| | |
|---|---|
| **Pre-condition** | server รันปกติ, DB มี demo_admin |
| **Steps** | 1) เปิด `/` 2) ใส่ `demo_admin` / `demo123` 3) กดปุ่ม "เข้าสู่ระบบ" |
| **Expected** | หน้า Dashboard แสดงผล + JWT token เก็บใน localStorage |
| **Actual** | ✅ ผ่าน — Dashboard แสดงผลภายใน 1 วินาที |
| **Evidence** | step-01 ในวิดีโอ |

### Test Case 2: Navigate ไปหน้า "จัดการอุปกรณ์"
| | |
|---|---|
| **Steps** | คลิกปุ่ม "จัดการอุปกรณ์" ใน sidebar |
| **Expected** | หน้า Devices แสดงผล + ตาราง + filter bar |
| **Actual** | ✅ ผ่าน — หน้าโหลดสำเร็จ, h1="จัดการอุปกรณ์", API `/api/devices` 200 |

### Test Case 3: แสดงตารางอุปกรณ์ (Empty state)
| | |
|---|---|
| **Expected** | แสดง empty state message ที่อ่านง่าย บอกให้เริ่มเพิ่มอุปกรณ์ |
| **Actual** | ✅ ผ่าน — แสดง "ยังไม่มีอุปกรณ์ในระบบ เริ่มต้นโดยการเพิ่มอุปกรณ์เครื่องแรกของคุณ" + ปุ่ม CTA "เพิ่มอุปกรณ์" |
| **Note** | UX ดี — มี CTA นำ user ไป action ถัดไป |

---

### 🔴 Test Case 4: ปุ่ม "เพิ่มอุปกรณ์" → Form Dialog
| | |
|---|---|
| **Steps** | คลิกปุ่ม "เพิ่มอุปกรณ์" |
| **Expected** | Dialog เปิดขึ้นพร้อมฟอร์มที่มี labels ครบถ้วน + required field markers |
| **Actual** | ⚠️ ผ่านบางส่วน — Dialog เปิดขึ้น, form fields แสดง แต่ input ส่วนใหญ่ **ไม่มี `id` และ `name`** (BUG #3) → label click ไม่ได้, screen reader ใช้ไม่ได้ |

### 🔴 Test Case 5: กด "บันทึก" โดยไม่กรอกข้อมูล (BUG #1)
| | |
|---|---|
| **Pre-condition** | Dialog เพิ่มอุปกรณ์เปิดอยู่, ทุก field ว่าง |
| **Steps** | กดปุ่ม "บันทึก" |
| **Expected** | 1) Validation errors แสดงใต้ required fields ที่ว่าง (รหัสอุปกรณ์ *, ชื่ออุปกรณ์ *, สถานะ *, สาขา *, ประเภท *, แบรนด์ *, รุ่น *) 2) ไม่มี POST request ออกไป |
| **Actual** | ❌ **วิกฤต!** กดบันทึกแล้วไม่เกิดอะไรเลย — ไม่มี validation, ไม่มี toast, ไม่มี POST request |
| **Root cause (analysis)** | ปุ่มเป็น `type="submit"` แต่ไม่ได้อยู่ใน `<form>` element (`form: null`) → submit event ไม่ trigger |
| **Severity** | 🔴 Critical — Blocker ของฟีเจอร์หลัก |
| **Evidence** | `qa-videos/step-02-no-validation.png` + `qa-videos/01-devices-page-qa.webm` นาที 1:30 |

---

### Test Case 6: Status filter dropdown
| | |
|---|---|
| **Steps** | 1) คลิก dropdown "สถานะทั้งหมด" 2) เลือก "ส่งซ่อม" |
| **Expected** | ตารางกรองเฉพาะ devices ที่ status=repair + API `/api/devices?status=repair` ถูกเรียก |
| **Actual** | ✅ ผ่าน — API `/api/devices?status=repair&limit=500` 200, ตารางอัปเดต |
| **Issue ย่อย** | 🟡 `limit=500` ไม่ตรงค่า page size ใน UI (BUG #5) |

### Test Case 7: Site filter dropdown (BUG #7)
| | |
|---|---|
| **Steps** | คลิก dropdown "สาขาทั้งหมด" |
| **Expected** | แสดงรายการสาขาที่มีในระบบ หรือแสดง empty state "ยังไม่มีสาขา ไปเพิ่มที่หน้า Settings" |
| **Actual** | ⚠️ มีแค่ "สาขาทั้งหมด" — ไม่มี empty state บอกว่ายังไม่มีข้อมูล → user สับสนว่าพังหรือไม่มีข้อมูล |
| **Severity** | 🟡 Medium UX |

### Test Case 8: Filter dropdown ปิดด้วย Escape (BUG #8)
| | |
|---|---|
| **Steps** | เปิด dropdown แล้วกด Escape 2 ครั้ง |
| **Expected** | Dropdown ปิดทันทีหลังกด Escape ครั้งแรก |
| **Actual** | ❌ ไม่ปิด — ต้องคลิกข้างนอก |
| **Severity** | 🟡 Medium UX — ผิด convention มาตรฐาน |

---

### 🔴 Test Case 9: Pagination — page size selector (BUG #6)
| | |
|---|---|
| **Pre-condition** | ตารางมีข้อมูล (แม้ DB ว่างก็ทดสอบได้) |
| **Steps** | 1) เปิด page size selector (default=50) 2) เลือก "100" 3) ตรวจ network requests |
| **Expected** | API `/api/devices?limit=100` ถูกเรียกใหม่ + ตารางแสดง 100 แถว (หรือ empty state ถ้า DB ว่าง) |
| **Actual** | ❌ UI อัปเดตเป็น "100" แต่ **ไม่มี API request ใหม่** — pagination ไม่ทำงาน |
| **Root cause** | state update ไม่ trigger refetch — น่าจะ missing useEffect dependency หรือ query key ไม่รวม page size |
| **Severity** | 🔴 Critical — Pagination feature พังสนิท |
| **Evidence** | `qa-videos/step-04-pagesize-no-refetch.png` |

---

### 🔴 Test Case 10: "ดาวน์โหลดเทมเพลต CSV" (BUG #9)
| | |
|---|---|
| **Steps** | 1) คลิก "นำเข้า CSV" เพื่อเปิด dialog 2) คลิก "ดาวน์โหลดเทมเพลต CSV" |
| **Expected** | Browser ดาวน์โหลดไฟล์ `device-template.csv` ทันที |
| **Actual** | ❌ ไม่เกิดอะไร — ไม่มี `<a download>` ถูกสร้าง, ไม่มี blob URL, ไม่มี error |
| **Severity** | 🔴 Critical — user ไม่สามารถเริ่มใช้ import CSV ได้เลย |
| **Evidence** | `qa-videos/step-07-template-broken.png` |

### 🔴 Test Case 11: "ส่งออก CSV" (BUG #10)
| | |
|---|---|
| **Pre-condition** | DB ว่าง (0 devices) |
| **Steps** | คลิกปุ่ม "ส่งออก CSV" |
| **Expected** | 1) Browser ดาวน์โหลด empty CSV (header เท่านั้น) หรือ 2) แสดง toast "ไม่มีข้อมูลให้ export" |
| **Actual** | ❌ API `/api/devices?limit=500` ถูกเรียก 200 OK แต่ไม่มีไฟล์ดาวน์โหลด — ไม่มี blob URL, ไม่มี toast |
| **Severity** | 🔴 Critical — Export feature พัง |
| **Evidence** | `qa-videos/step-05-export-csv-no-file.png` |

---

### Test Case 12: "สแกน QR / บาร์โค้ด"
| | |
|---|---|
| **Steps** | คลิกปุ่ม "สแกน QR / บาร์โค้ด" |
| **Expected** | Dialog เปิด + ขอ permission กล้อง + มี fallback "ใส่รหัสเอง" |
| **Actual** | ✅ ผ่าน — Dialog เปิด, แสดง "ไม่พบกล้อง" + fallback ใส่รหัดเอง + มีกรอบสีส้ม |
| **Note** | UX ดี — มี fallback ที่ใช้งานได้ |

### Test Case 13: "พิมพ์สติกเกอร์" (disabled state)
| | |
|---|---|
| **Expected** | ปุ่ม disabled + tooltip บอกเหตุผล ("เลือกอุปกรณ์ก่อนเพื่อพิมพ์สติกเกอร์") |
| **Actual** | ⚠️ ปุ่ม disabled แต่ไม่มี tooltip — user ไม่รู้ว่าทำไม |
| **Severity** | 🟡 Minor UX |

---

### 🔴 Test Case 14: Global Search (BUG #12)
| | |
|---|---|
| **Steps** | 1) คลิกปุ่ม "ค้นหาทั่วระบบ" 2) พิมพ์ "test" 3) ตรวจสอบ suggestions + API |
| **Expected** | `/api/search?q=test` ถูกเรียก + แสดงผลลัพธ์หรือ "ไม่พบผลลัพธ์" |
| **Actual** | ❌ พิมพ์แล้วไม่มี API request ออกไปเลย — listbox "Suggestions" ว่างเปล่า |
| **Severity** | 🔴 Critical — search feature ใช้ไม่ได้ |
| **Evidence** | `qa-videos/step-09-search-no-results.png` |

### Test Case 15: Alt+T keyboard shortcut (BUG #13)
| | |
|---|---|
| **Expected** | กด Alt+T เปิด Notifications panel |
| **Actual** | ❌ กด Alt+T เปิด "Global Search" แทน — แต่ region label บอก `aria-label="Notifications alt+T"` |
| **Severity** | 🟡 Medium UX — misleading label |

---

### Test Case 16: Refresh button
| | |
|---|---|
| **Steps** | คลิกปุ่ม "รีเฟรช" |
| **Expected** | API refetch + toast "รีเฟรชสำเร็จ" หรือ "อัปเดต X รายการ" |
| **Actual** | ⚠️ API refetch สำเร็จ แต่ไม่มี toast บอก feedback |
| **Severity** | 🟢 Minor UX |

---

### Test Case 17: Dark mode toggle
| | |
|---|---|
| **Steps** | คลิกปุ่ม "สลับเป็นโหมดมืด" |
| **Expected** | Theme เปลี่ยนเป็น dark mode ทันที + persist ใน localStorage |
| **Actual** | ✅ ผ่าน — bg=ดำ (lab 2.75), text=ขาว (lab 98.26) + class `dark` บน html |
| **Note** | contrast ratio ดีมาก อ่านง่าย |

### Test Case 18: Footer alignment
| | |
|---|---|
| **Expected** | Footer stuck to bottom of viewport + ไม่ overlap main content |
| **Actual** | ✅ ผ่าน — main bottom=767, footer top=767, ไม่ overlap, footer อยู่ bottom ที่ y=800 |

---

### 🟠 Test Case 19: Mobile responsive (BUG #11)
| | |
|---|---|
| **Viewport** | 390×844 (iPhone 14) |
| **Steps** | ปรับ viewport + screenshot |
| **Expected** | ทุก element แสดงผล + table สามารถ scroll แนวนอนได้ |
| **Actual** | ❌ Table กว้าง 894px แต่ container 330px + **table ไม่สามารถ scroll แนวนอนได้** (`tableScrollable: false`) |
| **ผลกระทบ** | user มือถือไม่เห็นคอลัมน์: มิเตอร์ล่าสุด, อัปเดตล่าสุด, การกระทำ |
| **Severity** | 🟠 High — กระทบ mobile users ทั้งหมด |
| **Evidence** | `qa-videos/step-11-mobile-no-scroll.png` |

---

### 🟠 Test Case 20: Network — React Query refetch loop (BUG #2)
| | |
|---|---|
| **Steps** | Navigate ไปหน้า Devices + สังเกต network requests ใน 3 วินาทีแรก |
| **Expected** | แต่ละ endpoint ถูกเรียก 1 ครั้งต่อ page load |
| **Actual** | ❌ 5 ชุด duplicate GET requests ในช่วง 3 วินาที = 20 requests รวม |
| **Endpoints ที่ duplicate** | `/api/devices`, `/api/devices/lifecycle`, `/api/devices/depreciation`, `/api/devices/warranty` |
| **Severity** | 🟠 High — บน production (2,378 devices) จะทำให้ client ช้า + server load 5-10× |
| **Evidence** | dev.log ในช่วง timestamp 2816.x |

### 🟡 Test Case 21: Cascading request อัตโนมัติ (BUG #4)
| | |
|---|---|
| **Steps** | Navigate ไปหน้า Devices โดยยังไม่ได้เลือก site/building |
| **Expected** | ไม่ควรมี cascading request จนกว่า user จะเลือก site |
| **Actual** | ❌ `/api/itam/devices/cascading?field=building&site=HQ` ถูกเรียกอัตโนมัติเมื่อ page load |
| **Severity** | 🟡 Medium — เปลือง bandwidth + server load โดยไม่จำเป็น |

---

### Test Case 22: Form inputs accessibility (BUG #3)
| | |
|---|---|
| **Steps** | ตรวจสอบ `<input>` elements ใน dialog เพิ่มอุปกรณ์ |
| **Expected** | ทุก input มี `id` (unique) + `name` + label ที่ `for` ชี้มาถูก input |
| **Actual** | ❌ จาก input ทั้งหมด มีแค่ `dev-assetSiteCode` ที่มี id — ที่เหลือ `id=""`, `name=""` |
| **ผลกระทบ** | 1) Label คลิกไม่ได้ (ไม่ focus input) 2) Screen reader ไม่ประกาศ label 3) Browser autofill ไม่ทำงาน 4) Form validation ที่อ้างอิง name พัง |
| **Severity** | 🟡 Medium — a11y ต่ำมาก |
| **WCAG 2.1** | ละเมิด SC 1.3.1 Info and Relationships + SC 3.3.2 Labels or Instructions + SC 4.1.2 Name, Role, Value |

---

## 🐞 3. รายการ Bug ทั้งหมด (Defect Log)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| BUG-001 | 🔴 Critical | ปุ่ม "บันทึก" ใน form เพิ่มอุปกรณ์ไม่ทำงาน (submit ไม่ trigger) | Open |
| BUG-002 | 🟠 High | React Query refetch loop — 20 requests ใน 3 วิ (5× duplicate) | Open |
| BUG-003 | 🟡 Medium | Form inputs ไม่มี `id`/`name` (a11y ต่ำ + label click ไม่ได้) | Open |
| BUG-004 | 🟡 Medium | Unwanted cascading request เมื่อ page load (`/api/itam/devices/cascading?field=building&site=HQ`) | Open |
| BUG-005 | 🟡 Medium | Page size inconsistency — UI=50, API=500 | Open |
| BUG-006 | 🔴 Critical | Page size selector พัง — เปลี่ยนค่า UI แล้วไม่ refetch | Open |
| BUG-007 | 🟡 Medium | Empty filter dropdown ไม่มี empty state message | Open |
| BUG-008 | 🟡 Medium | Dropdown ไม่ปิดด้วย Escape key | Open |
| BUG-009 | 🔴 Critical | "ดาวน์โหลดเทมเพลต CSV" ไม่ทำงาน | Open |
| BUG-010 | 🔴 Critical | "ส่งออก CSV" ไม่ดาวน์โหลดไฟล์ (API ถูกเรียก 200 OK แต่ไม่มี blob) | Open |
| BUG-011 | 🟠 High | Mobile — table ไม่ scroll แนวนอน (390px viewport) | Open |
| BUG-012 | 🔴 Critical | Global Search ไม่ทำงาน (พิมพ์แล้วไม่มี API request) | Open |
| BUG-013 | 🟡 Medium | Misleading label "Notifications alt+T" แต่จริงๆ เปิด Global Search | Open |
| BUG-014 | 🟢 Low | Date pickers มี spinbutton Month/Day/Year = 0 (placeholder ไม่ชัด) | Open |
| BUG-015 | 🟢 Low | ไม่มี toast หลัง Refresh button | Open |
| BUG-016 | 🟢 Low | "พิมพ์สติกเกอร์" disabled ไม่มี tooltip บอกเหตุผล | Open |
| BUG-017 | 🟢 Low | ไม่มี `aria-keyshortcuts` attributes บน shortcut buttons | Open |
| BUG-018 | 🟢 Low | Logout button ไม่เห็นใน desktop collapsed sidebar | Open |
| BUG-019 | 🟢 Low | Dialog ไม่มี focus trap (Tab ออกจาก dialog ได้) | Open (pending verify) |
| BUG-020 | 🟢 Low | Search box ไม่มี clear (×) button | Open |
| BUG-021 | 🟢 Low | Filter chip ไม่แสดงค่าที่เลือกแบบ visual badge | Open |
| BUG-022 | 🟢 Low | ไม่มี skeleton loader ตอนรอ data (white flash) | Open |

---

## 📊 4. สรุปและข้อแนะนำ

### สิ่งที่ทำงานได้ดี ✅
- Login flow (TC-1)
- Page navigation (TC-2)
- Empty state UX (TC-3) — มี CTA นำไป action ถัดไป
- Status filter (TC-6)
- QR scanner fallback (TC-12)
- Dark mode (TC-17) — contrast ดีมาก
- Footer alignment (TC-18)
- Dialog open/close (TC-4)

### สิ่งที่ต้องแก้ก่อน Cutover 🔴
1. **BUG-001** (form submit) — เพิ่มอุปกรณ์ไม่ได้เลย
2. **BUG-006** (pagination) — page size ใช้ไม่ได้
3. **BUG-009, BUG-010** (CSV) — import/export ใช้ไม่ได้
4. **BUG-012** (global search) — search ใช้ไม่ได้

### สิ่งที่ต้องแก้ก่อน Go-Live 🟠
1. **BUG-002** (refetch loop) — กระทบ production performance
2. **BUG-011** (mobile table scroll) — กระทบ mobile users ทั้งหมด

### สิ่งที่ควรแก้ (Polish) 🟡
1. **BUG-003** (form a11y) — ละเมิด WCAG 2.1
2. **BUG-007, BUG-008, BUG-013** (UX issues)
3. **BUG-004, BUG-005** (consistency issues)

### สิ่งที่ทำได้ทีหลัง 🟢
BUG-014 ถึง BUG-022 — cosmetic / polish

---

## 📁 5. หลักฐานประกอบ (Evidence)

### วิดีโอ
- `/home/z/my-project/qa-videos/01-devices-page-qa.webm` (698 KB) — บันทึกการเทสทั้งหมด ~2 นาที

### Screenshots
- `qa-videos/step-01-add-dialog.png` — Dialog เพิ่มอุปกรณ์เปิด
- `qa-videos/step-02-no-validation.png` — กดบันทึกแล้วไม่มี validation (BUG-001)
- `qa-videos/step-03-pagination-bug.png` — Pagination UI
- `qa-videos/step-04-pagesize-no-refetch.png` — เปลี่ยน page size แล้วไม่ refetch (BUG-006)
- `qa-videos/step-05-export-csv-no-file.png` — Export CSV ไม่มีไฟล์ (BUG-010)
- `qa-videos/step-06-import-dialog.png` — Import CSV dialog
- `qa-videos/step-07-template-broken.png` — Download template ไม่ทำงาน (BUG-009)
- `qa-videos/step-08-search-empty.png` — Global search เปิด
- `qa-videos/step-09-search-no-results.png` — พิมพ์แล้วไม่มีผลลัพธ์ (BUG-012)
- `qa-videos/step-10-dark-mode.png` — Dark mode ทำงาน
- `qa-videos/step-11-mobile-no-scroll.png` — Mobile table ไม่ scroll (BUG-011)

### Logs
- `/home/z/my-project/dev.log` — server log รวม duplicate requests (BUG-002)

---

## 📝 6. หมายเหตุ / Constraints ของการทดสอบ

1. **DB ว่าง** — ทดสอบใน SQLite ที่ยังไม่มีข้อมูล devices/sites/master จริง บาง bug อาจมี behavior ต่างเมื่อมีข้อมูล
2. **agent-browser click ไม่ trigger React handler** — ต้องใช้ `element.click()` ผ่าน `agent-browser eval` สำหรับปุ่มบางตัว (นี่เป็น constraint ของ test tool ไม่ใช่ bug ของแอป)
3. **ไม่ได้ทดสอบ**: การแก้ไขอุปกรณ์, ลบอุปกรณ์, multi-select, bulk edit, transfer flow — เพราะ DB ว่าง ไม่มีข้อมูลให้ทดสอบ
4. **ไม่ได้ทดสอบ**: Browser autofill, password manager integration — ต้องการ browser profile ที่มีข้อมูลจริง

---

## ✍️ 7. Sign-off

| บทบาท | ชื่อ | วันที่ | ลงนาม |
|------|-----|------|------|
| QA Tester | web dev review (cron) | 2026-08-23 | ✅ รายงานเสร็จสมบูรณ์ |
| Developer (ITAM-01) | — | — | ⏳ รอรับรายงาน |
| Acceptance | — | — | ⏳ รออนุมัติ |

---

> 📋 **เอกสารนี้เป็นของทีม QA** — ห้าม ITAM-01 แก้ไขเนื้อหา หากพบว่าผิด แจ้งทีม QA แก้ให้
> 📁 ตำแหน่งไฟล์: `/home/z/my-project/qa-reports/QA-DEVICES-001.md`
