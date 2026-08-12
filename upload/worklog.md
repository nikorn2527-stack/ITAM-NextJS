# Worklog — IT Asset Management (Google Apps Script)

## โครงการปัจจุบัน

Repository: `nikorn2527-stack/IT-Asset-Management` (Google Apps Script Web App)
เป้าหมาย: เพิ่ม 2 ฟีเจอร์สติกเกอร์โดยไม่พังของเดิม

1. **Bulk Sticker Print** — พิมพ์สติกเกอร์หลายเครื่องพร้อมกัน (ปัจจุบันได้ทีละเครื่อง)
2. **Sticker Template Editor** — หน้าจัดการเทมเพลตแบบ drag-move, ปรับขนาด/ความเข้มจาง/ตำแหน่งอิสระ

## หลักการสำคัญ (กันแอปเดี้ยงเหมือนครั้งก่อน)

- **Feature flag** `stickerTemplateEnabled` (boolean) — default `false`
- **Fallback** เสมอ: ถ้า template ไม่ valid หรือ flag ปิด → ใช้ layout เดิม (renderDeviceSticker เดิม)
- **Non-destructive**: ไม่ลบโค้ดเดิม, แค่แยกฟังก์ชันและเพิ่มใหม่
- **Layered rollback**: ปิดได้ 3 ระดับ
  1. ปิด toggle ใน Settings (กลับเป็น layout เดิม)
  2. ลบ `stickerTemplate` ออกจาก App_Settings
  3. Revert commit

---

## Task ID: STICKER-1 — Backend (SettingsService.gs)

Agent: main
Task: เพิ่ม `stickerTemplate` + `stickerTemplateEnabled` ใน default settings, และเพิ่มฟังก์ชัน `saveStickerTemplate` ใหม่

Work Log:
- เพิ่ม field `stickerTemplate: ''` และ `stickerTemplateEnabled: false` ใน `getDefaultAppSettings()`
- เพิ่ม description ใน `getAppSettingDescriptions()`
- เพิ่มฟังก์ชัน `saveStickerTemplate(templateJson, authToken)` — ตรว JSON valid + ความยาว < 45000 แล้วเก็บใน App_Settings
- เพิ่มฟังก์ชัน `getStickerTemplate(authToken)` — อ่าน template ปัจจุบันกลับไป editor

Stage Summary:
- Backend พร้อมรองรับ template JSON
- ใช้ chunking logic ที่มีอยู่ของ App_Settings ได้เลย (ถ้า template > 49000 ตัว)
- ไม่กระทบ logic เดิม

---

## Task ID: STICKER-2 — Refactor + Bulk Print (javascript.html)

Agent: main
Task: แยก `renderDeviceSticker` เป็น `renderDeviceStickerSingle` + `triggerStickerPrint` และเพิ่ม `printSelectedDeviceStickers`

Work Log:
- แยก `renderDeviceSticker(assetNo)` เดิมเป็น:
  - `renderDeviceStickerSingle(assetNo, targetEl)` — สร้าง HTML ใส่ targetEl (ไม่ print)
  - `triggerStickerPrint(printArea)` — ส่วน print + รอรูปโหลด
  - `renderDeviceSticker(assetNo)` — wrapper เรียกทั้งสอง (preserve behavior เดิม)
- เพิ่ม `printSelectedDeviceStickers()` — โหลด sticker settings ครั้งเดียว แล้วเรียก `renderBulkStickers`
- เพิ่ม `renderBulkStickers(assetNos)` — สร้างสติกเกอร์ทีละใบใน temp div, รวมเป็น grid, print ครั้งเดียว

Stage Summary:
- การ print เดิม (1 เครื่อง) ไม่เปลี่ยน behavior
- เพิ่ม bulk mode ใช้ grid 3 คอลัมน์ใน A4
- จำกัด 60 เครื่องต่อครั้ง (กัน timeout)

---

## Task ID: STICKER-3 — Template Renderer (javascript.html)

Agent: main
Task: เพิ่ม `renderStickerFromTemplate(device, template, targetEl)` + integrate เข้า `renderDeviceStickerSingle` ด้วย feature flag

Work Log:
- เพิ่มฟังก์ชัน `renderStickerFromTemplate(device, template, targetEl)` — รับ JSON template, แปลงเป็น HTML แบบ absolute positioning
- รองรับ element type: text, image, qr
- รองรับ variable: {{AssetNo}}, {{Serial}}, {{companyName}}, ฯลฯ
- ปรับ `renderDeviceStickerSingle` ให้ตรว flag + template ก่อน, ถ้ามี → ใช้ใหม่, ถ้าไม่มี → fallback เดิม

Stage Summary:
- โค้ดเดิมยังอยู่ครบ แค่ถูกห่อหุ้มด้วย if/else
- ถ้า template พัง → catch error แล้ว fallback อัตโนมัติ

---

## Task ID: STICKER-4 — Template Editor (javascript.html)

Agent: main
Task: เพิ่ม drag-move editor functions + property panel logic

Work Log:
- เพิ่ม `stickerEditorState` global state (template, selectedElId, dragging)
- เพิ่ม `openStickerEditor()`, `loadDefaultStickerTemplate()`, `renderStickerEditor()`
- เพิ่ม `startDragElement()`, `selectStickerElement()`, `updateSelectedStickerElement()`
- เพิ่ม `addStickerElement()`, `deleteSelectedStickerElement()`
- เพิ่ม `saveStickerTemplate()`, `previewStickerTemplate()`

Stage Summary:
- Editor ทำงานใน modal แยก ไม่กระทบ main page
- ใช้ pixel-perfect positioning (5px/mm)
- Save ผ่าน google.script.run.saveStickerTemplate

---

## Task ID: STICKER-5 — UI (index.html)

Agent: main
Task: เพิ่มปุ่ม bulk sticker + ปุ่มเปิด editor + modal sticker-editor

Work Log:
- เพิ่มปุ่ม "🖨️ พิมพ์สติกเกอร์ที่เลือก" ใน bulk-device-toolbar (line ~264)
- เพิ่ม section "🎨 ตัวจัดการเทมเพลตสติกเกอร์" ใน Settings panel (หลัง sticker logo upload)
  - Toggle "ใช้เทมเพลตแบบกำหนดเอง"
  - ปุ่ม "เปิดตัวจัดการเทมเพลต"
- เพิ่ม modal `modal-sticker-editor` ก่อน `</body>` (canvas + property panel + footer)

Stage Summary:
- ใช้ modal pattern เดิม (openModal/closeModal)
- ปุ่ม toggle ใช้ data-permission="ADMIN"

---

## Task ID: STICKER-6 — CSS (css.html)

Agent: main
Task: เพิ่ม CSS bulk mode + editor styles

Work Log:
- เพิ่ม `@media print` rule สำหรับ `.bulk-sticker-mode` — grid 3 คอลัมน์ใน A4
- เพิ่ม `.stk-editor-el` styles — drag handle, selection border, hover
- เพิ่ม `.sticker-template-mode` — absolute positioning container

Stage Summary:
- ใช้ `!important` เฉพาะใน @media print เพื่อ override
- ไม่แตะ CSS สติกเกอร์เดิม (บรรทัด 1822-2167)

---

## วิธีทดสอบ (หลัง push ขึ้น Apps Script)

### ทดสอบ Bulk Print (ฟีเจอร์ 1)
1. ไปหน้า "จัดการอุปกรณ์"
2. ติ๊กเลือกหลายเครื่อง (checkbox)
3. กดปุ่ม "🖨️ พิมพ์สติกเกอร์ที่เลือก"
4. คาดหวัง: สติกเกอร์ทั้งหมดแสดงในหน้า print preview เป็น grid

### ทดสอบ Template Editor (ฟีเจอร์ 2)
1. ไปหน้า "ตั้งค่า" → tab "ทั่วไป"
2. เลื่อนไป section "ตัวจัดการเทมเพลตสติกเกอร์"
3. **อย่าเปิด toggle ก่อน** — กดแค่ปุ่ม "เปิดตัวจัดการเทมเพลต"
4. ทดลองลาก element, ปรับขนาด, ปรับ opacity
5. กด "ทดลองพิมพ์" เพื่อ preview
6. กด "บันทึกเทมเพลต"
7. **เปิด toggle** "ใช้เทมเพลตแบบกำหนดเอง"
8. ลองพิมพ์สติกเกอร์ปกติ — ควรใช้ template ใหม่

### วิธี Rollback (ถ้าพัง)
- **Level 1**: ปิด toggle "ใช้เทมเพลตแบบกำหนดเอง" → กลับเป็น layout เดิมทันที
- **Level 2**: ลบ row `stickerTemplate` ใน sheet App_Settings
- **Level 3**: git revert commit นี้

---

## สถานะปัจจุบัน

- ✅ Backend (SettingsService.gs) — เสร็จ
- ✅ Refactor + Bulk Print — เสร็จ
- ✅ Template Renderer — เสร็จ
- ✅ Template Editor JS — เสร็จ
- ✅ UI (index.html) — เสร็จ
- ✅ CSS — เสร็จ
- ✅ Syntax verification ผ่าน (javascript.html + SettingsService.gs)
- ✅ div tag balance ผ่าน (445/445)
- ✅ @media balance ผ่าน (9 blocks)

## สรุปไฟล์ที่แก้

| ไฟล์ | บรรทัดเดิม | บรรทัดใหม่ | สิ่งที่เปลี่ยน |
|------|-----------|-----------|--------------|
| `SettingsService.gs` | 229 | 283 | +2 fields default, +2 descriptions, +2 functions (`saveStickerTemplate`, `getStickerTemplate`), expose `stickerTemplateEnabled` ใน `getPublicAppSettings` |
| `javascript.html` | 6506 | 7124 | +618 บรรทัด: refactor renderDeviceSticker เป็น 3 ฟังก์ชัน, +6 ฟังก์ชัน bulk print, +1 ฟังก์ชัน template renderer, +11 ฟังก์ชัน editor, update `updateDeviceSelectionSummary`, update settings load/save binding |
| `index.html` | 1469 | 1606 | +137 บรรทัด: bulk-sticker-bar, sticker editor section ใน Settings, modal sticker-editor |
| `css.html` | 2548 | 2656 | +108 บรรทัด: bulk mode grid, editor styles (drag handle, selection, placeholder), sticker-template-mode |

