/**
 * storage.ts — Unified storage abstraction layer.
 *
 * Automatically picks the best available storage provider:
 *   1. Cloudflare R2 (preferred — no egress fees, 10GB free, global CDN)
 *   2. Vercel Blob (fallback — 1GB free, integrated with Vercel)
 *   3. Supabase Storage (fallback — 1GB free, RLS support)
 *   4. In-memory (dev only — no persistence)
 *
 * This lets the app work in any environment without code changes:
 *   - Dev (no storage configured): in-memory
 *   - Vercel (Blob configured): Vercel Blob
 *   - Production (R2 configured): Cloudflare R2
 *
 * Usage:
 *   import { uploadImage, getFileUrl, deleteFile, getStorageProvider } from '@/lib/storage'
 *
 *   const provider = getStorageProvider()  // 'r2' | 'vercel-blob' | 'supabase' | 'memory'
 *   const { url } = await uploadImage(buffer, 'jpg', 'wo-photos')
 */

import { isR2Configured, uploadFile as r2Upload, getFileUrl as r2GetUrl, deleteFile as r2Delete, uploadImage as r2UploadImage } from './r2-storage'
import { isBlobConfigured } from './vercel-blob-storage'
import { isStorageConfigured as isSupabaseConfigured, uploadImage as supabaseUploadImage, getPublicUrl as supabaseGetUrl, deleteImage as supabaseDelete } from './supabase-storage'

export type StorageProvider = 'r2' | 'vercel-blob' | 'supabase' | 'memory'

/** In-memory storage (dev only — clears on restart) */
const memoryStore = new Map<string, { content: Buffer; contentType: string }>()

/**
 * Get the active storage provider (in priority order).
 */
export function getStorageProvider(): StorageProvider {
  if (isR2Configured()) return 'r2'
  if (isBlobConfigured()) return 'vercel-blob'
  if (isSupabaseConfigured()) return 'supabase'
  return 'memory'
}

/**
 * Check if any storage provider is configured.
 */
export function isStorageConfigured(): boolean {
  return getStorageProvider() !== 'memory'
}

/**
 * Upload an image to the active storage provider.
 *
 * @param buffer — file content as Buffer or Uint8Array
 * @param extension — file extension (jpg, png, webp)
 * @param folder — destination folder (e.g. 'wo-photos', 'device-images')
 * @returns { url, key, provider }
 */
export async function uploadImage(
  buffer: Buffer | Uint8Array,
  extension: string,
  folder: string = 'uploads',
): Promise<{ url: string; key: string; provider: StorageProvider }> {
  const provider = getStorageProvider()

  switch (provider) {
    case 'r2': {
      const result = await r2UploadImage(buffer, extension, folder)
      return { ...result, provider }
    }
    case 'vercel-blob': {
      // Use Vercel Blob
      const { uploadToBlob } = await import('./vercel-blob-storage')
      const contentType = `image/${extension === 'jpg' ? 'jpeg' : extension}`
      const key = `${folder}/${crypto.randomUUID()}.${extension}`
      const result = await uploadToBlob(buffer, key, contentType)
      return { url: result.url, key: result.pathname, provider }
    }
    case 'supabase': {
      const contentType = `image/${extension === 'jpg' ? 'jpeg' : extension}`
      const key = `${folder}/${crypto.randomUUID()}.${extension}`
      const result = await supabaseUploadImage(buffer, key, key, contentType)
      return { url: result.url, key: result.path, provider }
    }
    case 'memory': {
      // Dev fallback — return data URL
      const key = `${folder}/${crypto.randomUUID()}.${extension}`
      const contentType = `image/${extension === 'jpg' ? 'jpeg' : extension}`
      memoryStore.set(key, {
        content: Buffer.from(buffer),
        contentType,
      })
      // Return data URL for dev
      const b64 = Buffer.from(buffer).toString('base64')
      const dataUrl = `data:${contentType};base64,${b64}`
      return { url: dataUrl, key, provider: 'memory' }
    }
  }
}

/**
 * Get public URL for a stored file.
 * Note: only works for R2 and Supabase (public buckets).
 * For Vercel Blob, the URL is returned at upload time.
 */
export function getFileUrl(key: string): string {
  const provider = getStorageProvider()

  switch (provider) {
    case 'r2':
      return r2GetUrl(key)
    case 'supabase':
      return supabaseGetUrl('uploads', key)
    case 'vercel-blob':
      // Vercel Blob URLs are returned at upload time, not reconstructable
      return ''
    case 'memory':
      const stored = memoryStore.get(key)
      if (!stored) return ''
      const b64 = stored.content.toString('base64')
      return `data:${stored.contentType};base64,${b64}`
  }
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(key: string): Promise<void> {
  const provider = getStorageProvider()

  switch (provider) {
    case 'r2':
      await r2Delete(key)
      break
    case 'supabase':
      await supabaseDelete('uploads', key)
      break
    case 'vercel-blob': {
      const { del } = await import('@vercel/blob')
      // Vercel Blob needs full URL — caller should pass URL instead of key
      try {
        await del(key)
      } catch {
        // ignore — may not be a valid URL
      }
      break
    }
    case 'memory':
      memoryStore.delete(key)
      break
  }
}

/**
 * Upload a raw file (any content type, not just images).
 */
export async function uploadFile(
  content: Buffer | Uint8Array | string,
  key: string,
  contentType: string,
): Promise<{ url: string; key: string; provider: StorageProvider }> {
  const provider = getStorageProvider()

  switch (provider) {
    case 'r2': {
      const result = await r2Upload(content, key, contentType)
      return { url: result.url, key: result.key, provider }
    }
    case 'vercel-blob': {
      const { uploadToBlob } = await import('./vercel-blob-storage')
      const result = await uploadToBlob(content, key, contentType)
      return { url: result.url, key: result.pathname, provider }
    }
    case 'supabase': {
      const result = await supabaseUploadImage(content, 'uploads', key, contentType)
      return { url: result.url, key: result.path, provider }
    }
    case 'memory': {
      memoryStore.set(key, {
        content: Buffer.isBuffer(content)
          ? content
          : Buffer.from(typeof content === 'string' ? content : content),
        contentType,
      })
      const b64 = Buffer.isBuffer(content)
        ? content.toString('base64')
        : Buffer.from(content).toString('base64')
      return {
        url: `data:${contentType};base64,${b64}`,
        key,
        provider: 'memory',
      }
    }
  }
}

/**
 * Get storage status for health check / dashboard.
 */
export function getStorageStatus() {
  return {
    provider: getStorageProvider(),
    r2: isR2Configured(),
    vercelBlob: isBlobConfigured(),
    supabase: isSupabaseConfigured(),
  }
}
