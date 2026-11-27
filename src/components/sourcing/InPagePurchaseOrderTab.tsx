import React, { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  ShoppingCart,
  Download,
  CheckCircle2,
  Building,
  Save,
  DollarSign,
  Calendar,
  Truck,
  Plus,
  Trash2,
  FileSpreadsheet,
  Check,
  AlertTriangle,
  Eye,
  FileCheck2,
  Upload,
  Archive,
  X,
  RefreshCw,
  FileText,
  Package,
  Sparkles,
} from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import {
  SourcingWorksheetData,
  SourcingLineItem,
  generateStoresSummaryExcel,
  extractQtyNumber,
  extractTotalQtyNumber,
  isItemAvailableInStock,
  getRemainingPurchaseQty,
  buildLCodeOptions,
} from '../../services/sourcingEngine'
import {
  stampMTCDocument,
  downloadPDFBlob,
  downloadCertificatesAsZip,
} from '../../services/pdfEngine'
import {
  registerUploadedCertificate,
  getUploadedCertificateBytes,
  getAuthenticCertificateBytes,
  getVaultManifest,
  detectHeatNumberFromFilename,
  extractCertificatesFromZip,
  safeFetchPdfBytes,
  resolveBackendMtcBytes,
  hasSelectedHeatNumber,
  hasAvailableMtcForItem,
  isValidPdfBytes,
  ManifestCertificate
} from '../../services/zipExtractor'
import { db } from '../../services/db'
import { HeatNumberCombobox } from './HeatNumberCombobox'

interface InPagePurchaseOrderTabProps {
  worksheetData: SourcingWorksheetData
  selectedItemIds: Set<string>
  onApply: (updatedItems: SourcingLineItem[], stayInTab?: boolean) => void
  onBack: () => void
  showToast: (msg: string) => void
}

interface POItemRow {
  id: string
  sl_no: number
  client_po_item_no: string
  description: string
  totalQty: number
  uom: string
  poQty: number
  unitPrice: number
  make: string
  countryOfOrigin: string
  remarks: string
  heat_number: string
  certificate_number: string
  l_code: string
  inStock: boolean
  included: boolean
}

const COMMON_LOCAL_SUPPLIERS = [
  'AL GHAITH OILFIELD SUPPLIES',
  'AL FALAK MECHANICAL & MACHINE SHOP',
  'PETROTECH ENGINEERING SERVICES',
  'AL SHARQ FABRICATORS LLC',
  'APEX PRECISION MACHINING',
  'GULF PIPING & VALVE SERVICES',
  'BENKAN THAILAND CORP',
  'ULMA PIPING SPAIN',
  'WMASS FLANGES & FITTINGS GMBH',
  'LOCAL MACHINE SHOP',
]

