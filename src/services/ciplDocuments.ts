import ExcelJS from 'exceljs'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'
import {
  SourcingLineItem,
  autoDetectCountryOfOrigin,
  autoDetectHSCode,
  estimateUnitWeight,
  extractQtyNumber,
} from './sourcingEngine'
import { downloadPDFBlob } from './pdfEngine'

export type CIPLTemplateId = 'standard' | 'oilfield_detailed' | 'compact_customs'
export type PackingLabelTemplateId = 'warehouse_standard' | 'shipping_manifest' | 'thermal_pallet'

export type CIPLPackageType = 'PALLET' | 'WOODEN BOX' | 'CARTON BOX' | 'WOODEN CRATE' | 'BUNDLE'

export interface CIPLPackageConfig {
  id: string
  packageNo: string
  packageType: CIPLPackageType
  dimensions: string
  tareWeightKg: number
  manualNetWeightKg?: number
  manualGrossWeightKg?: number
  shippingMark?: string
}

export interface CIPLDocumentPayload {
  client: string
  consigneeAddress: string
  poNumber: string
  msgRef: string
  invoiceNumber: string
  invoiceDate: string
  currency: 'AED' | 'USD'
  portOfLoading?: string
  portOfDischarge?: string
  paymentTerms?: string
  template: CIPLTemplateId
  labelTemplate: PackingLabelTemplateId
  items: SourcingLineItem[]
  packages: CIPLPackageConfig[]
}

export interface ComputedPackageItem {
  item: SourcingLineItem
  qty: number
  unitWeightKg: number
  netWeightKg: number
  grossWeightKg: number
  unitPrice: number
  lineTotal: number
  origin: string
  hsCode: string
}

export interface ComputedPackageSummary {
  config: CIPLPackageConfig
  items: ComputedPackageItem[]
  totalPieces: number
  autoNetWeightKg: number
  netWeightKg: number
  grossWeightKg: number
  totalValue: number
}

export const CIPL_TEMPLATES: Array<{ id: CIPLTemplateId; name: string; description: string }> = [
  {
    id: 'standard',
    name: 'Standard Commercial Invoice & Packing List',
    description: 'Clean customs invoice & package-wise packing breakdown',
  },
  {
    id: 'oilfield_detailed',
    name: 'Oilfield Detailed (Heat #, Make & Cert)',
    description: 'Includes Heat Number, Manufacturer & MTC reference columns',
  },
  {
    id: 'compact_customs',
    name: 'Compact Customs Summary',
    description: 'Streamlined HSN, origin, package dims & net/gross weights',
  },
]

export const PACKING_LABEL_TEMPLATES: Array<{ id: PackingLabelTemplateId; name: string; description: string }> = [
  {
    id: 'warehouse_standard',
    name: 'Standard Warehouse Label (with QR)',
    description: 'Full item manifest, weights, dimensions and scannable QR tag',
  },
  {
    id: 'shipping_manifest',
    name: 'Export Shipping Mark & Manifest',
    description: 'Prominent consignee shipping mark with itemized contents table',
  },
  {
    id: 'thermal_pallet',
    name: 'Compact Pallet / Box Tag',
    description: 'High-contrast package tag focused on Pkg #, PO #, Weight & items',
  },
]

function sanitizeWinAnsi(text: string): string {
  return String(text || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/[×]/g, 'x')
    .replace(/[•·]/g, '|')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim()
}

export function normalizePkgNumber(rawNo?: string, fallbackPkgType?: string): string {
  const digits = String(rawNo || '').replace(/\D/g, '')
  if (digits) return digits
  const match = String(fallbackPkgType || '').match(/(\d+)/)
  return match ? match[1] : '1'
}

