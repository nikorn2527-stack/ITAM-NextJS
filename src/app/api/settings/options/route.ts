import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================
// GET /api/settings/options
// Returns subject options (หัวข้อปัญหา) and resolution options
// (ผลการแก้ไข) for the WorkOrder form. Reads from AppSetting keys:
//   - 'subjectOptions'
//   - 'resolutionOptions'
// Falls back to DEFAULT_SUBJECTS / DEFAULT_RESOLUTIONS when the
// setting is missing or invalid JSON.
// ============================================================

export interface SubjectOption {
  group: string
  value: string
  default_priority: string
}

export interface ResolutionOption {
  group: string
  value: string
}

const VALID_PRIORITIES = new Set(['ปกติ', 'ปานกลาง', 'สูง', 'ด่วน'])

// ── Default subject options (35 items across 4 groups) ──
const DEFAULT_SUBJECTS: SubjectOption[] = [
  // Group 1: อาการทั่วไป (12)
  { group: 'อาการทั่วไป', value: 'เครื่องไม่เปิด', default_priority: 'ปานกลาง' },
  { group: 'อาการทั่วไป', value: 'เครื่องค้าง / แฮงค์', default_priority: 'ปานกลาง' },
  { group: 'อาการทั่วไป', value: 'ช้าผิดปกติ', default_priority: 'ปกติ' },
  { group: 'อาการทั่วไป', value: 'เสียงดังผิดปกติ', default_priority: 'ปกติ' },
  { group: 'อาการทั่วไป', value: 'เครื่องร้อนจัด', default_priority: 'ปานกลาง' },
  { group: 'อาการทั่วไป', value: 'ไฟไม่ติด / ไม่รับไฟ', default_priority: 'สูง' },
  { group: 'อาการทั่วไป', value: 'จอไม่แสดงผล', default_priority: 'ปานกลาง' },
  { group: 'อาการทั่วไป', value: 'คีย์บอร์ด/เมาส์ไม่ทำงาน', default_priority: 'ปกติ' },
  { group: 'อาการทั่วไป', value: 'ซอฟต์แวร์ใช้งานไม่ได้', default_priority: 'ปานกลาง' },
  { group: 'อาการทั่วไป', value: 'ไวรัส / มัลแวร์', default_priority: 'สูง' },
  { group: 'อาการทั่วไป', value: 'อีเมล/Office ไม่ทำงาน', default_priority: 'ปานกลาง' },
  { group: 'อาการทั่วไป', value: 'สิทธิ์การใช้งาน/ล็อกอินไม่ได้', default_priority: 'ปานกลาง' },

  // Group 2: Printer (10)
  { group: 'Printer', value: 'พิมพ์ไม่ออก', default_priority: 'ปานกลาง' },
  { group: 'Printer', value: 'พิมพ์ไม่ชัด / มีลายเส้น', default_priority: 'ปกติ' },
  { group: 'Printer', value: 'กระดาษติด / แยม', default_priority: 'ปกติ' },
  { group: 'Printer', value: 'หมึกหมด / เตือนหมึก', default_priority: 'ปกติ' },
  { group: 'Printer', value: 'เครื่องพิมพ์ออฟไลน์', default_priority: 'ปานกลาง' },
  { group: 'Printer', value: 'พิมพ์ช้ามาก', default_priority: 'ปกติ' },
  { group: 'Printer', value: 'พิมพ์สีไม่ตรง / สีซีด', default_priority: 'ปกติ' },
  { group: 'Printer', value: 'ตัวเครื่องมีไฟแจ้งเตือน', default_priority: 'ปานกลาง' },
  { group: 'Printer', value: 'สแกนเนอร์ไม่ทำงาน', default_priority: 'ปานกลาง' },
  { group: 'Printer', value: 'เชื่อมต่อเครื่องพิมพ์ไม่ได้', default_priority: 'ปานกลาง' },

  // Group 3: Network (7)
  { group: 'Network', value: 'อินเทอร์เน็ตไม่ติด', default_priority: 'สูง' },
  { group: 'Network', value: 'เน็ตช้า / กระตุก', default_priority: 'ปานกลาง' },
  { group: 'Network', value: 'Wi-Fi ใช้งานไม่ได้', default_priority: 'ปานกลาง' },
  { group: 'Network', value: 'เชื่อมต่อ VPN ไม่ได้', default_priority: 'ปานกลาง' },
  { group: 'Network', value: 'เครือข่ายภายในไม่เข้าถึงได้', default_priority: 'สูง' },
  { group: 'Network', value: 'IP ชนกัน / ไม่ได้รับ IP', default_priority: 'ปานกลาง' },
  { group: 'Network', value: 'สาย LAN ชำรุด', default_priority: 'ปกติ' },

  // Group 4: อื่นๆ (6)
  { group: 'อื่นๆ', value: 'สอบถามการใช้งาน', default_priority: 'ปกติ' },
  { group: 'อื่นๆ', value: 'ขอติดตั้งอุปกรณ์ใหม่', default_priority: 'ปกติ' },
  { group: 'อื่นๆ', value: 'ขอย้ายเครื่อง/ที่ตั้ง', default_priority: 'ปกติ' },
  { group: 'อื่นๆ', value: 'ขอข้อมูล/คู่มือ', default_priority: 'ปกติ' },
  { group: 'อื่นๆ', value: 'งานนอกสถานที่ / ลูกค้าภายนอก', default_priority: 'ปานกลาง' },
  { group: 'อื่นๆ', value: 'อื่นๆ (ระบุในรายละเอียด)', default_priority: 'ปกติ' },
]