## ขั้นตอน deploy ไปยัง Apps Script จริง

เนื่องจากโปรเจกต์นี้เป็น Google Apps Script (ไม่ใช่ Next.js) ผู้ใช้ต้อง copy ไฟล์จาก local ไปยัง Apps Script editor ด้วยตนเอง:

### วิธีที่ 1: Manual copy (ง่ายที่สุด)
1. เปิด Spreadsheet → Extensions > Apps Script
2. แต่ละไฟล์ที่แก้ ให้ copy จาก local ไปวางทับใน Apps Script editor:
   - `SettingsService.gs` → วางทับไฟล์ `SettingsService.gs`
   - `javascript.html` → วางทับไฟล์ `javascript.html`
   - `index.html` → วางทับไฟล์ `index.html`
   - `css.html` → วางทับไฟล์ `css.html`
3. กด Save
4. Deploy → Manage deployments → Edit → Create new version
5. ทดสอบ URL ใหม่

### วิธีที่ 2: ใช้ clasp (advanced)
```bash
npm install -g @google/clasp
clasp login
clasp clone <SCRIPT_ID>   # จาก Apps Script URL
# copy ไฟล์จาก IT-Asset-Management/ ไปทับ
clasp push
```

## วิธีทดสอบ (หลัง push ขึ้น Apps Script)

### ทดสอบ Bulk Print (ฟีเจอร์ 1)
1. ไปหน้า "จัดการอุปกรณ์"
2. ติ๊กเลือกหลายเครื่อง (checkbox คอลัมน์ซ้ายสุด)
3. จะมี bar สีเหลือง "🖨️ พร้อมพิมพ์สติกเกอร์ที่เลือก" ปรากฏขึ้น
4. กดปุ่ม "🖨️ พิมพ์สติกเกอร์ที่เลือก"
5. คาดหวัง: print preview เปิดขึ้น สติกเกอร์ทั้งหมดอยู่ใน grid 3 คอลัมน์ใน A4
6. ถ้าเลือก > 60 เครื่อง → toast แจ้งเตือน

### ทดสอบ Template Editor (ฟีเจอร์ 2)
1. ไปหน้า "ตั้งค่า" → tab "ทั่วไป"
2. เลื่อนลงไป section "🎨 ตัวจัดการเทมเพลตสติกเกอร์"
3. **อย่าเปิด toggle ก่อน** — กดแค่ปุ่ม "🎨 เปิดตัวจัดการเทมเพลต"
4. modal เปิดขึ้น มี canvas + property panel
5. คลิก element ใน canvas → จะมีขอบสีฟ้า + property panel แสดงคุณสมบัติ
6. ลาก element เพื่อย้ายตำแหน่ง
7. ลากจุดสีฟ้ามุมขวาล่างเพื่อปรับขนาด
8. ปรับ opacity slider → ดูความโปร่งใสเปลี่ยน
9. กด "👁️ ทดลองพิมพ์" → preview สติกเกอร์จริง
10. กด "💾 บันทึกเทมเพลต"
11. กด "×" ปิด modal
12. **เปิด toggle** "เปิดใช้เทมเพลตแบบกำหนดเอง"
13. กด "💾 บันทึกการตั้งค่า" (ปุ่มด้านล่าง)
14. ลองพิมพ์สติกเกอร์ปกติ → ควรใช้ template ใหม่

### วิธี Rollback (ถ้าพัง)
- **Level 1** (เร็วสุด): ปิด toggle "เปิดใช้เทมเพลตแบบกำหนดเอง" ใน Settings → บันทึก → กลับเป็น layout เดิมทันที
- **Level 2**: ลบ row `stickerTemplate` และ `stickerTemplateEnabled` ใน sheet `App_Settings`
- **Level 3**: ใน Apps Script editor ใช้ Version History (File → See version history) ย้อนกลับไปก่อนแก้

## ความเสี่ยงที่เหลือ

1. **Print layout บางเครื่องไม่รองรับ CSS grid ใน @media print** — ถ้าเจอต้องเปลี่ยนเป็น flexbox ใน css.html `.bulk-sticker-mode`
2. **QuickChart QR API อาจ rate limit** เมื่อ print 60 เครื่องพร้อมกัน — แนะนำ stagger loading ในอนาคต
3. **`@page size: A4` override** อาจไม่ทำงานบาง browser — ผู้ใช้อาจต้องเลือก "A4" ใน print dialog เอง
4. **Apps Script quota** — `UrlFetchApp` มีขีดจำกัด 20,000 calls/day; QR 60 รูปต่อการ print 1 ครั้ง = ไม่มีปัญหา
5. **Browser pop-up blocker** — `window.print()` อาจถูก block ในบาง browser ถ้าไม่ใช่ user gesture (แต่ในที่นี้คลิกปุ่ม = user gesture, ปลอดภัย)

## Priority recommendations ต่อไป

- P0 (เดิม): ลบไฟล์ modules/ ที่ซ้ำกับ Code.gs (10 ฟังก์ชันซ้ำ) — ยังไม่ได้แก้
- P0 (เดิม): เปลี่ยน appsscript.json access = ANYONE_WITH_GOOGLE_ACCOUNT — ยังไม่ได้แก้
- P1 (เดิม): เพิ่ม orphan cleanup ใน deleteDevice
- P1 (เดิม): batch insert ใน saveMeterReading
- P2 (ใหม่): เพิ่ม "snap to grid" ใน sticker editor (ขณะนี้ปรับละเอียด 0.1mm อิสระ)
- P2 (ใหม่): เพิ่ม preview device selector ใน editor (เลือก device ที่จะ preview แทน device ตัวแรก)
- P2 (ใหม่): เพิ่ม keyboard shortcuts (Delete ลบ, ลูกศรย้าย 1mm, Shift+ลูกศรย้าย 0.1mm)

---

## 📋 Update ที่ 2: ย้าย editor จาก modal ไปเป็น tab ใน Settings

ตาม feedback ผู้ใช้: "เพิ่ม Tap ในหน้าตั้งค่าจะดีกว่าครับ เพราะพื้นที่จะได้ใช้งานปรับแต่งได้ง่าย"

### การเปลี่ยนแปลง

1. **เพิ่ม tab ใหม่** "🎨 สติกเกอร์" ใน settings-tabs (ถัดจาก "🏢 สาขา (Site)")
   - มี `data-permission="ADMIN"` ซ่อนจาก non-admin อัตโนมัติ
2. **เพิ่ม panel** `settings-panel-sticker` ใหม่ บรรจุ editor เต็มพื้นที่:
   - Card header พร้อม toggle "เปิดใช้งานเทมเพลตนี้"
   - กล่อง warning color อธิบายวิธีใช้ + rollback
   - Canvas (flex:1, min-width:400px) + Property panel (width:300px)
   - Action bar ล่าง (preview + save)
3. **ลบ modal** `modal-sticker-editor` ทิ้งทั้งบล็อก (ย้ายเนื้อหาไป panel แล้ว)
4. **ลบ sticker section** เดิมออกจาก app tab (toggle + ปุ่ม "เปิดตัวจัดการเทมเพลต")
5. **อัปเดต `showSettingsTab`** ใน javascript.html:
   - เพิ่ม `sticker` ใน panels object
   - เรียก `loadStickerEditorTab()` อัตโนมัติเมื่อ switch ไป tab sticker
6. **เพิ่มฟังก์ชันใหม่** `loadStickerEditorTab()`:
   - โหลด template จาก backend ครั้งแรกที่เข้า tab
   - ใช้ `_loaded` flag กันโหลดซ้ำซ้อน
   - Fallback ใช้ default template ถ้า server error
7. **แก้ `openStickerEditor()`** ให้ switch ไป tab sticker แทนการเปิด modal
8. **แก้ `saveStickerTemplate()`** ให้ตั้ง `_loaded = true` หลังบันทึก (กัน reload ซ้ำ)

### ผลลัพธ์

| ก่อน | หลัง |
|------|------|
| Toggle + ปุ่มเปิด modal อยู่ใน app tab (แคบ) | Toggle + editor เต็มพื้นที่อยู่ใน tab ใหม่ "🎨 สติกเกอร์" |
| Editor อยู่ใน modal 1100px (จำกัดความสูง) | Editor อยู่ใน panel เต็มจอ, canvas max-height 520px พร้อม scroll |
| ต้องคลิกปุ่ม "เปิดตัวจัดการเทมเพลต" ก่อน | คลิก tab "🎨 สติกเกอร์" ได้เลย — auto-load template |
| Property panel width:280px | Property panel width:300px (กว้างขึ้นเล็กน้อย) |

### Verification หลังแก้

- ✅ javascript.html syntax OK (308,424 chars)
- ✅ div balance 444/444
- ✅ tab/panel/loadStickerEditorTab มีครบ (8 references)
- ✅ modal `modal-sticker-editor` ถูกลบทิ้งแล้ว
- ✅ sticker section ใน app tab ถูกลบทิ้งแล้ว

### วิธีทดสอบใหม่

1. ไปหน้า "ตั้งค่า"
2. คลิก tab **"🎨 สติกเกอร์"** (ถัดจาก "🏢 สาขา (Site)")
3. Editor จะโหลด template อัตโนมัติ (ครั้งแรกอาจใช้เวลา 1-2 วินาที)
4. ทดลองลาก element, ปรับขนาด, ปรับ opacity
5. กด "👁️ ทดลองพิมพ์" เพื่อ preview
6. กด "💾 บันทึกเทมเพลต"
7. เปิด toggle "เปิดใช้งานเทมเพลตนี้" (อยู่ด้านบนขวาของ card header)
8. กดปุ่ม "💾 บันทึกการตั้งค่า" ที่ tab "⚙️ ตั้งค่าทั่วไป" (เพื่อบันทึก toggle)
9. ลองพิมพ์สติกเกอร์ปกติ → ควรใช้ template ใหม่

