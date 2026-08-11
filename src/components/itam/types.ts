// Shared client-side types for ITAM app

export interface Device {
  id: string
  assetCode: string
  name: string
  brand: string
  model: string
  type: string
  serialNumber: string | null
  status: string
  site: string
  department: string | null
  departmentCode: string | null
  parentRef: string | null
  displayLabel: string | null
  location: string | null
  purchaseDate: string | null
  lastMeterReading: number
  createdAt: string
  updatedAt: string
}

export interface MasterItem {
  id: string
  category: string
  code: string
  label: string
  parentRef: string | null
  displayLabel: string | null
  siteCode: string | null
  createdAt: string
  updatedAt: string
}

export interface MeterReading {
  id: string
  deviceId: string
  reading: number
  prevReading: number
  date: string
  remark: string | null
  delta: number
  cycleId: string | null
  createdAt: string
  device?: Pick<Device, 'id' | 'name' | 'assetCode' | 'brand' | 'model'>
}

export interface Cycle {
  id: string
  name: string
  startDate: string
  endDate: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface Site {
  id: string
  code: string
  name: string
  createdAt: string
}

export interface DashboardData {
  totals: { total: number; active: number; spare: number; repair: number }
  byStatus: Array<{ name: string; raw: string; value: number }>
  byType: Array<{ name: string; value: number }>
  topUsage: Array<{ id: string; name: string; assetCode: string; value: number }>
  recentActivity: Array<{
    id: string
    deviceName: string
    assetCode: string
    reading: number
    delta: number
    date: string
    remark: string | null
  }>
  paperThisMonth?: number
  range?: {
    key: string
    label: string
    start: string | null
    end: string | null
  }
}

export type DashboardRangeKey = 'month' | '30d' | 'quarter' | 'all'

export const DASHBOARD_RANGE_OPTIONS: {
  value: DashboardRangeKey
  label: string
  kpiLabel: string
}[] = [
  { value: 'month', label: 'เดือนนี้', kpiLabel: 'กระดาษเดือนนี้' },
  { value: '30d', label: '30 วันล่าสุด', kpiLabel: 'กระดาษ 30 วัน' },
  { value: 'quarter', label: 'ไตรมาสนี้', kpiLabel: 'กระดาษไตรมาสนี้' },
  { value: 'all', label: 'ทั้งหมด', kpiLabel: 'กระดาษทั้งหมด' },
]

export interface AuditLog {
  id: string
  action: string
  entity: string
  entityId: string | null
  summary: string
  detail: string | null
  actor: string
  createdAt: string
}

export const DEVICE_STATUS_OPTIONS = [
  { value: 'active', label: 'ใช้งานอยู่' },
  { value: 'spare', label: 'สำรอง' },
  { value: 'repair', label: 'ส่งซ่อม' },
  { value: 'disposed', label: 'ตัดของออก' },
] as const

export const MASTER_CATEGORIES = [
  'Brand',
  'Type',
  'Model',
  'Department',
  'Status',
  'DeviceGroup',
] as const

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
    case 'spare':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
    case 'repair':
      return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800'
    case 'disposed':
      return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  }
}

export function statusLabel(status: string): string {
  return DEVICE_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
}