export function mapPackageType(raw?: string): CIPLPackageType {
  const up = String(raw || '').toUpperCase()
  if (up.includes('WOODEN BOX') || up.includes('W.BOX')) return 'WOODEN BOX'
  if (up.includes('CRATE')) return 'WOODEN CRATE'
  if (up.includes('CARTON') || up.includes('BOX')) return 'CARTON BOX'
  if (up.includes('BUNDLE')) return 'BUNDLE'
  return 'PALLET'
}

export function computeCIPLPackageSummaries(payload: CIPLDocumentPayload): {
  packages: ComputedPackageSummary[]
  totalPieces: number
  totalNetWeightKg: number
  totalGrossWeightKg: number
  totalAmount: number
  totalPackages: number
} {
  const pkgMap = new Map<string, CIPLPackageConfig>()
  payload.packages.forEach(p => {
    pkgMap.set(normalizePkgNumber(p.packageNo), p)
  })

  // Ensure every item references an existing package config
  payload.items.forEach(it => {
    const pNo = normalizePkgNumber(it.package_no, it.package_type)
    if (!pkgMap.has(pNo)) {
      pkgMap.set(pNo, {
        id: `PKG-${pNo}`,
        packageNo: pNo,
        packageType: mapPackageType(it.package_type),
        dimensions: pNo === '1' ? '120 X 80 X 100 CM' : '100 X 80 X 80 CM',
        tareWeightKg: 15,
      })
    }
  })

  if (pkgMap.size === 0) {
    pkgMap.set('1', {
      id: 'PKG-1',
      packageNo: '1',
      packageType: 'PALLET',
      dimensions: '120 X 80 X 100 CM',
      tareWeightKg: 15,
    })
  }

  const orderedConfigs = Array.from(pkgMap.values()).sort(
    (a, b) => (Number(a.packageNo) || 0) - (Number(b.packageNo) || 0)
  )

  const summaries: ComputedPackageSummary[] = orderedConfigs.map(cfg => {
    const pkgItemsRaw = payload.items.filter(
      it => normalizePkgNumber(it.package_no, it.package_type) === normalizePkgNumber(cfg.packageNo)
    )

    const computedItems: ComputedPackageItem[] = pkgItemsRaw.map(it => {
      const qty = Math.max(0, extractQtyNumber(it.qty))
      const unitWt = it.unit_weight_kg && it.unit_weight_kg > 0 ? it.unit_weight_kg : estimateUnitWeight(it.description, it.uom)
      const netWt = it.total_net_weight_kg && it.total_net_weight_kg > 0
        ? Math.round(it.total_net_weight_kg * 100) / 100
        : Math.round(qty * unitWt * 100) / 100
      const grossWt = it.total_gross_weight_kg && it.total_gross_weight_kg > 0
        ? Math.round(it.total_gross_weight_kg * 100) / 100
        : Math.round(netWt * 1.1 * 100) / 100
      const rate = Number(it.unit_price || 0)
      const lineTotal = Math.round(qty * rate * 100) / 100
      const origin = (it.country_of_origin || autoDetectCountryOfOrigin(it.make, it.description, it.remarks)).toUpperCase()
      const hsCode = it.hs_code || autoDetectHSCode(it.description)
      return {
        item: it,
        qty,
        unitWeightKg: Math.round(unitWt * 1000) / 1000,
        netWeightKg: netWt,
        grossWeightKg: grossWt,
        unitPrice: rate,
        lineTotal,
        origin,
        hsCode,
      }
    })

    const autoNet = Math.round(computedItems.reduce((s, r) => s + r.netWeightKg, 0) * 100) / 100
    const netWeightKg = cfg.manualNetWeightKg !== undefined && cfg.manualNetWeightKg >= 0
      ? Math.round(cfg.manualNetWeightKg * 100) / 100
      : autoNet
    const autoGross = Math.round((netWeightKg + (cfg.tareWeightKg || 0)) * 100) / 100
    const grossWeightKg = cfg.manualGrossWeightKg !== undefined && cfg.manualGrossWeightKg >= 0
      ? Math.round(cfg.manualGrossWeightKg * 100) / 100
      : autoGross

    return {
      config: cfg,
      items: computedItems,
      totalPieces: Math.round(computedItems.reduce((s, r) => s + r.qty, 0) * 100) / 100,
      autoNetWeightKg: autoNet,
      netWeightKg,
      grossWeightKg,
      totalValue: Math.round(computedItems.reduce((s, r) => s + r.lineTotal, 0) * 100) / 100,
    }
  })

  const nonEmptyOrAll = summaries.filter(s => s.items.length > 0).length > 0 ? summaries : summaries
  return {
    packages: nonEmptyOrAll,
    totalPieces: Math.round(summaries.reduce((s, p) => s + p.totalPieces, 0) * 100) / 100,
    totalNetWeightKg: Math.round(summaries.reduce((s, p) => s + p.netWeightKg, 0) * 100) / 100,
    totalGrossWeightKg: Math.round(summaries.reduce((s, p) => s + p.grossWeightKg, 0) * 100) / 100,
    totalAmount: Math.round(summaries.reduce((s, p) => s + p.totalValue, 0) * 100) / 100,
    totalPackages: summaries.filter(s => s.items.length > 0).length || summaries.length,
  }
}

