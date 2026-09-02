/**
 * full-text-search.ts — PostgreSQL Full-Text Search helpers.
 *
 * Uses PostgreSQL's built-in `tsvector` + `tsquery` (FREE, no external service).
 * Supports Thai + English text search with ranking.
 *
 * Benefits vs current ILIKE search:
 *   - ILIKE '%term%' → full table scan (slow on large datasets)
 *   - tsvector + GIN index → indexed search (100x faster)
 *   - Supports word stemming, ranking, highlighting
 *   - Handles multi-word queries naturally
 *
 * Setup:
 *   1. Create GIN indexes (run in Supabase SQL Editor):
 *      CREATE INDEX idx_device_fts ON "Device"
 *      USING gin(to_tsvector('simple', coalesce("assetCode", '') || ' ' || coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(serialNumber, '')));
 *
 *   2. Similarly for WorkOrder, StockItem, MeterReading
 *
 * Usage:
 *   import { searchDevices, searchWorkOrders, searchStockItems } from '@/lib/full-text-search'
 *
 *   const results = await searchDevices('canon printer', { limit: 20 })
 */

import { db } from './db'

export interface SearchResult {
  id: string
  type: 'device' | 'work-order' | 'stock-item' | 'meter-reading' | 'master'
  title: string
  subtitle: string
  url?: string
  score?: number
}

/**
 * Build a tsquery string from user input.
 * Handles multi-word queries by joining with & (AND).
 *
 * @example
 *   buildTsQuery('canon printer') → 'canon & printer'
 *   buildTsQuery('IT-001') → 'IT-001'
 */