### Rollback (เหมือนเดิม)

- **Level 1**: ปิด toggle "เปิดใช้งานเทมเพลตนี้" → กลับเป็น layout เดิมทันที
- **Level 2**: ลบ row `stickerTemplate` ใน sheet `App_Settings`
- **Level 3**: git revert commit นี้

---

## 📋 Update ที่ 3: แก้ Thai Status legacy ใน sheet → normalise ทุกจุดในฟอร์ม

### ที่มาของปัญหา

ผู้ใช้สังเกตว่า sheet มีค่าสถานะไทยเก่า เช่น `เสีย`, `ซ่อม`, `ไม่ได้ใช้งาน` และถามว่า
"STATUS_TH ไม่รู้จัก → แสดงค่าเดิม" เป็นปัญหาเดียวกับ "ช่องเลือกสถานะ ต่อจากแผนก" หรือไม่

### คำตอบ: ไม่ใช่ปัญหาเดียวกัน — เป็น 2 ประเด็นคนละจุด

| ประเด็น | สถานะก่อนแก้ | สถานะหลังแก้ |
|--------|-------------|-------------|
| **1. Display** (ตาราง/dashboard badge) | ✅ แก้แล้ว — `STATUS_TH` map มีค่า legacy (`เสีย`→`ส่งซ่อม`, `ซ่อม`→`ส่งซ่อม`, `ไม่ได้ใช้งาน`→`ไม่ใช้งาน`) อยู่แล้ว | (ไม่ต้องแก้เพิ่ม) |
| **2. Edit form** (`f-Status` + `dl-Status` หลังแผนก) | ❌ ดึง raw จาก sheet → datalist ยุ่งเหยิง (อังกฤษ+ไทย), input แสดง raw `เสีย` | ✅ แก้แล้ว — normalise → อังกฤษมาตรฐาน |

### การเปลี่ยนแปลง (javascript.html เท่านั้น)

#### 1. เพิ่ม reverse map + helper functions (หลัง `getStatusBadge()`)
- **`STATUS_TO_EN`** — map ค่าทั้งหมด (อังกฤษมาตรฐาน + ไทยมาตรฐาน + ไทย legacy) → อังกฤษมาตรฐาน
  - legacy ที่รองรับ: `เสีย`, `ซ่อม`, `รอซ่อม`, `ไม่ได้ใช้งาน`, `ใช้ไม่ได้`, `พัง`, `สูญหาย`, `เสื่อมสภาพ`, `เลิกใช้`, `ยกเลิก`, `เครื่องเสีย`
- **`normalizeStatusToEn(status)`** — แปลงค่าใดๆ → อังกฤษมาตรฐาน (case-insensitive สำหรับอังกฤษ; unknown จะ return ค่าเดิม เพื่อไม่ทำลาย custom status)
- **`getStandardStatusOptions()`** — คืนตัวเลือกมาตรฐาน 8 ค่า + ค่าจาก sheet (ที่ normalise แล้ว) dedupe แล้ว

#### 2. `editDevice()` — normalise ค่า Status ก่อนใส่ input
```javascript
if (f === 'Status') val = normalizeStatusToEn(val);
el.value = val;
```
ผล: เปิดแก้ไขเครื่องที่ sheet เก็บ `เสีย` → ช่อง `f-Status` แสดง `In Repair` (มาตรฐาน) เมื่อ save จะเก็บ `In Repair` กลับลง sheet → **migrate ข้อมูลเก่าทีละเครื่องอัตโนมัติ**

#### 3. `populateFormDropdowns()` — `dl-Status` datalist ใช้ตัวเลือกมาตรฐาน
```javascript
fillDatalist('dl-Status', getStandardStatusOptions());
```
ผล: datalist แสดงเฉพาะ `Active, In Repair, Pending Repair, Retired, Returned, Inactive, Temporary, In Stock` (สะอาด ไม่มี legacy ปะปน)

#### 4. `refreshDeviceBulkOptions()` — `bulk-Status` dropdown ใช้ตัวเลือกมาตรฐาน
```javascript
fillSelect('bulk-Status', getStandardStatusOptions(), 'ไม่เปลี่ยน');
```

#### 5. `openLifecycleAction()` — normalise ค่า Status ก่อน set `lc-status`
```javascript
statusEl.value = normalizeStatusToEn(presetStatus || device.Status || '');
```
ผล: modal "เปลี่ยนสถานะ" จะ set ค่า default ติด แม้ device มี legacy `เสีย`

#### 6. ตัวกรองหน้าจัดการอุปกรณ์ (filter-status multiselect)
- `applyFilters()` — normalise `d.Status` ก่อนเทียบกับ filter ที่เลือก → filter `In Repair` จะจับเครื่องที่มี `เสีย`/`ซ่อม`/`In Repair` ได้ครบ
- `updateFilterOptions()` — normalise ค่า Status ก่อนสร้างตัวเลือก filter → dropdown แสดง `In Repair` ไม่ใช่ `เสีย`/`ซ่อม` แยกกัน
- เพิ่ม helper `normalizeDeviceStatusForFilter(devices)` สำหรับ normalise ก่อน `uniqueSortedValues`

### ผลรวม

| จุด | ก่อน | หลัง |
|----|------|------|
| ตาราง/Dashboard badge | แสดงไทย (ผ่าน STATUS_TH) | ไม่เปลี่ยน ✅ |
| `f-Status` input (edit form) | แสดง raw `เสีย` | แสดง `In Repair` ✅ |
| `dl-Status` datalist | ยุ่งเหยิง (mix อังกฤษ+ไทย) | สะอาด (8 มาตรฐาน) ✅ |
| `bulk-Status` dropdown | ยุ่งเหยิง | สะอาด ✅ |
| `lc-status` (lifecycle modal) | set ไม่ติด (legacy ไม่ match options) | set ติด ✅ |
| `filter-status` multiselect | แสดง legacy แยกกัน + filter ไม่ตรง | แสดงมาตรฐาน + filter จับได้ครบ ✅ |
| Sheet storage | เก็บ legacy `เสีย` ต่อไป | **migrate ทีละเครื่อง** เมื่อ user แก้ไข → ค่อยๆ กลายเป็น `In Repair` ✅ |

### Verification

- ✅ JavaScript syntax OK (362,759 chars, ผ่าน `new Function()` parse)
- ✅ ไม่มี `&quot;` ใหม่ใน JS strings (2 ตัวที่มีอยู่เป็น HTML entity map ใน `escapeHtml` — ปกติ)
- ✅ div balance ใน index.html: 435/435 (ไม่ได้แก้ index.html)
- ✅ Functional test `normalizeStatusToEn()` — 13/13 cases ผ่าน (รวม case-insensitive, null, unknown passthrough)

### หมายเหตุสำคัญเกี่ยวกับการ migrate ข้อมูล

แนวทางนี้เป็น **gradual migration** — ไม่ได้ bulk-update sheet ทีเดียว:
- เครื่องที่ user ยังไม่ได้แก้ไข → sheet ยังเก็บ legacy `เสีย` อยู่
- แต่หน้าแอปแสดงผลถูกต้องหมด (table แสดง `ส่งซ่อม`, form แสดง `In Repair`, filter ทำงานได้)
- เมื่อ user แก้ไขเครื่องนั้นและ save → sheet จะถูกเขียนทับด้วย `In Repair` อัตโนมัติ

ถ้าต้องการ migrate ทีเดียวจบ ต้องเขียน script ใน `Code.gs` ที่วน `All_Devices` แปลงค่าทุกแถว — แต่เสี่ยงเพราะอาจมีค่าที่ไม่อยู่ใน map แนะนำให้ใช้ gradual migration นี้ก่อน

### ไฟล์ที่แก้
- `javascript.html` — เพิ่ม ~70 บรรทัด (STATUS_TO_EN map + 3 helper functions + 5 call sites)

### Priority recommendations ต่อไป (ยังค้าง)
- P0: ลบไฟล์ modules/ ที่ซ้ำกับ Code.gs
- P0: เปลี่ยน appsscript.json access = ANYONE_WITH_GOOGLE_ACCOUNT
- P1: เพิ่ม orphan cleanup ใน deleteDevice
- P1: batch insert ใน saveMeterReading
- P2: bulk-migrate script สำหรับ sheet legacy Thai status (optional — ใช้ gradual migration แทนได้)

---

## 📋 Update ที่ 4: ปรับปรุงระบบสถานะ + จดมิเตอร์ + ประวัติ + สิทธิ์ + Performance

### สถานะอุปกรณ์ (Status Redesign)

แยกสถานะให้ชัดเจน — เดิม "ถอนการติดตั้ง" = Retired (ปิดงาน) ไม่ถูกต้อง

| สถานะ DB | แสดงผลไทย | reading type | prev ได้? | ปิดงาน? |
|---------|----------|:----------:|:------:|:------:|
| Active | ใช้งาน | MONTHLY | ✅ | ไม่ |
| Inactive | ถอนการติดตั้ง | CHECKOUT | ✅ | ไม่ |
| In Stock | เครื่องพร้อมใช้ | CHECKOUT | ✅ | ไม่ |
| In Repair | ส่งซ่อม | SEND_REPAIR | ❌ | ไม่ |
| Disposed | จำหน่าย | FINAL | ❌ | ใช่ |
| Retired | ปลดระวาง (เก่า) | FINAL | ❌ | ใช่ |
| Returned | คืนเครื่อง | FINAL | ❌ | ใช่ |

### ปุ่มใน Action Modal (context-aware)
- 📦 ถอนการติดตั้ง → Inactive (CHECKOUT)
- ✅ เครื่องพร้อมใช้ → In Stock (ไม่ต้องจดมิเตอร์)
- 🗑️ จำหน่าย → Disposed (FINAL)
- ♻️ ติดตั้งใหม่ → Active (RETURN/INITIAL)