export async function generateCIPLCustomWorkbook(payload: CIPLDocumentPayload): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  const summary = computeCIPLPackageSummaries(payload)
  const thinSide: ExcelJS.Border = { style: 'thin', color: { argb: 'FF334155' } }
  const border: Partial<ExcelJS.Borders> = { left: thinSide, right: thinSide, top: thinSide, bottom: thinSide }
  const isDetailed = payload.template === 'oilfield_detailed'

  // Sheet 1: COMMERCIAL INVOICE
  const wsInv = wb.addWorksheet('COMMERCIAL INVOICE')
  wsInv.getColumn(1).width = 8
  wsInv.getColumn(2).width = 44
  wsInv.getColumn(3).width = 10
  wsInv.getColumn(4).width = 10
  wsInv.getColumn(5).width = 15
  wsInv.getColumn(6).width = 14
  wsInv.getColumn(7).width = 14
  wsInv.getColumn(8).width = 16
  if (isDetailed) {
    wsInv.getColumn(9).width = 18
    wsInv.getColumn(10).width = 20
  }

  wsInv.getCell('A1').value = 'MSG OILFIELD EQUIPMENT TRADING LLC'
  wsInv.getCell('A1').font = { name: 'Arial', size: 12, bold: true }
  wsInv.getCell('A2').value = `COMMERCIAL INVOICE (${payload.template.toUpperCase()})`
  wsInv.getCell('A2').font = { name: 'Arial', size: 10, bold: true }
  wsInv.getCell('A3').value = `Invoice #: ${payload.invoiceNumber}   |   Date: ${payload.invoiceDate}   |   PO #: ${payload.poNumber}`
  wsInv.getCell('A4').value = `Consignee: ${payload.client} (${payload.consigneeAddress || 'UAE'})`
  wsInv.getCell('A5').value = `Port of Loading: ${payload.portOfLoading || 'Jebel Ali, UAE'}   |   Discharge: ${payload.portOfDischarge || 'Customer Site'}   |   Terms: ${payload.paymentTerms || 'As Agreed'}`

  const invHeaderRow = 7
  const invHeaders = isDetailed
    ? ['SR', 'DESCRIPTION', 'QTY', 'UOM', 'HS CODE', 'ORIGIN', `RATE (${payload.currency})`, `TOTAL (${payload.currency})`, 'HEAT #', 'MTC REF / MAKE']
    : ['SR', 'DESCRIPTION', 'QTY', 'UOM', 'HS CODE', 'ORIGIN', `RATE (${payload.currency})`, `TOTAL (${payload.currency})`]

  invHeaders.forEach((h, i) => {
    const c = wsInv.getRow(invHeaderRow).getCell(i + 1)
    c.value = h
    c.font = { name: 'Arial', size: 9, bold: true }
    c.border = border
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  })

  let rowInv = invHeaderRow + 1
  summary.packages.flatMap(p => p.items).forEach((entry, idx) => {
    const r = wsInv.getRow(rowInv)
    r.getCell(1).value = idx + 1
    r.getCell(2).value = entry.item.description
    r.getCell(3).value = entry.qty
    r.getCell(4).value = entry.item.uom || 'PCS'
    r.getCell(5).value = entry.hsCode
    r.getCell(6).value = entry.origin
    r.getCell(7).value = entry.unitPrice
    r.getCell(8).value = entry.lineTotal
    if (isDetailed) {
      r.getCell(9).value = entry.item.heat_number || '-'
      r.getCell(10).value = `${entry.item.certificate_number || '-'} / ${entry.item.make || '-'}`
    }
    for (let c = 1; c <= invHeaders.length; c++) {
      r.getCell(c).border = border
      r.getCell(c).font = { name: 'Arial', size: 8.5 }
    }
    rowInv++
  })

  const totInvRow = wsInv.getRow(rowInv + 1)
  totInvRow.getCell(2).value = `TOTAL (${summary.totalPackages} PACKAGES | NET ${summary.totalNetWeightKg.toFixed(2)} KG | GROSS ${summary.totalGrossWeightKg.toFixed(2)} KG)`
  totInvRow.getCell(2).font = { name: 'Arial', size: 9, bold: true }
  totInvRow.getCell(3).value = summary.totalPieces
  totInvRow.getCell(8).value = summary.totalAmount
  totInvRow.getCell(8).font = { name: 'Arial', size: 9.5, bold: true }

  // Sheet 2: PACKING LIST
  const wsPk = wb.addWorksheet('PACKING LIST')
  wsPk.getColumn(1).width = 8
  wsPk.getColumn(2).width = 44
  wsPk.getColumn(3).width = 10
  wsPk.getColumn(4).width = 10
  wsPk.getColumn(5).width = 15
  wsPk.getColumn(6).width = 14
  wsPk.getColumn(7).width = 14
  wsPk.getColumn(8).width = 16

  wsPk.getCell('A1').value = 'MSG OILFIELD EQUIPMENT TRADING LLC - PACKING LIST'
  wsPk.getCell('A1').font = { name: 'Arial', size: 11, bold: true }
  wsPk.getCell('A2').value = `Invoice #: ${payload.invoiceNumber}   |   PO #: ${payload.poNumber}   |   Client: ${payload.client}`

  let rowPk = 4
  summary.packages.forEach(pkg => {
    wsPk.mergeCells(`A${rowPk}:E${rowPk}`)
    wsPk.getCell(`A${rowPk}`).value = `PACKAGE #${pkg.config.packageNo} (${pkg.config.packageType}) - DIMS: ${pkg.config.dimensions}`
    wsPk.getCell(`A${rowPk}`).font = { name: 'Arial', size: 9, bold: true }
    wsPk.mergeCells(`F${rowPk}:H${rowPk}`)
    wsPk.getCell(`F${rowPk}`).value = `NET: ${pkg.netWeightKg.toFixed(2)} KG | GROSS: ${pkg.grossWeightKg.toFixed(2)} KG`
    wsPk.getCell(`F${rowPk}`).font = { name: 'Arial', size: 9, bold: true }
    for (let c = 1; c <= 8; c++) {
      wsPk.getRow(rowPk).getCell(c).border = border
      wsPk.getRow(rowPk).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    }
    rowPk++

    const headers = ['SR', 'DESCRIPTION', 'QTY', 'UOM', 'HS CODE', 'ORIGIN', 'UNIT WT (KG)', 'NET WT (KG)']
    headers.forEach((h, i) => {
      const cell = wsPk.getRow(rowPk).getCell(i + 1)
      cell.value = h
      cell.font = { name: 'Arial', size: 8.5, bold: true }
      cell.border = border
    })
    rowPk++

    pkg.items.forEach((entry, i) => {
      const r = wsPk.getRow(rowPk)
      r.getCell(1).value = i + 1
      r.getCell(2).value = entry.item.description
      r.getCell(3).value = entry.qty
      r.getCell(4).value = entry.item.uom || 'PCS'
      r.getCell(5).value = entry.hsCode
      r.getCell(6).value = entry.origin
      r.getCell(7).value = entry.unitWeightKg
      r.getCell(8).value = entry.netWeightKg
      for (let c = 1; c <= 8; c++) {
        r.getCell(c).border = border
        r.getCell(c).font = { name: 'Arial', size: 8.5 }
      }
      rowPk++
    })
    rowPk++
  })

  return wb
}

