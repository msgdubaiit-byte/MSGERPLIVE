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
} from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import {
  SourcingWorksheetData,
  SourcingLineItem,
  generateStoresSummaryExcel,
  extractQtyNumber,
  extractTotalQtyNumber,
} from '../../services/sourcingEngine'
import {
  stampMTCDocument,
  downloadPDFBlob,
  createSampleMillCertificate,
  downloadCertificatesAsZip,
} from '../../services/pdfEngine'
import {
  registerUploadedCertificate,
  getUploadedCertificateBytes,
  detectHeatNumberFromFilename,
  extractCertificatesFromZip,
} from '../../services/zipExtractor'
import { db } from '../../services/db'

interface InPagePurchaseOrderTabProps {
  worksheetData: SourcingWorksheetData
  selectedItemIds: Set<string>
  onApply: (updatedItems: SourcingLineItem[]) => void
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

  // PO Items state
  const [poItems, setPoItems] = useState<POItemRow[]>([])
  const [isExporting, setIsExporting] = useState(false)

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

    const effectiveSupp = defaultSupp || 'AL GHAITH OILFIELD SUPPLIES'
    setSupplierName(effectiveSupp)
    setSupplierPONumber(defaultPO || `LP-PO-${new Date().toISOString().substring(2, 4)}${new Date().getMonth() + 1}-01`)

    // Build PO items
    const rows: POItemRow[] = worksheetData.items.map((it, idx) => {
      const qNum = extractQtyNumber(it.qty)
      const isSelected = selectedItemIds.size > 0 ? selectedItemIds.has(it.id) : true

      return {
        id: it.id,
        sl_no: it.sl_no || idx + 1,
        client_po_item_no: it.client_po_item_no || `${idx + 1}`,
        description: it.description,
        totalQty: qNum,
        uom: it.uom || 'PCS',
        poQty: qNum,
        unitPrice: it.unit_price || 0,
        make: it.make || '',
        countryOfOrigin: it.country_of_origin || '',
        remarks: it.remarks || '',
        heat_number: it.heat_number || '',
        certificate_number: it.certificate_number || '',
        included: isSelected,
      }
    })