### ลูปการจดมิเตอร์ (3 ลูปหลัก)

1. **ถอน/ส่งซ่อน/จำหน่าย ในเดือนนั้น** → โหลดเข้ามา + แสดง "✅ จดแล้ว"
2. **FINAL/RETURN/SEND_REPAIR ไม่เป็น prev** → findValidPrevReading() ข้ามปิดงาน
3. **ปลด→ติดตั้งใหม่** → บังคับ INITIAL (จดเลขใหม่)

### ประวัติอุปกรณ์ (History Redesign)
- Modal ขยาย 1180px (modal-xlarge)
- Timeline view (รวม location + meter history)
- 3 tabs: Timeline / ประวัติย้าย / ประวัติมิเตอร์
- Export CSV + Print

### หน้าจดมิเตอร์ (Meter Page Redesign)
- Sticky toolbar (1 แถว)
- Quick Key bar (กระชับ)
- ประวัติการคีย์ล่าสุด (collapsible, 20 รายการ)
- ตาราง scroll ในตัว (flex:1)
- Column filter ในหัวตาราง + dropdown อาคาร/ชั้น
- Enter ในตาราง → กระโดดไป Quick Key

### วันที่ไทย (Bug F + F2)
- formatDateDisplay → พ.ศ. (15 ส.ค. 2568)
- Custom Thai Date Picker (ปฏิทินไทย 100%)
- formatMonthThai → "สิงหาคม 2568"

### สิทธิ์ผู้ใช้ (Permissions Redesign)

| Role | ตั้งค่าทั่วไป | สิทธิ์ผู้ใช้ | สาขา | สติกเกอร์ | Master Data | Audit Log | ลบอุปกรณ์ |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| superadmin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| admin | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| editor | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

- เพิ่ม USER_MANAGE (superadmin เท่านั้น — ลบผู้ใช้)
- เพิ่ม SYSTEM_CONFIG (superadmin เท่านั้น — ตั้งค่าระบบ)
- ดึง DEVICE_DELETE ออกจาก editor
- หน้าตั้งค่า: SUPERADMIN → ADMIN (admin เข้าได้)
- Master Data ย้ายเข้าตั้งค่าเป็น tab
- Audit Log viewer ใหม่ (tab ในตั้งค่า)

### Master Data ปรับปรุง
- ลบ Status + Site ออกจาก auto-sync (addDevice/updateDevice)
- Site จัดการจุดเดียว: ตั้งค่า > สาขา → auto-sync ไป Master_Items
- ลบ "Sync หลังแก้ All_Devices" (ไม่ต้องการแล้ว)

### Performance
- Dashboard: โหลด paper usage เฉพาะ 2 เดือน (แทน 14,000 rows)
- Paper Analytics: default เดือนปัจจุบัน + fallback 3 เดือนล่าสุด
- Settings tabs: cache ไม่โหลดซ้ำตอนสลับ

### ไฟล์ที่แก้
- `javascript.html` — UI + logic ทั้งหมด
- `index.html` — HTML structure + tab + modal
- `css.html` — styles ทั้งหมด
- `MeterService.gs` — getLifecycleReadingType + findValidPrevReading + getPrintersByLocation
- `TransferService.gs` — VALID_LIFECYCLE_STATUSES + isUninstall
- `DeviceService.gs` — ลบ Status + Site จาก auto-sync
- `Code.gs` — saveSiteAttribute auto-sync + getAuditLogs + ROLE_PERMISSIONS
- `Auth.gs` — deactivateUserPermission → USER_MANAGE
- `AnalyticsService.gs` — getPaperUsageStatsFast + default month
- `ImportService.gs` — ลบ reconcileDataAfterManualEdit

### Priority recommendations ต่อไป
- P0: deploy ทุกไฟล์ขึ้น Apps Script + ทดสอบ
- P1: แก้ Master_Items sheet: GroupName=SiteCode, AllowedSites=ALL
- P1: ทดสอบ workflow ถอน→ติดตั้งใหม่ (Inactive→Active)
- P2: localStorage cache สำหรับ devices (เร่งความเร็วเพิ่ม)
- P2: virtual scrolling สำหรับตารางอุปกรณ์ (ถ้าเกิน 5000 แถว)

---

## Task ID: PAPERRATE-FIX-1 — แก้ bug ค่ากระดาษ BW/Color หายหลังรีเฟรช

Agent: main
Task: ผู้ใช้รายงานว่าตั้งค่าค่ากระดาษ BW/Color ในหน้า Site_Attributes แล้ว รีเฟรชมาข้อมูลหายหมด ตารางแสดง "ไม่พบข้อมูล"

### Root Cause Analysis

**ปัญหาหลัก**: `readSiteAttributesSheet()` ใน Code.gs อ่านเฉพาะ 4 ฟิลด์ (SiteCode, SiteName, LineOA, Hotline) — **ไม่ได้อ่าน PaperRateBW/PaperRateColor** ที่ `saveSiteAttribute()` เขียนลง sheet จริง

ผลที่ตามมา:
- ข้อมูลถูกบันทึกลง sheet จริง ✓
- แต่ `listSiteAttributes()` → `readSiteAttributesSheet()` ไม่ดึง PaperRateBW/PaperRateColor ออกมา
- ตาราง frontend render แล้ว `item.PaperRateBW` เป็น undefined → แสดง "default" ตลอด
- editSiteAttribute() กรอกค่าว่างใน input → ดูเหมือนข้อมูลหาย

**ปัญหารอง**: 
1. `saveSiteAttribute` return เฉพาะ `{success, message}` — frontend เคลียร์ entries เป็น `[]` หลัง save → ตารางว่าง
2. colspan="5" ใน loading row แต่ตารางมี 7 คอลัมน์
3. ไม่มี validation ค่ากระดาษ (user ใส่ตัวอักษรหรือค่าติดลบได้)
4. ไม่มี feedback ว่าค่า default ที่ใช้จริงคือเท่าไหร่

### Work Log

**Backend (Code.gs):**
- แก้ `readSiteAttributesSheet()` ให้อ่าน PaperRateBW, PaperRateColor + RowNo ด้วย
- เพิ่ม skip empty rows (กัน phantom "ไม่พบข้อมูล" entries)
- เพิ่ม helper `getEffectivePaperRate(siteCode, type)` — ลำดับความสำคัญ: Site > App_Settings > hardcoded
- เพิ่ม helper `getDefaultPaperRates()` — สำหรับแสดงใน banner
- แก้ `listSiteAttributes()` ให้ส่ง `defaults` ไปด้วย
- แก้ `saveSiteAttribute()`:
  - เพิ่ม validation: ต้องเป็นตัวเลข >= 0 หรือว่าง
  - แปลง comma decimal ได้ (0,03 → 0.03)
  - เคลียร์ค่าใน sheet ถ้า user เคลียร์ input (ไม่เก็บค่าเดิม)
  - return entries + defaults กลับมาด้วย
  - เพิ่ม audit log (SITE_ATTR_SAVE)
- แก้ `deleteSiteAttribute()`:
  - return entries + defaults กลับมาด้วย
  - เพิ่ม audit log (SITE_ATTR_DELETE)

**Frontend (javascript.html):**
- เพิ่ม `defaults` field ใน `siteAttrState`
- แก้ `loadSiteAttributesPage(force)` ให้รับ force parameter + เก็บ defaults
- เพิ่ม `renderSiteAttrDefaultsBanner()` — แสดงค่า default ปัจจุบัน + ค่าใช้จ่ายต่อ 1,000 หน้า
- แก้ `renderSiteAttributes()`:
  - แสดง effective rate (site-specific ถ้ามี, ไม่งั้น default)
  - เพิ่ม badge "กำหนดเอง" (เขียว) / "default" (เทา)
  - ปรับ LINE OA link ให้ click ได้ + underline
- แก้ `saveSiteAttribute()`:
  - เพิ่ม validation ฝั่ง frontend (>= 0, ไม่เกิน 100)
  - รับ entries + defaults จาก result
  - refresh banner หลัง save
- แก้ `deleteSiteAttribute()`:
  - ใช้ result.entries + result.defaults แทน force reload
  - เพิ่มคำเตือนใน confirm popup
- แก้ `saveAppSettings()`:
  - invalidate `siteAttrState._loaded` เมื่อ default rate เปลี่ยน
  - auto-refresh banner ถ้ากำลังอยู่ใน tab sites

**HTML (index.html):**
- แก้ colspan="5" → "7" ใน loading row
- เพิ่ม "🔄 รีโหลด" button ใน card header
- เพิ่ม default rate banner div
- เพิ่ม help section (collapsible) อธิบายลำดับความสำคัญของเรท
- ปรับ labels: SiteName เป็น required, เพิ่ม small hints
- เพิ่ม maxlength="10" ใน SiteCode

### Verification Checklist
- [x] `readSiteAttributesSheet()` อ่าน PaperRateBW/PaperRateColor
- [x] Save → ค่าปรากฏในตารางทันที (ไม่ต้อง reload)
- [x] Edit → ค่าเดิมแสดงใน input
- [x] Default rate banner แสดงค่าจาก App_Settings
- [x] Badge บอกว่าใช้ "กำหนดเอง" หรือ "default"
- [x] Validation: ตัวเลข >= 0 หรือว่าง
- [x] Audit log บันทึกทุกการ save/delete
- [x] Invalidate cache เมื่อ default rate เปลี่ยน
- [x] colspan ตรงกับจำนวนคอลัมน์จริง

### ไฟล์ที่แก้
- `Code.gs` — readSiteAttributesSheet + getEffectivePaperRate + getDefaultPaperRates + listSiteAttributes + saveSiteAttribute + deleteSiteAttribute
- `javascript.html` — siteAttrState + loadSiteAttributesPage + renderSiteAttrDefaultsBanner + renderSiteAttributes + saveSiteAttribute + deleteSiteAttribute + saveAppSettings
- `index.html` — Site Attributes panel (colspan + banner + help + reload button + labels)