export const InPagePurchaseOrderTab: React.FC<InPagePurchaseOrderTabProps> = ({
  worksheetData,
  selectedItemIds,
  onApply,
  onBack,
  showToast,
}) => {
  const masterSuppliers = db.getSuppliers().map(s => s.supplier_name)
  const allSuppliers = Array.from(new Set([...COMMON_LOCAL_SUPPLIERS, ...masterSuppliers])).filter(Boolean)

  // PO Form State
  const [supplierName, setSupplierName] = useState('')
  const [isCustomSupplier, setIsCustomSupplier] = useState(false)
  const [supplierPONumber, setSupplierPONumber] = useState('')
  const [poDate, setPoDate] = useState(() => new Date().toISOString().substring(0, 10))
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().substring(0, 10)
  })
  const [paymentTerms, setPaymentTerms] = useState('30 Days Credit')
  const [deliveryLocation, setDeliveryLocation] = useState('MSG Oilfield Stores, Jebel Ali Free Zone, Dubai')
  const [currency, setCurrency] = useState<'AED' | 'USD'>(worksheetData.currency === 'USD' ? 'USD' : 'AED')
  const [poNotes, setPoNotes] = useState('All items must be supplied with authentic EN 10204 3.1 Mill Test Certificates.')

  // PO Items state (sticky selection retained across Add More Items & edits)
  const [poItems, setPoItems] = useState<POItemRow[]>([])
  const [excludedStockCount, setExcludedStockCount] = useState(0)
  const [alreadyOrderedCount, setAlreadyOrderedCount] = useState(0)
  const [isCreatePOModalOpen, setIsCreatePOModalOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const stickyCheckedIdsRef = useRef<Set<string> | null>(null)
  const hasInitializedHeaderRef = useRef(false)

  // Supplier-wise Tracking & Rejected Material Management Tabs
  const [activeSubTab, setActiveSubTab] = useState<string>('create_po')
  const [rejectTargetItem, setRejectTargetItem] = useState<SourcingLineItem | null>(null)
  const [rejectionReasonInput, setRejectionReasonInput] = useState('')
  const [selectedRejectedIds, setSelectedRejectedIds] = useState<Set<string>>(new Set())
  const [reorderNewSupplier, setReorderNewSupplier] = useState('PETROTECH ENGINEERING SERVICES')
  const [reorderNewPO, setReorderNewPO] = useState(() => `LP-REORDER-${new Date().toISOString().substring(2, 4)}${new Date().getMonth() + 1}-01`)
  const [reorderUnitPrice, setReorderUnitPrice] = useState<string>('')
  const [selectedExistingPO, setSelectedExistingPO] = useState<string>('')

  // Certificate Stamping & Preview State
  const [applyStamp, setApplyStamp] = useState(true)
  const [inspectorName, setInspectorName] = useState('Alex Turner / MSG QA-04')
  const [stampDate, setStampDate] = useState(() => new Date().toISOString().substring(0, 10))
  const [previewModalItem, setPreviewModalItem] = useState<POItemRow | null>(null)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isPackaging, setIsPackaging] = useState(false)
  const [isUploadingCert, setIsUploadingCert] = useState(false)

  // Hidden inputs for file uploads
  const bulkFileInputRef = useRef<HTMLInputElement>(null)
  const itemFileInputRef = useRef<HTMLInputElement>(null)
  const [targetUploadItemId, setTargetUploadItemId] = useState<string | null>(null)

  // Initialize PO Items
  useEffect(() => {
    let defaultSupp = ''
    let defaultPO = ''

    for (const it of worksheetData.items) {
      if (it.supplier_name && it.supplier_name.toUpperCase() !== 'STOCK') {
        defaultSupp = it.supplier_name
        if (it.supplier_po_number) defaultPO = it.supplier_po_number
        break
      }
    }

    if (!hasInitializedHeaderRef.current) {
      const effectiveSupp = defaultSupp || 'AL GHAITH OILFIELD SUPPLIES'
      setSupplierName(effectiveSupp)
      setSupplierPONumber(defaultPO || `LP-PO-${new Date().toISOString().substring(2, 4)}${new Date().getMonth() + 1}-01`)
      hasInitializedHeaderRef.current = true
    }

    // Build PO items: ONLY L-Code and Non-Stock items with pending qty > 0 (never show Stock or already-ordered items)
    const masterStock = db.getMasterStockView()
    let stockSkipped = 0
    let orderedSkipped = 0
    const rows: POItemRow[] = []

    worksheetData.items.forEach((it, idx) => {
      const qNum = extractQtyNumber(it.qty)
      const inStock = isItemAvailableInStock(it, masterStock)
      if (inStock) {
        stockSkipped++
        return
      }
      const pendingQty = getRemainingPurchaseQty(it, masterStock)
      if (pendingQty <= 0) {
        orderedSkipped++
        return
      }

      const prevChecked = stickyCheckedIdsRef.current
      const isSelected = prevChecked !== null
        ? prevChecked.has(it.id)
        : (selectedItemIds.size > 0 ? selectedItemIds.has(it.id) : true)

      const unitPrice = Number((it as any).supplier_unit_price ?? it.unit_price ?? 0)

      rows.push({
        id: it.id,
        sl_no: it.sl_no || idx + 1,
        client_po_item_no: it.client_po_item_no || `${idx + 1}`,
        description: it.description,
        totalQty: qNum,
        uom: it.uom || 'PCS',
        poQty: pendingQty,
        unitPrice,
        make: it.make || '',
        countryOfOrigin: it.country_of_origin || '',
        remarks: it.remarks || '',
        heat_number: it.heat_number || '',
        certificate_number: it.certificate_number || '',
        l_code: it.l_code || '',
        inStock: false,
        included: isSelected,
      })
    })

    if (stickyCheckedIdsRef.current === null) {
      stickyCheckedIdsRef.current = new Set(rows.filter(r => r.included).map(r => r.id))
    }
    setExcludedStockCount(stockSkipped)
    setAlreadyOrderedCount(orderedSkipped)
    setPoItems(rows)
  }, [worksheetData, selectedItemIds])

  const includedItems = poItems.filter(r => r.included)
  const totalPOQty = includedItems.reduce((sum, r) => sum + (r.poQty || 0), 0)
  const totalPOAmount = includedItems.reduce((sum, r) => sum + (r.poQty || 0) * (r.unitPrice || 0), 0)

  const [vaultManifest, setVaultManifest] = useState<ManifestCertificate[]>([])
  useEffect(() => {
    getVaultManifest()
      .then(list => {
        if (Array.isArray(list)) setVaultManifest(list)
      })
      .catch(() => {})
  }, [])

  // Check if an item has a real selected heat number & available certificate (never match placeholders)
  const hasCertificate = (r: POItemRow): boolean => {
    return hasAvailableMtcForItem(
      { heat_number: r.heat_number, certificate_number: r.certificate_number },
      vaultManifest,
      db.getStoredFiles(),
      db.getMTCs()
    )
  }

  // Retrieve raw PDF bytes for an item strictly by heat number or explicit certificate reference
  const getItemCertBytes = async (r: POItemRow): Promise<Uint8Array | null> => {
    const certRef = (r.certificate_number || '').trim()
    const heat = (r.heat_number || '').trim()
    if (!hasSelectedHeatNumber(heat)) return null

    // 1. Authentic Certificate from Cache or Bulk Zip Vault (strict heat/cert match, no description fallback)
    const authCert = await getAuthenticCertificateBytes(certRef, heat)
    if (authCert && isValidPdfBytes(authCert.bytes)) {
      if (!r.certificate_number && authCert.fileName) {
        handleUpdateItem(r.id, 'certificate_number', authCert.fileName)
        handleUpdateItem(r.id, 'heat_number', authCert.heatNumber || r.heat_number)
      }
      return authCert.bytes
    }

    // 2. Backend / Database MTC check (ignoring /sample-mtc.pdf placeholders & HTML responses)
    const dbMtc = db.getMTCs().find(m =>
      (heat && m.heat_number.toUpperCase() === heat.toUpperCase()) ||
      (certRef && m.certificate_reference.toUpperCase() === certRef.toUpperCase())
    )
    if (dbMtc) {
      const directUrl = (dbMtc as any).file_data_url || dbMtc.original_file_path
      if (directUrl) {
        const fetched = await safeFetchPdfBytes(directUrl)
        if (fetched && isValidPdfBytes(fetched)) return fetched
      }
    }

    const backendBytes = await resolveBackendMtcBytes(
      (certRef && certRef !== 'MTC-REF') ? certRef : dbMtc?.original_file_path || dbMtc?.certificate_reference,
      heat || dbMtc?.heat_number
    )
    if (backendBytes && isValidPdfBytes(backendBytes)) return backendBytes

    return null
  }

  // Toggle item inclusion (syncs sticky checkbox set so Add More Items preserves selections)
  const syncStickyChecked = (updatedRows: POItemRow[]) => {
    stickyCheckedIdsRef.current = new Set(updatedRows.filter(r => r.included).map(r => r.id))
  }

  const handleToggleInclude = (id: string) => {
    setPoItems(prev => {
      const next = prev.map(r => (r.id === id && !r.inStock) ? { ...r, included: !r.included } : r)
      syncStickyChecked(next)
      return next
    })
  }

  const handleToggleSelectAll = (checked: boolean) => {
    setPoItems(prev => {
      const next = prev.map(r => (r.inStock ? { ...r, included: false } : { ...r, included: checked }))
      syncStickyChecked(next)
      return next
    })
  }

  // Update item field
  const handleUpdateItem = (id: string, field: keyof POItemRow, val: any) => {
    setPoItems(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))
  }

  const validateSelectedLCodes = (): boolean => {
    if (includedItems.length === 0) {
      alert('Please select at least one L-Code or Non-Stock item first.')
      return false
    }
    const missing = includedItems.filter(r => !r.l_code.trim())
    if (missing.length > 0) {
      const labels = missing.map(r => `#${r.client_po_item_no || r.sl_no}`).join(', ')
      alert(`Please select an L-Code for all selected non-stock Local Purchase items (missing on Item ${labels}).`)
      return false
    }
    return true
  }

  // Finalize & Create Purchase Order (deducts ordered qty from pending items & retains remaining pending qty)
  const commitPurchaseOrder = (stayInSelectionAfterCreate: boolean) => {
    if (!validateSelectedLCodes()) return

    const activeSupp = supplierName.trim() || 'LOCAL PURCHASE'
    const activePO = supplierPONumber.trim() || 'LP-PO'

    const poItemMap = new Map(poItems.map(r => [r.id, r]))
    const newItems: SourcingLineItem[] = []

    let appliedCount = 0
    let splitCount = 0
    const orderedRowIds = new Set<string>()

    worksheetData.items.forEach(orig => {
      const state = poItemMap.get(orig.id)

      if (!state || !state.included || state.inStock) {
        newItems.push(orig)
        return
      }

      const pendingQty = state.totalQty
      const poQty = Math.min(pendingQty, Math.max(1, state.poQty))
      const suppUnitPrice = Number(state.unitPrice || 0)
      const linePurchaseTotal = Math.round(poQty * suppUnitPrice * 100) / 100
      const make = state.make
      const coo = state.countryOfOrigin
      const remarks = state.remarks
      const heatNum = state.heat_number
      const certRef = state.certificate_number
      const lCode = state.l_code.trim()
      const origTotalOrderQty = extractTotalQtyNumber(orig.qty) || pendingQty

      orderedRowIds.add(orig.id)

      if (poQty >= pendingQty) {
        newItems.push({
          ...orig,
          qty: pendingQty,
          unit_price: suppUnitPrice > 0 ? suppUnitPrice : orig.unit_price,
          total_price: suppUnitPrice > 0 ? linePurchaseTotal : orig.total_price,
          supplier_unit_price: suppUnitPrice,
          supplier_total_price: linePurchaseTotal,
          supplier_name: activeSupp,
          supplier_po_number: activePO,
          make: make || orig.make,
          country_of_origin: coo || orig.country_of_origin,
          heat_number: heatNum || orig.heat_number,
          certificate_number: certRef || orig.certificate_number,
          l_code: lCode,
          is_local: true,
          purchase_type: 'local_purchase',
          po_ordered_qty: pendingQty,
          po_created: true,
          remarks: remarks ? `${remarks}; Local PO: ${activePO} (${lCode})` : `Local PO: ${activePO} (${lCode})`,
          is_machined: true,
        })
        appliedCount++
      } else {
        const remainingQty = Math.round((pendingQty - poQty) * 100) / 100
        const origUnitP = orig.unit_price || 0

        // Remaining pending non-stock / L-Code balance for subsequent PO creation
        newItems.push({
          ...orig,
          qty: `${remainingQty} OF ${origTotalOrderQty}`,
          split_qty: `${remainingQty} OF ${origTotalOrderQty}`,
          total_qty: origTotalOrderQty,
          total_price: remainingQty * origUnitP,
          supplier_po_number: '',
          po_ordered_qty: 0,
          po_created: false,
          l_code: lCode,
          is_local: true,
          purchase_type: 'local_purchase',
          remarks: orig.remarks ? `${orig.remarks}; Pending PO Qty: ${remainingQty}` : `Pending PO Qty: ${remainingQty}`,
        })

        // Created Purchase Order slice (excluded from subsequent PO list)
        newItems.push({
          ...orig,
          id: `${orig.id}-PO-${Date.now()}`,
          client_po_item_no: orig.client_po_item_no,
          qty: `${poQty} OF ${origTotalOrderQty}`,
          split_qty: `${poQty} OF ${origTotalOrderQty}`,
          total_qty: origTotalOrderQty,
          unit_price: suppUnitPrice > 0 ? suppUnitPrice : origUnitP,
          total_price: suppUnitPrice > 0 ? linePurchaseTotal : poQty * origUnitP,
          supplier_unit_price: suppUnitPrice,
          supplier_total_price: linePurchaseTotal,
          supplier_name: activeSupp,
          supplier_po_number: activePO,
          make: make || orig.make,
          country_of_origin: coo || orig.country_of_origin,
          heat_number: heatNum || orig.heat_number,
          certificate_number: certRef || orig.certificate_number,
          l_code: lCode,
          is_local: true,
          purchase_type: 'local_purchase',
          po_ordered_qty: poQty,
          po_created: true,
          remarks: remarks ? `${remarks}; Local PO: ${activePO} (${lCode})` : `Local PO: ${activePO} (${lCode})`,
          is_machined: true,
        })

        splitCount++
        appliedCount++
      }
    })

    // Prune finalized full items from sticky selection while keeping remaining pending selections clean
    if (stickyCheckedIdsRef.current) {
      orderedRowIds.forEach(id => stickyCheckedIdsRef.current?.delete(id))
    }

    const renumbered = newItems.map((it, idx) => ({ ...it, sl_no: idx + 1 }))
    setIsCreatePOModalOpen(false)
    onApply(renumbered, stayInSelectionAfterCreate)
    showToast(`Created Purchase Order #${activePO} (${appliedCount} item(s), ${splitCount} partial split, total ${currency} ${totalPOAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })})!`)

    if (stayInSelectionAfterCreate) {
      // Increment suggested PO number cleanly for the next PO batch
      const match = activePO.match(/^(.*?)(\d+)$/)
      if (match) {
        const nextNum = String(Number(match[2]) + 1).padStart(match[2].length, '0')
        setSupplierPONumber(`${match[1]}${nextNum}`)
      }
    } else {
      onBack()
    }
  }

  const handleApplyToWorksheet = () => commitPurchaseOrder(false)
  const handleFinalizeCreatePO = () => commitPurchaseOrder(true)

  // Supplier-wise grouped PO items & Rejected Items traceability state
  const orderedSupplierLines = worksheetData.items.filter(it => {
    const supp = (it.supplier_name || '').trim()
    return (
      !it.is_rejected &&
      supp.length > 0 &&
      supp.toUpperCase() !== 'STOCK' &&
      (it.po_created || Boolean((it.supplier_po_number || '').trim()))
    )
  })

  const supplierNames = Array.from(new Set(orderedSupplierLines.map(it => it.supplier_name.trim())))
  const pendingRejectedItems = worksheetData.items.filter(it => it.is_rejected && !it.reordered)
  const reorderedRejectedItems = worksheetData.items.filter(it => it.is_rejected && it.reordered)

  const existingPOOptions = Array.from(
    orderedSupplierLines.reduce((map, it) => {
      const poNum = (it.supplier_po_number || '').trim()
      if (!poNum) return map
      const curr = map.get(poNum) || { poNumber: poNum, supplierName: it.supplier_name.trim(), count: 0 }
      curr.count += 1
      map.set(poNum, curr)
      return map
    }, new Map<string, { poNumber: string; supplierName: string; count: number }>()).values()
  )

  const handleUpdateSupplierReceiptField = (
    itemId: string,
    field: 'heat_number' | 'certificate_number',
    value: string
  ) => {
    const updated = worksheetData.items.map(it => (it.id === itemId ? { ...it, [field]: value } : it))
    onApply(updated, true)
  }

  const handleConfirmRejectItem = () => {
    if (!rejectTargetItem) return
    const reason = rejectionReasonInput.trim()
    if (!reason) {
      alert('Please enter a rejection reason before rejecting this item.')
      return
    }
    const targetId = rejectTargetItem.id
    const updated = worksheetData.items.map(it => {
      if (it.id !== targetId) return it
      return {
        ...it,
        is_rejected: true,
        rejection_reason: reason,
        rejected_at: new Date().toISOString().substring(0, 10),
        original_po_number: it.original_po_number || it.supplier_po_number || 'PO-N/A',
        original_supplier_name: it.original_supplier_name || it.supplier_name || 'Unknown Supplier',
        reordered: false,
      }
    })
    onApply(updated, true)
    setRejectTargetItem(null)
    setRejectionReasonInput('')
    showToast(`Item #${rejectTargetItem.client_po_item_no || rejectTargetItem.sl_no} rejected and moved to Rejected Items tab.`)
  }

  const toggleSelectRejected = (id: string) => {
    setSelectedRejectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const executeRejectedReorder = (targetPO: string, targetSupplier: string, modeLabel: 'New PO' | 'Existing PO') => {
    const poTrimmed = targetPO.trim()
    const suppTrimmed = targetSupplier.trim()
    if (!poTrimmed || !suppTrimmed) {
      alert('Please specify both Target Supplier and PO Number.')
      return
    }
    const targets = pendingRejectedItems.filter(it => selectedRejectedIds.has(it.id))
    if (targets.length === 0) {
      alert('Please select at least one pending rejected item to reorder.')
      return
    }

    const targetIds = new Set(targets.map(t => t.id))
    const overridePrice = reorderUnitPrice.trim() ? Math.max(0, Number(reorderUnitPrice) || 0) : null
    const newReplacementLines: SourcingLineItem[] = []

    const updatedOrig = worksheetData.items.map(it => {
      if (!targetIds.has(it.id)) return it

      const qtyNum = extractQtyNumber(it.qty)
      const unitP = overridePrice !== null ? overridePrice : (it.supplier_unit_price ?? it.unit_price ?? 0)
      const origPO = it.original_po_number || it.supplier_po_number || 'PO-N/A'
      const origSupp = it.original_supplier_name || it.supplier_name || 'Unknown Supplier'

      newReplacementLines.push({
        ...it,
        id: `${it.id}-RPL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        supplier_name: suppTrimmed,
        supplier_po_number: poTrimmed,
        heat_number: '',
        certificate_number: '',
        unit_price: unitP,
        total_price: Math.round(qtyNum * unitP * 100) / 100,
        supplier_unit_price: unitP,
        supplier_total_price: Math.round(qtyNum * unitP * 100) / 100,
        po_created: true,
        po_ordered_qty: qtyNum,
        is_rejected: false,
        reordered: false,
        rejection_reason: it.rejection_reason,
        original_po_number: origPO,
        original_supplier_name: origSupp,
        replacement_po_number: poTrimmed,
        replacement_supplier_name: suppTrimmed,
        remarks: `${it.remarks ? `${it.remarks}; ` : ''}Reordered from ${origPO} (${origSupp}) -> ${poTrimmed}`,
      })

      return {
        ...it,
        reordered: true,
        replacement_po_number: poTrimmed,
        replacement_supplier_name: suppTrimmed,
      }
    })

    const combined = [...updatedOrig, ...newReplacementLines].map((it, idx) => ({ ...it, sl_no: idx + 1 }))
    onApply(combined, true)
    setSelectedRejectedIds(new Set())
    showToast(`Reordered ${targets.length} rejected item(s) via ${modeLabel} #${poTrimmed} (${suppTrimmed}).`)

    if (modeLabel === 'New PO') {
      const m = poTrimmed.match(/^(.*?)(\d+)$/)
      if (m) {
        const nextNum = String(Number(m[2]) + 1).padStart(m[2].length, '0')
        setReorderNewPO(`${m[1]}${nextNum}`)
      }
    }
  }

  // Export PO Excel
  const handleExportPOExcel = async () => {
    if (!validateSelectedLCodes()) return
    setIsExporting(true)
    try {
      const activeSupp = supplierName.trim() || 'LOCAL PURCHASE'
      const activePO = supplierPONumber.trim() || 'LP-PO'

      const targetItems: SourcingLineItem[] = includedItems.map((it, idx) => ({
        id: it.id,
        sl_no: idx + 1,
        client_po_item_no: it.client_po_item_no,
        description: it.description,
        qty: it.poQty,
        uom: it.uom,
        unit_price: it.unitPrice,
        total_price: it.poQty * it.unitPrice,
        make: it.make,
        country_of_origin: it.countryOfOrigin,
        remarks: it.remarks,
        supplier_name: activeSupp,
        supplier_po_number: activePO,
        heat_number: it.heat_number || '',
        certificate_number: it.certificate_number || '',
        hs_code: '',
        unit_weight_kg: 0,
        total_net_weight_kg: 0,
        total_gross_weight_kg: 0,
        package_no: `PKG # 01`,
        is_machined: true,
      }))

      const exportData: SourcingWorksheetData = {
        ...worksheetData,
        client: activeSupp,
        po_number: activePO,
        items: targetItems,
      }

      await generateStoresSummaryExcel(exportData, false)
      showToast(`Supplier Purchase Order ${activePO} (.xlsx) downloaded successfully!`)
    } catch (err: any) {
      alert('Error exporting Supplier PO: ' + err.message)
    } finally {
      setIsExporting(false)
    }
  }

  // Single Item Certificate Upload
  const handleItemFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !targetUploadItemId) return

    try {
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const detectedHeat = detectHeatNumberFromFilename(file.name)
      const certRef = file.name

      registerUploadedCertificate(certRef, bytes, file.name, detectedHeat)
      if (detectedHeat) {
        registerUploadedCertificate(detectedHeat, bytes, file.name, detectedHeat)
      }

      setPoItems(prev =>
        prev.map(r => {
          if (r.id !== targetUploadItemId) return r
          return {
            ...r,
            certificate_number: certRef,
            heat_number: detectedHeat || r.heat_number || 'HT-MTC',
          }
        })
      )

      showToast(`Certificate "${file.name}" attached to item!`)
    } catch (err: any) {
      alert('Error uploading certificate: ' + err.message)
    } finally {
      if (itemFileInputRef.current) itemFileInputRef.current.value = ''
      setTargetUploadItemId(null)
    }
  }

  // Bulk Upload for PO items
  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploadingCert(true)
    let attachedCount = 0

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        if (file.name.toLowerCase().endsWith('.zip')) {
          const heats = poItems.map(it => it.heat_number).filter(Boolean)
          const extracted = await extractCertificatesFromZip(file, heats)

          for (const cert of extracted) {
            registerUploadedCertificate(cert.fileName, cert.rawBytes, cert.fileName, cert.heatNumber)
            if (cert.heatNumber) {
              registerUploadedCertificate(cert.heatNumber, cert.rawBytes, cert.fileName, cert.heatNumber)
            }

            const matched = poItems.find(it =>
              cert.heatNumber && it.heat_number && it.heat_number.toUpperCase() === cert.heatNumber.toUpperCase()
            )

            if (matched) {
              setPoItems(prev =>
                prev.map(r => r.id === matched.id ? { ...r, certificate_number: cert.fileName, heat_number: cert.heatNumber } : r)
              )
              attachedCount++
            } else {
              const unattached = poItems.find(it => !hasCertificate(it))
              if (unattached) {
                setPoItems(prev =>
                  prev.map(r => r.id === unattached.id ? { ...r, certificate_number: cert.fileName, heat_number: cert.heatNumber || unattached.heat_number } : r)
                )
                attachedCount++
              }
            }
          }
        } else if (file.name.toLowerCase().endsWith('.pdf')) {
          const buf = await file.arrayBuffer()
          const fileBytes = new Uint8Array(buf)
          const detectedHeat = detectHeatNumberFromFilename(file.name)
          const certRef = file.name

          registerUploadedCertificate(certRef, fileBytes, file.name, detectedHeat)
          if (detectedHeat) {
            registerUploadedCertificate(detectedHeat, fileBytes, file.name, detectedHeat)
          }

          const matched = poItems.find(it =>
            detectedHeat && it.heat_number && it.heat_number.toUpperCase() === detectedHeat.toUpperCase()
          )

          if (matched) {
            setPoItems(prev =>
              prev.map(r => r.id === matched.id ? { ...r, certificate_number: certRef, heat_number: detectedHeat } : r)
            )
            attachedCount++
          } else {
            const unattached = poItems.find(it => !hasCertificate(it))
            if (unattached) {
              setPoItems(prev =>
                prev.map(r => r.id === unattached.id ? { ...r, certificate_number: certRef, heat_number: detectedHeat || unattached.heat_number } : r)
              )
              attachedCount++
            }
          }
        }
      }

      showToast(`Bulk upload complete! Processed ${files.length} file(s) and attached ${attachedCount} certificate(s) to PO lines.`)
    } catch (err: any) {
      alert('Error during bulk MTC upload: ' + err.message)
    } finally {
      setIsUploadingCert(false)
      if (bulkFileInputRef.current) bulkFileInputRef.current.value = ''
    }
  }

  // Open Preview Modal for an Item
  const handleOpenPreview = async (r: POItemRow) => {
    setPreviewModalItem(r)
    setIsPreviewLoading(true)
    try {
      const rawBytes = await getItemCertBytes(r)
      if (!rawBytes) {
        alert('Could not retrieve certificate document for this item.')
        setPreviewModalItem(null)
        return
      }

      let finalBytes = rawBytes
      if (applyStamp) {
        finalBytes = await stampMTCDocument(
          rawBytes,
          {
            poNo: supplierPONumber || worksheetData.po_number || 'PO-MSG',
            itemNo: r.client_po_item_no || String(r.sl_no),
            qty: `${r.poQty} ${r.uom}`,
            sign: inspectorName,
            dateStr: stampDate,
            make: r.make,
            heatNo: r.heat_number,
            certificateRef: r.certificate_number,
            description: r.description,
          },
          true
        )
      }

      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl)
      const blob = new Blob([finalBytes as any], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setPreviewPdfUrl(url)
    } catch (err: any) {
      alert('Error rendering certificate preview: ' + err.message)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  // Download Single Item Stamped MTC
  const handleDownloadSingle = async (r: POItemRow) => {
    try {
      const rawBytes = await getItemCertBytes(r)
      if (!rawBytes) {
        alert('Could not retrieve certificate document for this item.')
        return
      }

      let finalBytes = rawBytes
      if (applyStamp) {
        finalBytes = await stampMTCDocument(
          rawBytes,
          {
            poNo: supplierPONumber || worksheetData.po_number || 'PO-MSG',
            itemNo: r.client_po_item_no || String(r.sl_no),
            qty: `${r.poQty} ${r.uom}`,
            sign: inspectorName,
            dateStr: stampDate,
            make: r.make,
            heatNo: r.heat_number,
            certificateRef: r.certificate_number,
            description: r.description,
          },
          true
        )
      }

      const safeName = (r.certificate_number && r.certificate_number.toLowerCase().endsWith('.pdf'))
        ? r.certificate_number
        : `MTC_PO_${supplierPONumber || 'PO'}_Item_${r.client_po_item_no}_Certified.pdf`

      downloadPDFBlob(finalBytes, safeName)
      showToast(`Downloaded stamped certificate: ${safeName}`)
    } catch (err: any) {
      alert('Error downloading certificate: ' + err.message)
    }
  }

  // Download All PO MTCs as a Unified Merged PDF Package
  const handleDownloadPOMTCPackage = async () => {
    setIsPackaging(true)
    try {
      const mergedPdf = await PDFDocument.create()
      let includedCount = 0

      for (const it of includedItems) {
        const rawBytes = await getItemCertBytes(it)
        if (rawBytes) {
          try {
            let stampedBytes = rawBytes
            if (applyStamp) {
              stampedBytes = await stampMTCDocument(
                rawBytes,
                {
                  poNo: supplierPONumber || worksheetData.po_number || 'PO-MSG',
                  itemNo: it.client_po_item_no || String(it.sl_no),
                  qty: `${it.poQty} ${it.uom}`,
                  sign: inspectorName,
                  dateStr: stampDate,
                  make: it.make,
                  heatNo: it.heat_number,
                  certificateRef: it.certificate_number,
                  description: it.description,
                },
                true
              )
            }

            const docToMerge = await PDFDocument.load(stampedBytes)
            const pages = await mergedPdf.copyPages(docToMerge, docToMerge.getPageIndices())
            pages.forEach(p => mergedPdf.addPage(p))
            includedCount++
          } catch (itemErr) {
            console.warn('Skipping unreadable PO MTC PDF during merge:', it.heat_number || it.certificate_number, itemErr)
          }
        }
      }

      if (includedCount === 0) {
        alert('No certificates found to merge.')
        return
      }

      const mergedBytes = await mergedPdf.save()
      const pkgName = `${(supplierPONumber || 'PO').replace(/[^a-zA-Z0-9_-]/g, '_')}_Complete_MTC_Package.pdf`
      downloadPDFBlob(mergedBytes, pkgName)
      showToast(`Merged & downloaded complete PO MTC package (${includedCount} certificates) into ${pkgName}!`)
    } catch (err: any) {
      alert('Error packaging merged PO MTCs: ' + err.message)
    } finally {
      setIsPackaging(false)
    }
  }

  // Download All PO MTCs as ZIP
  const handleDownloadPOZip = async () => {
    setIsPackaging(true)
    try {
      const certList: { fileName: string; bytes: Uint8Array }[] = []

      for (const it of includedItems) {
        const rawBytes = await getItemCertBytes(it)
        if (rawBytes && isValidPdfBytes(rawBytes)) {
          try {
            let stampedBytes = rawBytes
            if (applyStamp) {
              stampedBytes = await stampMTCDocument(
                rawBytes,
                {
                  poNo: supplierPONumber || worksheetData.po_number || 'PO-MSG',
                  itemNo: it.client_po_item_no || String(it.sl_no),
                  qty: `${it.poQty} ${it.uom}`,
                  sign: inspectorName,
                  dateStr: stampDate,
                  make: it.make,
                  heatNo: it.heat_number,
                  certificateRef: it.certificate_number,
                  description: it.description,
                },
                true
              )
            }

            const certName = (it.certificate_number && it.certificate_number.toLowerCase().endsWith('.pdf'))
              ? it.certificate_number
              : `MTC_PO_${supplierPONumber || 'PO'}_Item_${it.client_po_item_no}_Heat_${it.heat_number || 'Cert'}.pdf`

            certList.push({ fileName: certName, bytes: stampedBytes })
          } catch (itemErr) {
            console.warn('Skipping unreadable PO MTC PDF during ZIP export:', it.heat_number || it.certificate_number, itemErr)
          }
        }
      }

      if (certList.length === 0) {
        alert('No certificates found to bundle.')
        return
      }

      const zipName = `${(supplierPONumber || 'PO').replace(/[^a-zA-Z0-9_-]/g, '_')}_MTC_Certificates.zip`
      await downloadCertificatesAsZip(certList, zipName)
      showToast(`Bundled & downloaded ${certList.length} certificates into ${zipName}!`)
    } catch (err: any) {
      alert('Error bundling certificates to ZIP: ' + err.message)
    } finally {
      setIsPackaging(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hidden file inputs */}
      <input
        ref={bulkFileInputRef}
        type="file"
        multiple
        accept=".pdf,.zip"
        onChange={handleBulkUpload}
        className="hidden"
      />
      <input
        ref={itemFileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleItemFileUpload}
        className="hidden"
      />

      {/* Top Navigation & Status Bar */}
      <div className="bg-white p-5 rounded-lg shadow-xs border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Return to Sourcing Worksheet"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="text-base font-semibold text-slate-900 flex items-center space-x-2">
              <ShoppingCart className="h-4 w-4 text-blue-600" />
              <span>Purchase Order &amp; Local Sourcing Entry</span>
            </h1>
            <p className="text-xs text-slate-500">
              Configure supplier, PO number, unit costs, attach mill test certificates, preview stamp, and download deliverables.
            </p>
          </div>
        </div>

        {/* PO Actions Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Download PO Excel */}
          <button
            onClick={handleExportPOExcel}
            disabled={isExporting || includedItems.length === 0}
            className="bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Export official Supplier PO to Excel"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Supplier PO (.xlsx)</span>
          </button>

          {/* 2. Upload PO MTCs */}
          <button
            onClick={() => bulkFileInputRef.current?.click()}
            disabled={isUploadingCert}
            className="bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Upload supplier MTC PDFs or ZIP archive for this PO"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            <span>{isUploadingCert ? 'Uploading...' : 'Upload MTCs (PDF/ZIP)'}</span>
          </button>

          {/* 3. Download PO MTC Package PDF */}
          <button
            onClick={handleDownloadPOMTCPackage}
            disabled={isPackaging || includedItems.length === 0}
            className="bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Download all attached certificates for this PO merged into a single multi-page stamped PDF"
          >
            <FileCheck2 className="h-3.5 w-3.5 text-blue-600" />
            <span>{isPackaging ? 'Packaging...' : 'PO MTC Package (.pdf)'}</span>
          </button>

          {/* 4. Download All MTCs ZIP */}
          <button
            onClick={handleDownloadPOZip}
            disabled={isPackaging || includedItems.length === 0}
            className="bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Download all stamped certificates for this PO bundled in a .zip archive"
          >
            <Archive className="h-3.5 w-3.5 text-slate-500" />
            <span>MTCs (.zip)</span>
          </button>

          {/* 5. Open Create PO Popup */}
          <button
            type="button"
            onClick={() => setIsCreatePOModalOpen(true)}
            disabled={includedItems.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-md flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            title="Review selected L-Code / Non-Stock items in Create PO pop-up"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create PO ({includedItems.length})</span>
          </button>

          {/* 6. Apply & Sync to Worksheet */}
          <button
            onClick={handleApplyToWorksheet}
            disabled={includedItems.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs px-3.5 py-1.5 rounded-md flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            title="Save and synchronize all PO fields and MTC attachments back into main worksheet"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Apply &amp; Sync</span>
          </button>
        </div>
      </div>

      {/* Supplier-wise & Rejected Material Management Tabs Bar */}
      <div className="bg-slate-100 p-1.5 rounded-lg border border-slate-200 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveSubTab('create_po')}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${activeSubTab === 'create_po'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            }`}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Create PO (Pending)</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${activeSubTab === 'create_po' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {poItems.length}
          </span>
        </button>

        {supplierNames.map(supp => {
          const tabKey = `supplier:${supp}`
          const suppCount = orderedSupplierLines.filter(it => it.supplier_name.trim() === supp).length
          const isActive = activeSubTab === tabKey
          return (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveSubTab(tabKey)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${isActive
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                }`}
            >
              <Building className="h-3.5 w-3.5" />
              <span>{supp}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${isActive ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                {suppCount}
              </span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setActiveSubTab('rejected')}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${activeSubTab === 'rejected'
            ? 'bg-rose-600 text-white shadow-xs'
            : 'bg-white hover:bg-slate-50 text-rose-700 border border-rose-200'
            }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Rejected Items</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${activeSubTab === 'rejected' ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-800'}`}>
            {pendingRejectedItems.length}
          </span>
        </button>
      </div>

      {/* Supplier Tab View (Receipt Heat/Cert + Reject Material Option) */}
      {activeSubTab.startsWith('supplier:') && (() => {
        const activeSuppName = activeSubTab.slice('supplier:'.length)
        const suppItems = orderedSupplierLines.filter(it => it.supplier_name.trim() === activeSuppName)
        const suppTotalValue = suppItems.reduce(
          (sum, it) => sum + extractQtyNumber(it.qty) * Number(it.supplier_unit_price ?? it.unit_price ?? 0),
          0
        )
        const distinctPOs = Array.from(new Set(suppItems.map(it => it.supplier_po_number).filter(Boolean)))

        return (
          <div className="bg-white rounded-lg shadow-xs border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-emerald-50/70 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                  <Building className="h-4 w-4 text-emerald-600" />
                  <span>{activeSuppName}</span>
                </h2>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  PO #(s): <strong className="font-mono text-slate-900">{distinctPOs.join(', ') || 'Pending'}</strong> &bull; {suppItems.length} Active Line(s) &bull; Total: <strong>{currency} {suppTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </p>
              </div>
              <span className="text-[11px] text-emerald-800 bg-white border border-emerald-200 px-2.5 py-1 rounded-md font-medium">
                Enter received Heat # &amp; Certificate # or click REJECT on discrepancy
              </span>
            </div>

            {suppItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active items remaining under this supplier (all items were moved to Rejected Items or cleared).
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 w-16 text-center">Item #</th>
                      <th className="p-2.5 w-28">PO #</th>
                      <th className="p-2.5 w-24">L-Code</th>
                      <th className="p-2.5 min-w-[220px]">Description</th>
                      <th className="p-2.5 w-20 text-center">Qty</th>
                      <th className="p-2.5 w-40">Heat Number (Receipt)</th>
                      <th className="p-2.5 w-44">Certificate Number (MTC)</th>
                      <th className="p-2.5 w-28 text-right">Cost Value</th>
                      <th className="p-2.5 w-28 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {suppItems.map(it => {
                      const qNum = extractQtyNumber(it.qty)
                      const lineCost = Math.round(qNum * Number(it.supplier_unit_price ?? it.unit_price ?? 0) * 100) / 100
                      return (
                        <tr key={it.id} className="hover:bg-slate-50/70">
                          <td className="p-2.5 text-center font-mono font-bold text-slate-700">{it.client_po_item_no || it.sl_no}</td>
                          <td className="p-2.5 font-mono font-bold text-amber-900">{it.supplier_po_number}</td>
                          <td className="p-2.5 font-mono text-indigo-700 font-semibold">{it.l_code || '-'}</td>
                          <td className="p-2.5 text-slate-800">
                            <div>{it.description}</div>
                            {it.original_po_number && (
                              <span className="inline-block mt-0.5 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                Reorder for {it.original_po_number} ({it.rejection_reason})
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-bold">{qNum} {it.uom}</td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              aria-label={`Receipt Heat Number for item ${it.client_po_item_no || it.sl_no}`}
                              placeholder="Enter Heat #"
                              value={it.heat_number || ''}
                              onChange={e => handleUpdateSupplierReceiptField(it.id, 'heat_number', e.target.value)}
                              className="w-full border border-slate-300 rounded px-2 py-1 font-mono text-xs bg-white text-slate-900"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              aria-label={`Receipt Certificate Number for item ${it.client_po_item_no || it.sl_no}`}
                              placeholder="Enter Certificate #"
                              value={it.certificate_number || ''}
                              onChange={e => handleUpdateSupplierReceiptField(it.id, 'certificate_number', e.target.value)}
                              className="w-full border border-slate-300 rounded px-2 py-1 font-mono text-xs bg-white text-slate-900"
                            />
                          </td>
                          <td className="p-2.5 text-right font-mono font-semibold text-slate-800">
                            {currency} {lineCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setRejectTargetItem(it)
                                setRejectionReasonInput('')
                              }}
                              aria-label={`Reject item ${it.client_po_item_no || it.sl_no}`}
                              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                            >
                              REJECT
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* Rejected Items Tab (Pending Reorder + Traceability Log) */}
      {activeSubTab === 'rejected' && (
        <div className="space-y-5">
          <div className="bg-white rounded-lg shadow-xs border border-rose-200 overflow-hidden">
            <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-sm text-rose-950 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span>Rejected Items — Pending Purchase / Reorder ({pendingRejectedItems.length})</span>
                </h2>
                <p className="text-[11px] text-rose-700">
                  Select rejected items to either Create a New Purchase Order or Add to an Existing Purchase Order. Reordered items move automatically to Traceability History.
                </p>
              </div>
            </div>

            {pendingRejectedItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No rejected items pending reorder. All purchasing activities for rejected materials are complete.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 w-10 text-center">
                          <input
                            type="checkbox"
                            aria-label="Select all rejected items"
                            checked={pendingRejectedItems.length > 0 && pendingRejectedItems.every(it => selectedRejectedIds.has(it.id))}
                            onChange={e =>
                              setSelectedRejectedIds(
                                e.target.checked ? new Set(pendingRejectedItems.map(it => it.id)) : new Set()
                              )
                            }
                            className="rounded text-rose-600 h-3.5 w-3.5 cursor-pointer"
                          />
                        </th>
                        <th className="p-2.5 w-16 text-center">Item #</th>
                        <th className="p-2.5 min-w-[200px]">Description</th>
                        <th className="p-2.5 w-20 text-center">Qty</th>
                        <th className="p-2.5 w-24">L-Code</th>
                        <th className="p-2.5 w-36">Original PO &amp; Supplier</th>
                        <th className="p-2.5 w-32">Rejected Heat / Cert</th>
                        <th className="p-2.5 min-w-[180px]">Rejection Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingRejectedItems.map(it => (
                        <tr key={it.id} className="hover:bg-rose-50/30">
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              aria-label={`Select rejected item ${it.client_po_item_no || it.sl_no}`}
                              checked={selectedRejectedIds.has(it.id)}
                              onChange={() => toggleSelectRejected(it.id)}
                              className="rounded text-rose-600 h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold">{it.client_po_item_no || it.sl_no}</td>
                          <td className="p-2.5 text-slate-800">{it.description}</td>
                          <td className="p-2.5 text-center font-bold">{extractQtyNumber(it.qty)} {it.uom}</td>
                          <td className="p-2.5 font-mono text-indigo-700 font-semibold">{it.l_code || '-'}</td>
                          <td className="p-2.5">
                            <div className="font-mono font-bold text-slate-900">{it.original_po_number || it.supplier_po_number}</div>
                            <div className="text-[10px] text-slate-500">{it.original_supplier_name || it.supplier_name}</div>
                          </td>
                          <td className="p-2.5 font-mono text-[11px] text-slate-700">
                            <div>Heat: {it.heat_number || '-'}</div>
                            <div>Cert: {it.certificate_number || '-'}</div>
                          </td>
                          <td className="p-2.5 text-rose-800 font-medium">{it.rejection_reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Reorder Action Panels: Create New PO OR Add to Existing PO */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-2.5">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5 text-blue-600" />
                      <span>Create New Purchase Order (Alternate Supplier)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        aria-label="New PO Supplier for Rejected Items"
                        value={reorderNewSupplier}
                        onChange={e => setReorderNewSupplier(e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1.5 text-xs bg-white text-slate-900"
                      >
                        {allSuppliers.map((s, idx) => (
                          <option key={idx} value={s}>{s}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        aria-label="New Replacement PO Number"
                        placeholder="New PO #"
                        value={reorderNewPO}
                        onChange={e => setReorderNewPO(e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1.5 text-xs font-mono font-bold bg-white text-slate-900"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label="Replacement Supplier Unit Price"
                        placeholder={`Unit Price (${currency})`}
                        value={reorderUnitPrice}
                        onChange={e => setReorderUnitPrice(e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1.5 text-xs font-mono bg-white text-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={selectedRejectedIds.size === 0}
                      onClick={() => executeRejectedReorder(reorderNewPO, reorderNewSupplier, 'New PO')}
                      className="px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold cursor-pointer"
                    >
                      Create New Purchase Order
                    </button>
                  </div>

                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-2.5">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Add to Existing Purchase Order</span>
                    </div>
                    <select
                      aria-label="Existing Purchase Order Dropdown"
                      value={selectedExistingPO}
                      onChange={e => setSelectedExistingPO(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-900"
                    >
                      <option value="">-- Select Existing Purchase Order --</option>
                      {existingPOOptions.map(opt => (
                        <option key={opt.poNumber} value={opt.poNumber}>
                          {opt.poNumber} — {opt.supplierName} ({opt.count} item{opt.count > 1 ? 's' : ''})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={selectedRejectedIds.size === 0 || !selectedExistingPO}
                      onClick={() => {
                        const matched = existingPOOptions.find(o => o.poNumber === selectedExistingPO)
                        if (matched) {
                          executeRejectedReorder(matched.poNumber, matched.supplierName, 'Existing PO')
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold cursor-pointer"
                    >
                      Add to Existing Purchase Order
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Traceability History of Reordered Rejected Materials */}
          <div className="bg-white rounded-lg shadow-xs border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Rejected Material Traceability &amp; Replacement History ({reorderedRejectedItems.length})
              </h3>
            </div>
            {reorderedRejectedItems.length === 0 ? (
              <div className="p-4 text-xs text-slate-400 text-center">No reordered items yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase border-b border-slate-200">
                    <tr>
                      <th className="p-2 w-16 text-center">Item #</th>
                      <th className="p-2 min-w-[180px]">Description</th>
                      <th className="p-2 w-40">Original PO &amp; Supplier</th>
                      <th className="p-2 min-w-[160px]">Rejection Reason</th>
                      <th className="p-2 w-40">Replacement PO &amp; Supplier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reorderedRejectedItems.map(it => (
                      <tr key={it.id}>
                        <td className="p-2 text-center font-mono font-bold">{it.client_po_item_no || it.sl_no}</td>
                        <td className="p-2 text-slate-800">{it.description}</td>
                        <td className="p-2">
                          <div className="font-mono font-semibold text-slate-900">{it.original_po_number}</div>
                          <div className="text-[10px] text-slate-500">{it.original_supplier_name}</div>
                        </td>
                        <td className="p-2 text-rose-700">
                          <div>{it.rejection_reason}</div>
                          {it.rejected_at && <div className="text-[10px] text-slate-400">{it.rejected_at}</div>}
                        </td>
                        <td className="p-2">
                          <div className="font-mono font-bold text-emerald-700">{it.replacement_po_number}</div>
                          <div className="text-[10px] text-slate-600">{it.replacement_supplier_name}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create PO (Pending Selection) View */}
      {activeSubTab === 'create_po' && (
        <>
      {/* PO Master Details Form */}
      <div className="bg-white p-5 rounded-lg shadow-xs border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center space-x-2">
            <Building className="h-4 w-4 text-blue-600" />
            <span>1. Supplier &amp; Order Information</span>
          </h2>
          <span className="text-xs bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full font-semibold">
            {includedItems.length} lines selected for PO
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Supplier Selection */}
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-700 uppercase">Supplier Name *</label>
              <button
                type="button"
                onClick={() => setIsCustomSupplier(!isCustomSupplier)}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
              >
                {isCustomSupplier ? 'Select from list' : '+ Type custom name'}
              </button>
            </div>
            {isCustomSupplier ? (
              <input
                type="text"
                placeholder="Enter custom supplier name..."
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            ) : (
              <select
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
              >
                <option value="">-- Select Supplier --</option>
                {allSuppliers.map((s, idx) => (
                  <option key={idx} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>

          {/* Supplier PO Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Supplier PO Number *</label>
            <input
              type="text"
              placeholder="e.g. LP-PO-2026-01"
              value={supplierPONumber}
              onChange={e => setSupplierPONumber(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-amber-900 bg-amber-50/50 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          {/* Currency */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">PO Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value as any)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 bg-white cursor-pointer"
            >
              <option value="AED">AED - United Arab Emirates Dirham</option>
              <option value="USD">USD - US Dollar ($)</option>
            </select>
          </div>

          {/* PO Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">PO Issue Date</label>
            <input
              type="date"
              value={poDate}
              onChange={e => setPoDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
            />
          </div>

          {/* Delivery Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Required Delivery Date</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={e => setDeliveryDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
            />
          </div>

          {/* Payment Terms */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Payment Terms</label>
            <input
              type="text"
              value={paymentTerms}
              onChange={e => setPaymentTerms(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
              placeholder="30 Days PDC / Cash on Delivery"
            />
          </div>

          {/* Delivery Location */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Delivery Destination</label>
            <input
              type="text"
              value={deliveryLocation}
              onChange={e => setDeliveryLocation(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Line Items Table with MTC Attachment, Preview & Download */}
      <div className="bg-white rounded-lg shadow-xs border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-white border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-sm text-slate-900">
              2. L-Code &amp; Non-Stock Pending Items
            </h2>
            <span className="text-[11px] bg-slate-100 border border-slate-200 text-slate-700 font-mono px-2 py-0.5 rounded-full tabular-nums">
              {includedItems.length} of {poItems.length} selected
            </span>
            {excludedStockCount > 0 && (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                {excludedStockCount} Stock item(s) hidden
              </span>
            )}
            {alreadyOrderedCount > 0 && (
              <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                {alreadyOrderedCount} already in PO hidden
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 text-xs flex-wrap gap-y-1">
            <button
              type="button"
              onClick={() => handleToggleSelectAll(true)}
              className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Select All
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => handleToggleSelectAll(false)}
              className="text-slate-600 hover:text-slate-800 font-medium cursor-pointer"
            >
              Deselect All
            </button>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600 tabular-nums">
              Total PO Qty: <strong className="text-slate-900">{totalPOQty}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600 tabular-nums">
              Total Value: <strong className="text-slate-900">{currency} {totalPOAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="p-2.5 w-10 text-center">
                  {(() => {
                    const eligible = poItems.filter(r => !r.inStock)
                    return (
                      <input
                        type="checkbox"
                        checked={eligible.length > 0 && eligible.every(r => r.included)}
                        disabled={eligible.length === 0}
                        onChange={e => handleToggleSelectAll(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
                        title={eligible.length === 0 ? 'All items are available in stock' : 'Select all eligible non-stock items'}
                      />
                    )
                  })()}
                </th>
                <th className="p-2.5 w-12 text-center">SL</th>
                <th className="p-2.5 w-16">Item #</th>
                <th className="p-2.5 min-w-[240px]">Description &amp; Specifications</th>
                <th className="p-2.5 w-36">L-Code *</th>
                <th className="p-2.5 w-24 text-center">Order Qty</th>
                <th className="p-2.5 w-28 text-center">
                  PO Qty
                  <span className="block text-[9px] text-slate-400 font-normal normal-case">Split if partial</span>
                </th>
                <th className="p-2.5 w-24 text-right">
                  Unit Price
                </th>
                <th className="p-2.5 w-24 text-right">Line Total</th>
                <th className="p-2.5 w-28">Heat Number</th>
                <th className="p-2.5 w-44 text-center">
                  MTC Certificate (Preview &amp; Download)
                </th>
                <th className="p-2.5 w-28">Make / Mfr</th>
                <th className="p-2.5 w-24">COO</th>
                <th className="p-2.5 min-w-[140px]">PO Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {poItems.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-slate-500">
                    <div className="font-semibold text-slate-700 mb-1">No pending L-Code or Non-Stock items remaining for PO creation.</div>
                    <div className="text-[11px]">
                      In-stock items and items already included in a created Purchase Order are excluded automatically.
                    </div>
                  </td>
                </tr>
              ) : poItems.map(r => {
                const isAttached = hasCertificate(r)
                const lCodeOptions = buildLCodeOptions(
                  db.getLocalPurchases(),
                  db.getLots(),
                  `L-${(r.client_po_item_no || String(r.sl_no)).replace(/[^A-Za-z0-9]/g, '')}`
                )
                const isMissingLCode = !r.inStock && r.included && !r.l_code.trim()

                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-slate-50/70 transition-colors ${r.inStock ? 'bg-slate-50/80 opacity-60' : r.included ? 'bg-white' : 'bg-slate-50 opacity-75'
                      }`}
                  >
                    {/* Inclusion Checkbox */}
                    <td className="p-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={r.included}
                        disabled={r.inStock}
                        onChange={() => handleToggleInclude(r.id)}
                        title={r.inStock ? 'Available in stock — Local Purchase disabled' : 'Select non-stock item for Local Purchase'}
                        className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>

                    {/* SL */}
                    <td className="p-2.5 text-center font-bold text-slate-700">
                      {r.sl_no}
                    </td>

                    {/* Client PO Item No */}
                    <td className="p-2.5 font-mono text-center">
                      {r.client_po_item_no}
                    </td>

                    {/* Description */}
                    <td className="p-2.5 text-slate-800 leading-snug">
                      <div>{r.description}</div>
                      {r.inStock && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          In Stock — Local Purchase Disabled
                        </span>
                      )}
                    </td>

                    {/* L-Code Selector (required for non-stock Local Purchase items) */}
                    <td className="p-2.5">
                      {r.inStock ? (
                        <span className="text-[10px] font-medium text-slate-400">Stock Item</span>
                      ) : (
                        <div className="space-y-1">
                          <select
                            aria-label={`L-Code for item ${r.client_po_item_no || r.sl_no}`}
                            value={r.l_code}
                            disabled={!r.included}
                            onChange={e => handleUpdateItem(r.id, 'l_code', e.target.value)}
                            className={`w-full border rounded px-1.5 py-1 text-xs font-mono font-semibold bg-white disabled:bg-slate-100 disabled:text-slate-400 ${isMissingLCode
                              ? 'border-rose-400 text-rose-900 bg-rose-50/50'
                              : 'border-slate-300 text-slate-900'
                              }`}
                          >
                            <option value="">-- Select L-Code --</option>
                            {lCodeOptions.map(opt => (
                              <option key={opt.code} value={opt.code}>
                                {opt.label}
                              </option>
                            ))}
                            {r.l_code && !lCodeOptions.some(o => o.code === r.l_code) && (
                              <option value={r.l_code}>{r.l_code}</option>
                            )}
                          </select>
                          {isMissingLCode && (
                            <span className="block text-[9px] font-semibold text-rose-600">
                              L-Code required
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Original Order Qty */}
                    <td className="p-2.5 text-center font-bold text-slate-600">
                      {r.totalQty} {r.uom}
                    </td>

                    {/* PO Qty (Editable) */}
                    <td className="p-2.5 text-center bg-amber-50/20">
                      <div className="flex items-center justify-center space-x-1">
                        <input
                          type="number"
                          min="1"
                          max={r.totalQty}
                          value={r.poQty}
                          disabled={!r.included}
                          onChange={e => handleUpdateItem(r.id, 'poQty', Math.min(r.totalQty, Math.max(1, Number(e.target.value))))}
                          className="w-16 border border-amber-300 rounded px-1.5 py-1 text-center font-bold text-xs bg-white text-slate-900"
                        />
                        <span className="text-[10px] text-slate-500 font-mono">{r.uom}</span>
                      </div>
                      {r.poQty < r.totalQty && (
                        <span className="block text-[9px] text-amber-700 font-bold mt-0.5">
                          Will split: {r.totalQty - r.poQty} in Stock
                        </span>
                      )}
                    </td>

                    {/* Unit Price (Editable) */}
                    <td className="p-2.5 text-right bg-amber-50/20 font-mono">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={r.unitPrice}
                        disabled={!r.included}
                        onChange={e => handleUpdateItem(r.id, 'unitPrice', Number(e.target.value))}
                        className="w-20 border border-amber-300 rounded px-1.5 py-1 text-right text-xs font-bold bg-white text-slate-900"
                      />
                    </td>

                    {/* Line Total */}
                    <td className="p-2.5 text-right font-mono font-bold text-slate-800">
                      {((r.poQty || 0) * (r.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Heat Number */}
                    <td className="p-2.5 min-w-[140px]">
                      <HeatNumberCombobox
                        value={r.heat_number}
                        description={r.description}
                        extraLots={db.getMasterStockView()}
                        disabled={r.inStock || !r.included}
                        onChange={(heat, meta) => {
                          handleUpdateItem(r.id, 'heat_number', heat)
                          handleUpdateItem(r.id, 'certificate_number', !heat.trim() ? '' : (meta?.fileName || ''))
                          if (meta?.make) {
                            handleUpdateItem(r.id, 'make', meta.make)
                          } else if (meta?.isBenkan) {
                            handleUpdateItem(r.id, 'make', 'BENKAN THAILAND CORP')
                          }
                          if (meta?.countryOfOrigin) {
                            handleUpdateItem(r.id, 'countryOfOrigin', meta.countryOfOrigin)
                          } else if (meta?.isBenkan) {
                            handleUpdateItem(r.id, 'countryOfOrigin', 'Thailand')
                          }
                        }}
                      />
                    </td>

                    {/* MTC Certificate Column (Upload, 👁️ Preview, 📥 Download) */}
                    <td className="p-2.5 bg-indigo-50/20">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex-1 min-w-0">
                          {isAttached ? (
                            <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded truncate max-w-[110px]" title={r.certificate_number || 'Attached'}>
                              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
                              <span className="truncate">{r.certificate_number ? r.certificate_number.replace(/\.pdf$/i, '') : 'Attached'}</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setTargetUploadItemId(r.id)
                                itemFileInputRef.current?.click()
                              }}
                              className="inline-flex items-center space-x-1 text-[10px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                              title="Upload MTC PDF for this line"
                            >
                              <Upload className="h-2.5 w-2.5" />
                              <span>Upload PDF</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          {/* 👁️ Preview Button */}
                          <button
                            type="button"
                            disabled={!isAttached}
                            onClick={() => handleOpenPreview(r)}
                            className="p-1 rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            title={isAttached ? 'Preview stamped MTC Certificate inline' : 'Select Heat Number with an available MTC first'}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          {/* 📥 Download Single Stamped Button */}
                          <button
                            type="button"
                            disabled={!isAttached}
                            onClick={() => handleDownloadSingle(r)}
                            className="p-1 rounded bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            title={isAttached ? 'Download stamped MTC PDF for this line' : 'Select Heat Number with an available MTC first'}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Make */}
                    <td className="p-2.5">
                      <input
                        type="text"
                        placeholder="Make / Mill"
                        value={r.make}
                        disabled={!r.included}
                        onChange={e => handleUpdateItem(r.id, 'make', e.target.value)}
                        className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-800"
                      />
                    </td>

                    {/* Country of Origin */}
                    <td className="p-2.5">
                      <input
                        type="text"
                        placeholder="COO"
                        value={r.countryOfOrigin}
                        disabled={!r.included}
                        onChange={e => handleUpdateItem(r.id, 'countryOfOrigin', e.target.value)}
                        className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-800"
                      />
                    </td>

                    {/* Remarks */}
                    <td className="p-2.5">
                      <input
                        type="text"
                        placeholder="Machining / Special notes"
                        value={r.remarks}
                        disabled={!r.included}
                        onChange={e => handleUpdateItem(r.id, 'remarks', e.target.value)}
                        className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-700"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Summary Bar */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center space-x-4 text-xs flex-wrap gap-y-1">
            <span className="text-slate-600">
              Supplier: <strong className="text-slate-900">{supplierName || 'Not Set'}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">
              PO Number: <strong className="text-amber-900 font-mono">{supplierPONumber || 'Not Set'}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">
              Active Items: <strong className="text-slate-900">{includedItems.length} lines</strong>
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-sm font-semibold text-slate-800 tabular-nums">
              Total Purchase Order: <span className="text-slate-900 font-mono">{currency} {totalPOAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsCreatePOModalOpen(true)}
              disabled={includedItems.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-xs px-4 py-2 rounded-md flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create PO</span>
            </button>
            <button
              onClick={handleApplyToWorksheet}
              disabled={includedItems.length === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-md flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Apply to Worksheet</span>
            </button>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Reject Reason Modal for Supplier PO Receipt Discrepancy */}
      {rejectTargetItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reject Material Modal"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-rose-950 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>Reject Material / Certificate — Item #{rejectTargetItem.client_po_item_no || rejectTargetItem.sl_no}</span>
              </h3>
              <button
                type="button"
                onClick={() => setRejectTargetItem(null)}
                className="p-1 rounded text-rose-700 hover:bg-rose-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <div className="font-semibold text-slate-900">{rejectTargetItem.description}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  PO #: <span className="font-mono">{rejectTargetItem.supplier_po_number}</span> &bull; Supplier: {rejectTargetItem.supplier_name}
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Rejection Reason *</label>
                <textarea
                  rows={3}
                  aria-label="Rejection Reason"
                  placeholder="Describe material or certificate discrepancy..."
                  value={rejectionReasonInput}
                  onChange={e => setRejectionReasonInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-2 text-xs text-slate-900 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setRejectTargetItem(null)}
                className="px-3 py-1.5 rounded bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectItem}
                className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create PO Pop-up Modal (displays only selected L-Code / Non-Stock items) */}
      {isCreatePOModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create PO Modal"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden">
            {/* Popup Header */}
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShoppingCart className="h-5 w-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Create Purchase Order — Selected Items ({includedItems.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Supplier: <strong className="text-slate-700">{supplierName || 'LOCAL PURCHASE'}</strong> &bull; PO #: <strong className="font-mono text-amber-800">{supplierPONumber || 'LP-PO'}</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatePOModalOpen(false)}
                  className="px-3 py-1.5 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 text-blue-600" />
                  <span>Add More Items</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatePOModalOpen(false)}
                  aria-label="Close Create PO Modal"
                  className="p-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Popup Body: Selected Items + Supplier Unit Price Costing */}
            <div className="flex-1 overflow-auto p-4">
              {includedItems.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs">
                  No items selected. Click <strong>Add More Items</strong> to select pending L-Code or Non-Stock items.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-2 w-12 text-center">SL</th>
                      <th className="p-2 w-16 text-center">Item #</th>
                      <th className="p-2 min-w-[210px]">Description</th>
                      <th className="p-2 w-36">L-Code *</th>
                      <th className="p-2 w-24 text-center">PO Qty</th>
                      <th className="p-2 w-28 text-right">Supplier Unit Price ({currency})</th>
                      <th className="p-2 w-28 text-right">Line Purchase Total</th>
                      <th className="p-2 w-28 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {includedItems.map(r => {
                      const lCodeOptions = buildLCodeOptions(
                        db.getLocalPurchases(),
                        db.getLots(),
                        `L-${(r.client_po_item_no || String(r.sl_no)).replace(/[^A-Za-z0-9]/g, '')}`
                      )
                      const lineTotal = Math.round((r.poQty || 0) * (r.unitPrice || 0) * 100) / 100
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/70">
                          <td className="p-2 text-center font-bold text-slate-700">{r.sl_no}</td>
                          <td className="p-2 text-center font-mono">{r.client_po_item_no}</td>
                          <td className="p-2 text-slate-800">{r.description}</td>
                          <td className="p-2">
                            <select
                              aria-label={`Popup L-Code for item ${r.client_po_item_no || r.sl_no}`}
                              value={r.l_code}
                              onChange={e => handleUpdateItem(r.id, 'l_code', e.target.value)}
                              className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs font-mono font-semibold bg-white text-slate-900"
                            >
                              <option value="">-- Select L-Code --</option>
                              {lCodeOptions.map(opt => (
                                <option key={opt.code} value={opt.code}>
                                  {opt.label}
                                </option>
                              ))}
                              {r.l_code && !lCodeOptions.some(o => o.code === r.l_code) && (
                                <option value={r.l_code}>{r.l_code}</option>
                              )}
                            </select>
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="1"
                              max={r.totalQty}
                              aria-label={`Popup PO Qty for item ${r.client_po_item_no || r.sl_no}`}
                              value={r.poQty}
                              onChange={e =>
                                handleUpdateItem(
                                  r.id,
                                  'poQty',
                                  Math.min(r.totalQty, Math.max(1, Number(e.target.value) || 1))
                                )
                              }
                              className="w-16 border border-amber-300 rounded px-1.5 py-1 text-center font-bold text-xs bg-white"
                            />
                            <div className="text-[10px] text-slate-400">Pending: {r.totalQty} {r.uom}</div>
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              aria-label={`Supplier Unit Price for item ${r.client_po_item_no || r.sl_no}`}
                              value={r.unitPrice}
                              onChange={e => handleUpdateItem(r.id, 'unitPrice', Math.max(0, Number(e.target.value) || 0))}
                              className="w-24 border border-amber-300 rounded px-1.5 py-1 text-right font-mono font-bold text-xs bg-white"
                            />
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            {currency} {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleInclude(r.id)}
                              aria-label={`Remove Item ${r.client_po_item_no || r.sl_no}`}
                              className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Remove Item</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Popup Footer: Total Purchase Value & Actions */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <span className="text-slate-600">
                  Selected Lines: <strong className="text-slate-900">{includedItems.length}</strong> &bull; Total Qty: <strong className="text-slate-900">{totalPOQty}</strong>
                </span>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">
                  Total Purchase Value: <span className="font-mono text-emerald-700">{currency} {totalPOAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatePOModalOpen(false)}
                  className="px-3 py-2 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  Add More Items
                </button>
                <button
                  type="button"
                  onClick={handleExportPOExcel}
                  disabled={isExporting || includedItems.length === 0}
                  className="px-3 py-2 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold disabled:opacity-50 cursor-pointer"
                >
                  Supplier PO (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeCreatePO}
                  disabled={includedItems.length === 0}
                  className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Confirm &amp; Create PO</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Certificate Preview Modal */}
      {previewModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-50 text-slate-900 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <FileCheck2 className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-sm text-slate-900">
                    MTC Certificate Preview — Item #{previewModalItem.client_po_item_no || previewModalItem.sl_no}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    PO #{supplierPONumber || 'PO'} | Heat: {previewModalItem.heat_number || 'N/A'} | {previewModalItem.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownloadSingle(previewModalItem)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Stamped PDF</span>
                </button>
                <button
                  onClick={() => {
                    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl)
                    setPreviewModalItem(null)
                    setPreviewPdfUrl(null)
                  }}
                  className="p-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Stamp Configuration Sub-bar */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-1.5 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyStamp}
                    onChange={e => {
                      setApplyStamp(e.target.checked)
                      setTimeout(() => handleOpenPreview(previewModalItem), 100)
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                  <span>Apply MSG Certified True Copy Stamp</span>
                </label>

                {applyStamp && (
                  <div className="flex items-center space-x-3 text-red-950 font-medium">
                    <span>Inspector: <strong>{inspectorName}</strong></span>
                    <span>Date: <strong>{stampDate}</strong></span>
                    <span>PO: <strong>{supplierPONumber || 'PO'}</strong></span>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetUploadItemId(previewModalItem.id)
                    itemFileInputRef.current?.click()
                  }}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold px-2.5 py-1 rounded-md cursor-pointer"
                >
                  Upload Replacement PDF
                </button>
              </div>
            </div>

            {/* Iframe Preview Container */}
            <div className="flex-1 bg-slate-200 relative flex items-center justify-center overflow-hidden">
              {isPreviewLoading ? (
                <div className="text-center p-6 text-slate-600 text-xs">
                  <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin text-slate-500" />
                  Generating stamped certificate preview...
                </div>
              ) : previewPdfUrl ? (
                <iframe
                  src={`${previewPdfUrl}#toolbar=0&view=FitH`}
                  title="MTC Certificate Preview"
                  className="w-full h-full border-none"
                />
              ) : (
                <div className="text-center p-6 text-slate-400 text-xs">
                  No preview available
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="text-slate-500 font-mono">
                {previewModalItem.certificate_number || 'Default authentic mill certificate template with MSG True Copy Stamp'}
              </span>
              <button
                onClick={() => {
                  if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl)
                  setPreviewModalItem(null)
                  setPreviewPdfUrl(null)
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-4 py-1.5 rounded-lg cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