// ── Default resolution options (43 items across 5 groups) ──
const DEFAULT_RESOLUTIONS: ResolutionOption[] = [
  // Group 1: ซ่อมสำเร็จ (15)
  { group: 'ซ่อมสำเร็จ', value: 'ซ่อมสำเร็จ — ตรวจพบและแก้ไขสาเหตุ' },
  { group: 'ซ่อมสำเร็จ', value: 'แก้ไขการตั้งค่าระบบ' },
  { group: 'ซ่อมสำเร็จ', value: 'อัปเดตไดรเวอร์ / เฟิร์มแวร์' },
  { group: 'ซ่อมสำเร็จ', value: 'อัปเดตระบบปฏิบัติการ' },
  { group: 'ซ่อมสำเร็จ', value: 'ลบ/ติดตั้งซอฟต์แวร์ใหม่' },
  { group: 'ซ่อมสำเร็จ', value: 'ทำความสะอาดเครื่อง / แก้ฝุ่น' },
  { group: 'ซ่อมสำเร็จ', value: 'เคลียร์แคช / รีเซ็ตระบบ' },
  { group: 'ซ่อมสำเร็จ', value: 'เชื่อมต่อสาย / ปรับสายเคเบิล' },
  { group: 'ซ่อมสำเร็จ', value: 'รีสตาร์ทเครื่องแล้วใช้งานได้' },
  { group: 'ซ่อมสำเร็จ', value: 'ตรวจสอบพบว่าไม่มีปัญหา (No trouble found)' },
  { group: 'ซ่อมสำเร็จ', value: 'ปัญหาที่ผู้แจ้งรายงานหายไปแล้ว' },
  { group: 'ซ่อมสำเร็จ', value: 'แก้ไขสิทธิ์การเข้าถึง' },
  { group: 'ซ่อมสำเร็จ', value: 'แก้ไขการเชื่อมต่อเครือข่าย' },
  { group: 'ซ่อมสำเร็จ', value: 'แก้ไขการตั้งค่าพรินเตอร์' },
  { group: 'ซ่อมสำเร็จ', value: 'คืนค่าการตั้งค่าจากการสำรองข้อมูล' },

  // Group 2: เปลี่ยนอะไหล่ (10)
  { group: 'เปลี่ยนอะไหล่', value: 'เปลี่ยนหมึกพิมพ์ / โทนเนอร์' },
  { group: 'เปลี่ยนอะไหล่', value: 'เปลี่ยน Drum / Fuser' },
  { group: 'เปลี่ยนอะไหล่', value: 'เปลี่ยนฮาร์ดดิสก์ / SSD' },
  { group: 'เปลี่ยนอะไหล่', value: 'เปลี่ยนแรม (RAM)' },
  { group: 'เปลี่ยนอะไหล่', value: 'เปลี่ยนพาวเวอร์ซัพพลาย' },
  { group: 'เปลี่ยนอะไหล่', value: 'เปลี่ยนคีย์บอร์ด / เมาส์' },
  { group: 'เปลี่ยนอะไหล่', value: 'เปลี่ยนสาย / อะแดปเตอร์' },
  { group: 'เปลี่ยนอะไหล่', value: 'เปลี่ยนการ์ดเครือข่าย' },
  { group: 'เปลี่ยนอะไหล่', value: 'เปลี่ยนหัวพิมพ์ (Print head)' },
  { group: 'เปลี่ยนอะไหล่', value: 'เปลี่ยนอะไหล่อื่นๆ' },

  // Group 3: ปรับแต่ง/ตั้งค่า (8)
  { group: 'ปรับแต่ง/ตั้งค่า', value: 'ตั้งค่า IP / Network ใหม่' },
  { group: 'ปรับแต่ง/ตั้งค่า', value: 'ตั้งค่าพรินเตอร์ใหม่' },
  { group: 'ปรับแต่ง/ตั้งค่า', value: 'ตั้งค่าซอฟต์แวร์ใหม่' },
  { group: 'ปรับแต่ง/ตั้งค่า', value: 'ย้ายข้อมูล / Migration' },
  { group: 'ปรับแต่ง/ตั้งค่า', value: 'ติดตั้งซอฟต์แวร์ใหม่' },
  { group: 'ปรับแต่ง/ตั้งค่า', value: 'เพิ่ม/ลดสิทธิ์ผู้ใช้' },
  { group: 'ปรับแต่ง/ตั้งค่า', value: 'ตั้งค่าการสำรองข้อมูล' },
  { group: 'ปรับแต่ง/ตั้งค่า', value: 'ตั้งค่าอุปกรณ์ใหม่ทั้งหมด' },

  // Group 4: ส่งซ่อมภายนอก (5)
  { group: 'ส่งซ่อมภายนอก', value: 'ส่งซ่อมกับผู้จำหน่าย (Vendor)' },
  { group: 'ส่งซ่อมภายนอก', value: 'ส่งศูนย์บริการ' },
  { group: 'ส่งซ่อมภายนอก', value: 'เคลมประกัน / Warranty' },
  { group: 'ส่งซ่อมภายนอก', value: 'ส่งตรวจวิเคราะห์ภายนอก' },
  { group: 'ส่งซ่อมภายนอก', value: 'รออะไหล่สั่งซื้อ' },

  // Group 5: อื่นๆ (5)
  { group: 'อื่นๆ', value: 'ผู้แจ้งขอถอนใบงาน' },
  { group: 'อื่นๆ', value: 'ไม่สามารถทำซ่อมได้ (ทำลาย/เสียหายถาวร)' },
  { group: 'อื่นๆ', value: 'แจ้งซ่อมซ้ำ / งานซ้ำ' },
  { group: 'อื่นๆ', value: 'ไม่พบปัญหา ณ ที่ตั้ง (ตรวจสอบแล้วใช้งานได้)' },
  { group: 'อื่นๆ', value: 'อื่นๆ (ระบุในหมายเหตุ)' },
]

