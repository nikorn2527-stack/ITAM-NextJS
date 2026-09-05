import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// TEMPORARY: verify GOOGLE_APPLICATION_CREDENTIALS_JSON env var is set
// DELETE this file after testing.
export async function GET() {
  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS

  let jsonValid = false
  let jsonError: string | null = null
  if (json) {
    try {
      const parsed = JSON.parse(json)
      jsonValid = !!parsed.client_email && !!parsed.private_key
    } catch (e) {
      jsonError = e instanceof Error ? e.message : String(e)
    }
  }

  return NextResponse.json({
    has_json_env: !!json,
    json_length: json ? json.length : 0,
    json_valid: jsonValid,
    json_error: jsonError,
    json_starts_with: json ? json.substring(0, 40) + '...' : null,
    has_path_env: !!path,
    path_value: path || null,
    node_env: process.env.NODE_ENV,
  })
}
