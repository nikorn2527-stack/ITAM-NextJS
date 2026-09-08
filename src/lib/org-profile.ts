/**
 * Organization Profile — ระบบจัดการ profile ขององค์กร
 *
 * ทำให้แอปยืดหยุ่น: เปลี่ยนชื่อ/โลโก้/สี/ประเภทอุตสาหกรรมได้โดยไม่กระทบข้อมูล
 * ค่าเริ่มต้น: ชื่อกลาง "ระบบจัดการสินทรัพย์" ไม่อ้างโรงพยาบาล/โรงงาน
 */

import { db } from '@/lib/db'

export interface OrgProfile {
  appName: string
  appTagline: string
  industryType: string
  logoUrl: string | null
  primaryColor: string
  accentColor: string
  language: string
  timezone: string
  currency: string
  allowExcelImport: boolean
  /**
   * Phase 3 (Phase 3.2): Terminology used in Thai asset documents.
   * Default 'ครุภัณฑ์' (government); private sector may use 'ทรัพย์สิน'
   * or 'Fixed Asset'. Used by the Asset Register report title.
   */
  assetTerminology: string
  /** Fiscal year start month (1-12). Thai gov = 10 (Oct), private = 1 (Jan). */
  fiscalYearStartMonth: number
  /** Minimum value (฿) to capitalize as a fixed asset. */
  defaultCapitalizeThreshold: number | null
}

const DEFAULT_PROFILE: OrgProfile = {
  appName: 'ระบบจัดการสินทรัพย์',
  appTagline: 'Asset Management System',
  industryType: 'general',
  logoUrl: null,
  primaryColor: '#f97316',
  accentColor: '#0d9488',
  language: 'th',
  timezone: 'Asia/Bangkok',
  currency: 'THB',
  allowExcelImport: true,
  assetTerminology: 'ครุภัณฑ์',
  fiscalYearStartMonth: 1,
  defaultCapitalizeThreshold: 10000,
}

/**
 * Get the organization profile (singleton — always the first row).
 * Falls back to defaults if not configured.
 */
export async function getOrgProfile(): Promise<OrgProfile> {
  try {
    const row = await db.organizationProfile.findFirst()
    if (!row) return DEFAULT_PROFILE
    return {
      appName: row.appName || DEFAULT_PROFILE.appName,
      appTagline: row.appTagline || DEFAULT_PROFILE.appTagline,
      industryType: row.industryType || DEFAULT_PROFILE.industryType,
      logoUrl: row.logoUrl,
      primaryColor: row.primaryColor || DEFAULT_PROFILE.primaryColor,
      accentColor: row.accentColor || DEFAULT_PROFILE.accentColor,
      language: row.language || DEFAULT_PROFILE.language,
      timezone: row.timezone || DEFAULT_PROFILE.timezone,
      currency: row.currency || DEFAULT_PROFILE.currency,
      allowExcelImport: row.allowExcelImport,
      assetTerminology: row.assetTerminology || DEFAULT_PROFILE.assetTerminology,
      fiscalYearStartMonth: row.fiscalYearStartMonth ?? DEFAULT_PROFILE.fiscalYearStartMonth,
      defaultCapitalizeThreshold:
        row.defaultCapitalizeThreshold != null
          ? Number(row.defaultCapitalizeThreshold)
          : DEFAULT_PROFILE.defaultCapitalizeThreshold,
    }
  } catch {
    return DEFAULT_PROFILE
  }
}

/**
 * Update the organization profile (upsert).
 */
export async function updateOrgProfile(updates: Partial<OrgProfile>): Promise<OrgProfile> {
  const existing = await db.organizationProfile.findFirst()
  if (existing) {
    const updated = await db.organizationProfile.update({
      where: { id: existing.id },
      data: {
        appName: updates.appName,
        appTagline: updates.appTagline,
        industryType: updates.industryType,
        logoUrl: updates.logoUrl,
        primaryColor: updates.primaryColor,
        accentColor: updates.accentColor,
        language: updates.language,
        timezone: updates.timezone,
        currency: updates.currency,
        allowExcelImport: updates.allowExcelImport,
      },
    })
    return {
      ...DEFAULT_PROFILE,
      appName: updated.appName,
      appTagline: updated.appTagline,
      industryType: updated.industryType,
      logoUrl: updated.logoUrl,
      primaryColor: updated.primaryColor,
      accentColor: updated.accentColor,
      language: updated.language,
      timezone: updated.timezone,
      currency: updated.currency,
      allowExcelImport: updated.allowExcelImport,
    }
  }
  // Create new
  const created = await db.organizationProfile.create({
    data: {
      appName: updates.appName || DEFAULT_PROFILE.appName,
      appTagline: updates.appTagline || DEFAULT_PROFILE.appTagline,
      industryType: updates.industryType || DEFAULT_PROFILE.industryType,
      logoUrl: updates.logoUrl || null,
      primaryColor: updates.primaryColor || DEFAULT_PROFILE.primaryColor,
      accentColor: updates.accentColor || DEFAULT_PROFILE.accentColor,
      language: updates.language || DEFAULT_PROFILE.language,
      timezone: updates.timezone || DEFAULT_PROFILE.timezone,
      currency: updates.currency || DEFAULT_PROFILE.currency,
      allowExcelImport: updates.allowExcelImport ?? true,
    },
  })
  return {
    ...DEFAULT_PROFILE,
    appName: created.appName,
    appTagline: created.appTagline,
    industryType: created.industryType,
    logoUrl: created.logoUrl,
    primaryColor: created.primaryColor,
    accentColor: created.accentColor,
    language: created.language,
    timezone: created.timezone,
    currency: created.currency,
    allowExcelImport: created.allowExcelImport,
  }
}

/**
 * Industry type labels (Thai) — generic, not org-specific.
 * Uses @/lib/glossary as single source of truth.
 */
export const INDUSTRY_LABELS: Record<string, string> = {
  general: 'ทั่วไป',
  office: 'สำนักงาน',
  corporate: 'องค์กร',
  education: 'สถาบันการศึกษา',
  government: 'หน่วยงานรัฐ',
  healthcare: 'สถานพยาบาล',
  industrial: 'อุตสาหกรรม',
}