    setPoItems(rows)
  }, [worksheetData, selectedItemIds])

  const includedItems = poItems.filter(r => r.included)
  const totalPOQty = includedItems.reduce((sum, r) => sum + (r.poQty || 0), 0)
  const totalPOAmount = includedItems.reduce((sum, r) => sum + (r.poQty || 0) * (r.unitPrice || 0), 0)

  // Check if an item has an attached certificate
  const hasCertificate = (r: POItemRow): boolean => {
    const certRef = r.certificate_number
    const heat = r.heat_number
    if (certRef && getUploadedCertificateBytes(certRef)) return true
    if (heat && getUploadedCertificateBytes(heat)) return true
    const dbMtc = db.getMTCs().find(m =>
      (heat && m.heat_number.toUpperCase() === heat.toUpperCase()) ||
      (certRef && m.certificate_reference.toUpperCase() === certRef.toUpperCase())
    )
    if (dbMtc) return true
    return false
  }

  // Retrieve raw PDF bytes for an item
  const getItemCertBytes = async (r: POItemRow): Promise<Uint8Array | null> => {
    const certRef = r.certificate_number
    const heat = r.heat_number

    if (certRef) {
      const vBytes = getUploadedCertificateBytes(certRef)
      if (vBytes) return vBytes
    }
    if (heat) {
      const vBytes = getUploadedCertificateBytes(heat)
      if (vBytes) return vBytes
    }
    const dbMtc = db.getMTCs().find(m =>
      (heat && m.heat_number.toUpperCase() === heat.toUpperCase()) ||
      (certRef && m.certificate_reference.toUpperCase() === certRef.toUpperCase())
    )
    if (dbMtc && (dbMtc as any).file_data_url) {
      try {
        const res = await fetch((dbMtc as any).file_data_url)
        const buf = await res.arrayBuffer()
        return new Uint8Array(buf)
      } catch (e) {
        console.warn('Could not fetch dbMtc file_data_url:', e)
      }
    }
    return await createSampleMillCertificate(
      r.client_po_item_no || 'ITM',
      r.heat_number || 'ORIGINAL-HEAT',
      2026,
      2
    )
  }

  // Toggle item inclusion
  const handleToggleInclude = (id: string) => {
    setPoItems(prev => prev.map(r => r.id === id ? { ...r, included: !r.included } : r))
  }

  const handleToggleSelectAll = (checked: boolean) => {
    setPoItems(prev => prev.map(r => ({ ...r, included: checked })))
  }

  // Update item field
  const handleUpdateItem = (id: string, field: keyof POItemRow, val: any) => {
    setPoItems(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))
  }

  // Apply to Worksheet
  const handleApplyToWorksheet = () => {
    const activeSupp = supplierName.trim() || 'LOCAL PURCHASE'
    const activePO = supplierPONumber.trim() || 'LP-PO'

    const poItemMap = new Map(poItems.map(r => [r.id, r]))
    const newItems: SourcingLineItem[] = []

    let appliedCount = 0
    let splitCount = 0

    worksheetData.items.forEach(orig => {
      const state = poItemMap.get(orig.id)

      if (!state || !state.included) {
        newItems.push(orig)
        return
      }

      const totalQty = state.totalQty
      const poQty = state.poQty
      const unitP = state.unitPrice
      const make = state.make
      const coo = state.countryOfOrigin
      const remarks = state.remarks
      const heatNum = state.heat_number
      const certRef = state.certificate_number

      if (poQty >= totalQty) {
        newItems.push({
          ...orig,
          qty: totalQty,
          unit_price: unitP,
          total_price: totalQty * unitP,
          supplier_name: activeSupp,
          supplier_po_number: activePO,
          make: make || orig.make,
          country_of_origin: coo || orig.country_of_origin,
          heat_number: heatNum || orig.heat_number,
          certificate_number: certRef || orig.certificate_number,
          remarks: remarks ? `${remarks}; Local PO: ${activePO}` : `Local PO: ${activePO}`,
          is_machined: true,
        })
        appliedCount++
      } else {
        const remainingQty = Math.round((totalQty - poQty) * 100) / 100
        const origUnitP = orig.unit_price || 0

        newItems.push({
          ...orig,
          qty: `${remainingQty} OF ${totalQty}`,
          total_price: remainingQty * origUnitP,
          remarks: orig.remarks ? `${orig.remarks}; Main Stock` : 'Main Stock',
        })

        newItems.push({
          ...orig,
          id: `${orig.id}-PO-${Date.now()}`,
          client_po_item_no: orig.client_po_item_no,
          qty: `${poQty} OF ${totalQty}`,
          unit_price: unitP,
          total_price: poQty * unitP,
          supplier_name: activeSupp,
          supplier_po_number: activePO,
          make: make || orig.make,
          country_of_origin: coo || orig.country_of_origin,
          heat_number: heatNum || orig.heat_number,
          certificate_number: certRef || orig.certificate_number,
          remarks: remarks ? `${remarks}; Local PO: ${activePO}` : `Local PO: ${activePO}`,
          is_machined: true,
        })

        splitCount++
        appliedCount++
      }
    })

    const renumbered = newItems.map((it, idx) => ({ ...it, sl_no: idx + 1 }))
    onApply(renumbered)
    showToast(`Successfully synced Purchase Order #${activePO} (${appliedCount} lines, ${splitCount} split) to worksheet!`)
    onBack()
  }

  // Export PO Excel
  const handleExportPOExcel = async () => {
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
              },
              true
            )
          }

          const docToMerge = await PDFDocument.load(stampedBytes)
          const pages = await mergedPdf.copyPages(docToMerge, docToMerge.getPageIndices())
          pages.forEach(p => mergedPdf.addPage(p))
          includedCount++
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
        if (rawBytes) {
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
              },
              true
            )
          }

          const certName = (it.certificate_number && it.certificate_number.toLowerCase().endsWith('.pdf'))
            ? it.certificate_number
            : `MTC_PO_${supplierPONumber || 'PO'}_Item_${it.client_po_item_no}_Heat_${it.heat_number || 'Cert'}.pdf`

          certList.push({ fileName: certName, bytes: stampedBytes })
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
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Return to Sourcing Worksheet"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Worksheet</span>
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <ShoppingCart className="h-5 w-5 text-amber-600" />
              <span>Purchase Order &amp; Local Sourcing Entry</span>
            </h1>
            <p className="text-xs text-slate-500">
              Configure supplier, PO number, unit costs, attach mill test certificates, preview with Certified True Copy stamp, and download deliverables.
            </p>
          </div>
        </div>

        {/* PO Actions Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Download PO Excel */}
          <button
            onClick={handleExportPOExcel}
            disabled={isExporting || includedItems.length === 0}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            title="Export official Supplier PO to Excel"
          >
            <Download className="h-4 w-4" />
            <span>Supplier PO (.xlsx)</span>
          </button>

          {/* 2. Upload PO MTCs */}
          <button
            onClick={() => bulkFileInputRef.current?.click()}
            disabled={isUploadingCert}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            title="Upload supplier MTC PDFs or ZIP archive for this PO"
          >
            <Upload className="h-4 w-4" />
            <span>{isUploadingCert ? 'Uploading...' : 'Upload MTCs (PDF/ZIP)'}</span>
          </button>

          {/* 3. Download PO MTC Package PDF */}
          <button
            onClick={handleDownloadPOMTCPackage}
            disabled={isPackaging || includedItems.length === 0}
            className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            title="Download all attached certificates for this PO merged into a single multi-page stamped PDF"
          >
            <FileCheck2 className="h-4 w-4" />
            <span>{isPackaging ? 'Packaging...' : 'Download PO MTC Package (.pdf)'}</span>
          </button>

          {/* 4. Download All MTCs ZIP */}
          <button
            onClick={handleDownloadPOZip}
            disabled={isPackaging || includedItems.length === 0}
            className="bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            title="Download all stamped certificates for this PO bundled in a .zip archive"
          >
            <Archive className="h-4 w-4" />
            <span>MTCs (.zip)</span>
          </button>

          {/* 5. Apply & Sync to Worksheet */}
          <button
            onClick={handleApplyToWorksheet}
            disabled={includedItems.length === 0}
            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-md transition-colors cursor-pointer"
            title="Save and synchronize all PO fields and MTC attachments back into main worksheet"
          >
            <Save className="h-4 w-4" />
            <span>Apply &amp; Sync</span>
          </button>
        </div>
      </div>

      {/* PO Master Details Form */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-2">
            <Building className="h-4 w-4 text-indigo-600" />
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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center space-x-2">
            <h2 className="font-bold text-sm text-slate-800">
              2. PO Line Items &amp; MTC Certificates
            </h2>
            <span className="text-xs bg-slate-200 text-slate-700 font-mono px-2 py-0.5 rounded-full">
              {includedItems.length} of {poItems.length} included
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs flex-wrap gap-y-1">
            <button
              type="button"
              onClick={() => handleToggleSelectAll(true)}
              className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
            >
              Select All
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => handleToggleSelectAll(false)}
              className="text-slate-600 hover:text-slate-800 font-semibold cursor-pointer"
            >
              Deselect All
            </button>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">
              Total PO Qty: <strong className="text-slate-900">{totalPOQty}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">
              Total PO Value: <strong className="text-amber-900">{currency} {totalPOAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="p-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={poItems.length > 0 && poItems.every(r => r.included)}
                    onChange={e => handleToggleSelectAll(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                  />
                </th>
                <th className="p-2.5 w-12 text-center">SL</th>
                <th className="p-2.5 w-16">Item #</th>
                <th className="p-2.5 min-w-[240px]">Description &amp; Specifications</th>
                <th className="p-2.5 w-24 text-center">Order Qty</th>
                <th className="p-2.5 w-28 text-center bg-amber-50 text-amber-900 border-b-2 border-amber-400">
                  PO Qty
                  <span className="block text-[9px] text-amber-700 font-normal">Split if partial</span>
                </th>
                <th className="p-2.5 w-24 text-right bg-amber-50 text-amber-900 border-b-2 border-amber-400">
                  Unit Price
                </th>
                <th className="p-2.5 w-24 text-right">Line Total</th>
                <th className="p-2.5 w-28">Heat Number</th>
                <th className="p-2.5 w-44 text-center bg-indigo-50/50 text-indigo-900 border-b-2 border-indigo-400">
                  MTC Certificate (Preview &amp; Download)
                </th>
                <th className="p-2.5 w-28">Make / Mfr</th>
                <th className="p-2.5 w-24">COO</th>
                <th className="p-2.5 min-w-[140px]">PO Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {poItems.map(r => {
                const isAttached = hasCertificate(r)

                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      r.included ? 'bg-white' : 'bg-slate-50 opacity-50'
                    }`}
                  >
                    {/* Inclusion Checkbox */}
                    <td className="p-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={r.included}
                        onChange={() => handleToggleInclude(r.id)}
                        className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
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
                      {r.description}
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
                    <td className="p-2.5">
                      <input
                        type="text"
                        placeholder="e.g. 68C01M04"
                        value={r.heat_number}
                        disabled={!r.included}
                        onChange={e => handleUpdateItem(r.id, 'heat_number', e.target.value)}
                        className="w-full border border-red-200 rounded px-1.5 py-1 font-mono text-[11px] font-bold text-red-700 bg-red-50/30"
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
                            onClick={() => handleOpenPreview(r)}
                            className="p-1 rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 transition-colors cursor-pointer"
                            title="Preview stamped MTC Certificate inline"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          {/* 📥 Download Single Stamped Button */}
                          <button
                            type="button"
                            onClick={() => handleDownloadSingle(r)}
                            className="p-1 rounded bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 transition-colors cursor-pointer"
                            title="Download stamped MTC PDF for this line"
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
            <span className="text-sm font-bold text-slate-800">
              Total Purchase Order: <span className="text-amber-900 font-mono">{currency} {totalPOAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </span>
            <button
              onClick={handleApplyToWorksheet}
              disabled={includedItems.length === 0}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>Apply to Worksheet</span>
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Certificate Preview Modal */}
      {previewModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <FileCheck2 className="h-5 w-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm">
                    MTC Certificate Preview — Item #{previewModalItem.client_po_item_no || previewModalItem.sl_no}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    PO #{supplierPONumber || 'PO'} | Heat: {previewModalItem.heat_number || 'N/A'} | {previewModalItem.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownloadSingle(previewModalItem)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-xs"
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
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Stamp Configuration Sub-bar */}
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-1.5 font-bold text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyStamp}
                    onChange={e => {
                      setApplyStamp(e.target.checked)
                      setTimeout(() => handleOpenPreview(previewModalItem), 100)
                    }}
                    className="rounded text-red-600 focus:ring-red-500 h-4 w-4"
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
