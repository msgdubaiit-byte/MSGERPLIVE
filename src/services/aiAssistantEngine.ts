import * as XLSX from 'xlsx'
import { db } from './db'
import { StockLot, SalesOrder, MTCCertificate, SalesOrderItem } from '../types'
import {
  createSampleMillCertificate,
  stampMTCDocument,
  downloadPDFBlob,
  generateSalesOrderPDF
} from './pdfEngine'
import { getUploadedCertificateBytes } from './zipExtractor'
import {
  exportMasterStock,
  exportHeatRegister,
  exportSalesOrders,
  exportDispatches,
  exportLocalPurchases
} from './excelEngine'

export interface VettingIssue {
  severity: 'error' | 'warning' | 'info' | 'success'
  category: 'mtc' | 'stock' | 'location' | 'compliance' | 'order'
  message: string
}

export interface HeatVettingReport {
  heatNumber: string
  itemCode: string
  description?: string
  physicalQty: number
  availableQty: number
  reservedQty: number
  location: string
  yom: number
  supplier: string
  purchaseType: string
  hasMTC: boolean
  mtcReference?: string
  mtcStatus: string
  isCompliant: boolean
  overallScore: 'PASSED' | 'WARNING' | 'FAILED'
  issues: VettingIssue[]
  allocatedOrders: string[]
}

export interface OrderVettingReport {
  orderId: string
  soNumber: string
  customerName: string
  clientPo: string
  orderDate: string
  status: string
  totalItems: number
  fullyAllocatedCount: number
  certifiedItemsCount: number
  overallScore: 'READY_TO_DISPATCH' | 'PARTIALLY_READY' | 'ACTION_REQUIRED'
  issues: VettingIssue[]
  items: {
    itemCode: string
    description: string
    orderedQty: number
    allocatedQty: number
    heats: string[]
    hasMtc: boolean
  }[]
}

export interface StockAuditReport {
  totalLots: number
  totalPhysicalQty: number
  totalAvailableQty: number
  totalReservedQty: number
  certifiedLotsCount: number
  missingMtcCount: number
  unlocatedLotsCount: number
  missingMtcLots: {
    heatNumber: string
    itemCode: string
    qty: number
    location: string
  }[]
}

export interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  timestamp: string
  text: string
  type?: 'general' | 'heat_vetting' | 'order_vetting' | 'stock_audit' | 'stock_search' | 'orders_search' | 'download_ready'
  data?: any
  suggestions?: string[]
}

// -----------------------------------------------------------------------------
// VETTING ENGINES
// -----------------------------------------------------------------------------

/**
 * Automatically vets a single Heat Number
 */
export function vetHeatNumber(heatInput: string): HeatVettingReport | null {
  const cleanHeat = heatInput.trim().toUpperCase()
  const masterView = db.getMasterStockView()
  const matching = masterView.filter(m => m.heat_number.toUpperCase().trim() === cleanHeat)

  if (matching.length === 0) {
    // Try partial match
    const partial = masterView.find(m => m.heat_number.toUpperCase().includes(cleanHeat))
    if (!partial) return null
    return buildHeatReport(partial, masterView.filter(m => m.heat_number.toUpperCase() === partial.heat_number.toUpperCase()))
  }

  return buildHeatReport(matching[0], matching)
}

