import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// TEMPORARY: diagnose JSON parsing issue with GOOGLE_APPLICATION_CREDENTIALS_JSON
// DELETE this file after testing.
export async function GET() {
  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON

  if (!json) {
    return NextResponse.json({ error: 'env var not set' })
  }

  // Show length + last 200 chars + chars around position 2402
  const around2402 = json.substring(2300, 2500)
  const last200 = json.substring(json.length - 200)

  // Try to find what's at position 2402
  const char2402 = json.charAt(2402)
  const char2401 = json.charAt(2401)
  const char2400 = json.charAt(2400)

  // Count opening and closing braces
  const openBraces = (json.match(/\{/g) || []).length
  const closeBraces = (json.match(/\}/g) || []).length

  return NextResponse.json({
    json_length: json.length,
    char_2400: char2400,
    char_2401: char2401,
    char_2402: char2402,
    around_2402: around2402,
    last_200_chars: last200,
    open_braces: openBraces,
    close_braces: closeBraces,
  })
}
