// Cloudinary Universal Cloud Storage Service for MSG Oilfield ERP
// Handles direct high-speed CDN upload for MTC Certificates (PDFs), Excel sheets (.xlsx), and ZIP Archives.

export interface CloudinaryConfig {
  cloudName: string
  apiKey?: string
  apiSecret?: string
  uploadPreset?: string
  folder: string
}

const STORAGE_KEY = 'msg_cloudinary_config'

// Default bundled production credentials from MSG Oilfield infrastructure
const DEFAULT_CLOUD_NAME = 'za7di1ec'
const DEFAULT_API_KEY = '729516663361263'
const DEFAULT_API_SECRET = 'FlafntwcdkclylxQj64P9KbCs44'
const DEFAULT_FOLDER = 'msg-oilfield-erp'

export function getStoredCloudinaryConfig(): CloudinaryConfig {
  const envCloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUD_NAME
  const envApiKey = import.meta.env.VITE_CLOUDINARY_API_KEY || DEFAULT_API_KEY
  const envApiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET || DEFAULT_API_SECRET
  const envPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || ''
  const envFolder = import.meta.env.VITE_CLOUDINARY_FOLDER || DEFAULT_FOLDER

  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        cloudName: parsed.cloudName || envCloudName,
        apiKey: parsed.apiKey || envApiKey,
        apiSecret: parsed.apiSecret || envApiSecret,
        uploadPreset: parsed.uploadPreset || envPreset,
        folder: parsed.folder || envFolder
      }
    }
  } catch {}

  return {
    cloudName: envCloudName,
    apiKey: envApiKey,
    apiSecret: envApiSecret,
    uploadPreset: envPreset,
    folder: envFolder
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
  const hasSigned = Boolean(config.cloudName && config.apiKey && config.apiSecret)
  const hasUnsigned = Boolean(config.cloudName && config.uploadPreset)
  return Boolean(config.cloudName && (hasSigned || hasUnsigned))
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

async function generateSha1Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buffer = new TextEncoder().encode(text)
    const hash = await crypto.subtle.digest('SHA-1', buffer)
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  return ''
}

/**
 * Upload a file (PDF, Excel, Image, ZIP) to Cloudinary via Direct Signed CDN Upload or Preset.
 */
export async function uploadToCloudinary(
  file: File | Blob | Uint8Array,
  fileName: string,
  subFolder: 'mtcs' | 'excels' | 'general' = 'mtcs'
): Promise<CloudinaryUploadResponse> {
  const config = getStoredCloudinaryConfig()

  if (!isCloudinaryConfigured()) {
    return {
      success: false,
      error: 'Cloudinary credentials are not configured.'
    }
  }

  try {
    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const targetFolder = `${config.folder}/${subFolder}`

    let fileBlob: Blob
    if (file instanceof Uint8Array) {
      fileBlob = new Blob([file as any], {
        type: fileName.endsWith('.xlsx')
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'
      })
    } else {
      fileBlob = file
    }

    const formData = new FormData()
    formData.append('file', fileBlob, cleanName)

    const isSigned = Boolean(config.apiKey && config.apiSecret)
    if (isSigned) {
      const timestamp = Math.round(Date.now() / 1000)
      const strToSign = `folder=${targetFolder}&timestamp=${timestamp}${config.apiSecret}`
      const signature = await generateSha1Hex(strToSign)

      formData.append('api_key', config.apiKey!.trim())
      formData.append('timestamp', String(timestamp))
      formData.append('folder', targetFolder)
      formData.append('signature', signature)
    } else {
      formData.append('upload_preset', (config.uploadPreset || '').trim())
      formData.append('folder', targetFolder)
    }

    // Try 'raw' endpoint first for PDFs/Docs, with 'auto' fallback
    const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName.trim()}/raw/upload`

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      // Fallback attempt with 'auto' endpoint
      const autoEndpoint = `https://api.cloudinary.com/v1_1/${config.cloudName.trim()}/auto/upload`
      const autoResponse = await fetch(autoEndpoint, {
        method: 'POST',
        body: formData
      })
      const autoData = await autoResponse.json()

      if (!autoResponse.ok || autoData.error) {
        return {
          success: false,
          error: data.error?.message || autoData.error?.message || `Upload failed with status ${response.status}`
        }
      }

      return {
        success: true,
        url: autoData.secure_url || autoData.url,
        secureUrl: autoData.secure_url || autoData.url,
        publicId: autoData.public_id,
        bytes: autoData.bytes,
        originalFilename: cleanName
      }
    }

    return {
      success: true,
      url: data.secure_url || data.url,
      secureUrl: data.secure_url || data.url,
      publicId: data.public_id,
      format: data.format,
      bytes: data.bytes,
      originalFilename: cleanName
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Network error communicating with Cloudinary CDN.'
    }
  }
}

/**
 * Test connectivity and upload permissions with Cloudinary
 */
export async function testCloudinaryConnection(
  cloudName?: string,
  uploadPreset?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const config = getStoredCloudinaryConfig()
    const targetCloud = (cloudName || config.cloudName || '').trim()
    if (!targetCloud) {
      return { success: false, message: 'Cloudinary Cloud Name is required.' }
    }

    const probe = new Blob(['probe'], { type: 'text/plain' })
    const res = await uploadToCloudinary(probe, 'probe.txt', 'general')
    if (res.success && res.secureUrl) {
      return {
        success: true,
        message: `Connected to Cloudinary CDN (${targetCloud})! Universal document & certificate upload is active.`
      }
    }
    return {
      success: false,
      message: res.error || 'Failed to verify Cloudinary credentials.'
    }
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error connecting to Cloudinary.'
    }
  }
}