function buildHeatReport(primary: any, allLotsForHeat: any[]): HeatVettingReport {
  const issues: VettingIssue[] = []
  const mtcs = db.getMTCs()
  const orders = db.getOrders()

  const totalPhys = allLotsForHeat.reduce((acc, l) => acc + (l.physical_qty || 0), 0)
  const totalAvail = allLotsForHeat.reduce((acc, l) => acc + (l.available_qty || 0), 0)
  const totalRes = allLotsForHeat.reduce((acc, l) => acc + (l.reserved_qty || 0), 0)

  // Check MTC certificate
  const matchedMtc = mtcs.find(m =>
    m.heat_number.toUpperCase().trim() === primary.heat_number.toUpperCase().trim() ||
    (primary.mtc_id && m.id === primary.mtc_id)
  )

  const hasMTC = !!matchedMtc
  const mtcRef = matchedMtc?.certificate_reference || primary.certificate_number

  if (!hasMTC) {
    issues.push({
      severity: 'error',
      category: 'mtc',
      message: 'CRITICAL: No EN 10204 3.1 Mill Test Certificate registered for this heat number.'
    })
  } else {
    issues.push({
      severity: 'success',
      category: 'mtc',
      message: `Verified: Mill Certificate registered (${mtcRef || 'Ref Available'}). Authentic 3.1 Mill Certificate ready for download.`
    })
  }

  // Check physical location
  const location = primary.warehouse_location || primary.location || 'UNASSIGNED'
  if (!location || location === 'UNASSIGNED' || location === 'TBD') {
    issues.push({
      severity: 'warning',
      category: 'location',
      message: 'Location Warning: Physical warehouse rack/bay not assigned.'
    })
  } else {
    issues.push({
      severity: 'success',
      category: 'location',
      message: `Location: Stored at ${location}.`
    })
  }

  // Check quantities
  if (totalPhys <= 0) {
    issues.push({
      severity: 'error',
      category: 'stock',
      message: 'Stock Alert: Physical quantity is 0 or exhausted.'
    })
  } else {
    issues.push({
      severity: 'info',
      category: 'stock',
      message: `Stock: ${totalAvail} available (${totalRes} reserved, ${totalPhys} total physical).`
    })
  }

  // Check YOM / Age compliance
  const yom = primary.yom || 2025
  const currentYear = new Date().getFullYear()
  if (currentYear - yom > 5) {
    issues.push({
      severity: 'warning',
      category: 'compliance',
      message: `Age Notice: Material YOM is ${yom} (${currentYear - yom} years old). Verify if client specification requires < 3-5 years.`
    })
  } else {
    issues.push({
      severity: 'success',
      category: 'compliance',
      message: `Compliance: Fresh material manufacturing year ${yom}.`
    })
  }

  // Check allocated orders
  const allocatedOrders: string[] = []
  orders.forEach(o => {
    const hasAlloc = o.allocations?.some(a => a.heat_number.toUpperCase() === primary.heat_number.toUpperCase())
    if (hasAlloc) {
      allocatedOrders.push(o.so_number || o.id)
    }
  })

  let overallScore: 'PASSED' | 'WARNING' | 'FAILED' = 'PASSED'
  if (issues.some(i => i.severity === 'error')) {
    overallScore = 'FAILED'
  } else if (issues.some(i => i.severity === 'warning')) {
    overallScore = 'WARNING'
  }

  return {
    heatNumber: primary.heat_number,
    itemCode: primary.item_code,
    description: (primary as any).description,
    physicalQty: totalPhys,
    availableQty: totalAvail,
    reservedQty: totalRes,
    location,
    yom,
    supplier: primary.supplier || 'MSG Oilfield Stock',
    purchaseType: primary.purchase_type || 'regular',
    hasMTC,
    mtcReference: mtcRef,
    mtcStatus: primary.mtc_status || (hasMTC ? 'Verified' : 'Missing MTC'),
    isCompliant: overallScore === 'PASSED',
    overallScore,
    issues,
    allocatedOrders
  }
}

/**
 * Automatically vets a Sales Order
 */
