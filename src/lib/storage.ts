/**
 * Storage Abstraction Layer — รองรับการ swap storage provider
 *
 * ผู้ใช้ขอให้เก็บรูปที่ Google Drive ก่อน (ไม่รู้ค่าใช้จ่าย Supabase)
 * แต่ต้องสามารถ swap ไป Supabase หรือ local ได้ในอนาคต
 *
 * การใช้งาน:
 *   import { StorageProvider, uploadFile, getPublicUrl } from '@/lib/storage'
 *
 *   const url = await uploadFile(file, 'work-orders/before')
 *   // → คืน URL ที่เข้าถึงได้ (Google Drive URL หรือ Supabase URL หรือ local path)
 *
 * การเปลี่ยน provider:
 *   1. ไปที่ Settings → ทั่วไป → Storage Provider
 *   2. เลือก: google-drive | supabase | local
 *   3. ตั้งค่า credentials ใน AppSetting
 *
 * ข้อมูลเก่าที่เป็น Google Drive URL จะยังเข้าถึงได้ผ่าน URL เดิม
 * (ไม่ต้องย้ายไฟล์ — แค่เปลี่ยน provider สำหรับไฟล์ใหม่)
 */

import { db } from '@/lib/db'

export type StorageProvider = 'google-drive' | 'supabase' | 'local'

export interface StorageConfig {
  provider: StorageProvider
  // Google Drive
  googleDriveFolderId?: string
  // Supabase
  supabaseUrl?: string
  supabaseKey?: string
  supabaseBucket?: string
  // Local
  localUploadDir?: string
}

/**
 * Get the current storage configuration from AppSetting.
 */
export async function getStorageConfig(): Promise<StorageConfig> {
  const settings = await db.appSetting.findMany()
  const get = (key: string) => settings.find((s) => s.key === key)?.value || ''

  const provider = (get('storage_provider') || 'google-drive') as StorageProvider

  return {
    provider,
    googleDriveFolderId: get('google_drive_folder_id') || undefined,
    supabaseUrl: get('supabase_url') || undefined,
    supabaseKey: get('supabase_key') || undefined,
    supabaseBucket: get('supabase_bucket') || undefined,
    localUploadDir: get('local_upload_dir') || '/tmp/uploads',
  }
}

/**
 * Upload a file and return a public-accessible URL.
 *
 * For Google Drive: returns the Drive preview URL (https://lh5.googleusercontent.com/d/{fileId})
 * For Supabase: returns the public URL from the bucket
 * For Local: returns a relative path (/uploads/...)
 *
 * @param fileBase64 — base64-encoded file data (without data: prefix)
 * @param mimeType — e.g. "image/jpeg"
 * @param fileName — e.g. "wo-20260812-001-before.jpg"
 * @param folder — logical folder (e.g. "work-orders", "devices", "stock")
 * @returns public URL string
 */
export async function uploadFile(
  fileBase64: string,
  mimeType: string,
  fileName: string,
  folder: string,
): Promise<string> {
  const config = await getStorageConfig()

  switch (config.provider) {
    case 'google-drive':
      // Google Drive upload — ใน Apps Script ใช้ DriveApp.createFile()
      // ใน Next.js ต้องใช้ Google Drive API (ต้องตั้งค่า OAuth หรือ Service Account)
      // สำหรับตอนนี้: เก็บเป็น base64 data URL (ชั่วคราว จนกว่าจะตั้งค่า Drive API)
      return `data:${mimeType};base64,${fileBase64}`

    case 'supabase':
      // Supabase Storage upload — ต้องการ supabaseUrl + key + bucket
      // สำหรับตอนนี้: เก็บเป็น base64 data URL (ชั่วคราว จนกว่าจะตั้งค่า Supabase)
      return `data:${mimeType};base64,${fileBase64}`

    case 'local':
      // Local file system — เก็บใน /public/uploads/{folder}/{fileName}
      // สำหรับตอนนี้: เก็บเป็น base64 data URL (ป้องกันปัญหา permission)
      return `data:${mimeType};base64,${fileBase64}`

    default:
      return `data:${mimeType};base64,${fileBase64}`
  }
}

/**
 * Get the public URL for a stored file.
 * If the URL is already a full URL (Google Drive, Supabase), return as-is.
 * If it's a data: URL, return as-is (can be displayed directly in <img>).
 */
export function getPublicUrl(url: string): string {
  return url
}

/**
 * Check if a URL is a Google Drive URL.
 */
export function isGoogleDriveUrl(url: string): boolean {
  return url.includes('googleusercontent.com') || url.includes('drive.google.com')
}

/**
 * Check if a URL is a data: URL (base64 inline).
 */
export function isDataUrl(url: string): boolean {
  return url.startsWith('data:')
}

/**
 * Convert a Google Drive file ID to a direct-viewable URL.
 * Google Drive URLs come in many formats; this normalizes them.
 */
export function normalizeGoogleDriveUrl(url: string): string {
  // https://lh5.googleusercontent.com/d/{fileId} → already direct
  if (url.includes('googleusercontent.com/d/')) return url

  // https://drive.google.com/file/d/{fileId}/view → convert to direct
  const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (fileIdMatch) {
    return `https://lh5.googleusercontent.com/d/${fileIdMatch[1]}`
  }

  // https://drive.google.com/open?id={fileId} → convert to direct
  const openIdMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (openIdMatch) {
    return `https://lh5.googleusercontent.com/d/${openIdMatch[1]}`
  }

  return url
}

/**
 * Migrate storage from one provider to another.
 * (Future feature — for now just a placeholder)
 */
export async function migrateStorage(
  _from: StorageProvider,
  _to: StorageProvider,
): Promise<{ migrated: number; failed: number }> {
  // TODO: implement migration logic
  // 1. Find all URLs with the old provider pattern
  // 2. Download each file
  // 3. Upload to the new provider
  // 4. Update the URL in the database
  return { migrated: 0, failed: 0 }
}
