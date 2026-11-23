// Certificate Vault & Raw Byte Storage for MSG Oilfield Equipment Trading LLC
// Guarantees zero alteration, 100% byte-for-byte preservation of authentic supplier PDFs from ZIP files.

export interface StoredCertificateEntry {
  bytes: Uint8Array
  fileName: string
  mimeType: string
  url: string
  detectedHeat?: string
  extractedText?: string
}

export interface ManifestCertificate {
  fileName: string
  url: string
  heatNumber: string
  fileSize: number
}

export const uploadedCertificatesCache = new Map<string, StoredCertificateEntry>()
let manifestCache: ManifestCertificate[] | null = null

export async function getVaultManifest(): Promise<ManifestCertificate[]> {
  if (manifestCache && manifestCache.length > 0) return manifestCache
  try {
    const res = await fetch('/certificates/manifest.json')
    if (res.ok) {
      manifestCache = await res.json()
      return manifestCache || []
    }
  } catch (e) {
    console.warn('Could not load /certificates/manifest.json:', e)
  }
  return []
}

export function registerUploadedCertificate(
  nameOrHeat: string,
  bytes: Uint8Array,
  fileName: string,
  detectedHeat?: string,
  extractedText?: string
): string {
  const blob = new Blob([bytes as any], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const entry: StoredCertificateEntry = { bytes, fileName, mimeType: 'application/pdf', url, detectedHeat, extractedText }

  uploadedCertificatesCache.set(nameOrHeat.toLowerCase().trim(), entry)
  uploadedCertificatesCache.set(fileName.toLowerCase().trim(), entry)
  const cleanKey = nameOrHeat.replace(/\.[^/.]+$/, '').toLowerCase().trim()
  uploadedCertificatesCache.set(cleanKey, entry)
  if (detectedHeat) {
    uploadedCertificatesCache.set(detectedHeat.toLowerCase().trim(), entry)
    const pureAlphaNum = detectedHeat.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    if (pureAlphaNum) uploadedCertificatesCache.set(pureAlphaNum, entry)
  }
  return url
}

export function getUploadedCertificateBytes(refOrHeatOrDocName?: string): Uint8Array | null {
  if (!refOrHeatOrDocName) return null
  const key = refOrHeatOrDocName.toLowerCase().trim()
  const entry = uploadedCertificatesCache.get(key)
  if (entry) return entry.bytes

  const cleanKey = key.replace(/\.[^/.]+$/, '').trim()
  const cleanEntry = uploadedCertificatesCache.get(cleanKey)
  if (cleanEntry) return cleanEntry.bytes

  const pureKey = key.replace(/[^a-zA-Z0-9]/g, '')
  if (pureKey) {
    const pureEntry = uploadedCertificatesCache.get(pureKey)
    if (pureEntry) return pureEntry.bytes
  }

  return null
}

// Retrieves authentic certificate bytes asynchronously from memory or bulk zip vault
export async function getAuthenticCertificateBytes(
  refOrDocName?: string,
  heatNumber?: string,
  description?: string
): Promise<{ bytes: Uint8Array; fileName: string; heatNumber?: string } | null> {
  // 1. Check in-memory uploaded cache
  if (refOrDocName) {
    const b = getUploadedCertificateBytes(refOrDocName)
    if (b) {
      const entry = uploadedCertificatesCache.get(refOrDocName.toLowerCase().trim())
      return { bytes: b, fileName: entry?.fileName || refOrDocName, heatNumber: entry?.detectedHeat || heatNumber }
    }
  }

  if (heatNumber) {
    const b = getUploadedCertificateBytes(heatNumber)
    if (b) {
      const entry = uploadedCertificatesCache.get(heatNumber.toLowerCase().trim())
      return { bytes: b, fileName: entry?.fileName || heatNumber, heatNumber: entry?.detectedHeat || heatNumber }
    }
  }

  // 2. Search extracted bulk zip vault manifest (338 authentic supplier certificates)
  const manifest = await getVaultManifest()
  if (manifest && manifest.length > 0) {
    const cleanHeat = (heatNumber || '').trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const cleanRef = (refOrDocName || '').trim().toLowerCase()

    let matchedEntry: ManifestCertificate | undefined

    // A. Match by exact or partial heat number
    if (cleanHeat && cleanHeat.length >= 3) {
      matchedEntry = manifest.find(m => {
        const mHeat = (m.heatNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
        if (mHeat && (mHeat === cleanHeat || mHeat.startsWith(cleanHeat) || cleanHeat.startsWith(mHeat))) {
          return true
        }
        const fnUpper = m.fileName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
        return fnUpper.includes(cleanHeat)
      })
    }

    // B. Match by certificate reference or filename
    if (!matchedEntry && cleanRef && cleanRef !== 'mtc-ref' && cleanRef !== 'null') {
      matchedEntry = manifest.find(m => {
        const fn = m.fileName.toLowerCase()
        return fn.includes(cleanRef) || cleanRef.includes(fn.replace(/\.pdf$/i, ''))
      })
    }

    // C. Match by item description keywords (e.g. "ELBOW 90 DEG 6 SCH.80")
    if (!matchedEntry && description) {
      const descUpper = description.toUpperCase()
      matchedEntry = manifest.find(m => {
        const fn = m.fileName.toUpperCase()
        if (descUpper.includes('ELBOW 90') && fn.includes('ELBOW 90') && descUpper.includes('SCH.80') && fn.includes('SCH.80')) {
          return true
        }
        if (descUpper.includes('FLANGE') && fn.includes('FLANGE') && descUpper.includes('10') && fn.includes('10')) {
          return true
        }
        return false
      })
    }

    if (matchedEntry) {
      try {
        const resp = await fetch(encodeURI(matchedEntry.url))
        if (resp.ok) {
          const buf = await resp.arrayBuffer()
          const bytes = new Uint8Array(buf)
          registerUploadedCertificate(matchedEntry.fileName, bytes, matchedEntry.fileName, matchedEntry.heatNumber)
          if (matchedEntry.heatNumber) {
            registerUploadedCertificate(matchedEntry.heatNumber, bytes, matchedEntry.fileName, matchedEntry.heatNumber)
          }
          if (heatNumber) {
            registerUploadedCertificate(heatNumber, bytes, matchedEntry.fileName, matchedEntry.heatNumber)
          }
          return {
            bytes,
            fileName: matchedEntry.fileName,
            heatNumber: matchedEntry.heatNumber || heatNumber,
          }
        }
      } catch (err) {
        console.warn('Could not fetch authentic certificate from vault:', matchedEntry.url, err)
      }
    }
  }

  return null
}

export function getAllCachedCertificates(): StoredCertificateEntry[] {
  const unique = new Map<string, StoredCertificateEntry>()
  uploadedCertificatesCache.forEach((val) => {
    unique.set(val.fileName.toLowerCase(), val)
  })
  return Array.from(unique.values())
}

// Inspects ASCII and stream content inside raw PDF bytes to extract Heat Numbers and keywords
export function extractTextAndHeatsFromPDFBytes(
  bytes: Uint8Array,
  candidateHeats: string[] = []
): { detectedHeat?: string; textSnippet?: string } {
  let text = ''
  const maxBytes = Math.min(bytes.length, 600000)
  for (let i = 0; i < maxBytes; i++) {
    const b = bytes[i]
    if ((b >= 32 && b <= 126) || b === 10 || b === 13) {
      text += String.fromCharCode(b)
    }
  }

  // 1. Check known candidate heats from Excel
  for (const heat of candidateHeats) {
    const clean = heat.trim()
    if (clean && clean.length >= 2 && !clean.startsWith('LOT-')) {
      const escaped = clean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      const regex = new RegExp(`\\b${escaped}\\b`, 'i')
      if (regex.test(text)) {
        return { detectedHeat: clean, textSnippet: `Found Heat "${clean}" in PDF content` }
      }
    }
  }

  // 2. Regex patterns commonly found on Mill Test Certificates EN 10204 3.1
  const heatMatch = text.match(/(?:HEAT|HEAT\s*(?:NO|NUMBER|#)|CHARGE|CHARGE\s*(?:NO|#)|CAST\s*(?:NO|#))[\s:=-]+([A-Za-z0-9\-_/]{3,20})/i)
  if (heatMatch) {
    return { detectedHeat: heatMatch[1].trim(), textSnippet: heatMatch[0].trim() }
  }

  return {}
}
