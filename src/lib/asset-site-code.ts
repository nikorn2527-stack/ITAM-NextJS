/**
 * asset-site-code.ts — helpers for the per-site AssetSiteCode (e.g. `UDH-00001`).
 *
 * Format:  `<SITE_CODE>-<NNNNN>`  (5-digit zero-padded sequence)
 *
 * Behavior mirrors the Apps Script version (SettingsService.gs +
 * DeviceService.gs `getNextAssetSiteCode`):
 *   • Look up the SiteAttribute.siteCode for the given siteName.
 *   • Find the MAX existing AssetSiteCode for that site in the devices table.
 *   • If the device was previously at this site (per Location_History),
 *     REUSE the old AssetSiteCode (the Apps Script version says
 *     "ใช้ทะเบียน Site เดิมเมื่อย้ายกลับ Site ที่เคยอยู่").
 *   • Otherwise increment + format.
 *
 * This module imports `db`, so it is SERVER-ONLY. Do not import from
 * client components.
 */

import { db } from '@/lib/db'

const DEFAULT_WIDTH = 5

/**
 * Pull the numeric seed out of an AssetSiteCode like `UDH-00001` → 1.
 * Returns 0 if the value is null/empty/malformed.
 */
export function parseAssetSiteCodeSeed(code: string | null | undefined): number {
  if (!code) return 0
  // Accept `PREFIX-NNNNN` or just `NNNNN`
  const m = String(code).match(/(\d+)\s*$/)
  if (!m) return 0
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : 0
}

/**
 * Format a prefix + numeric seed as an AssetSiteCode: `UDH` + 1 → `UDH-00001`.
 */
export function formatAssetSiteCode(
  prefix: string,
  num: number,
  width = DEFAULT_WIDTH,
): string {
  const safePrefix = (prefix || '').trim().toUpperCase()
  const safeNum = Math.max(0, Math.floor(num))
  return `${safePrefix}-${String(safeNum).padStart(width, '0')}`
}

/**
 * Normalize for comparison — strip whitespace, uppercase, leading zeros stripped
 * from the numeric portion so `UDH-00001` and `UDH-1` compare equal.
 */
export function normalizeAssetSiteCodeForCompare(code: string | null | undefined): string {
  if (!code) return ''
  const s = String(code).trim().toUpperCase()
  const m = s.match(/^([A-Z]+)-0*(\d+)$/)
  if (m) return `${m[1]}-${m[2]}`
  return s
}

/**
 * Look up the SiteCode prefix for a given siteName (e.g. "โรงพยาบาลศูนย์อุดรธานี" → "UDH").
 * Returns null if the site is not found in SiteAttribute.
 */
export async function getSiteCodeForName(siteName: string | null | undefined): Promise<string | null> {
  if (!siteName) return null
  const site = await db.siteAttribute.findFirst({
    where: { siteName: { equals: siteName } },
    select: { siteCode: true },
  })
  return site?.siteCode ?? null
}

/**
 * Reverse lookup — given a SiteCode, find the siteName.
 */
export async function getSiteNameForCode(siteCode: string | null | undefined): Promise<string | null> {
  if (!siteCode) return null
  const site = await db.siteAttribute.findUnique({
    where: { siteCode },
    select: { siteName: true },
  })
  return site?.siteName ?? null
}

/**
 * Compute the NEXT AssetSiteCode for a device being moved to `targetSiteName`.
 *
 * Algorithm (matches Apps Script):
 *   1. If `assetNo` already has a history entry with `toSite === targetSiteName`
 *      (i.e. the device has lived at this site before), REUSE the AssetSiteCode
 *      from that historical record (`toAssetSiteCode`).
 *   2. Otherwise find MAX(AssetSiteCode) for the target site among ALL devices
 *      and return PREFIX-(MAX+1).
 *   3. If no device exists at the target site yet, start at PREFIX-00001.
 *
 * The caller is responsible for actually persisting the new code on the device
 * row (the transfer endpoint does this inside its transaction).
 */
export async function getNextAssetSiteCode(
  targetSiteName: string,
  options?: { assetNo?: string | null; reuseFromHistory?: boolean },
): Promise<string | null> {
  const prefix = await getSiteCodeForName(targetSiteName)
  if (!prefix) {
    // No SiteAttribute row → fall back to the raw site name (uppercased) so
    // the transfer still works even if the admin hasn't configured SiteCode.
    const fallback = (targetSiteName || '').trim().toUpperCase().slice(0, 6) || null
    if (!fallback) return null
    return continueWithPrefix(fallback, targetSiteName, options)
  }
  return continueWithPrefix(prefix, targetSiteName, options)
}

async function continueWithPrefix(
  prefix: string,
  targetSiteName: string,
  options?: { assetNo?: string | null; reuseFromHistory?: boolean },
): Promise<string> {
  const reuse = options?.reuseFromHistory !== false

  // 1. Reuse from history if applicable
  if (reuse && options?.assetNo) {
    const hist = await db.locationHistory.findFirst({
      where: {
        assetNo: options.assetNo,
        toSite: targetSiteName,
        toAssetSiteCode: { not: null },
      },
      orderBy: { moveDate: 'desc' },
      select: { toAssetSiteCode: true },
    })
    if (hist?.toAssetSiteCode) {
      // Reuse the exact prior code — matches GAS behavior.
      return hist.toAssetSiteCode
    }
  }

  // 2. Find MAX assetSiteCode across all devices currently at this site
  //    (and also any historical references, to avoid collisions).
  const devicesAtSite = await db.device.findMany({
    where: { site: targetSiteName, assetSiteCode: { not: null } },
    select: { assetSiteCode: true },
    orderBy: { assetSiteCode: 'desc' },
    take: 1,
  })
  let maxSeed = 0
  if (devicesAtSite.length > 0 && devicesAtSite[0].assetSiteCode) {
    maxSeed = parseAssetSiteCodeSeed(devicesAtSite[0].assetSiteCode)
  }
  // Also probe Location_History for any higher historical code we should not collide with.
  const histMax = await db.locationHistory.findFirst({
    where: { toSite: targetSiteName, toAssetSiteCode: { not: null } },
    orderBy: { toAssetSiteCode: 'desc' },
    select: { toAssetSiteCode: true },
    take: 1,
  })
  if (histMax?.toAssetSiteCode) {
    maxSeed = Math.max(maxSeed, parseAssetSiteCodeSeed(histMax.toAssetSiteCode))
  }

  const nextSeed = maxSeed + 1
  return formatAssetSiteCode(prefix, nextSeed)
}
