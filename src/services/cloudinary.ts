// Cloudinary Universal Cloud Storage Service (Server-Signed Upload)
// All API secrets remain strictly on the backend server (/api/files/cloudinary-upload).

import { apiUpload, apiGet } from './api'

export interface CloudinaryConfig {
  cloudName: string
  uploadPreset?: string
  folder: string
}

const STORAGE_KEY = 'msg_cloudinary_config'

export function getStoredCloudinaryConfig(): CloudinaryConfig {
  const envCloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || ''
  const envPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || ''
  const envFolder = import.meta.env.VITE_CLOUDINARY_FOLDER || 'msg-oilfield-erp'

  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        cloudName: parsed.cloudName || envCloudName,
        uploadPreset: parsed.uploadPreset || envPreset,
        folder: parsed.folder || envFolder,
      }
    }
  } catch {}

  return {
    cloudName: envCloudName,
    uploadPreset: envPreset,
    folder: envFolder,
  }
}

export function saveCloudinaryConfig(config: Partial<CloudinaryConfig>): void {
  const current = getStoredCloudinaryConfig()
  const updated = { ...current, ...config }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }
}

export function isCloudinaryConfigured(): boolean {
  const config = getStoredCloudinaryConfig()
  return Boolean(config.cloudName)
}

export interface CloudinaryUploadResponse {
  success: boolean
  url?: string
  secureUrl?: string
  publicId?: string
  format?: string
  bytes?: number
  originalFilename?: string
  error?: string
}

/**
 * Upload a file (PDF, Excel, Image, ZIP) via backend server-signed Cloudinary endpoint.
 */
export async function uploadToCloudinary(
  file: File | Blob | Uint8Array,
  fileName: string,
  subFolder: 'mtcs' | 'excels' | 'general' = 'mtcs'
): Promise<CloudinaryUploadResponse> {
  try {
    const res = await apiUpload<any>('/api/files/cloudinary-upload', file, fileName, {
      sub_folder: subFolder,
    })
    return {
      success: Boolean(res.success),
      url: res.url,
      secureUrl: res.url,
      publicId: res.public_id,
      bytes: res.bytes,
      originalFilename: fileName,
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Server Cloudinary upload unavailable.',
    }
  }
}

export async function testCloudinaryConnection(
  _cloudName?: string,
  _uploadPreset?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const health = await apiGet<any>('/api/health')
    if (health.cloudinaryConfigured) {
      const probe = new Blob(['probe'], { type: 'text/plain' })
      const res = await uploadToCloudinary(probe, 'probe.txt', 'general')
      if (res.success && res.secureUrl) {
        return {
          success: true,
          message: 'Connected to Cloudinary CDN via secure server-signed upload!',
        }
      }
      return { success: false, message: res.error || 'Cloudinary probe failed.' }
    }
    return { success: false, message: 'Cloudinary credentials not configured on backend server.' }
  } catch (err: any) {
    return { success: false, message: err.message || 'Error testing Cloudinary backend.' }
  }
}