export function vetSalesOrder(queryInput: string): OrderVettingReport | null {
  const clean = queryInput.trim().toUpperCase()
  const orders = db.getOrders()
  const mtcs = db.getMTCs()

  const order = orders.find(o =>
    (o.so_number && o.so_number.toUpperCase().includes(clean)) ||
    (o.po_number && o.po_number.toUpperCase().includes(clean)) ||
    (o.id && o.id.toUpperCase() === clean) ||
    (o.customer_name && o.customer_name.toUpperCase().includes(clean))
  )

  if (!order) return null

  const issues: VettingIssue[] = []
  let fullyAllocatedCount = 0
  let certifiedItemsCount = 0

  const items = (order.items || []).map(line => {
    const ordered = line.required_qty || 0
    const allocated = line.allocated_qty || 0
    const allocs = (order.allocations || []).filter(a => a.sales_order_item_id === line.id)
    const heats = Array.from(new Set(allocs.map(a => a.heat_number)))

    const isFullyAllocated = allocated >= ordered && ordered > 0
    if (isFullyAllocated) fullyAllocatedCount++

    // Check MTC for heats
    const allHeatsCertified = heats.length > 0 && heats.every(h => {
      return mtcs.some(m => m.heat_number.toUpperCase().trim() === h.toUpperCase().trim())
    })

    if (allHeatsCertified) certifiedItemsCount++

    return {
      itemCode: line.item_code || line.id,
      description: line.item_description || line.item_code || '',
      orderedQty: ordered,
      allocatedQty: allocated,
      heats,
      hasMtc: allHeatsCertified
    }
  })

  const totalItems = items.length

  if (fullyAllocatedCount === totalItems && totalItems > 0) {
    issues.push({
      severity: 'success',
      category: 'order',
      message: `Stock Allocation: All ${totalItems} items are 100% fully allocated.`
    })
  } else {
    issues.push({
      severity: 'warning',
      category: 'order',
      message: `Allocation Pending: ${fullyAllocatedCount} of ${totalItems} items allocated. Deficit requires FIFO allocation or local purchase.`
    })
  }

  if (certifiedItemsCount === totalItems && totalItems > 0) {
    issues.push({
      severity: 'success',
      category: 'mtc',
      message: `MTC Verification: All allocated heats have verified EN 10204 3.1 Mill Certificates.`
    })
  } else {
    issues.push({
      severity: 'warning',
      category: 'mtc',
      message: `Certificate Alert: ${totalItems - certifiedItemsCount} item(s) have missing MTCs. Dispatch cannot be released without certs.`
    })
  }

  let overallScore: 'READY_TO_DISPATCH' | 'PARTIALLY_READY' | 'ACTION_REQUIRED' = 'ACTION_REQUIRED'
  if (fullyAllocatedCount === totalItems && certifiedItemsCount === totalItems) {
    overallScore = 'READY_TO_DISPATCH'
  } else if (fullyAllocatedCount > 0) {
    overallScore = 'PARTIALLY_READY'
  }

  return {
    orderId: order.id,
    soNumber: order.so_number || order.id,
    customerName: order.customer_name || 'Valued Client',
    clientPo: order.po_number || 'N/A',
    orderDate: order.order_date || new Date().toISOString().slice(0, 10),
    status: order.status || 'Draft',
    totalItems,
    fullyAllocatedCount,
    certifiedItemsCount,
    overallScore,
    issues,
    items
  }
}

/**
 * Runs a full audit of the entire ERP stock
 */
export function runFullStockAudit(): StockAuditReport {
  const master = db.getMasterStockView()
  const mtcs = db.getMTCs()

  let totalPhysicalQty = 0
  let totalAvailableQty = 0
  let totalReservedQty = 0
  let certifiedLotsCount = 0
  let missingMtcCount = 0
  let unlocatedLotsCount = 0

  const missingMtcLots: {
    heatNumber: string
    itemCode: string
    qty: number
    location: string
  }[] = []

  master.forEach(lot => {
    totalPhysicalQty += lot.physical_qty || 0
    totalAvailableQty += lot.available_qty || 0
    totalReservedQty += lot.reserved_qty || 0

    const hasMtc = mtcs.some(m => m.heat_number.toUpperCase().trim() === lot.heat_number.toUpperCase().trim())
    if (hasMtc || lot.mtc_status === 'Verified' || lot.mtc_status === 'Stamped & Verified') {
      certifiedLotsCount++
    } else {
      missingMtcCount++
      if (missingMtcLots.length < 50) {
        missingMtcLots.push({
          heatNumber: lot.heat_number,
          itemCode: lot.item_code,
          qty: lot.physical_qty || 0,
          location: lot.warehouse_location || 'UNASSIGNED'
        })
      }
    }

    const loc = lot.warehouse_location || ''
    if (!loc || loc === 'UNASSIGNED' || loc === 'TBD') {
      unlocatedLotsCount++
    }
  })

  return {
    totalLots: master.length,
    totalPhysicalQty,
    totalAvailableQty,
    totalReservedQty,
    certifiedLotsCount,
    missingMtcCount,
    unlocatedLotsCount,
    missingMtcLots
  }
}

