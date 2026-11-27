// Certificate Vault & Raw Byte Storage for MSG Oilfield Equipment Trading LLC
// Guarantees zero alteration, 100% byte-for-byte preservation of authentic supplier PDFs from ZIP files.
import { autoDetectMake, autoDetectCountryOfOrigin } from './sourcingEngine'

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

export function isValidPdfBytes(bytes?: Uint8Array | null): boolean {
  if (!bytes || bytes.length < 5) return false
  const limit = Math.min(bytes.length - 5, 1024)
  for (let i = 0; i <= limit; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2d // -
    ) {
      return true
    }
  }
  return false
}

export function encodeStaticAssetUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/#/g, '%23')
  }
  const [pathOnly, queryPart] = trimmed.split('?')
  const encodedPath = pathOnly
    .split('/')
    .map(seg => {
      if (!seg) return seg
      try {
        return encodeURIComponent(decodeURIComponent(seg))
      } catch {
        return encodeURIComponent(seg)
      }
    })
    .join('/')
  return queryPart ? `${encodedPath}?${queryPart}` : encodedPath
}

export async function safeFetchPdfBytes(rawUrl: string): Promise<Uint8Array | null> {
  if (!rawUrl || rawUrl.trim() === '/sample-mtc.pdf') return null
  try {
    const resp = await fetch(encodeStaticAssetUrl(rawUrl))
    if (!resp.ok) return null
    const contentType = (resp.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('text/html')) return null
    const bytes = new Uint8Array(await resp.arrayBuffer())
    return isValidPdfBytes(bytes) ? bytes : null
  } catch {
    return null
  }
}