export async function downloadCustomCIPLExcel(payload: CIPLDocumentPayload): Promise<void> {
  const wb = await generateCIPLCustomWorkbook(payload)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `CIPL_${(payload.invoiceNumber || payload.poNumber || 'DOC').replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function generateCIPLPdfBytes(payload: CIPLDocumentPayload): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const summary = computeCIPLPackageSummaries(payload)
  const allItems = summary.packages.flatMap(p => p.items)

  const addHeader = (page: any, title: string) => {
    page.drawText('MSG OILFIELD EQUIPMENT TRADING LLC', { x: 40, y: 800, size: 12, font: fontBold, color: rgb(0.05, 0.14, 0.27) })
    page.drawText(sanitizeWinAnsi(title), { x: 40, y: 782, size: 10.5, font: fontBold, color: rgb(0.12, 0.32, 0.62) })
    page.drawText(
      sanitizeWinAnsi(`Inv #: ${payload.invoiceNumber}  |  Date: ${payload.invoiceDate}  |  PO #: ${payload.poNumber}  |  Ref: ${payload.msgRef}`),
      { x: 40, y: 766, size: 8.5, font: fontReg, color: rgb(0.2, 0.25, 0.33) }
    )
    page.drawText(
      sanitizeWinAnsi(`Client / Consignee: ${payload.client} (${payload.consigneeAddress || 'UAE'})`),
      { x: 40, y: 753, size: 8.5, font: fontReg, color: rgb(0.2, 0.25, 0.33) }
    )
    page.drawLine({ start: { x: 40, y: 745 }, end: { x: 555, y: 745 }, thickness: 1, color: rgb(0.75, 0.8, 0.88) })
  }

  // Page 1+: Commercial Invoice
  let page = pdfDoc.addPage([595, 842])
  addHeader(page, `COMMERCIAL INVOICE - TEMPLATE: ${payload.template.toUpperCase()}`)
  let y = 725

  page.drawText('SR', { x: 42, y, size: 8, font: fontBold })
  page.drawText('DESCRIPTION', { x: 70, y, size: 8, font: fontBold })
  page.drawText('QTY', { x: 325, y, size: 8, font: fontBold })
  page.drawText('ORIGIN / HS', { x: 370, y, size: 8, font: fontBold })
  page.drawText(`RATE (${payload.currency})`, { x: 455, y, size: 8, font: fontBold })
  page.drawText(`TOTAL`, { x: 515, y, size: 8, font: fontBold })
  y -= 14

  allItems.forEach((entry, idx) => {
    if (y < 70) {
      page = pdfDoc.addPage([595, 842])
      addHeader(page, 'COMMERCIAL INVOICE (CONTINUED)')
      y = 720
    }
    const extraDetail = payload.template === 'oilfield_detailed' && entry.item.heat_number
      ? ` [Heat: ${entry.item.heat_number}]`
      : ''
    const descLine = sanitizeWinAnsi(`${entry.item.description}${extraDetail}`).slice(0, 56)
    page.drawText(String(idx + 1), { x: 42, y, size: 8, font: fontReg })
    page.drawText(descLine, { x: 70, y, size: 8, font: fontReg })
    page.drawText(`${entry.qty} ${entry.item.uom || 'PCS'}`, { x: 325, y, size: 8, font: fontReg })
    page.drawText(sanitizeWinAnsi(`${entry.origin} / ${entry.hsCode}`).slice(0, 18), { x: 370, y, size: 7.5, font: fontReg })
    page.drawText(entry.unitPrice.toFixed(2), { x: 455, y, size: 8, font: fontReg })
    page.drawText(entry.lineTotal.toFixed(2), { x: 515, y, size: 8, font: fontBold })
    y -= 14
  })

  y -= 8
  page.drawText(
    sanitizeWinAnsi(`INVOICE TOTAL: ${payload.currency} ${summary.totalAmount.toFixed(2)}  |  TOTAL PCS: ${summary.totalPieces}  |  NET: ${summary.totalNetWeightKg.toFixed(2)} KG  |  GROSS: ${summary.totalGrossWeightKg.toFixed(2)} KG`),
    { x: 42, y, size: 9, font: fontBold, color: rgb(0.05, 0.14, 0.27) }
  )

  // Packing List Pages (grouped per package)
  let pkPage = pdfDoc.addPage([595, 842])
  addHeader(pkPage, `PACKING LIST (${summary.totalPackages} PACKAGES)`)
  let pkY = 725

  summary.packages.forEach(pkg => {
    if (pkY < 110) {
      pkPage = pdfDoc.addPage([595, 842])
      addHeader(pkPage, 'PACKING LIST (CONTINUED)')
      pkY = 720
    }
    pkPage.drawRectangle({ x: 40, y: pkY - 4, width: 515, height: 18, color: rgb(0.94, 0.96, 0.99) })
    pkPage.drawText(
      sanitizeWinAnsi(`PACKAGE #${pkg.config.packageNo} (${pkg.config.packageType}) | DIMS: ${pkg.config.dimensions} | NET: ${pkg.netWeightKg.toFixed(2)} KG | GROSS: ${pkg.grossWeightKg.toFixed(2)} KG`),
      { x: 46, y: pkY + 1, size: 8.2, font: fontBold, color: rgb(0.06, 0.18, 0.36) }
    )
    pkY -= 20

    pkg.items.forEach((entry, i) => {
      if (pkY < 60) {
        pkPage = pdfDoc.addPage([595, 842])
        addHeader(pkPage, 'PACKING LIST (CONTINUED)')
        pkY = 720
      }
      pkPage.drawText(
        sanitizeWinAnsi(`${i + 1}. ${entry.item.description}`).slice(0, 62),
        { x: 46, y: pkY, size: 8, font: fontReg }
      )
      pkPage.drawText(
        sanitizeWinAnsi(`${entry.qty} ${entry.item.uom || 'PCS'} | Unit: ${entry.unitWeightKg.toFixed(2)} kg | Net: ${entry.netWeightKg.toFixed(2)} kg`),
        { x: 350, y: pkY, size: 8, font: fontReg }
      )
      pkY -= 13
    })
    pkY -= 8
  })

  return await pdfDoc.save()
}

