/**
 * Client-side CSV export helper.
 * Emits a UTF-8 BOM (\uFEFF) so Excel correctly renders Thai text.
 * Values containing commas, quotes, or newlines are RFC-4180 escaped.
 */
export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
  headers?: { key: string; label: string }[],
): void {
  const cols =
    headers ??
    (rows.length > 0
      ? Object.keys(rows[0]).map((k) => ({ key: k, label: k }))
      : [])

  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const headerLine = cols.map((c) => escape(c.label)).join(',')
  const lines = rows.map((r) =>
    cols
      .map((c) => escape((r as Record<string, unknown>)[c.key]))
      .join(','),
  )
  const csv = '\uFEFF' + [headerLine, ...lines].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Builds a YYYYMMDD stamp from the current date — useful for filenames. */
export function dateStamp(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}
