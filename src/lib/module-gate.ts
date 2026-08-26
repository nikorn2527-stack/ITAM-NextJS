import { NextResponse } from 'next/server'
import { isModuleEnabled, type ModuleName } from '@/config/modules'

/**
 * Returns a stable 404 response when an optional module is disabled.
 * Route adapters must call this before authentication and data access so a
 * disabled feature has no observable API surface.
 */
export function moduleUnavailableResponse(module: ModuleName): NextResponse | null {
  if (isModuleEnabled(module)) return null

  return NextResponse.json(
    {
      error: {
        code: 'MODULE_DISABLED',
        message: `Module "${module}" is disabled.`,
      },
    },
    { status: 404 },
  )
}
