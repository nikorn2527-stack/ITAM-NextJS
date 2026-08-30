/**
 * google-sheets-sync.ts — ดึงข้อมูลจาก Google Sheets (3 แอฟเดิม)
 *
 * ใช้ public CSV export URL (ไม่ต้องใช้ Service Account) — ต้องเปิดแชร์ Sheets เป็น "Anyone with link"
 *
 * 3 แอฟเดิม:
 *   1. ITAM (จัดการอุปกรณ์) — Devices, Meter Readings, Transfers
 *   2. Services (แจ้งซ่อม) — Work Orders, Repair Tickets
 *   3. Stock (สต๊อก) — Inventory, Stock In/Out, Purchase Orders
 *
 * การใช้งาน:
 *   const sheets = new GoogleSheetsSync()
 *   const data = await sheets.fetchSheet('itam', 0) // sheet index 0 = first tab
 *   // data = array of objects (header row → keys)
 */

export type SheetApp = 'itam' | 'services' | 'stock'

const SHEET_IDS: Record<SheetApp, string> = {
  itam: process.env.GOOGLE_SHEETS_ID_ITAM ?? '',
  services: process.env.GOOGLE_SHEETS_ID_SERVICES ?? '',
  stock: process.env.GOOGLE_SHEETS_ID_STOCK ?? '',
}

export interface SheetRow {
  [key: string]: string
}

export class GoogleSheetsSync {
  /**
   * Fetch a single sheet (tab) as CSV → parse to objects
   * @param app Which legacy app ('itam' | 'services' | 'stock')
   * @param gid Sheet/tab ID (0 = first tab, find in Google Sheets URL: #gid=XXXXX)
   * @returns Array of row objects (keys from header row)
   */
  async fetchSheet(app: SheetApp, gid: number = 0): Promise<SheetRow[]> {
    const sheetId = SHEET_IDS[app]
    if (!sheetId) throw new Error(`No GOOGLE_SHEETS_ID_${app.toUpperCase()} in env`)

    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
    const res = await fetch(url, { redirect: 'follow' as RequestRedirect })

    if (!res.ok) {
      throw new Error(`Failed to fetch ${app} sheet (gid=${gid}): ${res.status} ${res.statusText}`)
    }

    const csv = await res.text()
    return this.parseCSV(csv)
  }

  /**
   * List all tabs in a spreadsheet (requires API key or service account)
   * For public sheets, we can try fetching known gid values
   */
  async fetchAllTabs(app: SheetApp, gids: number[]): Promise<Record<number, SheetRow[]>> {
    const result: Record<number, SheetRow[]> = {}
    for (const gid of gids) {
      try {
        result[gid] = await this.fetchSheet(app, gid)
      } catch (err) {
        console.error(`Failed to fetch ${app} gid=${gid}:`, err)
        result[gid] = []
      }
    }
    return result
  }

  /**
   * Parse CSV text → array of objects
   * Handles quoted fields, commas inside quotes, newlines inside quotes
   */
  private parseCSV(csv: string): SheetRow[] {
    const lines: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i]
      if (char === '"') {
        if (inQuotes && csv[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
          current += char
        }
      } else if (char === '\n' && !inQuotes) {
        lines.push(current)
        current = ''
      } else if (char === '\r') {
        // skip
      } else {
        current += char
      }
    }
    if (current) lines.push(current)

    if (lines.length < 2) return []

    const headers = this.parseCSVLine(lines[0])
    const rows: SheetRow[] = []

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      const values = this.parseCSVLine(lines[i])
      const row: SheetRow = {}
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j]?.trim() || `col_${j}`
        row[key] = (values[j] ?? '').trim()
      }
      rows.push(row)
    }

    return rows
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    result.push(current)
    return result
  }
}
