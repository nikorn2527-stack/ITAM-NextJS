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
  warrantyMonths: number
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

export interface SiteRate {
  id: string
  siteCode: string
  siteName: string
  bwRate: number
  colorRate: number
  createdAt: string
  updatedAt: string
}

export type WarrantyStatus = 'active' | 'expiring' | 'expired' | 'unknown'

export interface WarrantyEntry {
  id: string
  assetCode: string
  name: string
  brand: string
  model: string
  site: string
  purchaseDate: string | null
  warrantyMonths: number
  warrantyExpiry: string | null
  status: WarrantyStatus
  daysUntilExpiry: number | null
}

export interface WarrantySummary {
  active: number
  expiring: number
  expired: number
  unknown: number
}

export interface CostAnalyticsRow {
  id: string
  assetCode: string
  name: string
  site: string
  sheets: number
  rate: number
  cost: number
}

export interface CostAnalyticsBySite {
  site: string
  cost: number
  sheets: number
}

export interface CostAnalyticsData {
  devices: CostAnalyticsRow[]
  totalCost: number
  totalSheets: number
  bySite: CostAnalyticsBySite[]
  range: {
    key: string
    start: string | null
    end: string | null
  }
}

// ---- Search result types ----
export interface SearchDeviceResult {
  type: 'device'
  id: string
  title: string
  subtitle: string
  url: null
}
export interface SearchMasterResult {
  type: 'master'
  id: string
  title: string
  subtitle: string
}
export interface SearchMeterResult {
  type: 'meter'
  id: string
  title: string
  subtitle: string
  deviceId: string
}
export interface SearchAuditResult {
  type: 'audit'
  id: string
  title: string
  subtitle: string
}
export interface SearchSiteResult {
  type: 'site'
  id: string
  title: string
  subtitle: string
}
export interface SearchResults {
  devices: SearchDeviceResult[]
  master: SearchMasterResult[]
  meter: SearchMeterResult[]
  audit: SearchAuditResult[]
  sites: SearchSiteResult[]
}

// ---- Warranty helpers (client-side, used by devices-page and detail sheet) ----

/** Add `months` to a YYYY-MM-DD string, clamping to last day of target month. */
export function addMonthsISO(iso: string, months: number): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const d = new Date(iso.slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() < day) d.setDate(0)
  return d.toISOString().slice(0, 10)
}

export function computeWarranty(
  purchaseDate: string | null,
  warrantyMonths: number,
): {
  expiry: string | null
  status: WarrantyStatus
  daysUntilExpiry: number | null
} {
  const expiry = purchaseDate
    ? addMonthsISO(purchaseDate, warrantyMonths)
    : null
  if (!expiry) {
    return { expiry: null, status: 'unknown', daysUntilExpiry: null }
  }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const exp = new Date(expiry + 'T00:00:00')
  const diffMs = exp.getTime() - today.getTime()
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return { expiry, status: 'expired', daysUntilExpiry: days }
  if (days <= 30) return { expiry, status: 'expiring', daysUntilExpiry: days }
  return { expiry, status: 'active', daysUntilExpiry: days }
}

export function warrantyBadgeClass(status: WarrantyStatus): string {
  switch (status) {
    case 'active':
      return 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 transition-colors hover:scale-105'
    case 'expiring':
      return 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 transition-colors hover:scale-105 animate-pulse'
    case 'expired':
      return 'border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300 transition-colors hover:scale-105'
    case 'unknown':
    default:
      return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors hover:scale-105'
  }
}

export function warrantyLabel(status: WarrantyStatus): string {
  switch (status) {
    case 'active':
      return 'รับประกัน'
    case 'expiring':
      return 'ใกล้หมด'
    case 'expired':
      return 'หมดแล้ว'
    case 'unknown':
    default:
      return 'ไม่ระบุ'
  }
}

export function formatThaiDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function formatBaht(value: number): string {
  return `฿${value.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
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

export interface DeviceTransfer {
  id: string
  deviceId: string
  fromSite: string | null
  toSite: string
  fromDept: string | null
  toDept: string | null
  fromDeptCode: string | null
  toDeptCode: string | null
  reason: string | null
  transferDate: string
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
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 transition-colors hover:scale-105'
    case 'spare':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 transition-colors hover:scale-105'
    case 'repair':
      return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800 transition-colors hover:scale-105'
    case 'disposed':
      return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800 transition-colors hover:scale-105'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 transition-colors hover:scale-105'
  }
}

export function statusLabel(status: string): string {
  return DEVICE_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
}