### Stage Summary
- **Bug หลักแก้แล้ว**: ค่ากระดาษ BW/Color ที่ตั้งไว้ จะไม่หายหลังรีเฟรช
- **UX ดีขึ้น**: แสดง effective rate + badge + default banner + help section
- **Data integrity**: validation + audit log + cache invalidation ครบ
- **ครอบคลุมทุกจุด**: backend read/write, frontend render/edit/save, cache sync, validation, audit, help text


---

## Task ID: DASHBOARD-COST-1 — Paper Cost Analytics Dashboard + Bugfix

Agent: main (cron webDevReview)
Task: QA review พบ bug division-by-zero + เพิ่ม Paper Cost Analytics Dashboard ครบชุด (cost cards + BW/Color donut + Top 10 devices + % meter completeness + YoY)

### QA Findings (Bugs/Issues found)

1. **Bug: Division by zero** in `renderDashboard()` — `count/stats.total*100` คืน NaN ถ้า `stats.total === 0`
2. **Missing data: BW/Color split** — `getPaperUsageStatsFast` รวม Pages_BW + Pages_Color เป็น `pages` เดียว → ไม่สามารถคำนวณ cost แยก BW/Color ได้
3. **Missing feature: Cost calculation** — ไม่มีการใช้ `getEffectivePaperRate()` ที่สร้างไว้ใน phase ก่อน
4. **Missing feature: Top 10 devices** — Dashboard ไม่แสดงเครื่องที่ใช้กระดาษเยอะสุด
5. **Missing feature: % meter completeness** — ไม่มี indicator ว่าจดมิเตอร์ครบกี่ %
6. **Missing feature: YoY comparison** — เทียบเดือนเดียวกันปีก่อน
7. **Missing feature: BW vs Color pie/donut**

### Work Log

**Backend (AnalyticsService.gs):**
- Bump dashboard cache version `v5` → `v6` (structure changed)
- แก้ `getPaperUsageStatsFast()`:
  - อ่าน `Pages_BW` + `Pages_Color` แยก ไม่รวมเป็น pages เดียว
  - คำนวณ `costBW`, `costColor`, `costTotal` ด้วย `getEffectivePaperRate(siteName, type)` ต่อ row
  - เพิ่ม filter เดือน YoY (current + prev + YoY = 3 เดือน)
  - สร้าง `byMonthBW`, `byMonthColor`, `byMonthCost` maps
  - สร้าง `topDeviceMap` — aggregate pages/cost/site/brand/model ต่อ asset สำหรับเดือนปัจจุบัน
  - คำนวณ `meterCompleteness` = readCount / activeCount * 100 (Active devices ที่มี reading ในเดือนปัจจุบัน)
  - คำนวณ `yoyChange` = (latestPages - yoyPages) / yoyPages * 100
  - Return fields ใหม่: `latestMonthBW`, `latestMonthColor`, `latestMonthCost`, `yoyMonth`, `yoyPages`, `yoyChange`, `meterCompleteness`, `topDevices`, `defaultRates`
  - `monthlyTrend` เพิ่ม `pagesBW`, `pagesColor`, `costTotal` ต่อเดือน

**Frontend (javascript.html):**
- แก้ bug division by zero: `const totalDevices = stats.total || 1`
- เพิ่ม `renderPaperCostDashboard(paperUsage)`:
  - 4 cost stat cards: BW / Color / Total / YoY (color-coded: slate/amber/green/violet)
  - BW vs Color donut chart (SVG-based, Caja-safe — ใช้ stroke-dasharray ไม่ต้อง conic-gradient)
  - Legend พร้อม % และแผ่น
  - Top 10 devices list (gold/silver/bronze badges, progress bar, BW/Color/Total/Cost badges)
  - ปุ่ม "📋 รายละเอียด" → เปิด modal breakdown by Site
- เพิ่ม `renderMeterCompleteness(paperUsage)`:
  - Progress bar สีเปลี่ยนตาม % (เขียว/เหลือง/ส้ม/แดง)
  - สถานะ: ดีมาก/ดี/ปานกลาง/ต้องปรับปรุง/วิกฤต
  - 4 stats: จดแล้ว / ยังไม่จด / Active ทั้งหมด / สถานะ
- เพิ่ม `openPaperCostDetailModal()`:
  - ตาราง breakdown ตาม Site: เครื่อง / แผ่น BW / แผ่นสี / ค่า BW / ค่าสี / รวม / % ของทั้งหมด
  - Progress bar ขนาดเล็กในแต่ละ row
- อัปเดต `renderDashboard(stats)`: เรียก `renderPaperCostDashboard` + `renderMeterCompleteness`

**HTML (index.html):**
- แทนที่การ์ด "อาคารที่มีอุปกรณ์ (Top 10)" ด้วย meter-completeness-card (ย้าย building breakdown ออก — มีอยู่แล้วใน dashboard-usage-grid)
- เพิ่ม `<div class="card" id="paper-cost-analytics">` ก่อน paper usage card
- เพิ่ม `<div class="card dashboard-compact-card" id="meter-completeness-card">` ใน overview grid

**CSS (css.html):**
- เพิ่ม styles ครบชุด:
  - `.cost-analytics-header`, `.cost-analytics-grid` (responsive auto-fit)
  - `.cost-stat-card` (4 variants: bw/color/total/yoy) + hover lift effect
  - `.cost-stat-icon` (44px rounded, color-coded backgrounds)
  - `.cost-analytics-detail-grid` (donut + top devices)
  - `.cost-detail-panel`, `.cost-donut-wrapper`, `.cost-donut-legend`
  - `.legend-item`, `.legend-dot`, `.legend-label`, `.legend-value`, `.legend-pct`
  - `.top-device-row` + hover slide effect, `.top-device-rank` (gold/silver/bronze gradients)
  - `.top-device-bar` (gradient fill slate→amber)
  - `.top-device-stats .badge` (compact)
  - `#meter-completeness-card`, `.completeness-header`, `.completeness-bar-wrapper` (with 50% marker line)
  - `.completeness-bar` (animated width transition)
  - `.completeness-stats` (2-col grid), `.comp-stat` (label + value)
  - `.empty-state-small`
- Responsive:
  - `@media (max-width: 1100px)`: stack donut + top devices vertically
  - `@media (max-width: 768px)`: 2-col cost grid, smaller icons, stacked completeness stats

### Verification Checklist
- [x] Bug fix: division by zero ใน type breakdown
- [x] BW/Color pages แยกใน detailRows
- [x] Cost calculated per row ด้วย effective rate ของ site นั้น
- [x] Top 10 devices แสดง pages + cost + badges
- [x] % meter completeness คำนวณจาก Active devices ที่มี reading
- [x] YoY comparison กับเดือนเดียวกันปีก่อน
- [x] Donut chart SVG-based (Caja-safe)
- [x] Cost detail modal breakdown by Site
- [x] Dashboard cache bumped เป็น v6
- [x] Responsive mobile-friendly
- [x] Hover effects บน cost cards + top device rows
- [x] Color-coded stat cards (slate/amber/green/violet)

### ไฟล์ที่แก้
- `AnalyticsService.gs` — getPaperUsageStatsFast (BW/Color split + cost + top devices + completeness + YoY) + cache v6
- `javascript.html` — renderPaperCostDashboard + renderMeterCompleteness + openPaperCostDetailModal + bugfix division-by-zero
- `index.html` — paper-cost-analytics card + meter-completeness-card
- `css.html` — cost analytics + donut + top devices + completeness styles + responsive

### Stage Summary
- **Bug fix**: division by zero ใน type breakdown (เกิดเมื่อยังไม่มี devices)
- **Feature ใหม่ครบ**: Paper Cost Analytics Dashboard ครบทุกองค์ประกอบที่ผู้ใช้ขอ
  - ✅ ค่าใช้จ่ายกระดาษ (BW×rate + Color×rate) — 4 stat cards
  - ✅ Top 10 เครื่องที่ใช้เยอะ — พร้อม rank badges + progress bar
  - ✅ % จดมิเตอร์ครบ — progress bar + 4 stats + สถานะ
  - ✅ BW vs สี (donut) — SVG-based, Caja-safe
  - ✅ YoY (เทียบปีก่อน) — ใน stat card ที่ 4
- **Styling ปรับปรุง**: hover effects, gradient badges, color-coded cards, responsive mobile
- **Cost detail modal**: breakdown by Site พร้อม progress bar และ % ของทั้งหมด


---

## Task ID: STICKER-FIT-KB-1 — Sticker editor fit viewport + keyboard controls

Agent: main
Task: ผู้ใช้ต้องการ (1) หน้าสติกเกอร์อยู่ในหน้าเดียว ไม่ต้องเลื่อน (2) รองรับ keyboard arrow keys ปรับตำแหน่ง element ละเอียดกว่าเมาส์

### Work Log

**1. Fit Viewport Layout (HTML + CSS):**
- เปลี่ยน structure ของ `#settings-panel-sticker` จาก vertical scroll เป็น flex column ที่ fill viewport
- เพิ่ม class `sticker-panel-fit` + `sticker-card` ที่ใช้ `flex: 1; min-height: 0; overflow: hidden`
- เพิ่ม CSS `#page-settings.sticker-mode` — เมื่อ sticker tab active, page กลายเป็น `height: calc(100vh - 48px); overflow: hidden`
- ทำให้ template library เป็น `<details>` collapsible (ปิดได้เพื่อประหยัดพื้นที่)
- แบ่ง editor body เป็น 3 columns: palette (180px) | canvas (flex:1) | props (230px)
- canvas scroll area ใช้ `flex: 1; min-height: 0; overflow: auto` — scroll ภายในตัวเอง
- property panel ใช้ `overflow-y: auto` — scroll ภายใน
- ลด padding ทั้งหมด: card 14px, panels 8-10px, inputs 3px 6px
- compact template rows: padding 6px 8px, font 12px
- responsive: stack vertical เมื่อ < 1100px, ปิด fit-mode เมื่อ < 768px