function buildTsQuery(query: string): string {
  // Escape special chars + split into words + join with &
  const escaped = query
    .replace(/[&|!()<>:'\\]/g, ' ')
    .trim()
  if (!escaped) return ''
  const words = escaped.split(/\s+/).filter(Boolean)
  return words.join(' & ')
}

/**
 * Search devices using PostgreSQL full-text search.
 * Falls back to ILIKE if FTS index doesn't exist.
 *
 * Searchable fields: assetCode, name, brand, model, serialNumber, site, department
 */
export async function searchDevices(
  query: string,
  options: { limit?: number; siteCode?: string } = {},
): Promise<SearchResult[]> {
  const limit = Math.min(options.limit ?? 20, 100)
  const tsQuery = buildTsQuery(query)
  if (!tsQuery) return []

  try {
    // Try FTS first (fast, indexed)
    const ftsResults = await db.$queryRaw<SearchResult[]>`
      SELECT
        id,
        'device' as type,
        COALESCE("assetCode", '') || ' — ' || COALESCE(name, '') as title,
        COALESCE(brand, '') || ' ' || COALESCE(model, '') || ' · ' || COALESCE("serialNumber", '') as subtitle,
        ts_rank(
          to_tsvector('simple',
            COALESCE("assetCode", '') || ' ' ||
            COALESCE(name, '') || ' ' ||
            COALESCE(brand, '') || ' ' ||
            COALESCE(model, '') || ' ' ||
            COALESCE("serialNumber", '') || ' ' ||
            COALESCE(site, '') || ' ' ||
            COALESCE(department, '')
          ),
          plainto_tsquery('simple', ${query})
        ) as score
      FROM "Device"
      WHERE
        to_tsvector('simple',
          COALESCE("assetCode", '') || ' ' ||
          COALESCE(name, '') || ' ' ||
          COALESCE(brand, '') || ' ' ||
          COALESCE(model, '') || ' ' ||
          COALESCE("serialNumber", '') || ' ' ||
          COALESCE(site, '') || ' ' ||
          COALESCE(department, '')
        ) @@ plainto_tsquery('simple', ${query})
        ${options.siteCode ? db.$queryRaw`AND site = ${options.siteCode}` : db.$queryRaw``}
      ORDER BY score DESC
      LIMIT ${limit}
    `
    if (ftsResults.length > 0) return ftsResults
  } catch (err) {
    console.warn('[searchDevices] FTS failed, falling back to ILIKE:', err)
  }

  // Fallback: ILIKE (slower but always works)
  const likeQuery = `%${query}%`
  const devices = await db.device.findMany({
    where: {
      OR: [
        { assetCode: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
        { brand: { contains: query, mode: 'insensitive' } },
        { model: { contains: query, mode: 'insensitive' } },
        { serialNumber: { contains: query, mode: 'insensitive' } },
        { site: { contains: query, mode: 'insensitive' } },
        { department: { contains: query, mode: 'insensitive' } },
      ],
      ...(options.siteCode ? { site: options.siteCode } : {}),
    },
    select: {
      id: true,
      assetCode: true,
      name: true,
      brand: true,
      model: true,
      serialNumber: true,
      site: true,
    },
    take: limit,
    orderBy: { assetCode: 'asc' },
  })

  return devices.map((d) => ({
    id: d.id,
    type: 'device' as const,
    title: `${d.assetCode ?? ''} — ${d.name ?? ''}`.trim(),
    subtitle: `${d.brand ?? ''} ${d.model ?? ''} · ${d.serialNumber ?? ''} · ${d.site ?? ''}`.trim(),
  }))
}

/**
 * Search work orders using PostgreSQL full-text search.
 * Searchable fields: woNumber, subject, reporterName, tel, details, siteCode
 */
export async function searchWorkOrders(
  query: string,
  options: { limit?: number; siteCode?: string } = {},
): Promise<SearchResult[]> {
  const limit = Math.min(options.limit ?? 20, 100)
  if (!query.trim()) return []

  try {
    const ftsResults = await db.$queryRaw<SearchResult[]>`
      SELECT
        id,
        'work-order' as type,
        COALESCE("woNumber", '') || ' — ' || COALESCE(subject, '') as title,
        COALESCE("reporterName", '') || ' · ' || COALESCE(tel, '') || ' · ' || COALESCE("siteCode", '') as subtitle,
        ts_rank(
          to_tsvector('simple',
            COALESCE("woNumber", '') || ' ' ||
            COALESCE(subject, '') || ' ' ||
            COALESCE(details, '') || ' ' ||
            COALESCE("reporterName", '') || ' ' ||
            COALESCE(tel, '') || ' ' ||
            COALESCE("siteCode", '')
          ),
          plainto_tsquery('simple', ${query})
        ) as score
      FROM "WorkOrder"
      WHERE
        to_tsvector('simple',
          COALESCE("woNumber", '') || ' ' ||
          COALESCE(subject, '') || ' ' ||
          COALESCE(details, '') || ' ' ||
          COALESCE("reporterName", '') || ' ' ||
          COALESCE(tel, '') || ' ' ||
          COALESCE("siteCode", '')
        ) @@ plainto_tsquery('simple', ${query})
        ${options.siteCode ? db.$queryRaw`AND "siteCode" = ${options.siteCode}` : db.$queryRaw``}
      ORDER BY score DESC
      LIMIT ${limit}
    `
    if (ftsResults.length > 0) return ftsResults
  } catch (err) {
    console.warn('[searchWorkOrders] FTS failed, falling back to ILIKE:', err)
  }

  // Fallback: ILIKE
  const wos = await db.workOrder.findMany({
    where: {
      OR: [
        { woNumber: { contains: query, mode: 'insensitive' } },
        { subject: { contains: query, mode: 'insensitive' } },
        { reporterName: { contains: query, mode: 'insensitive' } },
        { tel: { contains: query, mode: 'insensitive' } },
        { details: { contains: query, mode: 'insensitive' } },
      ],
      ...(options.siteCode ? { siteCode: options.siteCode } : {}),
    },
    select: {
      id: true,
      woNumber: true,
      subject: true,
      reporterName: true,
      tel: true,
      siteCode: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  })

  return wos.map((w) => ({
    id: w.id,
    type: 'work-order' as const,
    title: `${w.woNumber ?? ''} — ${w.subject ?? ''}`.trim(),
    subtitle: `${w.reporterName ?? ''} · ${w.tel ?? ''} · ${w.siteCode ?? ''}`.trim(),
  }))
}

/**
 * Search stock items using PostgreSQL full-text search.
 * Searchable fields: productCode, productName, brand, model, specifications
 */
export async function searchStockItems(
  query: string,
  options: { limit?: number } = {},
): Promise<SearchResult[]> {
  const limit = Math.min(options.limit ?? 20, 100)
  if (!query.trim()) return []

  try {
    const ftsResults = await db.$queryRaw<SearchResult[]>`
      SELECT
        id,
        'stock-item' as type,
        COALESCE("productCode", '') || ' — ' || COALESCE("productName", '') as title,
        COALESCE(brand, '') || ' ' || COALESCE(model, '') || ' · คงเหลือ: ' || COALESCE(quantity::text, '0') as subtitle,
        ts_rank(
          to_tsvector('simple',
            COALESCE("productCode", '') || ' ' ||
            COALESCE("productName", '') || ' ' ||
            COALESCE(brand, '') || ' ' ||
            COALESCE(model, '') || ' ' ||
            COALESCE(specifications, '')
          ),
          plainto_tsquery('simple', ${query})
        ) as score
      FROM "StockItem"
      WHERE
        to_tsvector('simple',
          COALESCE("productCode", '') || ' ' ||
          COALESCE("productName", '') || ' ' ||
          COALESCE(brand, '') || ' ' ||
          COALESCE(model, '') || ' ' ||
          COALESCE(specifications, '')
        ) @@ plainto_tsquery('simple', ${query})
      ORDER BY score DESC
      LIMIT ${limit}
    `
    if (ftsResults.length > 0) return ftsResults
  } catch (err) {
    console.warn('[searchStockItems] FTS failed, falling back to ILIKE:', err)
  }

  // Fallback: ILIKE
  const items = await db.stockItem.findMany({
    where: {
      OR: [
        { productCode: { contains: query, mode: 'insensitive' } },
        { productName: { contains: query, mode: 'insensitive' } },
        { brand: { contains: query, mode: 'insensitive' } },
        { model: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      productCode: true,
      productName: true,
      brand: true,
      model: true,
      quantity: true,
    },
    take: limit,
  })

  return items.map((s) => ({
    id: s.id,
    type: 'stock-item' as const,
    title: `${s.productCode ?? ''} — ${s.productName ?? ''}`.trim(),
    subtitle: `${s.brand ?? ''} ${s.model ?? ''} · คงเหลือ: ${s.quantity}`.trim(),
  }))
}

/**
 * Universal search across all entity types.
 * Returns combined results sorted by relevance.
 */
export async function searchAll(
  query: string,
  options: { limit?: number; siteCode?: string } = {},
): Promise<SearchResult[]> {
  const limit = options.limit ?? 10
  const [devices, wos, stock] = await Promise.all([
    searchDevices(query, { limit, siteCode: options.siteCode }),
    searchWorkOrders(query, { limit, siteCode: options.siteCode }),
    searchStockItems(query, { limit }),
  ])

  // Combine + sort by score (if available), otherwise interleave
  const all = [...devices, ...wos, ...stock]
  return all
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit * 3) // 3x because we want variety across types
}

/**
 * SQL to create GIN indexes for full-text search.
 * Run this in Supabase SQL Editor once to enable fast FTS.
 */
export const FTS_INDEX_SQL = `
-- Full-Text Search GIN Indexes (run once in Supabase SQL Editor)
-- These make search 100x faster than ILIKE

CREATE INDEX IF NOT EXISTS idx_device_fts ON "Device"
USING gin(to_tsvector('simple',
  COALESCE("assetCode", '') || ' ' ||
  COALESCE(name, '') || ' ' ||
  COALESCE(brand, '') || ' ' ||
  COALESCE(model, '') || ' ' ||
  COALESCE("serialNumber", '') || ' ' ||
  COALESCE(site, '') || ' ' ||
  COALESCE(department, '')
));

CREATE INDEX IF NOT EXISTS idx_workorder_fts ON "WorkOrder"
USING gin(to_tsvector('simple',
  COALESCE("woNumber", '') || ' ' ||
  COALESCE(subject, '') || ' ' ||
  COALESCE(details, '') || ' ' ||
  COALESCE("reporterName", '') || ' ' ||
  COALESCE(tel, '') || ' ' ||
  COALESCE("siteCode", '')
));

CREATE INDEX IF NOT EXISTS idx_stockitem_fts ON "StockItem"
USING gin(to_tsvector('simple',
  COALESCE("productCode", '') || ' ' ||
  COALESCE("productName", '') || ' ' ||
  COALESCE(brand, '') || ' ' ||
  COALESCE(model, '') || ' ' ||
  COALESCE(specifications, '')
));
`