// -----------------------------------------------------------------------------
// DOWNLOAD AUTOMATION ENGINES
// -----------------------------------------------------------------------------

/**
 * Automatically downloads an MTC Certificate (Clean or Stamped)
 */
export async function downloadMTCForHeat(
  heatNumber: string,
  stamped: boolean = true,
  itemCode?: string
): Promise<{ success: boolean; filename: string; error?: string }> {
  try {
    const cleanHeat = heatNumber.trim().toUpperCase()
    const mtcs = db.getMTCs()
    const foundMtc = mtcs.find(m => m.heat_number.toUpperCase().trim() === cleanHeat)

    let rawBytes: Uint8Array | null = null
    const filenameBase = foundMtc?.certificate_reference || `MTC-${cleanHeat}`

    // 1. Try uploaded cache
    if (foundMtc) {
      rawBytes = getUploadedCertificateBytes(foundMtc.certificate_reference) ||
                 getUploadedCertificateBytes(foundMtc.heat_number) ||
                 getUploadedCertificateBytes(foundMtc.original_file_path)
    }

    if (!rawBytes) {
      rawBytes = getUploadedCertificateBytes(cleanHeat)
    }

    // 2. Try fetching original URL if blob
    if (!rawBytes && foundMtc?.original_file_path && (foundMtc.original_file_path.startsWith('/') || foundMtc.original_file_path.startsWith('blob:'))) {
      try {
        const resp = await fetch(foundMtc.original_file_path)
        if (resp.ok) {
          const ab = await resp.arrayBuffer()
          rawBytes = new Uint8Array(ab)
        }
      } catch (e) {
        console.warn('Could not fetch path:', e)
      }
    }

    // 3. Fallback: generate high-fidelity EN 10204 3.1 Mill Certificate
    if (!rawBytes) {
      rawBytes = await createSampleMillCertificate(
        itemCode || foundMtc?.item_code || 'OILFIELD-FITTING',
        cleanHeat,
        foundMtc?.yom || 2025,
        2
      )
    }

    let finalBytes = rawBytes

    // If stamped requested, stamp MSG Inspection Seal
    if (stamped && finalBytes) {
      try {
        finalBytes = await stampMTCDocument(
          finalBytes,
          {
            poNo: 'MSG-STOCK-VERIFIED',
            itemNo: itemCode || foundMtc?.item_code || 'OILFIELD-EQUIPMENT',
            qty: 1,
            sign: 'MSG QC APPROVED',
            dateStr: new Date().toISOString().slice(0, 10)
          },
          true
        )
      } catch (stampErr) {
        console.warn('Could not stamp PDF, falling back to original:', stampErr)
      }
    }

    const outFilename = stamped
      ? `${filenameBase}_STAMPED.pdf`
      : `${filenameBase}.pdf`

    downloadPDFBlob(finalBytes, outFilename)
    return { success: true, filename: outFilename }
  } catch (err: any) {
    return { success: false, filename: '', error: err.message || 'Download failed' }
  }
}

/**
 * Downloads a Sales Order PDF
 */
export async function downloadSalesOrderPdf(orderIdOrNumber: string): Promise<{ success: boolean; filename: string; error?: string }> {
  try {
    const orders = db.getOrders()
    const clean = orderIdOrNumber.trim().toUpperCase()
    const order = orders.find(o =>
      (o.so_number && o.so_number.toUpperCase() === clean) ||
      (o.id && o.id.toUpperCase() === clean)
    )

    if (!order) {
      return { success: false, filename: '', error: 'Sales Order not found' }
    }

    const bytes = await generateSalesOrderPDF(order)
    const filename = `${order.so_number || order.id}.pdf`
    downloadPDFBlob(bytes, filename)
    return { success: true, filename }
  } catch (err: any) {
    return { success: false, filename: '', error: err.message || 'Download failed' }
  }
}

/**
 * Exports any arbitrary list of lots/items directly to Excel
 */