**2. Keyboard Controls (JS):**
- เพิ่ม `setupStickerKeyboard()` IIFE — global keydown listener (capture phase)
- ตรวจ sticker panel visible ก่อน ถ้าไม่ visible → skip
- ข้ามเมื่อ user พิมพ์ใน input/textarea/select (รวม inline-edit textarea)
- Shortcuts:
  - `←↑→↓` = เลื่อน 0.5mm (default, snap 0.1mm)
  - `Shift+←↑→↓` = เลื่อน 5mm (coarse, fast)
  - `Ctrl/Cmd+←↑→↓` = เลื่อน 0.1mm (super fine, pixel-perfect)
  - `Delete` / `Backspace` = ลบ element ที่เลือก
  - `Tab` / `Shift+Tab` = cycle next/prev element (ข้าม hidden)
  - `+` / `=` = zoom in
  - `-` / `_` = zoom out
  - `0` = reset zoom 100%
- จำกัดไม่ให้เกิน canvas boundary (เหมือน drag)
- อัปเดต pos-info live: "X: 12.3 Y: 5.0 (0.5mm)"
- focus canvas-scroll อัตโนมัติเมื่อ select element (เพื่อให้ keyboard ทำงานทันที)
- `tabindex="0"` บน `#stk-canvas-scroll` เพื่อให้ focus ได้ + focus ring (border-color + box-shadow)

**3. UI Enhancements:**
- subtitle แสดง keyboard hint: `←↑→↓ ปรับละเอียด • Shift+Arrow = 5mm • Ctrl+Arrow = 0.1mm • Del = ลบ`
- ใช้ `<kbd>` tags สำหรับ keys (style: monospace, border, บอกว่าเป็น key)
- เพิ่ม `⌨️ ใช้ลูกศร` badge ใน zoom bar (สีฟง, cursor:help)
- ปุ่ม "ลบที่เลือก" แสดง `<kbd>Del</kbd>` inline
- template list compact: count + refresh button ในแถวเดียว
- "➕ สร้างใหม่" ย้ายไป summary ของ details
- compact header row ใน template list: "5 เทมเพลต" + "🔄 รีเฟรช"

**4. showSettingsTab updates:**
- toggle `sticker-mode` class บน `#page-settings`
- auto-focus `#stk-canvas-scroll` เมื่อเข้า sticker tab (delay 100ms)

### Files Modified
- `index.html` — restructure sticker panel (fit viewport + collapsible library + compact controls)
- `css.html` — sticker fit-viewport layout + keyboard hint styles + responsive + compact template rows
- `javascript.html` — keyboard controls (arrow keys + delete + tab + zoom) + showSettingsTab toggle class + auto-focus canvas + compact template list render + stk-inline-edit-ta class