export async function resolveBackendMtcBytes(docName?: string, heatNumber?: string): Promise<Uint8Array | null> {
  if (!docName && !heatNumber) return null
  try {
    const params = new URLSearchParams()
    if (docName && docName !== '/sample-mtc.pdf') params.set('doc_name', docName)
    if (heatNumber && heatNumber !== '-') params.set('heat_number', heatNumber)
    if (!params.toString()) return null
    const resp = await fetch(`/api/mtc/resolve?${params.toString()}`)
    if (!resp.ok) return null
    const contentType = (resp.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('text/html')) return null
    const bytes = new Uint8Array(await resp.arrayBuffer())
    return isValidPdfBytes(bytes) ? bytes : null
  } catch {
    return null
  }
}

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
  if (!isValidPdfBytes(bytes)) return ''
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
  if (entry && isValidPdfBytes(entry.bytes)) return entry.bytes

  const cleanKey = key.replace(/\.[^/.]+$/, '').trim()
  const cleanEntry = uploadedCertificatesCache.get(cleanKey)
  if (cleanEntry && isValidPdfBytes(cleanEntry.bytes)) return cleanEntry.bytes

  const pureKey = key.replace(/[^a-zA-Z0-9]/g, '')
  if (pureKey) {
    const pureEntry = uploadedCertificatesCache.get(pureKey)
    if (pureEntry && isValidPdfBytes(pureEntry.bytes)) return pureEntry.bytes
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
      const vaultUrl = `/certificates/${encodeURIComponent(matchedEntry.fileName)}`
      const bytes =
        (await safeFetchPdfBytes(vaultUrl)) ||
        (matchedEntry.url ? await safeFetchPdfBytes(matchedEntry.url) : null)
      if (bytes) {
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

export function hasSelectedHeatNumber(heatNumber?: string | null): boolean {
  const heat = (heatNumber || '').trim()
  return Boolean(heat && heat !== '-' && heat.toUpperCase() !== 'N/A')
}

export function hasAvailableMtcForItem(
  item: { heat_number?: string | null; certificate_number?: string | null } | null | undefined,
  vaultManifest: ManifestCertificate[],
  storedFiles: { id?: string; category?: string; heat_number?: string; file_name?: string }[],
  mtcs: { heat_number?: string; certificate_reference?: string; original_file_path?: string; file_data_url?: string }[]
): boolean {
  if (!item || !hasSelectedHeatNumber(item.heat_number)) return false

  const certRef = (item.certificate_number || '').trim()
  const heat = (item.heat_number || '').trim()

  if (certRef && getUploadedCertificateBytes(certRef)) return true
  if (heat && getUploadedCertificateBytes(heat)) return true

  if (vaultManifest.length > 0) {
    const cleanHeat = heat.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const cleanRef = certRef.toLowerCase()
    const inManifest = vaultManifest.some(m => {
      if (cleanHeat.length >= 3) {
        const mHeat = (m.heatNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
        if (mHeat && (mHeat === cleanHeat || mHeat.startsWith(cleanHeat) || cleanHeat.startsWith(mHeat))) {
          return true
        }
        if (m.fileName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().includes(cleanHeat)) {
          return true
        }
      }
      if (cleanRef && cleanRef !== 'mtc-ref' && cleanRef !== 'null') {
        const fn = m.fileName.toLowerCase()
        if (fn.includes(cleanRef) || cleanRef.includes(fn.replace(/\.pdf$/i, ''))) {
          return true
        }
      }
      return false
    })
    if (inManifest) return true
  }

  const storedMatch = storedFiles.some(sf => {
    if (!sf || (sf.category && sf.category !== 'mtc' && sf.category !== 'stamped_mtc')) return false
    const sfHeat = (sf.heat_number || '').trim().toUpperCase()
    const sfName = (sf.file_name || '').trim().toLowerCase()
    if (sfHeat && sfHeat === heat.toUpperCase()) return true
    if (certRef && (sfName === certRef.toLowerCase() || (sf.id && certRef.includes(sf.id)))) return true
    return false
  })
  if (storedMatch) return true

  const dbMtc = mtcs.find(m =>
    (m.heat_number || '').toUpperCase() === heat.toUpperCase() ||
    (certRef && (m.certificate_reference || '').toUpperCase() === certRef.toUpperCase())
  )
  if (dbMtc && (dbMtc.file_data_url || (dbMtc.original_file_path && dbMtc.original_file_path !== '/sample-mtc.pdf'))) {
    return true
  }

  return false
}

const DN_TO_INCH: Record<string, string> = {
  '15': '0.5',
  '20': '0.75',
  '25': '1',
  '30': '1.25',
  '32': '1.25',
  '40': '1.5',
  '50': '2',
  '65': '2.5',
  '80': '3',
  '100': '4',
  '125': '5',
  '150': '6',
  '200': '8',
  '250': '10',
  '300': '12',
  '350': '14',
  '400': '16',
  '450': '18',
  '500': '20',
  '600': '24',
}

const VALID_NPS_SIZES = new Set([
  '0.25', '0.375', '0.5', '0.75', '1', '1.25', '1.5', '2', '2.5', '3',
  '3.5', '4', '5', '6', '8', '10', '12', '14', '16', '18', '20', '24',
])

function normalizeSizeNumber(raw: string): string {
  const s = raw.trim()
  if (s === '1.12') return '1.5'
  if (s.includes('.')) {
    return s.replace(/0+$/, '').replace(/\.$/, '')
  }
  return s
}

export function extractNormalizedSize(text?: string | null): string | null {
  if (!text) return null
  let t = String(text).toUpperCase()
  t = t.replace(/\b(\d+)\s*[-\s]\s*1\/2\b/g, (_m, w) => String(parseInt(w, 10) + 0.5))
  t = t.replace(/\b(\d+)\s*[-\s]\s*1\/4\b/g, (_m, w) => String(parseInt(w, 10) + 0.25))
  t = t.replace(/\b(\d+)\s*[-\s]\s*3\/4\b/g, (_m, w) => String(parseInt(w, 10) + 0.75))
  t = t.replace(/3\/4/g, '0.75').replace(/1\/2/g, '0.5').replace(/1\/4/g, '0.25').replace(/3\/8/g, '0.375')
  // Strip leading item index prefixes like "56-CONC..." or "1-ELBOW..."
  t = t.replace(/^\s*\d+\s*-\s*/, '')
  // Strip embedded heat refs, pressure classes, standards, schedules, angles, and quantities
  t = t.replace(/\b(?:HN|HEAT|HT)\s*[-:#]?\s*(?:NO\.?\s*)?[A-Z0-9-]+\b/g, ' ')
  t = t.replace(/\b(?:150|300|600|900|1500|2500|3000|6000|9001500)\s*(?:#|LBS?)\b/g, ' ')
  t = t.replace(/\bCL\.?\s*(?:150|300|600|900|1500|2500|3000)\b/g, ' ')
  t = t.replace(/\b(?:B16\.\d+|SP-\d+|A105N?|SA\s*105N?|A234|A420|A860|WPL6|WPHY\d+|SS316L?|WPB)\b/g, ' ')
  t = t.replace(/\b(?:SCH\.?\s*\d+[A-Z]*|S\.?\d+[A-Z]*|90\s*DEG|45\s*DEG|180\s*DEG|90EL|45EL)\b/g, ' ')
  t = t.replace(/\(QTY-\d+\)|\bQTY[-\s]*\d+\b|\(\d+NOS\)/g, ' ')
  t = t.replace(/\bDN\s*(\d+)\b/g, (_m, dn) => ` ${DN_TO_INCH[dn] || dn}IN `)

  // 2-dimension reducer / reducing tee sizes (e.g. 4 x 2, 1" x 1/2")
  const twoDim = t.match(/(\d+(?:\.\d+)?)\s*(?:["\u201d']|''|IN(?:CH)?)?\s*[X\u00d7]\s*(\d+(?:\.\d+)?)\s*(?:["\u201d']|''|IN(?:CH)?)?/)
  if (twoDim) {
    const a = normalizeSizeNumber(twoDim[1])
    const b = normalizeSizeNumber(twoDim[2])
    if (VALID_NPS_SIZES.has(a) && VALID_NPS_SIZES.has(b)) {
      return `${a}x${b}`
    }
  }

  // Single explicit inch size (e.g. 0.5", 2 INCH, 6IN)
  const explicitInch = t.match(/\b(\d+(?:\.\d+)?)\s*(?:["\u201d']|''|IN(?:CH)?\b)/)
  if (explicitInch) {
    const n = normalizeSizeNumber(explicitInch[1])
    if (VALID_NPS_SIZES.has(n)) return n
  }

  // Standalone nominal pipe size token
  const tokens = t.match(/(?<![A-Z0-9.])(\d+(?:\.\d+)?)(?![A-Z0-9.])/g) || []
  for (const tok of tokens) {
    const n = normalizeSizeNumber(tok)
    if (VALID_NPS_SIZES.has(n)) return n
  }

  return null
}

export function extractYomFromFilename(fileName?: string | null): number | undefined {
  if (!fileName) return undefined
  const mTrail = fileName.match(/[-_\s](20[12]\d)(?:\.pdf)?$/i)
  if (mTrail) {
    const yr = parseInt(mTrail[1], 10)
    if (yr >= 2005 && yr <= 2035) return yr
  }
  const mPrefixYr = fileName.match(/\bHN[-\s]+(\d{2})-\d{4,6}\b/i)
  if (mPrefixYr) {
    const yr = 2000 + parseInt(mPrefixYr[1], 10)
    if (yr >= 2010 && yr <= 2035) return yr
  }
  return undefined
}

function extractCertQtyFromFilename(fileName?: string | null): number | undefined {
  if (!fileName) return undefined
  const qMatch = fileName.match(/\(QTY[-\s]*(\d+)\)|\((\d+)\s*NOS\)/i)
  if (qMatch) {
    const val = parseInt(qMatch[1] || qMatch[2], 10)
    if (!isNaN(val) && val > 0) return val
  }
  return undefined
}

function detectMakeAndOrigin(
  fileName: string,
  heatNumber: string,
  lotSupplier?: string,
  lotMake?: string
): { make?: string; countryOfOrigin?: string; isBenkan: boolean } {
  const upperFile = fileName.toUpperCase()
  const isBenkan = Boolean(
    upperFile.includes('BENKAN') ||
    /^(68C|68[0-9]|67C|67[0-9]|65P|65N|65[0-9]|62C|62E|61G)/i.test(heatNumber)
  )

  let make = (lotMake || '').trim()
  if (!make && lotSupplier && lotSupplier.trim() && lotSupplier.trim().toUpperCase() !== 'STOCK') {
    make = autoDetectMake(lotSupplier) || lotSupplier.trim()
  }
  if (!make) {
    make = autoDetectMake(fileName)
  }
  if (!make && isBenkan) {
    make = 'BENKAN THAILAND CORP'
  }
  if (!make && /\bAPCO\b/i.test(upperFile)) {
    make = 'APCO'
  }
  if (!make && /\bSKB\b/i.test(upperFile)) {
    make = 'SKB'
  }

  let countryOfOrigin: string | undefined
  if (isBenkan) {
    countryOfOrigin = 'Thailand'
  } else if (make) {
    const detected = autoDetectCountryOfOrigin(make, fileName)
    if (detected) countryOfOrigin = detected
  }

  return { make: make || undefined, countryOfOrigin, isBenkan }
}

export interface VaultHeatOption {
  heatNumber: string
  fileName: string
  label: string
  isBenkan: boolean
  matched?: boolean
  size?: string
  sizeMatched?: boolean
  stockQty?: number
  certQty?: number
  yom?: number
  make?: string
  countryOfOrigin?: string
}

export interface ExtraLotOptionInput {
  heat_number: string
  lot_no?: string
  item_code?: string
  item_description?: string
  size?: string
  yom?: number
  available_qty?: number
  physical_qty?: number
  received_qty?: number
  supplier_name?: string
  make?: string
  mtc_ref?: string
  certificate_number?: string
}

export async function getAllVaultHeatOptions(
  itemDescription?: string,
  extraLots?: ExtraLotOptionInput[],
  mtcs?: { heat_number?: string; certificate_reference?: string; yom?: number; supplier_name?: string }[]
): Promise<VaultHeatOption[]> {
  const manifest = await getVaultManifest()
  const options: VaultHeatOption[] = []
  const seenKeys = new Set<string>()
  const itemSize = extractNormalizedSize(itemDescription)

  const descWords = itemDescription
    ? itemDescription
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(w => w.length >= 2 && !['THE', 'FOR', 'AND', 'WITH', 'DEG', 'INCH'].includes(w))
    : []

  const findMatchingLot = (heat: string, fileSize: string | null) => {
    if (!extraLots || extraLots.length === 0) return undefined
    const heatUpper = heat.toUpperCase()
    const matches = extraLots.filter(l => (l.heat_number || '').trim().toUpperCase() === heatUpper)
    if (matches.length === 0) return undefined
    if (fileSize) {
      const sizeMatch = matches.find(l => (l.size || extractNormalizedSize(l.item_description)) === fileSize)
      if (sizeMatch) return sizeMatch
    }
    return matches[0]
  }

  for (const m of manifest) {
    const rawHeat = (m.heatNumber || '').trim()
    if (!rawHeat) continue
    const dedupeKey = `${rawHeat.toUpperCase()}|${m.fileName.toLowerCase()}`
    if (seenKeys.has(dedupeKey)) continue
    seenKeys.add(dedupeKey)

    const upperFile = m.fileName.toUpperCase()
    const fileSize = extractNormalizedSize(m.fileName)
    const sizeMatched = Boolean(itemSize && fileSize && fileSize === itemSize)

    let matchCount = 0
    for (const w of descWords) {
      if (upperFile.includes(w)) matchCount++
    }

    const matchingLot = findMatchingLot(rawHeat, fileSize)
    const matchingMtc = mtcs?.find(x => (x.heat_number || '').trim().toUpperCase() === rawHeat.toUpperCase())
    const stockQty = matchingLot
      ? (matchingLot.available_qty ?? matchingLot.physical_qty ?? matchingLot.received_qty)
      : undefined
    const certQty = extractCertQtyFromFilename(m.fileName)
    const yom =
      (matchingLot?.yom && matchingLot.yom > 0 ? matchingLot.yom : undefined) ??
      (matchingMtc?.yom && matchingMtc.yom > 0 ? matchingMtc.yom : undefined) ??
      extractYomFromFilename(m.fileName)

    const { make, countryOfOrigin, isBenkan } = detectMakeAndOrigin(
      m.fileName,
      rawHeat,
      matchingLot?.supplier_name || matchingMtc?.supplier_name,
      matchingLot?.make
    )

    const shortFile = m.fileName.replace(/\.pdf$/i, '').replace(/^[0-9]+-/, '')
    const displayLabel = `${rawHeat} — ${shortFile.length > 38 ? shortFile.substring(0, 35) + '...' : shortFile}${isBenkan ? ' [Benkan]' : ''}`

    options.push({
      heatNumber: rawHeat,
      fileName: m.fileName,
      label: displayLabel,
      isBenkan,
      matched: sizeMatched || matchCount > 0,
      size: fileSize || undefined,
      sizeMatched,
      stockQty,
      certQty,
      yom,
      make,
      countryOfOrigin,
    })
  }

  // Include inventory lots (including lots whose heat is not in manifest.json)
  if (extraLots && extraLots.length > 0) {
    for (const lot of extraLots) {
      const rawHeat = (lot.heat_number || '').trim()
      if (!rawHeat) continue
      const existingForHeat = options.some(o => o.heatNumber.toUpperCase() === rawHeat.toUpperCase())
      if (existingForHeat) continue

      const lotSize = (lot.size && extractNormalizedSize(lot.size)) || extractNormalizedSize(lot.item_description)
      const sizeMatched = Boolean(itemSize && lotSize && lotSize === itemSize)
      const matchingMtc = mtcs?.find(x => (x.heat_number || '').trim().toUpperCase() === rawHeat.toUpperCase())
      const fileName = lot.mtc_ref || lot.certificate_number || matchingMtc?.certificate_reference || ''
      const dedupeKey = `${rawHeat.toUpperCase()}|${fileName.toLowerCase()}`
      if (seenKeys.has(dedupeKey)) continue
      seenKeys.add(dedupeKey)

      const stockQty = lot.available_qty ?? lot.physical_qty ?? lot.received_qty
      const yom =
        (lot.yom && lot.yom > 0 ? lot.yom : undefined) ??
        (matchingMtc?.yom && matchingMtc.yom > 0 ? matchingMtc.yom : undefined)
      const { make, countryOfOrigin, isBenkan } = detectMakeAndOrigin(
        `${fileName} ${lot.item_description || ''}`,
        rawHeat,
        lot.supplier_name || matchingMtc?.supplier_name,
        lot.make
      )

      options.push({
        heatNumber: rawHeat,
        fileName,
        label: `${rawHeat} — Lot: ${lot.lot_no || lot.item_code || 'Stock'}`,
        isBenkan,
        matched: sizeMatched,
        size: lotSize || undefined,
        sizeMatched,
        stockQty,
        yom,
        make,
        countryOfOrigin,
      })
    }
  }

  // Sort: Size-matched first, then in-stock (>0), then keyword matched, then Benkan, then alphabetical
  options.sort((a, b) => {
    if (a.sizeMatched && !b.sizeMatched) return -1
    if (!a.sizeMatched && b.sizeMatched) return 1
    const aHasStock = (a.stockQty ?? 0) > 0
    const bHasStock = (b.stockQty ?? 0) > 0
    if (aHasStock && !bHasStock) return -1
    if (!aHasStock && bHasStock) return 1
    if (a.matched && !b.matched) return -1
    if (!a.matched && b.matched) return 1
    if (a.isBenkan && !b.isBenkan) return -1
    if (!a.isBenkan && b.isBenkan) return 1
    return a.heatNumber.localeCompare(b.heatNumber)
  })

  return options
}