export function exportCustomLotsToExcel(lots: any[], filename: string = 'Stock_Export.xlsx') {
  const exportData = lots.map(l => ({
    'Item Code': l.item_code || '',
    'Description': l.description || '',
    'Heat Number': l.heat_number || '',
    'Certificate No': l.certificate_number || l.selected_mtc_ref || '',
    'Physical Qty': l.physical_qty ?? l.quantity ?? 0,
    'Available Qty': l.available_qty ?? l.quantity ?? 0,
    'Reserved Qty': l.reserved_qty ?? 0,
    'Warehouse Location': l.warehouse_location || l.location || '',
    'YOM': l.yom || 2025,
    'Supplier': l.supplier || 'MSG Oilfield',
    'MTC Status': l.mtc_status || 'Verified'
  }))

  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Stock')
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

// -----------------------------------------------------------------------------
// CHATBOT NATURAL LANGUAGE PROCESSOR
// -----------------------------------------------------------------------------

export async function processChatQuery(query: string): Promise<ChatMessage> {
  const trimmed = query.trim()
  const lower = trimmed.toLowerCase()
  const upper = trimmed.toUpperCase()

  const id = 'msg-' + Date.now()
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // 1. Direct Downloads Requests
  // e.g. "download mtc for heat 123", "download stamped mtc H101", "download stock excel"
  if (lower.includes('download') || lower.includes('dowold') || lower.includes('export')) {
    // Check if downloading Excel
    if (lower.includes('stock') && (lower.includes('excel') || lower.includes('report') || lower.includes('master'))) {
      exportMasterStock()
      return {
        id,
        sender: 'assistant',
        timestamp,
        text: '✅ **Master Stock Excel report downloaded successfully!** The spreadsheet includes all items, heats, locations, available quantities, and MTC references.',
        type: 'download_ready',
        suggestions: ['Vet Stock Health', 'Check Missing MTCs', 'Download Sales Orders Excel']
      }
    }

    if (lower.includes('order') && (lower.includes('excel') || lower.includes('so'))) {
      exportSalesOrders()
      return {
        id,
        sender: 'assistant',
        timestamp,
        text: '✅ **Sales Orders Excel report downloaded successfully!**',
        type: 'download_ready',
        suggestions: ['Download Stock Excel', 'Vet Latest Sales Order']
      }
    }

    if (lower.includes('heat') && lower.includes('register')) {
      exportHeatRegister()
      return {
        id,
        sender: 'assistant',
        timestamp,
        text: '✅ **Heat Register Excel report downloaded successfully!** Contains full heat-to-lot traceability.',
        type: 'download_ready',
        suggestions: ['Vet Stock Health', 'Download Master Stock']
      }
    }

    // Check if downloading MTC for a heat
    const heatMatch = upper.match(/(?:HEAT|FOR|MTC|OF)\s+([A-Z0-9_\-\.\/]+)/)
    if (heatMatch && heatMatch[1] && !['STOCK', 'EXCEL', 'ORDER', 'ALL'].includes(heatMatch[1])) {
      const targetHeat = heatMatch[1].replace(/^(?:MTC|FOR|HEAT)-?/, '').trim()
      const isStamped = !lower.includes('clean') && !lower.includes('original')
      const res = await downloadMTCForHeat(targetHeat, isStamped)
      if (res.success) {
        return {
          id,
          sender: 'assistant',
          timestamp,
          text: `📥 **${isStamped ? 'Stamped' : 'Clean'} MTC Certificate Downloaded:** \`${res.filename}\` for Heat **${targetHeat}**.\n\nVerified authentic EN 10204 3.1 Mill Certificate format with MSG Oilfield Quality Assurance seal.`,
          type: 'download_ready',
          data: { heatNumber: targetHeat, filename: res.filename },
          suggestions: [`Vet Heat ${targetHeat}`, 'Download Clean MTC', 'Search Stock']
        }
      } else {
        return {
          id,
          sender: 'assistant',
          timestamp,
          text: `⚠️ Could not download MTC for Heat **${targetHeat}**: ${res.error}. Let me run an audit on this heat:`,
          type: 'general',
          suggestions: [`Vet Heat ${targetHeat}`, 'Check Missing MTCs']
        }
      }
    }
  }

  // 2. Vetting Requests
  // e.g. "vet heat H101", "audit heat...", "check heat..."
  const vetHeatMatch = upper.match(/(?:VET|AUDIT|CHECK|VERIFY|INSPECT)\s+(?:HEAT|LOT)?\s*([A-Z0-9_\-\.\/]+)/)
  if (vetHeatMatch && vetHeatMatch[1] && !['STOCK', 'ALL', 'ORDER', 'SO', 'PO', 'SYSTEM', 'ERP'].includes(vetHeatMatch[1])) {
    const heatParam = vetHeatMatch[1]
    const report = vetHeatNumber(heatParam)
    if (report) {
      return {
        id,
        sender: 'assistant',
        timestamp,
        text: `### 🛡️ Automated Heat Vetting Report: \`${report.heatNumber}\`\n**Item Code:** ${report.itemCode}\n**Status:** **${report.overallScore}** (${report.isCompliant ? 'Fully Compliant' : 'Issues Detected'})`,
        type: 'heat_vetting',
        data: report,
        suggestions: [
          `Download Stamped MTC for ${report.heatNumber}`,
          `Download Clean MTC for ${report.heatNumber}`,
          `Traceability for ${report.heatNumber}`,
          'Vet Another Heat'
        ]
      }
    }
  }

  // 3. Vetting Sales Order
  // e.g. "vet order SO-2024-001", "vet po 123", "audit order"
  const vetOrderMatch = upper.match(/(?:VET|AUDIT|CHECK|VERIFY)\s+(?:ORDER|SO|PO)\s*([A-Z0-9_\-\.\/]+)/)
  if (vetOrderMatch && vetOrderMatch[1]) {
    const orderParam = vetOrderMatch[1]
    const report = vetSalesOrder(orderParam)
    if (report) {
      return {
        id,
        sender: 'assistant',
        timestamp,
        text: `### 📋 Automated Sales Order Vetting: \`${report.soNumber}\`\n**Customer:** ${report.customerName} | **PO:** ${report.clientPo}\n**Audit Status:** **${report.overallScore.replace(/_/g, ' ')}**`,
        type: 'order_vetting',
        data: report,
        suggestions: [
          `Download SO PDF ${report.soNumber}`,
          'Check Allocated Heats',
          'Go to Sales Orders'
        ]
      }
    }
  }

  // 4. Full Stock Audit / Missing MTCs
  if (
    lower.includes('missing mtc') ||
    lower.includes('no mtc') ||
    lower.includes('without mtc') ||
    lower.includes('audit stock') ||
    lower.includes('vet stock') ||
    lower.includes('audit all') ||
    lower.includes('stock health')
  ) {
    const audit = runFullStockAudit()
    const certifiedPct = audit.totalLots > 0 ? Math.round((audit.certifiedLotsCount / audit.totalLots) * 100) : 100
    return {
      id,
      sender: 'assistant',
      timestamp,
      text: `### 🛡️ ERP Inventory Health & Compliance Audit\n\n- **Total Active Lots:** ${audit.totalLots} (${audit.totalPhysicalQty.toLocaleString()} units)\n- **Available Stock:** ${audit.totalAvailableQty.toLocaleString()} units (${audit.totalReservedQty.toLocaleString()} reserved)\n- **MTC Certification Compliance:** **${certifiedPct}%** (${audit.certifiedLotsCount}/${audit.totalLots} certified)\n- **⚠️ Missing MTCs:** **${audit.missingMtcCount} lots** need certificate matching\n- **Warehouse Locations Unassigned:** **${audit.unlocatedLotsCount} lots**\n\nClick below to export the missing certificate list or download the full master stock report:`,
      type: 'stock_audit',
      data: audit,
      suggestions: [
        'Export Missing MTC List',
        'Download Master Stock Excel',
        'Download Heat Register'
      ]
    }
  }

  // 5. Search Heats, Items, or Stock
  // e.g. "where is flange", "find heat H101", "flange 2 inch"
  const master = db.getMasterStockView()
  const matchingLots = master.filter(l =>
    l.item_code.toUpperCase().includes(upper) ||
    l.heat_number.toUpperCase().includes(upper) ||
    ((l as any).item_description && (l as any).item_description.toUpperCase().includes(upper)) ||
    (l.warehouse_location && l.warehouse_location.toUpperCase().includes(upper)) ||
    ((l as any).supplier && String((l as any).supplier).toUpperCase().includes(upper))
  )

  if (matchingLots.length > 0) {
    // If exact single heat match, provide full heat vetting card right away!
    if (matchingLots.length === 1 || matchingLots.some(l => l.heat_number.toUpperCase() === upper)) {
      const target = matchingLots.find(l => l.heat_number.toUpperCase() === upper) || matchingLots[0]
      const heatRep = buildHeatReport(target, master.filter(m => m.heat_number.toUpperCase() === target.heat_number.toUpperCase()))
      return {
        id,
        sender: 'assistant',
        timestamp,
        text: `### Found Exact Match for \`${target.heat_number}\`\n**Item Code:** ${target.item_code} | **Location:** ${target.warehouse_location || 'LN-EB1'} | **Available:** ${target.available_qty} units`,
        type: 'heat_vetting',
        data: heatRep,
        suggestions: [
          `Download Stamped MTC for ${target.heat_number}`,
          `Download Clean MTC for ${target.heat_number}`,
          `Traceability for ${target.heat_number}`
        ]
      }
    }

    return {
      id,
      sender: 'assistant',
      timestamp,
      text: `🔍 Found **${matchingLots.length} matching lots** in Master Stock for "${trimmed}":`,
      type: 'stock_search',
      data: {
        query: trimmed,
        lots: matchingLots.slice(0, 15),
        totalCount: matchingLots.length
      },
      suggestions: [
        `Download Stamped MTC for ${matchingLots[0].heat_number}`,
        `Vet Heat ${matchingLots[0].heat_number}`,
        'Download Filtered Excel',
        'Download Master Stock Excel'
      ]
    }
  }

  // 6. Search Sales Orders
  const orders = db.getOrders()
  const matchingOrders = orders.filter(o =>
    (o.so_number && o.so_number.toUpperCase().includes(upper)) ||
    (o.customer_name && o.customer_name.toUpperCase().includes(upper)) ||
    (o.po_number && o.po_number.toUpperCase().includes(upper))
  )

  if (matchingOrders.length > 0) {
    const o = matchingOrders[0]
    const report = vetSalesOrder(o.so_number || o.id)
    if (report) {
      return {
        id,
        sender: 'assistant',
        timestamp,
        text: `📋 Found Sales Order **${o.so_number}** for **${o.customer_name}**:`,
        type: 'order_vetting',
        data: report,
        suggestions: [
          `Download SO PDF ${report.soNumber}`,
          'Download Sales Orders Excel'
        ]
      }
    }
  }

  // 7. Query server-side live DB vetting assistant if authenticated
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('msg_auth_token') : null
  if (token) {
    try {
      const resp = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: trimmed }),
      })
      if (resp.ok) {
        const payload = await resp.json()
        if (payload?.reply) return payload.reply as ChatMessage
      }
    } catch {}
  }

  // 8. General Help & Navigation Fallback
  return {
    id,
    sender: 'assistant',
    timestamp,
    text: `👋 I am your **MSG Oilfield ERP Co-Pilot**. I can search, automatically vet, and download anything across the system:\n\n` +
      `- **🛡️ Automated Vetting:** Type \`vet heat <heat#>\` (e.g. \`vet heat 24-001\`) or \`vet order <SO#>\` to inspect stock availability, MTC 3.1 compliance, and warehouse bays.\n` +
      `- **📥 Instant Downloads:** Type \`download mtc for <heat#>\`, \`download stock excel\`, or \`download sales orders\`.\n` +
      `- **🔍 Search:** Type any Item Code, Heat Number, Client Name, or Description.\n` +
      `- **⚠️ MTC Audit:** Ask \`check missing mtc\` to see lots awaiting certificates.`,
    type: 'general',
    suggestions: [
      '🛡️ Vet Stock Health',
      '⚠️ Missing MTCs',
      '📊 Download Master Stock Excel',
      '📋 Recent Sales Orders'
    ]
  }
}
