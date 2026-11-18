// Excel Import and Export Engine for MSG Oilfield Equipment Trading LLC
// Supports exact MSG Zoho Books format: Item Name, Description, Rate, Account, Purchase Rate, Stock On Hand
// Automatically parses embedded Heat Numbers, Make/Supplier, Warehouse Location (LN-), YOM, and L-Codes.

import * as XLSX from 'xlsx'
import { db } from './db'
import { uploadedCertificatesCache } from './zipExtractor'
import { autoDetectMake, autoDetectSupplier } from './sourcingEngine'

// Auto-match MTCs by Heat Number and Item Code
export function matchCertificatesForHeat(heatNumber: string, itemCode?: string): any[] {
  const cleanHeat = String(heatNumber || '').trim().toUpperCase()
  if (!cleanHeat || cleanHeat.startsWith('LOT-')) {
    return []
  }

  const existingMTCs = db.getMTCs()
  const matched: any[] = existingMTCs.filter(m => {
    const certHeat = String(m.heat_number || '').trim().toUpperCase()
    const certRef = String(m.certificate_reference || '').toUpperCase()
    return certHeat === cleanHeat || certRef.includes(cleanHeat) || (certHeat.length >= 3 && cleanHeat.includes(certHeat))
  })

  // Match against certificates extracted from uploaded ZIP in memory
  const seenFiles = new Set(matched.map(m => m.certificate_reference.toLowerCase()))

  uploadedCertificatesCache.forEach((entry, key) => {
    if (seenFiles.has(entry.fileName.toLowerCase())) return

    const fileUpper = entry.fileName.toUpperCase()
    const detectedUpper = (entry.detectedHeat || '').toUpperCase()
    const keyUpper = key.toUpperCase()

    const isMatch =
      keyUpper === cleanHeat ||
      keyUpper.includes(cleanHeat) ||
      fileUpper.includes(cleanHeat) ||
      (cleanHeat.length >= 3 && fileUpper.includes(cleanHeat)) ||
      (detectedUpper && (detectedUpper === cleanHeat || detectedUpper.includes(cleanHeat) || cleanHeat.includes(detectedUpper))) ||
      (itemCode && fileUpper.includes(itemCode.toUpperCase()))

    if (isMatch) {
      seenFiles.add(entry.fileName.toLowerCase())
      matched.push({
        id: 'CACHE-' + entry.fileName,
        item_id: '',
        item_code: itemCode || 'STOCK',
        stock_lot_id: '',
        heat_number: heatNumber,
        certificate_reference: entry.fileName,
        original_file_path: entry.url,
        purchase_type: 'regular',
        supplier_name: 'Authentic Mill (ZIP Archive)',
        upload_date: new Date().toISOString().substring(0, 10),
        uploaded_by: 'MTC Controller',
        verification_status: 'Verified',
        approval_status: 'Approved',
        pages: 2,
        yom: 2025,
        created_at: new Date().toISOString(),
        textSnippet: entry.extractedText
      })
    }
  })

  return matched
}

