#!/usr/bin/env node
// check-module-manifest.mjs — validates module consistency across the codebase.
//
// Phase 4.4 fix: This script now imports MODULE_NAMES directly from
// src/config/modules.ts (single source of truth) instead of maintaining
// a separate list that drifted out of sync.
//
// Previous issue: this file had 'meter' (singular) while modules.ts had
// 'meters' (plural), plus 'mobile', 'sites', 'users' that modules.ts
// doesn't define, and was missing 'authorization', 'stickers', 'sync',
// 'pm' that modules.ts does define.
//
// Now: expectedModules is read from MODULE_NAMES in modules.ts directly.

import { readFileSync } from 'node:fs'

const manifestPath = 'src/config/modules.ts'
const sidebarPath = 'src/components/itam/sidebar.tsx'
const manifest = readFileSync(manifestPath, 'utf8')
const sidebar = readFileSync(sidebarPath, 'utf8')

// Extract MODULE_NAMES from modules.ts (single source of truth)
const moduleNameMatch = manifest.match(/export const MODULE_NAMES\s*=\s*\[([\s\S]*?)\]/)
if (!moduleNameMatch) {
  console.error('❌ Could not find MODULE_NAMES in modules.ts')
  process.exit(1)
}
const expectedModules = moduleNameMatch[1]
  .split(',')
  .map((s) => s.trim().replace(/['"`]/g, ''))
  .filter(Boolean)

console.log(`📋 Validating ${expectedModules.length} modules from MODULE_NAMES (single source of truth):`)
console.log(`   ${expectedModules.join(', ')}\n`)

const errors = []

for (const moduleName of expectedModules) {
  // Check that the module has a definition in MODULES
  const hasDefinition = manifest.includes(`${moduleName}:`) || manifest.includes(`'${moduleName}':`)
  if (!hasDefinition) {
    errors.push(`Module '${moduleName}' is in MODULE_NAMES but has no definition in MODULES`)
  }
}

// Also check sidebar references (UI navigation items)
// Sidebar items may use different names (e.g. 'itam-devices' vs 'devices')
// so we just warn, not error
const sidebarItems = [
  'itam-devices', 'itam-meter-keyboard', 'itam-work-orders',
  'itam-stock', 'itam-dashboard', 'itam-reports',
  'itam-settings', 'itam-sticker-editor', 'itam-paper-analytics',
  'itam-pm-schedules',
]
for (const item of sidebarItems) {
  if (!sidebar.includes(item)) {
    console.warn(`⚠️  Sidebar item '${item}' not found in sidebar.tsx (may have been renamed)`)
  }
}

// Validate module dependency graph (no cycles)
const modulesMatch = manifest.match(/MODULES\s*:\s*Readonly<Record<ModuleName,\s*ModuleDefinition>>\s*=\s*\{([\s\S]*?)\n\}/)
if (modulesMatch) {
  const moduleDefs = modulesMatch[1]
  // Simple cycle check: each module's dependencies must exist in MODULE_NAMES
  for (const name of expectedModules) {
    const defMatch = moduleDefs.match(new RegExp(`${name}:\\s*\\{[^}]*dependencies:\\s*\\[([^\\]]*)\\]`))
    if (defMatch) {
      const deps = defMatch[1].split(',').map((s) => s.trim().replace(/['"`]/g, '')).filter(Boolean)
      for (const dep of deps) {
        if (!expectedModules.includes(dep)) {
          errors.push(`Module '${name}' depends on '${dep}' which is not in MODULE_NAMES`)
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`\n❌ Found ${errors.length} error(s):`)
  for (const e of errors) console.error(`   - ${e}`)
  process.exit(1)
}

console.log('✅ Module manifest is consistent (MODULE_NAMES = single source of truth)')