export async function generatePackingLabelsPdfBytes(
  payload: CIPLDocumentPayload,
  onlyPackageNo?: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const summary = computeCIPLPackageSummaries(payload)
  const targets = onlyPackageNo
    ? summary.packages.filter(p => normalizePkgNumber(p.config.packageNo) === normalizePkgNumber(onlyPackageNo))
    : summary.packages

  for (const pkg of targets) {
    const page = pdfDoc.addPage([420, 595]) // A5 portrait label per package
    page.drawRectangle({ x: 16, y: 16, width: 388, height: 563, borderColor: rgb(0.1, 0.15, 0.25), borderWidth: 1.5 })

    // Header band
    page.drawRectangle({ x: 16, y: 525, width: 388, height: 54, color: rgb(0.05, 0.16, 0.35) })
    page.drawText('MSG OILFIELD EQUIPMENT TRADING LLC', { x: 26, y: 558, size: 10, font: fontBold, color: rgb(1, 1, 1) })
    page.drawText(
      sanitizeWinAnsi(`PACKING LABEL (${payload.labelTemplate.replace(/_/g, ' ').toUpperCase()})`),
      { x: 26, y: 542, size: 8.5, font: fontReg, color: rgb(0.85, 0.92, 1) }
    )
    page.drawText(
      sanitizeWinAnsi(`PKG #${pkg.config.packageNo} OF ${summary.totalPackages}`),
      { x: 295, y: 546, size: 12, font: fontBold, color: rgb(0.98, 0.85, 0.35) }
    )

    // Metadata box
    page.drawText(sanitizeWinAnsi(`PACKAGE TYPE: ${pkg.config.packageType}`), { x: 26, y: 505, size: 9.5, font: fontBold })
    page.drawText(sanitizeWinAnsi(`DIMENSIONS: ${pkg.config.dimensions}`), { x: 26, y: 490, size: 8.5, font: fontReg })
    page.drawText(
      sanitizeWinAnsi(`NET WT: ${pkg.netWeightKg.toFixed(2)} KG   |   GROSS WT: ${pkg.grossWeightKg.toFixed(2)} KG`),
      { x: 26, y: 475, size: 9, font: fontBold, color: rgb(0.1, 0.35, 0.15) }
    )
    page.drawText(sanitizeWinAnsi(`CLIENT: ${payload.client}`).slice(0, 48), { x: 26, y: 458, size: 8.5, font: fontReg })
    page.drawText(sanitizeWinAnsi(`PO REF: ${payload.poNumber}  |  INV #: ${payload.invoiceNumber}`).slice(0, 50), { x: 26, y: 444, size: 8.5, font: fontBold })
    if (pkg.config.shippingMark) {
      page.drawText(sanitizeWinAnsi(`MARK: ${pkg.config.shippingMark}`).slice(0, 50), { x: 26, y: 430, size: 8, font: fontReg })
    }

    // Embedded QR Code on right
    try {
      const qrData = await QRCode.toDataURL(
        JSON.stringify({
          inv: payload.invoiceNumber,
          po: payload.poNumber,
          pkg: pkg.config.packageNo,
          type: pkg.config.packageType,
          grossKg: pkg.grossWeightKg,
          pcs: pkg.totalPieces,
        }),
        { width: 90, margin: 1 }
      )
      const qrImg = await pdfDoc.embedPng(qrData)
      page.drawImage(qrImg, { x: 325, y: 442, width: 68, height: 68 })
    } catch {
      // skip QR if canvas unavailable
    }

    page.drawLine({ start: { x: 24, y: 420 }, end: { x: 396, y: 420 }, thickness: 1, color: rgb(0.75, 0.8, 0.88) })
    page.drawText('PACKED MATERIALS & QUANTITIES', { x: 26, y: 405, size: 8.5, font: fontBold, color: rgb(0.1, 0.2, 0.4) })

    let y = 387
    pkg.items.forEach((entry, idx) => {
      if (y < 42) return
      const heatSuffix = entry.item.heat_number ? ` [Heat: ${entry.item.heat_number}]` : ''
      page.drawText(
        sanitizeWinAnsi(`${idx + 1}. ${entry.item.description}${heatSuffix}`).slice(0, 52),
        { x: 26, y, size: 8, font: fontReg }
      )
      page.drawText(
        sanitizeWinAnsi(`${entry.qty} ${entry.item.uom || 'PCS'} (${entry.netWeightKg.toFixed(1)} kg)`),
        { x: 300, y, size: 8, font: fontBold }
      )
      y -= 15
    })

    page.drawText(
      sanitizeWinAnsi(`Total Pieces: ${pkg.totalPieces}  |  MSG Warehouse Dispatch Label`),
      { x: 26, y: 26, size: 7.5, font: fontReg, color: rgb(0.4, 0.45, 0.55) }
    )
  }

  return await pdfDoc.save()
}