function parseSubjects(value: string | null | undefined): SubjectOption[] {
  if (!value) return DEFAULT_SUBJECTS
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return DEFAULT_SUBJECTS
    const out: SubjectOption[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      // Support both flat ({group, value, default_priority}) and
      // nested ({group, options: [{value, default_priority}]}) shapes.
      const group = String(item.group ?? '').trim()
      if (group && typeof item.value === 'string') {
        const dp = String(item.default_priority ?? 'ปกติ').trim()
        out.push({
          group,
          value: String(item.value).trim(),
          default_priority: VALID_PRIORITIES.has(dp) ? dp : 'ปกติ',
        })
      } else if (group && Array.isArray(item.options)) {
        for (const opt of item.options) {
          if (!opt || typeof opt.value !== 'string') continue
          const dp = String(opt.default_priority ?? 'ปกติ').trim()
          out.push({
            group,
            value: String(opt.value).trim(),
            default_priority: VALID_PRIORITIES.has(dp) ? dp : 'ปกติ',
          })
        }
      }
    }
    if (out.length === 0) return DEFAULT_SUBJECTS
    return out
  } catch {
    return DEFAULT_SUBJECTS
  }
}

function parseResolutions(value: string | null | undefined): ResolutionOption[] {
  if (!value) return DEFAULT_RESOLUTIONS
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return DEFAULT_RESOLUTIONS
    const out: ResolutionOption[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const group = String(item.group ?? '').trim()
      if (group && typeof item.value === 'string') {
        out.push({ group, value: String(item.value).trim() })
      } else if (group && Array.isArray(item.options)) {
        for (const opt of item.options) {
          if (!opt || typeof opt.value !== 'string') continue
          out.push({ group, value: String(opt.value).trim() })
        }
      }
    }
    if (out.length === 0) return DEFAULT_RESOLUTIONS
    return out
  } catch {
    return DEFAULT_RESOLUTIONS
  }
}

export async function GET() {
  try {
    const [subjRow, resRow] = await Promise.all([
      db.appSetting.findUnique({ where: { key: 'subjectOptions' } }),
      db.appSetting.findUnique({ where: { key: 'resolutionOptions' } }),
    ])

    const subjects = parseSubjects(subjRow?.value)
    const resolutions = parseResolutions(resRow?.value)

    return NextResponse.json({
      subjects,
      resolutions,
    })
  } catch (err) {
    console.error('GET /api/settings/options', err)
    return NextResponse.json(
      {
        error: 'Failed to load options',
        subjects: DEFAULT_SUBJECTS,
        resolutions: DEFAULT_RESOLUTIONS,
      },
      { status: 500 },
    )
  }
}
