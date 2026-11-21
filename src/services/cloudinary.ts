// Cloudinary Universal Cloud Storage Service for MSG Oilfield ERP
// Handles direct high-speed CDN upload for MTC Certificates (PDFs), Excel sheets (.xlsx), and ZIP Archives.

export interface CloudinaryConfig {
  cloudName: string
  uploadPreset: string
  folder: string
}

const STORAGE_KEY = 'msg_cloudinary_config'

export function getStoredCloudinaryConfig(): CloudinaryConfig {
  const envCloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || ''
  const envPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || ''
  const envFolder = import.meta.env.VITE_CLOUDINARY_FOLDER || 'msg-oilfield-erp'

  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        cloudName: parsed.cloudName || envCloudName,
        uploadPreset: parsed.uploadPreset || envPreset,
        folder: parsed.folder || envFolder
      }
    }
  } catch {}

  return {
    cloudName: envCloudName,
    uploadPreset: envPreset,
    folder: envFolder
  }
}

export function saveCloudinaryConfig(config: Partial<CloudinaryConfig>): void {
  const current = getStoredCloudinaryConfig()
  const updated = { ...current, ...config }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export function isCloudinaryConfigured(): boolean {
  const config = getStoredCloudinaryConfig()
  return Boolean(config.cloudName && config.cloudName.trim() && config.uploadPreset && config.uploadPreset.trim())
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
 * Upload a file (PDF, Excel, Image, ZIP) to Cloudinary via Unsigned Upload Preset.
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
      error: 'Cloudinary Cloud Name or Upload Preset is not configured.'
    }
  }

  try {
    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const targetFolder = `${config.folder}/${subFolder}`

    let fileBlob: Blob
    if (file instanceof Uint8Array) {
      fileBlob = new Blob([file as any], { type: fileName.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf' })
    } else {
      fileBlob = file
    }

    const formData = new FormData()
    formData.append('file', fileBlob, cleanName)
    formData.append('upload_preset', config.uploadPreset.trim())
    formData.append('folder', targetFolder)

    // For PDFs, spreadsheets and documents, Cloudinary uses 'auto' or 'raw'
    const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName.trim()}/auto/upload`

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      // Fallback attempt with 'raw' resource type if 'auto' fails for arbitrary document formats
      const rawEndpoint = `https://api.cloudinary.com/v1_1/${config.cloudName.trim()}/raw/upload`
      const rawResponse = await fetch(rawEndpoint, {
        method: 'POST',
        body: formData
      })
      const rawData = await rawResponse.json()

      if (!rawResponse.ok || rawData.error) {
        return {
          success: false,
          error: data.error?.message || rawData.error?.message || `Upload failed with status ${response.status}`
        }
      }

      return {
        success: true,
        url: rawData.secure_url || rawData.url,
        secureUrl: rawData.secure_url || rawData.url,
        publicId: rawData.public_id,
        bytes: rawData.bytes,
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
 * Ping test to verify Cloudinary Cloud Name and Upload Preset credentials.
 */
export async function testCloudinaryConnection(
  cloudName: string,
  uploadPreset: string
): Promise<{ success: boolean; message: string }> {
  if (!cloudName.trim() || !uploadPreset.trim()) {
    return { success: false, message: 'Please provide both Cloud Name and Upload Preset.' }
  }

  try {
    // 1-pixel test payload
    const testBlob = new Blob(['MSG OILFIELD ERP CDN TEST'], { type: 'text/plain' })
    const formData = new FormData()
    formData.append('file', testBlob, 'test_ping.txt')
    formData.append('upload_preset', uploadPreset.trim())
    formData.append('folder', 'msg-oilfield-erp/tests')

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName.trim()}/raw/upload`, {
      method: 'POST',
      body: formData
    })

    const data = await response.json()
    if (response.ok && data.secure_url) {
      return {
        success: true,
        message: `Connected successfully to Cloudinary! CDN is ready for MTC certificates & Excel files.`
      }
    } else {
      return {
        success: false,
        message: data.error?.message || `Cloudinary rejected test upload (HTTP ${response.status}). Ensure preset is Unsigned.`
      }
    }
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Could not connect to Cloudinary endpoint.'
    }
  }
}