export async function generatePackingLabelsWorkbook(
  payload: CIPLDocumentPayload,
  onlyPackageNo?: string
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  const summary = computeCIPLPackageSummaries(payload)
  const targets = onlyPackageNo
    ? summary.packages.filter(p => normalizePkgNumber(p.config.packageNo) === normalizePkgNumber(onlyPackageNo))
    : summary.packages

  const thinSide: ExcelJS.Border = { style: 'thin', color: { argb: 'FF334155' } }
  const border: Partial<ExcelJS.Borders> = { left: thinSide, right: thinSide, top: thinSide, bottom: thinSide }

  targets.forEach(pkg => {
    const ws = wb.addWorksheet(`PKG_${pkg.config.packageNo}`)
    ws.getColumn(1).width = 8
    ws.getColumn(2).width = 46
    ws.getColumn(3).width = 14
    ws.getColumn(4).width = 12
    ws.getColumn(5).width = 18
    ws.getColumn(6).width = 16

    ws.getCell('A1').value = `PACKING LABEL - PACKAGE #${pkg.config.packageNo} OF ${summary.totalPackages} (${pkg.config.packageType})`
    ws.getCell('A1').font = { name: 'Arial', size: 11, bold: true }
    ws.getCell('A2').value = `Client: ${payload.client}   |   PO #: ${payload.poNumber}   |   Invoice #: ${payload.invoiceNumber}`
    ws.getCell('A3').value = `Dimensions: ${pkg.config.dimensions}   |   Net Weight: ${pkg.netWeightKg.toFixed(2)} kg   |   Gross Weight: ${pkg.grossWeightKg.toFixed(2)} kg`
    ws.getCell('A4').value = `Template: ${payload.labelTemplate}   |   Shipping Mark: ${pkg.config.shippingMark || payload.client}`

    const headers = ['SL', 'MATERIAL DESCRIPTION', 'HEAT #', 'QTY', 'UOM', 'NET WT (KG)']
    headers.forEach((h, idx) => {
      const c = ws.getRow(6).getCell(idx + 1)
      c.value = h
      c.font = { name: 'Arial', size: 9, bold: true }
      c.border = border
    })

    let r = 7
    pkg.items.forEach((entry, idx) => {
      const row = ws.getRow(r)
      row.getCell(1).value = idx + 1
      row.getCell(2).value = entry.item.description
      row.getCell(3).value = entry.item.heat_number || '-'
      row.getCell(4).value = entry.qty
      row.getCell(5).value = entry.item.uom || 'PCS'
      row.getCell(6).value = entry.netWeightKg
      for (let col = 1; col <= 6; col++) {
        row.getCell(col).border = border
      }
      r++
    })
  })

  return wb
}

export async function downloadCIPLPdf(payload: CIPLDocumentPayload): Promise<void> {
  const bytes = await generateCIPLPdfBytes(payload)
  downloadPDFBlob(bytes, `CIPL_${(payload.invoiceNumber || payload.poNumber || 'DOC').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`)
}

export async function downloadPackingLabelsPdf(payload: CIPLDocumentPayload, onlyPackageNo?: string): Promise<void> {
  const bytes = await generatePackingLabelsPdfBytes(payload, onlyPackageNo)
  const suffix = onlyPackageNo ? `_PKG_${onlyPackageNo}` : '_ALL'
  downloadPDFBlob(bytes, `Packing_Labels${suffix}_${(payload.poNumber || 'DOC').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`)
}

export async function downloadPackingLabelsExcel(payload: CIPLDocumentPayload, onlyPackageNo?: string): Promise<void> {
  const wb = await generatePackingLabelsWorkbook(payload, onlyPackageNo)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const suffix = onlyPackageNo ? `_PKG_${onlyPackageNo}` : '_ALL'
  a.download = `Packing_Labels${suffix}_${(payload.poNumber || 'DOC').replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