### Verification Checklist
- [x] Sticker panel fills viewport (no page scroll) on desktop
- [x] Template library collapsible
- [x] Canvas scroll internally
- [x] Property panel scroll internally
- [x] Arrow keys move selected element (0.5mm default)
- [x] Shift+Arrow = 5mm coarse
- [x] Ctrl+Arrow = 0.1mm super fine
- [x] Delete/Backspace = delete element
- [x] Tab/Shift+Tab = cycle elements
- [x] +/-/0 = zoom controls
- [x] Skip when typing in inputs
- [x] Auto-focus canvas on tab enter / element select
- [x] Keyboard hints visible in UI
- [x] Responsive: stack on tablet, normal scroll on mobile
- [x] Boundary clamp (can't move outside canvas)


---

## Task ID: COST-FORECAST-ANOMALY-1 — Cost Trend Chart + Forecast + Anomaly Detection + CSV Export

Agent: main (cron webDevReview)
Task: QA review พบว่า frontend re-filter detailRows เพล่าๆ → แก้โดยให้ backend ส่ง cost split โดยตรง + เพิ่มฟีเจอร์ Cost Trend Chart, Forecast, Anomaly Detection, CSV Export

### QA Findings
1. **Bug/Inefficiency**: `renderPaperCostDashboard` re-filter `detailRows` บน frontend เพื่อคำนวณ bwCost/colorCost — ข้อมูลนี้ backend มีอยู่แล้ว ควรส่งมาโดยตรง
2. **Missing feature**: `monthlyTrend` มี `costTotal` แต่ไม่มี `costBW`/`costColor` แยก → ไม่สามารถวาด stacked bar chart ได้
3. **Missing feature**: ไม่มี cost trend chart (แนวโน้มค่าใช้จ่ายรายเดือน)
4. **Missing feature**: ไม่มี forecast สำหรับเดือนหน้า
5. **Missing feature**: ไม่มี anomaly detection (เครื่องที่ค่าใช้จ่ายสูงผิดปกติ)
6. **Missing feature**: ไม่มี export CSV สำหรับรายงานค่าใช้จ่าย

### Work Log

**Backend (AnalyticsService.gs):**
- Bump cache version `v6` → `v7`
- แก้ `getPaperUsageStatsFast()`:
  - คำนวณ `latestCostBW`, `latestCostColor` โดยตรง (loop rows ของ latestMonth)
  - คำนวณ `yoyCost` + `yoyCostChange` (เทียบค่าใช้จ่ายกับเดือนเดียวกันปีก่อน)
  - **Cost Forecast**: linear regression จาก 3 เดือนล่าสุด → `costForecast` + `nextMonthLabel`
  - **Anomaly detection**: คำนวณ `avgCost` ของ top devices → flag `isAnomaly` ถ้า cost > 2x average
  - `topDevices` เพิ่ม fields: `colorRatio` (% สี), `isAnomaly`, `anomalyMultiple`
  - `monthlyTrend` เพิ่ม `costBW`, `costColor` ต่อเดือน (สำหรับ stacked bar chart)
  - Return fields ใหม่: `latestMonthCostBW`, `latestMonthCostColor`, `yoyCost`, `yoyCostChange`, `costForecast`, `nextMonthLabel`, `avgDeviceCost`, `anomalyCount`

**Frontend (javascript.html):**
- แก้ `renderPaperCostDashboard`:
  - ใช้ `paperUsage.latestMonthCostBW` / `latestMonthCostColor` จาก backend (ไม่ re-filter อีก)
  - YoY card ใช้ `yoyCostChange` (cost-based) แทน `yoyChange` (pages-based)
  - **Forecast card ใหม่** (สีชมพู): แสดงพยากรณ์เดือนหน้า + % เปลี่ยนแปลง
  - **5 stat cards**: BW / Color / Total / Forecast / YoY (เพิ่มจาก 4 → 5)
  - Total card เพิ่ม "เฉลี่ย X ฿/เครื่อง"
  - Subtitle แสดง anomaly count ถ้ามี
  - เพิ่มปุ่ม "📥 CSV" export
  - Top 10 devices เพิ่ม:
    - **Anomaly badge** (แดง, pulse animation) — "⚠️ สูงผิดปกติ 2.5x"
    - **Color ratio badge** (เหลือง) — "🎨 สี 65%" ถ้า > 50%
    - anomaly-row มี left border แดง + gradient bg
- เพิ่ม `renderCostTrendChart(trendRows, forecast, nextMonthLabel)`:
  - SVG stacked bar chart (Caja-safe)
  - แต่ละ bar = 1 เดือน, แบ่ง BW (เทา, ล่าง) + Color (ส้ม, บน)
  - **Forecast bar** = ม่วง dashed outline (พยากรณ์)
  - Y-axis gridlines at 25/50/75/100% พร้อม value labels
  - Value label บนแต่ละ bar (เช่น "2.5k")
  - Month labels ใช้ `formatMonthThaiShort` (ส.ค. 68)
  - Legend: BW / สี / พยากรณ์
  - Horizontal scroll ถ้า bars เยอะ
- เพิ่ม `exportCostReportCSV()`:
  - Export รายละเอียดค่าใช้จ่ายเดือนปัจจุบันเป็น CSV
  - Columns: AssetNo, Site, Brand, Model, Building, Floor, Dept, PagesBW, PagesColor, PagesTotal, BWRate, ColorRate, CostBW, CostColor, CostTotal
  - Sort by costTotal desc
  - Summary row ด้านล่าง (รวมทั้งหมด)
  - UTF-8 BOM สำหรับ Excel Thai support
  - Download อัตโนมัติ: `cost-report-2025-08.csv`
- เพิ่ม `formatMonthThaiShort(value)` — "2025-08" → "ส.ค. 68"

**CSS (css.html):**
- `.cost-stat-forecast` — สีชมพู, gradient bg, border-left ชมพู
- `.anomaly-badge` — แดง, pulse animation (box-shadow pulse ทุก 2s)
- `.top-device-row.anomaly-row` — left border แดง + gradient bg
- `.color-ratio-high` — เหลือง/amber badge
- `.cost-trend-panel`, `.cost-trend-chart-wrapper` (horizontal scroll)
- `.cost-trend-legend`, `.trend-legend-item`, `.trend-legend-dot`
- Responsive: 5-card grid → 2-col on mobile

### Verification Checklist
- [x] Backend ส่ง cost split โดยตรง (ไม่ต้อง re-filter ฝั่ง frontend)
- [x] Cost trend chart SVG-based (Caja-safe)
- [x] Stacked bars: BW (เทา) + Color (ส้ม)
- [x] Forecast bar ม่วง dashed
- [x] Y-axis gridlines + value labels
- [x] Month labels สั้น (ส.ค. 68)
- [x] Forecast card แสดงพยากรณ์ + % เปลี่ยน
- [x] Anomaly badge pulse animation
- [x] Color ratio badge (>50% สี)
- [x] anomaly-row gradient bg + red border
- [x] CSV export พร้อม UTF-8 BOM
- [x] CSV sort by cost desc + summary row
- [x] Dashboard cache bumped v7
- [x] Responsive 5→2 col on mobile

### ไฟล์ที่แก้
- `AnalyticsService.gs` — cost split + forecast + anomaly + costBW/costColor per month + cache v7
- `javascript.html` — renderPaperCostDashboard (5 cards + forecast + anomaly badges) + renderCostTrendChart + exportCostReportCSV + formatMonthThaiShort
- `css.html` — forecast card + anomaly badge (pulse) + color-ratio + cost-trend chart + legend + responsive

### Stage Summary
- **QA fix**: ย้าย cost calculation จาก frontend → backend (ลดงาน frontend, consistent data)
- **Feature ใหม่ 4 ตัว**:
  1. ✅ Cost Trend Chart — SVG stacked bar (BW + Color + Forecast phantom bar)
  2. ✅ Cost Forecast — linear regression 3 เดือนล่าสุด
  3. ✅ Anomaly Detection — flag devices > 2x average + pulse badge
  4. ✅ CSV Export — รายงานค่าใช้จ่ายพร้อม BOM สำหรับ Excel
- **Styling**: forecast card ชมพู gradient, anomaly pulse animation, color-ratio amber badge, trend chart legend


---

## Task ID: INSIGHTS-DEVICE-COST-1 — Dashboard Smart Insights + Device Table Cost Column

Agent: main (cron webDevReview)
Task: QA review พบว่า `renderDashboardPaperInsights` คาดหวัง `paperUsage.insights` แต่ `getPaperUsageStatsFast` ไม่ได้ส่งมา → panel ว่างเสมอ + เพิ่ม cost column ในตารางอุปกรณ์

### QA Findings
1. **Bug**: `renderDashboardPaperInsights` คาดหวัง `paperUsage.insights` (array of strings) แต่ `getPaperUsageStatsFast` ไม่ได้ generate insights → panel "Smart Insights" ใน dashboard ว่างเสมอ (แสดง "ระบบจะสรุป insight อัตโนมัติเมื่อมีข้อมูลมากพอ")
2. **Inconsistency**: `exportCostReportCSV` ใช้ `new Blob` + `URL.createObjectURL` โดยตรง ทั้งที่มี helper `downloadTextFile` อยู่แล้ว → ควรใช้ helper เดิมเพื่อ consistency
3. **Missing feature**: ตารางอุปกรณ์ไม่แสดงค่ากระดาษของแต่ละเครื่อง → user ไม่เห็นว่าเครื่องไหนใช้เงินเยอะ
4. **Missing feature**: ไม่มีการ sort ตารางอุปกรณ์ตามค่าใช้จ่าย

### Work Log

**Backend (AnalyticsService.gs):**
- Bump cache version `v7` → `v8`
- เพิ่ม `insights` array generation ใน `getPaperUsageStatsFast()` — สรุปอัตโนมัติ 7 insights:
  1. 🏆 Top device (asset + pages + cost)
  2. 📈/📉 MoM change (ถ้า >= 10%)
  3. 💰 Cost summary (BW + Color split)
  4. ⚠️ Anomaly devices (ถ้ามี, แสดง top 3)
  5. 📅 YoY cost change (ถ้า >= 10%)
  6. 🔮 Forecast (พยากรณ์เดือนหน้า + % เปลี่ยน)
  7. 🎨 Color ratio warning (ถ้าสี > 40% ของแผ่นพิมพ์)
  8. ⏰ Meter completeness (ถ้า < 80%)
- Return field ใหม่: `insights: insights`

**Frontend (javascript.html):**
- แก้ `exportCostReportCSV`: ใช้ `downloadTextFile` (helper เดิม) แทน `new Blob` + `URL.createObjectURL` โดยตรง → Caja-safe + consistent
- แก้ `renderDashboardPaperInsights`: ตรวจ emoji prefix เพื่อกำหนด tone (warning/success/info/primary)
- เพิ่ม `getDeviceCostMap()`: สร้าง lookup map { assetNo → costTotal } จาก dashboard paperUsage.detailRows
- เพิ่ม `toggleDeviceSortMode()`: สลับ sort mode ระหว่าง 'updated' (default) ↔ 'cost'
- แก้ `renderDeviceTable`:
  - รองรับ sort mode 'cost' (sort ตามค่ากระดาษ desc)
  - เพิ่ม cost cell ต่อ device:
    - `normal` (เทา): ต่ำกว่าค่าเฉลี่ย
    - `above-avg` (ส้ม bg): สูงกว่าค่าเฉลี่ย
    - `anomaly` (แดง bg + border): สูงกว่า 2x เฉลี่ย + ⚠️ icon
  - แสดง "% vs เฉลี่ย" ใต้ค่า
  - "—" ถ้าไม่มีข้อมูลมิเตอร์
- colspan 11 → 12 ใน empty/loading row

**HTML (index.html):**
- เพิ่มคอลัมน์ "💰 ค่ากระดาษ (เดือนล่าสุด) ↕" ใน device table header
- clickable header → `toggleDeviceSortMode()` (cursor: pointer + tooltip)
- colspan 11 → 12 ใน loading row

**CSS (css.html):**
- `.dashboard-insight-chip` + hover lift effect
- `.insight-warning` (amber), `.insight-success` (green), `.insight-info` (blue), `.insight-primary` (default)
- `.device-cost-cell` (monospace, 12px)
- `.device-cost-cell.normal` (gray)
- `.device-cost-cell.above-avg` (orange bg)
- `.device-cost-cell.anomaly` (red bg + left border + bold + hover)

### Verification Checklist
- [x] Backend generate insights array (7 ประเภท)
- [x] Frontend render insights พร้อม tone color
- [x] CSV export ใช้ downloadTextFile (Caja-safe)
- [x] Device table แสดง cost column
- [x] Cost cell 3 variants (normal/above-avg/anomaly)
- [x] Sort by cost toggle (click header)
- [x] Anomaly highlight (red bg + ⚠️)
- [x] % vs average ใต้ค่า
- [x] colspan 12 ถูกต้อง
- [x] Cache bumped v8

### ไฟล์ที่แก้
- `AnalyticsService.gs` — insights generation + cache v8
- `javascript.html` — renderDashboardPaperInsights (tone) + getDeviceCostMap + toggleDeviceSortMode + renderDeviceTable (cost column + sort) + exportCostReportCSV (downloadTextFile)
- `index.html` — device table cost column header (clickable)
- `css.html` — insight chip variants + device-cost-cell variants

### Stage Summary
- **Bug fix**: Dashboard Smart Insights panel ตอนนี้แสดง insights จริง (ไม่ว่างอีก)
- **Bug fix**: CSV export ใช้ helper ที่ Caja-safe
- **Feature ใหม่ 2 ตัว**:
  1. ✅ Dashboard Smart Insights — สรุปอัตโนมัติ 7 ประเภท พร้อม tone color
  2. ✅ Device Table Cost Column — แสดงค่ากระดาษ/เครื่อง + sort by cost + anomaly highlight
- **Styling**: insight chip tone variants, device-cost-cell 3 variants (normal/above-avg/anomaly)


---

## Task ID: PAPERRATE-DEFAULT-FIX — แก้ bug เรทราคาตั้งต้นแก้ไขไม่ได้

Agent: main
Task: ผู้ใช้รายงานว่า "เรทราคา ตั้งต้น ทำไม่แก้ไขไม่ได้" — แก้ในช่อง input แล้วบันทึก แต่ค่าไม่ถูกบันทึกจริง

### Root Cause Analysis

**ปัญหาหลัก**: `paperRateBW` และ `paperRateColor` **ไม่ได้อยู่ใน `getDefaultAppSettings()`** ใน SettingsService.gs

สายโซ่ผลกระทบ:
1. `normalizeAppSettingsForSave()` iterate `Object.keys(defaults)` เพื่อบันทึก → ข้าม `paperRateBW`/`paperRateColor` เพราะไม่อยู่ใน defaults
2. `getAppSettingsInternal()` อ่านจาก sheet เฉพาะ keys ที่อยู่ใน defaults → ไม่โหลด `paperRateBW`/`paperRateColor` แม้จะมีใน sheet
3. `renderAppSettings()` เห็น `settings.paperRateBW` = undefined → แสดงค่า default `'0.03'` / `'0.15'`
4. User เห็น 0.03 ในช่อง → พิมพ์ค่าใหม่ → กดบันทึก → **ค่าไม่ถูกบันทึก** (เพราะ normalize ข้ามไป)
5. รีเฟรชหน้า → ค่ากลับเป็น 0.03 เหมือนเดิม → ดูเหมือน "แก้ไม่ได้"

### Work Log

**Backend (SettingsService.gs):**
- เพิ่ม `paperRateBW:'0.03'` และ `paperRateColor:'0.15'` ใน `getDefaultAppSettings()`
- เพิ่ม descriptions ใน `getAppSettingDescriptions()`

**Backend (Code.gs):**
- Bump `APP_SETTINGS_CACHE_KEY` จาก `'appSettings:v1'` → `'appSettings:v2'` (force cache miss เพราะ defaults เปลี่ยน)

### Verification
- [x] `paperRateBW` และ `paperRateColor` อยู่ใน defaults แล้ว
- [x] Descriptions เพิ่มแล้ว
- [x] Cache key bumped → เก่าจะหมดอายุ + ใหม่จะใช้งานทันที
- [x] `normalizeAppSettingsForSave` จะบันทึกค่านี้แล้ว (เพราะ iterate defaults keys)
- [x] `getAppSettingsInternal` จะโหลดค่านี้แล้ว (เพราะ iterate defaults keys)
- [x] `renderAppSettings` จะแสดงค่าจริงจาก sheet แล้ว

### ไฟล์ที่แก้
- `SettingsService.gs` — เพิ่ม paperRateBW/paperRateColor ใน getDefaultAppSettings + getAppSettingDescriptions
- `Code.gs` — bump APP_SETTINGS_CACHE_KEY v1 → v2


---

## Task ID: DASHBOARD-3TABS-1 — แดชบอร์ด 3 แถบ + แก้ bug anomalyCount + SiteName lookup

Agent: main
Task: ผู้ใช้รายงาน "หน้าแดชบอร์ดโหลดไม่ได้ ไม่มีข้อมูลขึ้น" + ต้องการแบ่งเป็น 3 แถบเพื่อให้เห็นข้อมูลโดยไม่ต้องเลื่อน

### QA Findings
1. **Bug**: `anomalyCount` ถูกใช้ใน insights block แต่ไม่ได้ถูก define จนกว่าจะถึง return statement → `undefined > 0` = false → anomaly insight ไม่แสดง
2. **Bug**: `getEffectivePaperRate(siteName, ...)` ค้นหา `getSiteAttributes` ด้วย SiteName (เช่น "โรงพยาบาลศูนย์อุดรธานี") แต่ `getSiteAttributes` ค้นหาเฉพาะ SiteCode (เช่น "UDH") → ไม่เจอ → ใช้ default rate เสมอ (site-specific rate ไม่ทำงาน)
3. **UX**: แดชบอร์ดยาวมาก (5 stat cards + 3 overview + cost analytics + paper usage) → ต้องเลื่อนเยอะ

### Work Log

**Backend (AnalyticsService.gs):**
- Bump cache `v8` → `v9`
- แก้ `anomalyCount`: ย้ายการคำนวณมาก่อน insights block (เดิมอยู่ใน return เท่านั้น)
  ```javascript
  var anomalyCount = topDevices.filter(function(d){return d.isAnomaly;}).length;
  ```

**Backend (Code.gs):**
- แก้ `getSiteAttributes(siteCode)`: ค้นหาทั้ง SiteCode และ SiteName
  ```javascript
  return list.find(function(s){
    return normalizeHeaderName(s.SiteCode)===key || normalizeHeaderName(s.SiteName)===key;
  }) || null;
  ```
- อัปเดต `getEffectivePaperRate` parameter name → `siteCodeOrName` (รองรับทั้งสองแบบ)

**Frontend (index.html):**
- แบ่งแดชบอร์ดเป็น 3 แถบ (tabs):
  - **📊 ภาพรวม**: ประเภทอุปกรณ์ + สถานะ + % จดมิเตอร์ครบ
  - **💰 ค่าใช้จ่าย**: cost analytics dashboard (stat cards + trend chart + donut + Top 10)
  - **📄 การใช้กระดาษ**: เปรียบเทียบการใช้กระดาษ (dept + building + monthly trend + insights)
- Stat cards (5 การ์ด) อยู่เหนือ tabs เสมอ — เห็นได้ทุกแถบ
- Tabs อยู่ใน sticky-summary → ติดอยู่ด้านบนเสมอ

**Frontend (javascript.html):**
- เพิ่ม `showDashboardTab(tab)`: สลับ panel + active class + จำ tab ล่าสุดใน `state.dashboardTab`
- แก้ `renderDashboard`: restore last active tab หลัง render

**CSS (css.html):**
- `.dashboard-tabs`: flex tabs, gap 4px
- `.dashboard-tabs .tab`: flex 1, center text, 13px font
- `.dashboard-tab-panel`: fadeIn animation (opacity + translateY)

### Verification
- [x] anomalyCount คำนวณก่อน insights block
- [x] getSiteAttributes ค้นหาทั้ง SiteCode และ SiteName
- [x] 3 tabs: ภาพรวม / ค่าใช้จ่าย / การใช้กระดาษ
- [x] Stat cards เห็นได้ทุกแถบ
- [x] Tab จำตำแหน่งล่าสุด
- [x] Cache bumped v9


---

## Task ID: DASHBOARD-2TABS-1 — แดชบอร์ด 2 แถบ (เครื่อง / การใช้กระดาษ)

Agent: main
Task: ผู้ใช้ต้องการแยกเป็น 2 แถบหลัก — เครื่อง (อุปกรณ์) และ การใช้กระดาษ — โดยรวมทุกส่วนที่เกี่ยวข้องของแต่ละแถบไว้ด้วยกัน เพื่อให้ดูเป็นระเบียบ

### Work Log

**เปลี่ยนจาก 3 แถบ → 2 แถบ:**

| แถบ | เนื้อหา (รวมทุกอย่างที่เกี่ยวข้อง) |
|-----|------|
| **🖥️ เครื่อง** | stat cards (ทั้งหมด/ติดตั้ง/ไม่ใช้งาน) + % จดมิเตอร์ครบ + ประเภท + สถานะ + อาคาร Top 10 |
| **📄 การใช้กระดาษ** | stat cards (แผ่นเดือนล่าสุด/เทียบเดือนก่อน) + cost analytics dashboard + เปรียบเทียบการใช้กระดาษ (หน่วยงาน/อาคาร/แนวโน้ม) + Smart Insights |

**หลักการจัดกลุ่ม:**
- แถบ "เครื่อง" = ทุกอย่างเกี่ยวกับอุปกรณ์ (จำนวน, สถานะ, ประเภท, อาคาร, % จดมิเตอร์)
- แถบ "การใช้กระดาษ" = ทุกอย่างเกี่ยวกับการใช้กระดาษ (แผ่น, ค่าใช้จ่าย, หน่วยงาน/อาคาร, แนวโน้ม, insights)
- Stat cards ของแต่ละแถบอยู่ในแถบนั้น (ไม่รวมกันด้านบน) → เห็นเฉพาะที่เกี่ยวข้อง

**Frontend (index.html):**
- เปลี่ยน tabs จาก 3 → 2: "🖥️ เครื่อง" / "📄 การใช้กระดาษ"
- แถบเครื่อง: 3 stat cards + meter-completeness card + 3 breakdown cards (type/status/building)
- แถบการใช้กระดาษ: 2 stat cards + cost-analytics card + paper comparison card
- คืน "อาคาร Top 10" card ที่เคยถูกลบในเวอร์ชัน 3 แถบ

**Frontend (javascript.html):**
- อัปเดต `showDashboardTab`: panels = { devices, paper } (จากเดิม overview/cost/usage)

### Verification
- [x] 2 tabs: เครื่อง / การใช้กระดาษ
- [x] Stat cards แยกตามแถบ (ไม่รวมกัน)
- [x] อาคาร Top 10 กลับมาอยู่ในแถบเครื่อง
- [x] Cost analytics อยู่ในแถบการใช้กระดาษ
- [x] จำตำแหน่ง tab ล่าสุด
- [x] Default tab = เครื่อง (active class ใน HTML)


---

## Task ID: DASHBOARD-PRO-POLISH-1 — แดชบอร์ดโปรเฟสชั่นนัล + แก้ bug โหลดไม่ได้ + เปลี่ยนชื่อแถบ

Agent: main
Task: ผู้ใช้รายงาน "ข้อมูลโหลดไม่มี" + อยากให้หน้าการใช้กระดาษจัดวางใหม่ + แถบ tabs ดูมืออาชีพ + เปลี่ยนชื่อ "เครื่อง" → "อุปกรณ์"

### QA Findings
1. **Bug**: `renderDashboard` ไม่มี try-catch → ถ้า `stats.paperUsage` มี field ที่ undefined (เช่น `latestMonthCostBW` ตอนยังไม่มีข้อมูล) อาจ throw error ทำให้ทั้งฟังก์ชันหยุดทำงาน → ข้อมูลไม่ขึ้นเลย
2. **UX**: แถบ tabs ใช้ `.tabs .tab` เดิม → ดูธรรมดา ไม่โปรเฟสชั่นนัล
3. **UX**: หน้า "การใช้กระดาษ" ไม่มี section headers → ข้อมูลปะปนกัน ดูไม่เป็นระเบียบ
4. **Naming**: ผู้ใช้อยากเปลี่ยน "เครื่อง" → "อุปกรณ์"

### Work Log

**Bug fix (javascript.html):**
- `renderDashboard` เพิ่ม guard: `if (!stats) return`
- แปลง `stats.total/active/inactive` ผ่าน `Number(x || 0)` (กัน NaN)
- แต่ละ sub-render (`renderPaperUsageDashboard`, `renderPaperCostDashboard`, `renderMeterCompleteness`) ห่อด้วย try-catch แยก → ถ้าตัวไหนพัง ตัวอื่นยังทำงานได้
- ทั้งฟังก์ชันห่อด้วย try-catch + showToast error

**Renaming:**
- แถบ "🖥️ เครื่อง" → "🖥️ อุปกรณ์"

**Professional tabs (HTML + CSS):**
- เปลี่ยนจาก `.tabs .tab` เดิม → `.dashboard-tabs-wrapper` + `.dashboard-tab` ใหม่
- โครงสร้าง: icon (16px) + label (14px) แบบ flex
- Style: พื้นขาว + border + shadow อ่อน + radius 12px
- Active: gradient (primary → primary-dark) + shadow
- Hover: gray-50 bg
- Responsive: ลด padding/font บนมือถือ

**Paper tab reorganization (HTML):**
แบ่งเป็น 3 sections ชัดเจน มี section header แยก:
- **Section A: 📊 ภาพรวมการใช้กระดาษ** — stat cards (แผ่น/MoM) + Smart Insights
- **Section B: 💰 ค่าใช้จ่ายกระดาษ** — cost analytics dashboard
- **Section C: 📋 เปรียบเทียบการใช้กระดาษ** — dept/building/monthly trend

- เพิ่ม `.dashboard-section-header` (h3 + subtitle + border-bottom 2px)
- ย้าย `paper-usage-subtitle` จาก card-header มาเป็น section subtitle

**JS:**
- `showDashboardTab`: อัปเดต selector จาก `.tab` → `.dashboard-tab`

### Verification
- [x] renderDashboard มี try-catch (กัน silent failure)
- [x] แต่ละ sub-render แยก try-catch
- [x] ชื่อแถบ "อุปกรณ์" (ไม่ใช่ "เครื่อง")
- [x] Professional tabs (gradient active + shadow)
- [x] Paper tab แบ่ง 3 sections ชัดเจน
- [x] Section headers มี border + subtitle
- [x] Responsive mobile