export function parseMSGDescription(desc: string) {
  let cleanDesc = desc || ''
  let heatNumber = ''
  let make = 'WMASS GERMANY'
  let location = 'LN-EB1'
  let yom = 2024
  let isLocal = false

  // 1. Heat Number Regex (Matches: HEAT NUMBER:889, HEAT NUMBER: A-2212, HEAT NO: S22408, HEAT: 0047, etc.)
  const heatMatch = cleanDesc.match(/HEAT\s*(?:NUMBER|NO)?\s*[:#]\s*([A-Za-z0-9\-_/ \(\)\.]+?)(?=\s+(?:LN[:\-]|LN\s*:|LOCAL|FC|EC|DC)|,|\s*$)/i)
  if (heatMatch) {
    heatNumber = heatMatch[1].trim()
    const yomMatch = heatNumber.match(/\((\d{2,4})\)/)
    if (yomMatch) {
      const yr = parseInt(yomMatch[1], 10)
      yom = yr < 100 ? 2000 + yr : yr
      heatNumber = heatNumber.replace(/\s*\(\d{2,4}\)/, '').trim()
    }
  }

  // 2. Make / Manufacturer
  const makeMatch = cleanDesc.match(/MAKE\s*[:#]\s*([A-Za-z0-9\- /]+?)(?=\s+HEAT|,|\s*$)/i)
  if (makeMatch) {
    make = makeMatch[1].trim()
  }

  // 3. Location / LN
  const locMatch = cleanDesc.match(/(?:LN[:\-]|LN\s*:|LOCATION[:\-]?|LOCAL-BAY-)\s*([A-Za-z0-9\- ]+?)(?=,|\s*$)/i)
  if (locMatch) {
    location = locMatch[0].trim()
  } else {
    const rawLoc = cleanDesc.match(/(?:LN|FC|EC|DC)\s*[-:]?\s*([0-9A-Za-z]+)/i)
    if (rawLoc) location = 'LN-' + rawLoc[0].replace(/[\s:]/g, '')
  }

  // 4. Local Purchase flag
  if (/local/i.test(cleanDesc) || /promat/i.test(cleanDesc) || /shree/i.test(cleanDesc)) {
    isLocal = true
  }

  // 5. Clean pure material description
  cleanDesc = cleanDesc
    .replace(/\s*MAKE\s*[:#].*$/i, '')
    .replace(/\s*HEAT\s*(?:NUMBER|NO)?\s*[:#].*$/i, '')
    .replace(/[,;\s]+$/, '')
    .trim()

  if (!cleanDesc) cleanDesc = desc

  return {
    cleanDesc,
    heatNumber: heatNumber || (isLocal ? 'LOC-HEAT' : 'STOCK-HEAT'),
    make,
    location,
    yom,
    isLocal
  }
}

// Generates Multi-Heat Matrix Format, MSG Standard Format, and Extended Detailed Template
export function generateStockImportTemplate(): void {
  const wb = XLSX.utils.book_new()

  // 1. Multi-Heat Matrix Format (Exact user layout with HEAT - 1, HEAT - 2, HEAT - 3)
  const multiHeatData = [
    ['', '', '', '', 'HEAT - 1', '', '', '', '', 'HEAT - 2', '', '', '', '', 'HEAT - 3', '', '', '', ''],
    [
      'Item Name', 'Description', 'Stock', 'TOTAL QTY',
      'QTY', 'HEAT NO', 'CERTIFICATE NO', 'DATE', 'LOCATION',
      'QTY', 'HEAT NO', 'CERTIFICATE NO', 'DATE', 'LOCATION',
      'QTY', 'HEAT NO', 'CERTIFICATE NO', 'DATE', 'LOCATION'
    ],
    [
      'EL9080S40WPB', 'ELBOW 3" 90DEG SCH.40 LR A234 WPB BENKAN', 'IN STOCK', 27,
      9, '67C00M255', 'CERT-BEN-101', '2024', 'LN-AC1',
      18, '67C00M256', 'CERT-BEN-102', '2024', 'LN-AC2',
      '', '', '', '', ''
    ],
    [
      'WN80150S80RF', 'WELDNECK FLANGE 3" 150# SCH.80 A105N METALFAR', 'IN STOCK', 50,
      25, '23/39490', 'CERT-MFF-501', '2023', 'LN-DD5',
      25, '23/39491', 'CERT-MFF-502', '2023', 'LN-DD6',
      '', '', '', '', ''
    ],
    [
      'LEL9065S40WPB', 'ELBOW 2.1/2" 90DEG SCH.40 LOCAL UAE', 'IN STOCK', 24,
      24, 'LOC-HT-4921', 'CERT-LOC-882', '2024', 'LOCAL-BAY-1',
      '', '', '', '', '',
      '', '', '', '', ''
    ]
  ]
  const wsMultiHeat = XLSX.utils.aoa_to_sheet(multiHeatData)
  XLSX.utils.book_append_sheet(wb, wsMultiHeat, 'Multi_Heat_Stock_Format')

  // 2. MSG Standard Zoho Books Format
  const standardMSGFormat = [
    {
      'Item Name': 'WSO15150F316',
      'Description': '1/2" Flange SORF CL150 SS316/SS316L MAKE: WMASS GERMANY   HEAT NUMBER:889, LN-EB1',
      'Rate': 'AED 22.00',
      'Account': 'Sales',
      'Purchase Rate': 'AED 11.00',
      'Stock On Hand': 50
    },
    {
      'Item Name': 'WSO20150F316',
      'Description': '3/4" Flange SORF CL150 SS316/SS316L MAKE: WMASS GERMANY   HEAT NUMBER:A-2212, LN-EB1',
      'Rate': 'AED 32.00',
      'Account': 'Sales',
      'Purchase Rate': 'AED 16.00',
      'Stock On Hand': 50
    },
    {
      'Item Name': 'WBL40150RF',
      'Description': '1 1/2" Carbon Steel BLRF Flange #150 - A105N MAKE: WMASS GERMANY   HEAT NUMBER:106480 / 0087  LN: DC7',
      'Rate': 'AED 25.00',
      'Account': 'Sales',
      'Purchase Rate': 'AED 10.00',
      'Stock On Hand': 39
    },
    {
      'Item Name': 'WSO80150F316-LOC',
      'Description': '3" Flange SORF CL150 SS316/SS316L (Item #8 - Local Purchase) MAKE: SHREE SUPPLY   HEAT NUMBER:LOC-A2212-LP, LOCAL-BAY-01',
      'Rate': 'AED 155.00',
      'Account': 'Sales',
      'Purchase Rate': 'AED 89.00',
      'Stock On Hand': 10
    }
  ]
  const wsStandard = XLSX.utils.json_to_sheet(standardMSGFormat)
  XLSX.utils.book_append_sheet(wb, wsStandard, 'MSG_Standard_Format')

  // 3. Explicit Extended Multi-Column Format
  const extendedFormat = [
    {
      'Item Code': 'WSO15150F316',
      'Description': '1/2" Flange SORF CL150 SS316/SS316L',
      'Material Grade': 'SS316/316L',
      'Specification': 'ASME B16.5',
      'Size': '1/2" #150',
      'UOM': 'PCS',
      'Heat Number': '889',
      'YOM': 2024,
      'Quantity': 50,
      'Purchase Type': 'regular',
      'Supplier': 'WMASS GERMANY',
      'Warehouse Location': 'LN-EB1',
      'L Code': '',
      'Unit Price AED': 22.0
    }
  ]
  const wsExtended = XLSX.utils.json_to_sheet(extendedFormat)
  XLSX.utils.book_append_sheet(wb, wsExtended, 'Extended_Detailed_Format')

  XLSX.writeFile(wb, 'MSG_Stock_Import_Template.xlsx')
}

// Multi-Heat Matrix Parser (Supports HEAT - 1, HEAT - 2, HEAT - 3 layout across columns)
export function parseMultiHeatAOA(rows: any[][], sheetName: string = 'Stock'): any[] | null {
  if (!rows || rows.length < 2) return null

  let headerRowIdx = -1
  let groupRowIdx = -1

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const rowStr = rows[r].map(c => String(c || '').trim()).join(' ').toUpperCase()
    if (rowStr.includes('ITEM NAME') || rowStr.includes('ITEM CODE') || (rowStr.includes('DESCRIPTION') && rowStr.includes('HEAT'))) {
      headerRowIdx = r
      break
    }
  }

  if (headerRowIdx === -1) return null

  if (headerRowIdx > 0) {
    const prevRowStr = rows[headerRowIdx - 1].map(c => String(c || '').trim()).join(' ').toUpperCase()
    if (prevRowStr.includes('HEAT')) {
      groupRowIdx = headerRowIdx - 1
    }
  }

  const headerRow = rows[headerRowIdx].map(c => String(c || '').trim())
  const groupRow = groupRowIdx >= 0 ? rows[groupRowIdx].map(c => String(c || '').trim()) : []

  let itemCodeCol = -1
  let descCol = -1
  let totalQtyCol = -1
  let stockCol = -1

  headerRow.forEach((colName, cIdx) => {
    const clean = colName.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (clean === 'ITEMNAME' || clean === 'ITEMCODE' || clean === 'ITEM') itemCodeCol = cIdx
    else if (clean === 'DESCRIPTION' || clean === 'ITEMDESCRIPTION') descCol = cIdx
    else if (clean === 'TOTALQTY' || clean === 'STOCKONHAND' || clean === 'TOTALSTOCK') totalQtyCol = cIdx
    else if (clean === 'STOCK' || (clean === 'QTY' && totalQtyCol === -1)) stockCol = cIdx
  })

  if (itemCodeCol === -1 && descCol === -1) return null
  if (totalQtyCol === -1 && stockCol !== -1) totalQtyCol = stockCol

  const heatBlocks: {
    heatCol: number
    certCol: number
    dateCol: number
    locCol: number
    qtyCol: number
    label: string
  }[] = []

  for (let c = 0; c < headerRow.length; c++) {
    const cell = headerRow[c].toUpperCase().trim()
    if (cell === 'HEAT NO' || cell === 'HEAT' || cell === 'HEAT NUMBER' || cell === 'HEAT#') {
      let certCol = -1
      let dateCol = -1
      let locCol = -1
      let qtyCol = -1

      // Check column immediately preceding for QTY
      if (c > 0 && /^(?:QTY|PIECES|STOCK|PCS)$/i.test(headerRow[c - 1])) qtyCol = c - 1

      // Scan right up to 4 columns for Cert, Date, Location, Qty
      for (let offset = 1; offset <= 4 && c + offset < headerRow.length; offset++) {
        const nextCell = headerRow[c + offset].toUpperCase().trim()
        if (nextCell === 'HEAT NO' || nextCell === 'HEAT' || nextCell === 'HEAT NUMBER' || nextCell === 'HEAT#') break
        if (certCol === -1 && (nextCell.includes('CERT') || nextCell.includes('MTC'))) certCol = c + offset
        else if (dateCol === -1 && (nextCell.includes('DATE') || nextCell.includes('YOM') || nextCell.includes('YEAR'))) dateCol = c + offset
        else if (locCol === -1 && (nextCell.includes('LOC') || nextCell.includes('BAY') || nextCell.includes('LN'))) locCol = c + offset
        else if (qtyCol === -1 && (nextCell.includes('QTY') || nextCell.includes('STOCK') || nextCell.includes('PCS'))) qtyCol = c + offset
      }

      let label = `Heat ${heatBlocks.length + 1}`
      if (groupRow.length > c && groupRow[c]) label = groupRow[c]
      else if (c > 0 && groupRow.length > c - 1 && groupRow[c - 1]) label = groupRow[c - 1]

      heatBlocks.push({
        heatCol: c,
        certCol,
        dateCol,
        locCol,
        qtyCol,
        label
      })
    }
  }

  // Must have at least 1 heat block to qualify as multi-heat matrix
  if (heatBlocks.length === 0) return null

  const resultRows: any[] = []

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length === 0) continue

    const rawCode = itemCodeCol >= 0 ? row[itemCodeCol] : ''
    const itemCode = String(rawCode || '').trim().toUpperCase()
    if (!itemCode) continue

    const desc = descCol >= 0 ? String(row[descCol] || '').trim() : ''
    const rawTotalQty = totalQtyCol >= 0 ? row[totalQtyCol] : 0
    const totalQty = parseInt(String(rawTotalQty).replace(/[^0-9]/g, ''), 10) || 0

    const rowHeats: {
      heat_number: string
      certificate_number: string
      yom: number
      location: string
      explicitQty: number | null
    }[] = []

    for (let b = 0; b < heatBlocks.length; b++) {
      const block = heatBlocks[b]
      const heatNo = block.heatCol >= 0 ? String(row[block.heatCol] || '').trim() : ''
      if (!heatNo || heatNo === '-' || heatNo.toUpperCase() === 'N/A') continue

      const certNo = block.certCol >= 0 ? String(row[block.certCol] || '').trim() : ''
      const rawDate = block.dateCol >= 0 ? row[block.dateCol] : ''
      const location = block.locCol >= 0 ? String(row[block.locCol] || '').trim() : 'LN-EB1'
      const rawQty = block.qtyCol >= 0 ? row[block.qtyCol] : ''
      const explicitQty = rawQty !== '' && rawQty !== undefined ? parseInt(String(rawQty).replace(/[^0-9]/g, ''), 10) : null

      let yom = 2025
      if (rawDate) {
        const yrMatch = String(rawDate).match(/\b(20\d{2}|19\d{2})\b/)
        if (yrMatch) yom = parseInt(yrMatch[1], 10)
      }

      rowHeats.push({
        heat_number: heatNo,
        certificate_number: certNo,
        yom,
        location: location || 'LN-EB1',
        explicitQty
      })
    }

    const detectedMake = autoDetectMake(itemCode + ' ' + desc) || 'International Mill'
    const isLocal = itemCode.endsWith('-LOC') || desc.toUpperCase().includes('LOCAL') || desc.toUpperCase().includes('LOCALLY')
    const supplier = isLocal ? 'Local UAE Supplier' : autoDetectSupplier(detectedMake, desc)

    if (rowHeats.length === 0) {
      resultRows.push({
        rowNum: r + 1,
        sheet_name: sheetName,
        item_code: itemCode,
        description: desc || `${itemCode} Oilfield Material`,
        raw_description: desc,
        heat_number: `LOT-${itemCode.slice(0, 8)}`,
        certificate_number: '',
        selected_mtc_ref: '',
        is_extracted_heat: false,
        yom: 2025,
        quantity: totalQty || 1,
        rate: 0,
        purchase_rate: 0,
        account: 'Sales',
        purchase_type: isLocal ? 'local_purchase' : 'regular',
        supplier,
        location: 'LN-EB1',
        l_code: isLocal ? `L-${itemCode}-${r + 1}` : undefined,
        unit_price: 0,
        isValid: true,
        errors: []
      })
      continue
    }

    const anyExplicit = rowHeats.some(h => h.explicitQty !== null && h.explicitQty > 0)
    let finalHeats: {
      heat_number: string
      certificate_number: string
      yom: number
      location: string
      quantity: number
    }[]

    if (anyExplicit) {
      finalHeats = rowHeats.map(h => ({
        ...h,
        quantity: (h.explicitQty !== null && h.explicitQty > 0) ? h.explicitQty : Math.max(1, Math.floor(totalQty / rowHeats.length))
      }))
    } else {
      const count = rowHeats.length
      const perHeatQty = count > 0 ? Math.floor(totalQty / count) : totalQty
      const remainder = totalQty - (perHeatQty * count)

      finalHeats = rowHeats.map((h, idx) => ({
        ...h,
        quantity: idx === 0 ? perHeatQty + remainder : perHeatQty
      }))
    }

    for (const h of finalHeats) {
      resultRows.push({
        rowNum: r + 1,
        sheet_name: sheetName,
        item_code: itemCode,
        description: desc || `${itemCode} Oilfield Material`,
        raw_description: desc,
        heat_number: h.heat_number,
        certificate_number: h.certificate_number,
        selected_mtc_ref: h.certificate_number || undefined,
        is_extracted_heat: false,
        yom: h.yom,
        quantity: h.quantity || 1,
        rate: 0,
        purchase_rate: 0,
        account: 'Sales',
        purchase_type: isLocal ? 'local_purchase' : 'regular',
        supplier,
        location: h.location,
        l_code: isLocal ? `L-${itemCode}-${r + 1}` : undefined,
        unit_price: 0,
        isValid: true,
        errors: []
      })
    }
  }

  return resultRows
}

// Robust key lookup ignoring case and spaces
function getRowValue(row: any, candidates: string[]) {
  const keys = Object.keys(row)
  for (const cand of candidates) {
    const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '')
    for (const key of keys) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (cleanKey === cleanCand && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
        return row[key]
      }
    }
  }
  return undefined
}

export function parseExcelBuffer(data: Uint8Array | ArrayBuffer): {
  rows: any[]
  validationErrors: string[]
  validCount: number
  invalidCount: number
  sheetNames: string[]
} {
  const workbook = XLSX.read(data, { type: 'array' })
  const sheetNames = workbook.SheetNames || []

  const rows: any[] = []
  const validationErrors: string[] = []
  let validCount = 0
  let invalidCount = 0
  let globalRowCounter = 0

  sheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return

    // 1. Try parsing as Multi-Heat Matrix first (HEAT - 1, HEAT - 2, HEAT - 3 layout)
    const rawAOA: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const multiHeatRows = parseMultiHeatAOA(rawAOA, sheetName)

    if (multiHeatRows && multiHeatRows.length > 0) {
      multiHeatRows.forEach(r => {
        globalRowCounter++
        validCount++

        // Auto-match MTC certificates by Heat Number and Item Code
        const candidateMTCs = matchCertificatesForHeat(r.heat_number, r.item_code)
        let mtcMatchStatus: 'auto_matched' | 'multiple_found' | 'missing' = 'missing'
        let selectedMtcRef = r.selected_mtc_ref || ''
        let selectedMtcId = ''

        if (candidateMTCs.length === 1) {
          mtcMatchStatus = 'auto_matched'
          selectedMtcRef = candidateMTCs[0].certificate_reference
          selectedMtcId = candidateMTCs[0].id
        } else if (candidateMTCs.length > 1) {
          const matchByRef = r.certificate_number
            ? candidateMTCs.find((c: any) => c.certificate_reference.toUpperCase() === r.certificate_number.toUpperCase())
            : null
          if (matchByRef) {
            mtcMatchStatus = 'auto_matched'
            selectedMtcRef = matchByRef.certificate_reference
            selectedMtcId = matchByRef.id
          } else {
            mtcMatchStatus = 'multiple_found'
            selectedMtcRef = ''
            selectedMtcId = ''
          }
        } else {
          mtcMatchStatus = 'missing'
        }

        rows.push({
          ...r,
          id: `ROW-${globalRowCounter}`,
          candidate_mtcs: candidateMTCs,
          mtc_match_status: mtcMatchStatus,
          selected_mtc_ref: selectedMtcRef,
          selected_mtc_id: selectedMtcId
        })
      })
      return
    }

    // 2. Fallback to standard 1-heat per row format
    const rawJson: any[] = XLSX.utils.sheet_to_json(sheet)
    if (!rawJson || rawJson.length === 0) return

    rawJson.forEach((row, idx) => {
      globalRowCounter++
      const rowNum = idx + 2

      // Detect columns:
      // Format 1: Exact MSG 6-Column Format
      // "Item Name", "Description", "Rate", "Account", "Purchase Rate", "Stock On Hand"
      const rawItemName = getRowValue(row, ['Item Name', 'ItemName', 'Item Code', 'item_code', 'item_name', 'Item'])
      const rawDescription = String(getRowValue(row, ['Description', 'Item Description', 'desc', 'description']) || '')

      // Rates & Quantities
      const rawRate = getRowValue(row, ['Rate', 'Unit Price', 'Unit Price AED', 'rate', 'unit_price'])
      const rawAccount = getRowValue(row, ['Account', 'account', 'Account Name']) || 'Sales'
      const rawPurchaseRate = getRowValue(row, ['Purchase Rate', 'PurchaseRate', 'purchase_rate'])
      const rawQty = getRowValue(row, ['Stock On Hand', 'StockOnHand', 'Quantity', 'Stock on Hand', 'stock_on_hand', 'Qty', 'Qty In Stock'])

      // Explicit columns if present
      const explicitHeat = getRowValue(row, ['Heat Number', 'HeatNumber', 'heat_number', 'Heat No', 'Heat#'])
      const explicitYom = getRowValue(row, ['YOM', 'Year of Manufacturing', 'yom', 'Year'])
      const explicitSupplier = getRowValue(row, ['Supplier', 'Make', 'make', 'Manufacturer'])
      const explicitLocation = getRowValue(row, ['Warehouse Location', 'Location', 'location', 'Bay', 'LN'])
      const explicitLCode = getRowValue(row, ['L Code', 'l_code', 'LCode'])
      const explicitPurchaseType = getRowValue(row, ['Purchase Type', 'purchase_type', 'Type'])

      let itemCode = String(rawItemName || '').trim().toUpperCase()
      let description = rawDescription
      let heatNumber = explicitHeat ? String(explicitHeat).trim() : ''
      let yom = explicitYom ? Number(explicitYom) : 2024
      let supplier = explicitSupplier ? String(explicitSupplier).trim() : 'WMASS GERMANY'
      let location = explicitLocation ? String(explicitLocation).trim() : 'LN-EB1'
      let lCode = explicitLCode ? String(explicitLCode).trim() : ''
      let purchaseType = explicitPurchaseType ? (String(explicitPurchaseType).toLowerCase().includes('local') ? 'local_purchase' : 'regular') : 'regular'
      let isExtracted = false

      // Smart parser if Description contains embedded MAKE / HEAT NUMBER / LN
      if (!explicitHeat && rawDescription) {
        const parsed = parseMSGDescription(rawDescription)
        description = parsed.cleanDesc
        heatNumber = parsed.heatNumber
        supplier = parsed.make
        location = parsed.location
        yom = parsed.yom
        isExtracted = true
        if (parsed.isLocal || itemCode.endsWith('-LOC')) {
          purchaseType = 'local_purchase'
          if (!lCode) {
            lCode = `L-${itemCode.replace('-LOC', '')}-${rowNum}`
          }
        }
      }

      // Default heat fallback for gaskets / non-heat bulk items if not specified
      if (!heatNumber && itemCode) {
        heatNumber = `LOT-${itemCode.slice(0, 8)}`
      }

      // Parse numeric values
      const rateVal = rawRate !== undefined ? parseFloat(String(rawRate).replace(/[^0-9.]/g, '')) || 0 : 0
      const purchaseRateVal = rawPurchaseRate !== undefined ? parseFloat(String(rawPurchaseRate).replace(/[^0-9.]/g, '')) || 0 : 0
      const qtyVal = rawQty !== undefined ? parseInt(String(rawQty).replace(/[^0-9]/g, ''), 10) || 0 : 0

      const errs: string[] = []
      if (!itemCode) errs.push('Missing Item Name')
      if (rawQty === undefined || isNaN(qtyVal)) errs.push('Invalid Stock On Hand quantity')

      if (errs.length > 0) {
        invalidCount++
        validationErrors.push(`[${sheetName}] Row ${rowNum} (${itemCode || 'Unnamed'}): ${errs.join(', ')}`)
      } else {
        validCount++
      }

      // Auto-match MTC certificates by Heat Number and Item Code
      const candidateMTCs = matchCertificatesForHeat(heatNumber, itemCode)
      let mtcMatchStatus: 'auto_matched' | 'multiple_found' | 'missing' = 'missing'
      let selectedMtcRef = ''
      let selectedMtcId = ''

      if (candidateMTCs.length === 1) {
        mtcMatchStatus = 'auto_matched'
        selectedMtcRef = candidateMTCs[0].certificate_reference
        selectedMtcId = candidateMTCs[0].id
      } else if (candidateMTCs.length > 1) {
        mtcMatchStatus = 'multiple_found'
        selectedMtcRef = ''
        selectedMtcId = ''
      } else {
        mtcMatchStatus = 'missing'
      }

      rows.push({
        id: `ROW-${globalRowCounter}`,
        rowNum,
        sheet_name: sheetName,
        item_code: itemCode,
        description: description,
        raw_description: rawDescription,
        heat_number: heatNumber,
        is_extracted_heat: isExtracted,
        yom: yom,
        quantity: qtyVal,
        rate: rateVal,
        purchase_rate: purchaseRateVal,
        account: rawAccount,
        purchase_type: purchaseType,
        supplier: supplier,
        location: location,
        l_code: lCode,
        unit_price: rateVal,
        candidate_mtcs: candidateMTCs,
        mtc_match_status: mtcMatchStatus,
        selected_mtc_ref: selectedMtcRef,
        selected_mtc_id: selectedMtcId,
        isValid: errs.length === 0,
        errors: errs
      })
    })
  })

  return { rows, validationErrors, validCount, invalidCount, sheetNames }
}

export function parseExcelFile(file: File): Promise<{
  rows: any[]
  validationErrors: string[]
  validCount: number
  invalidCount: number
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const res = parseExcelBuffer(data)
        resolve(res)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = (err) => reject(err)
    reader.readAsArrayBuffer(file)
  })
}

