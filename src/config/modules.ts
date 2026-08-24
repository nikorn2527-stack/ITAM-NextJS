import type { ActivePage } from '@/store/app-store'

export type ModuleName =
  | 'auth'
  | 'dashboard'
  | 'devices'
  | 'meter'
  | 'paper-analytics'
  | 'work-orders'
  | 'stock'
  | 'reports'
  | 'settings'
  | 'users'
  | 'sites'
  | 'templates'
  | 'import'
  | 'audit'
  | 'notifications'
  | 'mobile'

export interface ModuleManifestItem {
  name: ModuleName
  enabled: boolean
  required: boolean
  dependencies: ModuleName[]
  routeIds: ActivePage[]
  navLabel?: string
}

export const MODULE_ORDER: ModuleName[] = [
  'auth',
  'audit',
  'sites',
  'users',
  'settings',
  'devices',
  'meter',
  'stock',
  'work-orders',
  'paper-analytics',
  'reports',
  'templates',
  'import',
  'notifications',
  'dashboard',
  'mobile',
]

export const MODULES: Record<ModuleName, ModuleManifestItem> = {
  auth: {
    name: 'auth',
    enabled: true,
    required: true,
    dependencies: [],
    routeIds: [],
  },
  audit: {
    name: 'audit',
    enabled: true,
    required: true,
    dependencies: ['auth'],
    routeIds: ['itam-audit', 'itam-snapshot-viewer'],
    navLabel: 'ประวัติการใช้งาน',
  },
  sites: {
    name: 'sites',
    enabled: true,
    required: true,
    dependencies: ['auth'],
    routeIds: [],
  },
  users: {
    name: 'users',
    enabled: true,
    required: true,
    dependencies: ['auth', 'sites', 'audit'],
    routeIds: [],
  },
  settings: {
    name: 'settings',
    enabled: true,
    required: true,
    dependencies: ['auth', 'audit'],
    routeIds: ['itam-settings', 'settings-v2', 'settings'],
    navLabel: 'ตั้งค่าระบบ',
  },
  devices: {
    name: 'devices',
    enabled: true,
    required: true,
    dependencies: ['auth', 'sites', 'audit'],
    routeIds: ['itam-devices', 'devices-page', 'devices'],
    navLabel: 'จัดการอุปกรณ์',
  },
  meter: {
    name: 'meter',
    enabled: true,
    required: false,
    dependencies: ['devices', 'sites', 'audit'],
    routeIds: ['itam-meter', 'itam-meter-keyboard', 'meter-page', 'meter'],
    navLabel: 'จดมิเตอร์',
  },
  stock: {
    name: 'stock',
    enabled: true,
    required: false,
    dependencies: ['auth', 'sites', 'audit'],
    routeIds: ['itam-stock', 'stock'],
    navLabel: 'สต๊อก',
  },
  'work-orders': {
    name: 'work-orders',
    enabled: true,
    required: false,
    dependencies: ['devices', 'stock', 'notifications'],
    routeIds: ['itam-work-orders', 'work-orders', 'itam-repairs'],
    navLabel: 'แจ้งซ่อม',
  },
  'paper-analytics': {
    name: 'paper-analytics',
    enabled: true,
    required: false,
    dependencies: ['meter', 'devices'],
    routeIds: ['itam-paper-analytics', 'paper-analytics-page', 'paper-analytics'],
    navLabel: 'วิเคราะห์กระดาษ',
  },
  reports: {
    name: 'reports',
    enabled: true,
    required: false,
    dependencies: ['devices', 'meter', 'stock', 'work-orders'],
    routeIds: ['reports-hub', 'monthly-report'],
    navLabel: 'ศูนย์รายงาน',
  },
  templates: {
    name: 'templates',
    enabled: true,
    required: false,
    dependencies: ['devices', 'work-orders'],
    routeIds: ['templates', 'itam-sticker-editor', 'itam-document-editor'],
    navLabel: 'เทมเพลต',
  },
  import: {
    name: 'import',
    enabled: true,
    required: false,
    dependencies: ['devices', 'stock', 'sites'],
    routeIds: ['import'],
    navLabel: 'นำเข้าข้อมูล',
  },
  notifications: {
    name: 'notifications',
    enabled: true,
    required: false,
    dependencies: ['settings', 'users'],
    routeIds: [],
  },
  dashboard: {
    name: 'dashboard',
    enabled: true,
    required: false,
    dependencies: ['devices', 'meter', 'stock', 'work-orders'],
    routeIds: ['dashboard', 'itam'],
    navLabel: 'Dashboard',
  },
  mobile: {
    name: 'mobile',
    enabled: true,
    required: false,
    dependencies: ['work-orders', 'meter', 'stock'],
    routeIds: ['mobile'],
    navLabel: 'โหมดมือถือ',
  },
}

export const MODULE_ROUTE_INDEX: Partial<Record<ActivePage, ModuleName>> =
  Object.fromEntries(
    Object.values(MODULES).flatMap((moduleDef) =>
      moduleDef.routeIds.map((routeId) => [routeId, moduleDef.name]),
    ),
  ) as Partial<Record<ActivePage, ModuleName>>

export function getModuleForRoute(routeId: ActivePage): ModuleManifestItem | null {
  const moduleName = MODULE_ROUTE_INDEX[routeId]
  return moduleName ? MODULES[moduleName] : null
}

export function isModuleEnabled(moduleName: ModuleName): boolean {
  const moduleDef = MODULES[moduleName]
  if (!moduleDef) return false
  if (!moduleDef.enabled) return false
  return moduleDef.dependencies.every(isModuleEnabled)
}

export function isRouteEnabled(routeId: ActivePage): boolean {
  const moduleDef = getModuleForRoute(routeId)
  if (!moduleDef) return true
  return isModuleEnabled(moduleDef.name)
}

export function validateModuleManifest(): string[] {
  const errors: string[] = []
  const moduleNames = new Set(MODULE_ORDER)

  for (const moduleName of MODULE_ORDER) {
    const moduleDef = MODULES[moduleName]
    if (!moduleDef) {
      errors.push(`Missing manifest entry for module '${moduleName}'`)
      continue
    }
    if (moduleDef.name !== moduleName) {
      errors.push(`Manifest key '${moduleName}' has mismatched name '${moduleDef.name}'`)
    }
    if (moduleDef.required && !moduleDef.enabled) {
      errors.push(`Required module '${moduleName}' cannot be disabled`)
    }
    for (const dependency of moduleDef.dependencies) {
      if (!moduleNames.has(dependency)) {
        errors.push(`Module '${moduleName}' depends on unknown module '${dependency}'`)
      }
    }
  }

  for (const [routeId, moduleName] of Object.entries(MODULE_ROUTE_INDEX)) {
    if (!moduleNames.has(moduleName)) {
      errors.push(`Route '${routeId}' maps to unknown module '${moduleName}'`)
    }
  }

  return errors
}
