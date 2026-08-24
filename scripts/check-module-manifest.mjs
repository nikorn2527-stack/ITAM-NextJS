#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const manifestPath = 'src/config/modules.ts'
const sidebarPath = 'src/components/itam/sidebar.tsx'
const manifest = readFileSync(manifestPath, 'utf8')
const sidebar = readFileSync(sidebarPath, 'utf8')

const expectedModules = [
  'auth',
  'dashboard',
  'devices',
  'meter',
  'paper-analytics',
  'work-orders',
  'stock',
  'reports',
  'settings',
  'users',
  'sites',
  'templates',
  'import',
  'audit',
  'notifications',
  'mobile',
]

const errors = []

for (const moduleName of expectedModules) {
  const entryPattern = new RegExp(`name:\\s*['"]${moduleName}['"]`)
  if (!entryPattern.test(manifest)) {
    errors.push(`Missing manifest entry for module '${moduleName}'`)
  }
}

const routeMatches = [...manifest.matchAll(/routeIds:\s*\[([^\]]*)\]/g)]
const manifestRouteIds = new Set()
for (const [, routeList] of routeMatches) {
  for (const routeMatch of routeList.matchAll(/['"]([^'"]+)['"]/g)) {
    manifestRouteIds.add(routeMatch[1])
  }
}

const sidebarRouteIds = new Set(
  [...sidebar.matchAll(/page:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]),
)

for (const routeId of sidebarRouteIds) {
  if (!manifestRouteIds.has(routeId)) {
    errors.push(`Sidebar route '${routeId}' is not mapped in MODULES.routeIds`)
  }
}

for (const routeId of ['dashboard', 'itam-devices', 'itam-meter-keyboard', 'mobile', 'reports-hub', 'monthly-report']) {
  if (!manifestRouteIds.has(routeId)) {
    errors.push(`Required route '${routeId}' is missing from MODULES.routeIds`)
  }
}

if (!manifest.includes('validateModuleManifest')) {
  errors.push('Manifest must export validateModuleManifest()')
}

if (!sidebar.includes('isRouteEnabled')) {
  errors.push('Sidebar must use isRouteEnabled() to hide disabled modules')
}

if (errors.length > 0) {
  console.error('Module manifest check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Module manifest OK (${expectedModules.length} modules, ${manifestRouteIds.size} route ids)`)