// Fetch and parse the live 420-item MSG sample inventory file
export async function loadPreloadedMSGSheet(): Promise<{
  rows: any[]
  validationErrors: string[]
  validCount: number
  invalidCount: number
}> {
  const resp = await fetch('/sample-msg-inventory.xlsx')
  const arrayBuf = await resp.arrayBuffer()
  return parseExcelBuffer(new Uint8Array(arrayBuf))
}

// Export Master Stock
export function exportMasterStock(): void {
  const stockView = db.getMasterStockView()
  const data = stockView.map(s => ({
    'Item Name': s.item_code,
    'Description': `${s.item_description} MAKE: ${s.supplier_name}   HEAT NUMBER:${s.heat_number}, ${s.warehouse_location}`,
    'Rate': `AED ${s.unit_price_aed?.toFixed(2) || '0.00'}`,
    'Account': 'Sales',
    'Purchase Rate': `AED ${(s.unit_price_aed * 0.6).toFixed(2)}`,
    'Stock On Hand': s.physical_qty,
    'Available Stock': s.available_qty,
    'Reserved Stock': s.reserved_qty,
    'Dispatched Stock': s.dispatched_qty,
    'YOM': s.yom || 'N/A',
    'Purchase Type': s.purchase_type === 'local_purchase' ? 'Local Purchase' : 'Regular Stock',
    'L Code': s.l_code || '-',
    'MTC Status': s.mtc_status,
    'Receipt Date': s.stock_receipt_date
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Master_Stock_Inventory')
  XLSX.writeFile(wb, `MSG_Master_Stock_${new Date().toISOString().substring(0, 10)}.xlsx`)
}

// Export Heat Number Register
export function exportHeatRegister(): void {
  const stockView = db.getMasterStockView()
  const data = stockView.map(s => ({
    'Heat Number': s.heat_number,
    'Item Name': s.item_code,
    'Description': s.item_description,
    'YOM': s.yom || 'N/A',
    'L Code': s.l_code || '-',
    'Supplier': s.supplier_name,
    'Stock On Hand': s.physical_qty,
    'Reserved Stock': s.reserved_qty,
    'Available Stock': s.available_qty,
    'Dispatched Stock': s.dispatched_qty,
    'Warehouse Location': s.warehouse_location,
    'Rate': `AED ${s.unit_price_aed?.toFixed(2) || '0.00'}`,
    'MTC Reference': s.mtc_ref || s.mtc_status
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Heat_Number_Register')
  XLSX.writeFile(wb, `MSG_Heat_Register_${new Date().toISOString().substring(0, 10)}.xlsx`)
}

// Export Sales Orders (including cancelled orders)
export function exportSalesOrders(): void {
  const orders = db.getOrders()
  const data: any[] = []

  orders.forEach(order => {
    order.items.forEach(item => {
      const heatAllocations = order.allocations
        .filter(a => a.sales_order_item_id === item.id)
        .map(a => `${a.heat_number} (${a.allocated_qty} PCS)`)
        .join(', ')

      data.push({
        'Sales Order No': order.so_number,
        'Customer P.O.': order.po_number,
        'Customer': order.customer_name,
        'Order Date': order.order_date,
        'Required Date': order.required_delivery_date,
        'Order Status': order.status,
        'Item Name': item.item_code,
        'Description': item.item_description,
        'Required Qty': item.required_qty,
        'Allocated Qty': item.allocated_qty,
        'Dispatched Qty': item.dispatched_qty,
        'Allocated Heats': heatAllocations || 'None',
        'Store Approved By': order.approved_by || 'Pending',
        'MTC Package': order.mtc_package_generated ? 'Generated' : 'Pending',
        'Cancellation Date': order.cancellation_date || '-',
        'Cancellation Reason': order.cancellation_reason || '-'
      })
    })
  })

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sales_Orders_Register')
  XLSX.writeFile(wb, `MSG_Sales_Orders_${new Date().toISOString().substring(0, 10)}.xlsx`)
}

// Export Stock Movement History (Audit Ledger)
export function exportStockMovements(): void {
  const movements = db.getMovements()
  const data = movements.map(m => ({
    'Timestamp': m.timestamp,
    'Movement Type': m.movement_type,
    'Item Name': m.item_code,
    'Heat Number': m.heat_number,
    'Quantity Change': m.quantity,
    'Reference Type': m.reference_type,
    'Reference ID': m.reference_id,
    'Previous Balance': m.previous_balance,
    'New Balance': m.new_balance,
    'Performed By': m.performed_by,
    'Remarks': m.remarks
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Stock_Movements_Ledger')
  XLSX.writeFile(wb, `MSG_Stock_Movements_${new Date().toISOString().substring(0, 10)}.xlsx`)
}

// Export Local Purchases (L Codes)
export function exportLocalPurchases(): void {
  const localPurchases = db.getLocalPurchases()
  const data = localPurchases.map(lp => ({
    'L Code': lp.l_code,
    'Item Name': lp.item_code,
    'Supplier': lp.supplier_name,
    'Purchase Reference': lp.purchase_reference,
    'Purchase Date': lp.purchase_date,
    'Stock On Hand': lp.received_qty,
    'YOM': lp.yom,
    'Supplier MTC Uploaded': lp.supplier_mtc_uploaded ? 'Yes (Stamped)' : 'Pending',
    'Created By': lp.created_by
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Local_Purchases_L_Codes')
  XLSX.writeFile(wb, `MSG_Local_Purchases_${new Date().toISOString().substring(0, 10)}.xlsx`)
}

// Export Dispatch Register
export function exportDispatches(): void {
  const dispatches = db.getDispatches()
  const data = dispatches.map(d => ({
    'Dispatch Ref': d.dispatch_reference,
    'Sales Order': d.so_number,
    'Customer': d.customer_name,
    'Delivery Note': d.delivery_note_number,
    'Dispatch Date': d.dispatch_date,
    'Dispatched By': d.dispatched_by,
    'Items Summary': d.items_summary.map(i => `${i.item_code} [Heat: ${i.heat_number}] x ${i.quantity}`).join('; '),
    'Remarks': d.delivery_remarks || ''
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dispatch_Register')
  XLSX.writeFile(wb, `MSG_Dispatch_Register_${new Date().toISOString().substring(0, 10)}.xlsx`)
}

// Download Sales Order Import Template
export function generateSalesOrderTemplate(): void {
  const templateData = [
    {
      'Customer Name': 'McDermott Middle East Inc',
      'Customer P.O.': 'PO-MCD-88412',
      'Item Name': 'WSO15150F316',
      'Required Qty': 5,
      'Required Delivery Date': '2026-11-15'
    },
    {
      'Customer Name': 'McDermott Middle East Inc',
      'Customer P.O.': 'PO-MCD-88412',
      'Item Name': 'WSO20150F316',
      'Required Qty': 10,
      'Required Delivery Date': '2026-11-15'
    },
    {
      'Customer Name': 'Petrofac International Ltd',
      'Customer P.O.': 'PO-PET-4911',
      'Item Name': 'EL9050S80WPBBENKAN-STOCK',
      'Required Qty': 8,
      'Required Delivery Date': '2026-11-20'
    }
  ]

  const ws = XLSX.utils.json_to_sheet(templateData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sales_Orders_Import')
  XLSX.writeFile(wb, 'MSG_Sales_Orders_Import_Template.xlsx')
}

// Parse Sales Orders Excel
export function parseSalesOrderExcel(file: File): Promise<{
  customerName: string
  poNumber: string
  itemCode: string
  requiredQty: number
  deliveryDate?: string
  sheetName?: string
}[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheetNames = wb.SheetNames || []
        const rows: any[] = []

        sheetNames.forEach(sheetName => {
          const sheet = wb.Sheets[sheetName]
          if (!sheet) return
          const json: any[] = XLSX.utils.sheet_to_json(sheet)
          json.forEach(r => {
            const cust = r['Customer Name'] || r['Customer'] || r['customer_name'] || 'General Client'
            const po = r['Customer P.O.'] || r['PO Number'] || r['P.O. Number'] || r['po_number'] || 'PO-ONLINE'
            const item = r['Item Name'] || r['Item Code'] || r['item_code'] || r['Item'] || ''
            const qty = parseInt(String(r['Required Qty'] || r['Quantity'] || r['Qty'] || 1).replace(/[^0-9]/g, ''), 10) || 1
            const date = r['Required Delivery Date'] || r['Delivery Date'] || r['delivery_date'] || ''

            if (String(item).trim()) {
              rows.push({
                customerName: String(cust).trim(),
                poNumber: String(po).trim(),
                itemCode: String(item).trim().toUpperCase(),
                requiredQty: qty,
                deliveryDate: date ? String(date).trim() : undefined,
                sheetName
              })
            }
          })
        })

        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = (err) => reject(err)
    reader.readAsArrayBuffer(file)
  })
}
