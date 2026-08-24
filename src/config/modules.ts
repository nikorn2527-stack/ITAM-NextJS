/**
 * Module manifest — the single source of truth for optional ITAM capabilities.
 *
 * It is deliberately framework-independent so it can be validated in CI and
 * reused by navigation, API adapters, and future server-side feature gates.
 */
export const MODULE_NAMES = [
  'auth',
  'authorization',
  'devices',
  'meters',
  'work-orders',
  'stock',
  'dashboard',
  'reports',
  'paper-analytics',
  'import',
  'templates',
  'stickers',
  'settings',
  'notifications',
  'audit',
  'sync',
] as const

export type ModuleName = (typeof MODULE_NAMES)[number]

export interface ModuleDefinition {
  /** Required platform modules cannot be disabled. */
  required: boolean
  /** Feature availability. Dependencies are also required to be enabled. */
  enabled: boolean
  /** Other modules that must be enabled before this module can be used. */
  dependencies: readonly ModuleName[]
}

export const MODULES: Readonly<Record<ModuleName, ModuleDefinition>> = {
  auth: { required: true, enabled: true, dependencies: [] },
  authorization: { required: true, enabled: true, dependencies: ['auth', 'audit'] },
  devices: { required: true, enabled: true, dependencies: ['authorization', 'audit'] },
  meters: { required: false, enabled: true, dependencies: ['devices', 'authorization'] },
  'work-orders': { required: false, enabled: true, dependencies: ['devices', 'stock', 'authorization'] },
  stock: { required: false, enabled: true, dependencies: ['authorization'] },
  dashboard: { required: false, enabled: true, dependencies: ['devices', 'meters', 'stock', 'work-orders'] },
  reports: { required: false, enabled: true, dependencies: ['devices', 'meters', 'stock', 'work-orders'] },
  'paper-analytics': { required: false, enabled: true, dependencies: ['meters', 'devices'] },
  import: { required: false, enabled: true, dependencies: ['devices', 'stock', 'audit'] },
  templates: { required: false, enabled: true, dependencies: ['authorization'] },
  stickers: { required: false, enabled: true, dependencies: ['devices', 'templates'] },
  settings: { required: false, enabled: true, dependencies: ['authorization', 'audit'] },
  notifications: { required: false, enabled: true, dependencies: ['auth', 'work-orders'] },
  audit: { required: true, enabled: true, dependencies: [] },
  sync: { required: false, enabled: true, dependencies: ['devices', 'stock', 'work-orders', 'audit'] },
}

export class ModuleConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModuleConfigurationError'
  }
}

/** Throws when required modules are disabled, dependencies are unavailable, or the graph cycles. */
export function assertValidModuleConfiguration(
  definitions: Readonly<Record<ModuleName, ModuleDefinition>> = MODULES,
): void {
  for (const name of MODULE_NAMES) {
    const definition = definitions[name]
    if (definition.required && !definition.enabled) {
      throw new ModuleConfigurationError(`Required module "${name}" cannot be disabled.`)
    }
    if (definition.enabled) {
      for (const dependency of definition.dependencies) {
        if (!definitions[dependency]?.enabled) {
          throw new ModuleConfigurationError(
            `Enabled module "${name}" requires enabled dependency "${dependency}".`,
          )
        }
      }
    }
  }

  const visiting = new Set<ModuleName>()
  const visited = new Set<ModuleName>()
  const visit = (name: ModuleName): void => {
    if (visited.has(name)) return
    if (visiting.has(name)) {
      throw new ModuleConfigurationError(`Circular module dependency detected at "${name}".`)
    }
    visiting.add(name)
    for (const dependency of definitions[name].dependencies) visit(dependency)
    visiting.delete(name)
    visited.add(name)
  }
  for (const name of MODULE_NAMES) visit(name)
}

/** Returns true only when the module and all of its dependencies are enabled. */
export function isModuleEnabled(
  name: ModuleName,
  definitions: Readonly<Record<ModuleName, ModuleDefinition>> = MODULES,
): boolean {
  const seen = new Set<ModuleName>()
  const isEnabled = (current: ModuleName): boolean => {
    if (seen.has(current)) return true
    seen.add(current)
    const definition = definitions[current]
    return definition.enabled && definition.dependencies.every(isEnabled)
  }
  return isEnabled(name)
}

assertValidModuleConfiguration()
