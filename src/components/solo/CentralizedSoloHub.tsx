import React, { useState, useMemo, useRef } from 'react'
import {
  Zap,
  Search,
  FileSpreadsheet,
  Package,
  Wrench,
  Sparkles,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Building,
  FileDown,
  ChevronRight,
  Flame,
  Truck,
  ExternalLink,
  Tag,
  AlertTriangle,
  Layers,
  ArrowRight,
  FileUp,
  FileText,
  Loader2,
  RefreshCw,
  X,
  UploadCloud,
  Check,
  Edit3,
  ChevronDown,
  ChevronUp,
  Hash
} from 'lucide-react'
import { db } from '../../services/db'
import { useAuth } from '../../context/AuthContext'
import { NavTabId } from '../common/Sidebar'
import {
  generateClientSummaryExcel,
  generateStoresSummaryExcel,
  generateCIPLLogisticExcel,
  generateSupplierPOZip,
  SourcingWorksheetData,
  SourcingLineItem,
  autoDetectMake,
  autoDetectCountryOfOrigin,
  autoDetectHSCode,
  normalizeHSCode,
  estimateUnitWeight
} from '../../services/sourcingEngine'
import { parseCustomerSOPDF } from '../../services/pdfEngine'
import { parseSalesOrderExcel } from '../../services/excelEngine'
import { LocalPurchaseAllocationModal } from '../sourcing/LocalPurchaseAllocationModal'
import { ExcelDeliverablesPreviewModal, SourcingPreviewTab } from '../sourcing/ExcelDeliverablesPreviewModal'

interface CentralizedSoloHubProps {
  onNavigateTab: (tab: NavTabId) => void
  onOpenHeatModal: (heatNumber: string) => void
}

export const CentralizedSoloHub: React.FC<CentralizedSoloHubProps> = ({
  onNavigateTab,
  onOpenHeatModal
}) => {
  const { currentUser } = useAuth()
  const [dbRefreshKey, setDbRefreshKey] = useState(0)
  const refreshData = () => setDbRefreshKey(k => k + 1)

  // Real-time data from local DB
  const orders = useMemo(() => db.getOrders(), [dbRefreshKey])
  const lots = useMemo(() => db.getLots(), [dbRefreshKey])
  const balances = useMemo(() => db.getBalances(), [dbRefreshKey])
  const mtcs = useMemo(() => db.getMTCs(), [dbRefreshKey])

  // Selected Order for Instant Deliverables
  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => orders[0]?.id || '')
  const [heatSearchQuery, setHeatSearchQuery] = useState('')
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Uploading state
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Modals & Review State
  const [isLpModalOpen, setIsLpModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [previewTab, setPreviewTab] = useState<SourcingPreviewTab>('client')
  const [showLineItemsReview, setShowLineItemsReview] = useState(true)
  const [editingHsnIndex, setEditingHsnIndex] = useState<number | null>(null)
  const [editingHsnValue, setEditingHsnValue] = useState<string>('')

  // Fast-track selected order details
  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId) || orders[0]
  }, [orders, selectedOrderId])

  // Convert selected order into SourcingWorksheetData for 1-click deliverables
  const currentWorksheetData: SourcingWorksheetData = useMemo(() => {
    if (!selectedOrder) {
      return { client: 'Client Name', po_number: 'PO-001', msg_ref: 'SO-001', currency: 'AED', items: [] }
    }

    const items: SourcingLineItem[] = selectedOrder.items.map((it, idx) => {
      const desc = it.item_description || `Item ${it.item_code}`
      const detectedMake = it.make || autoDetectMake(desc) || 'BENKAN THAILAND'
      const detectedCOO = it.country_of_origin || autoDetectCountryOfOrigin(detectedMake, desc, '')
      const detectedHS = it.hs_code || autoDetectHSCode(desc, it.item_code)
      const unitPrice = it.unit_price || 50
      const unitWt = estimateUnitWeight(desc, it.uom)
      const lineNet = Math.round(it.required_qty * unitWt * 100) / 100
      const lineGross = Math.round(lineNet * 1.15 * 100) / 100

      return {
        id: `SOLO-ITM-${idx + 1}`,
        sl_no: idx + 1,
        client_po_item_no: it.client_po_item_no || `${idx + 1}`,
        description: desc,
        qty: it.required_qty,
        uom: it.uom || 'PCS',
        heat_number: it.heat_number || '',
        certificate_number: it.heat_number ? `MTC-${it.heat_number}.pdf` : '',
        make: detectedMake,
        remarks: it.location ? `Yard: ${it.location}` : 'Allocated',
        supplier_name: it.supplier_name || detectedMake,
        supplier_po_number: `PO-${idx + 1}`,
        hs_code: detectedHS,
        country_of_origin: detectedCOO,
        unit_price: unitPrice,
        total_price: it.required_qty * unitPrice,
        unit_weight_kg: unitWt,
        total_net_weight_kg: lineNet,
        total_gross_weight_kg: lineGross,
        package_no: `PKG # ${Math.floor(idx / 3) + 1}`,
        is_machined: false
      }
    })

    return {
      client: selectedOrder.customer_name,
      po_number: selectedOrder.po_number,
      msg_ref: selectedOrder.so_number,
      currency: 'AED',
      items
    }
  }, [selectedOrder])

  // Save manual HSN code modification to the sales order in database
  const handleSaveHsn = (idx: number, newHsn: string) => {
    if (!selectedOrder) return
    const trimmed = newHsn.trim()
    if (!trimmed) return
    const targetItem = selectedOrder.items[idx]
    const desc = targetItem ? (targetItem.item_description || targetItem.item_code) : ''
    // Auto-normalize or reclassify typos like 700.7 / 7007 / 7307 to accurate 8-digit tariff lines
    const normalizedHsn = autoDetectHSCode(desc, targetItem?.item_code || '', trimmed) || normalizeHSCode(trimmed) || trimmed

    const updatedItems = selectedOrder.items.map((it, i) => {
      if (i === idx) {
        return { ...it, hs_code: normalizedHsn }
      }
      return it
    })
    db.updateSalesOrder({
      id: selectedOrder.id,
      items: updatedItems
    })
    setEditingHsnIndex(null)
    refreshData()
    setStatusNotice(`HSN Code updated to "${normalizedHsn}" for Line #${idx + 1}`)
    setTimeout(() => setStatusNotice(null), 3000)
  }

  // Re-detect all HSN codes using the enhanced oilfield heuristic engine
  const handleAutoDetectAllHsns = () => {
    if (!selectedOrder) return
    let updatedCount = 0
    const updatedItems = selectedOrder.items.map(it => {
      const desc = it.item_description || it.item_code
      // Freshly evaluate from item description & code (resolving any typos or general headings)
      const code = autoDetectHSCode(desc, it.item_code)
      if (code !== it.hs_code) updatedCount++
      return { ...it, hs_code: code }
    })
    db.updateSalesOrder({
      id: selectedOrder.id,
      items: updatedItems
    })
    refreshData()
    setStatusNotice(`✨ Re-evaluated HSN codes for ${updatedItems.length} lines (${updatedCount} updated)!`)
    setTimeout(() => setStatusNotice(null), 4000)
  }

  // Heat & Stock Search Results
  const filteredStockLots = useMemo(() => {
    if (!heatSearchQuery.trim()) {
      return lots.slice(0, 6)
    }
    const q = heatSearchQuery.toLowerCase()
    return lots.filter(
      l =>
        l.heat_number.toLowerCase().includes(q) ||
        l.item_code.toLowerCase().includes(q) ||
        l.item_description.toLowerCase().includes(q) ||
        (l.warehouse_location && l.warehouse_location.toLowerCase().includes(q))
    )
  }, [lots, heatSearchQuery])

  // Pending Storekeeper Approvals
  const pendingApprovals = useMemo(() => {
    return orders.filter(o => o.status === 'Pending Storekeeper Approval')
  }, [orders])

  // Approved Orders Ready for Physical Stock Reduction
  const approvedOrders = useMemo(() => {
    return orders.filter(
      o => o.status === 'Approved' || o.status === 'Ready for Dispatch' || o.status === 'MTC Generated'
    )
  }, [orders])

  // Fast-track approve an order without storekeeper
  const handleFastTrackApprove = (orderId: string) => {
    db.storekeeperApprove(
      orderId,
      currentUser?.employee_name || 'Solo Operator',
      'Approved',
      'Fast-track approved by Solo Operator / Centralized Mode (Staff Absent)'
    )
    refreshData()
    setStatusNotice(`Order ${orderId} fast-track approved & released for dispatch!`)
    setTimeout(() => setStatusNotice(null), 4000)
  }

  // 1-Click Fast Physical Dispatch & Stock Deduction
  const handleFastDispatchOrder = (orderId: string) => {
    const res = db.fastDispatchOrder(
      orderId,
      `DN-SOLO-${Date.now().toString().slice(-5)}`,
      currentUser?.email || 'solo.operator@msgoilfield.ae'
    )
    refreshData()
    setStatusNotice(res.message)
    setTimeout(() => setStatusNotice(null), 5000)
  }

  // Upload missing certificate directly from Solo Hub
  const handleUploadMissingMTCForHeat = (file: File, heatNumber: string, itemCode?: string) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const res = db.uploadMTCForHeat(
        heatNumber,
        {
          fileName: file.name,
          fileDataUrl: dataUrl,
          itemCode,
          pages: 2
        },
        currentUser?.email || 'solo.operator@msgoilfield.ae'
      )
      refreshData()
      setStatusNotice(`MTC Certificate "${file.name}" linked to Heat ${heatNumber}! Affected Lots: ${res.affectedLots}, Orders: ${res.affectedOrders}`)
      setTimeout(() => setStatusNotice(null), 4000)
    }
    reader.readAsDataURL(file)
  }

  const handleOpenPreview = (tab: SourcingPreviewTab) => {
    setPreviewTab(tab)
    setIsPreviewModalOpen(true)
  }

  // Handle Drag & Drop / Direct Sales Order Upload (PDF / Excel)
  const handleFileUpload = async (file: File) => {
    if (!file) return
    setIsUploading(true)
    setStatusNotice(`Processing ${file.name}...`)

    try {
      const fileNameLower = file.name.toLowerCase()
      const isPdf = fileNameLower.endsWith('.pdf')
      const isExcel =
        fileNameLower.endsWith('.xlsx') ||
        fileNameLower.endsWith('.xls') ||
        fileNameLower.endsWith('.csv')

      if (isPdf) {
        const parsed = await parseCustomerSOPDF(file)
        const res = db.createSalesOrder({
          customer_name: parsed.customerName || 'Direct Customer',
          po_number: parsed.poNumber || `PO-${Date.now().toString().slice(-6)}`,
          so_number: parsed.soNumber || `SO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          required_delivery_date: parsed.deliveryDate || new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
          items: parsed.items.map((it, idx) => ({
            item_code: it.itemCode || `ITEM-${idx + 1}`,
            item_description: it.itemDescription,
            required_qty: it.requiredQty || 1,
            heat_number: it.heatNumber || '',
            location: it.location || 'Yard Stock',
            client_po_item_no: it.clientPoItemNo || `${idx + 1}`,
            position: it.position || idx + 1,
            hs_code: (it as any).hsCode,
            make: (it as any).make,
            country_of_origin: (it as any).countryOfOrigin,
            unit_price: (it as any).rate || (it as any).unitPrice,
            uom: (it as any).uom || 'PCS',
            supplier_name: (it as any).supplierName
          })),
          po_document_name: file.name,
          po_document_url: parsed.pdfBlobUrl,
          userEmail: currentUser?.email || 'solo.operator@cipl.ae'
        })

        if (res.success && res.order) {
          refreshData()
          setSelectedOrderId(res.order.id)
          setStatusNotice(
            `🎉 Sales Order ${res.order.so_number} (${res.order.customer_name}) loaded with ${res.order.items.length} items! 1-Click deliverables are ready below.`
          )
        } else {
          setStatusNotice(res.message || 'Sales order created.')
        }
      } else if (isExcel) {
        const rows = await parseSalesOrderExcel(file)
        const res = db.importSalesOrdersFromExcel(
          rows,
          currentUser?.email || 'solo.operator@cipl.ae'
        )
        if (res.success && res.orders && res.orders.length > 0) {
          refreshData()
          setSelectedOrderId(res.orders[0].id)
          setStatusNotice(
            `🎉 Successfully imported ${res.orders.length} order(s) with ${rows.length} line items from spreadsheet!`
          )
        } else {
          setStatusNotice(res.message || 'Imported Excel successfully.')
        }
      } else {
        alert('Please upload a PDF or Excel (.xlsx, .xls, .csv) Sales Order document.')
      }
    } catch (err: any) {
      console.error('File parse error:', err)
      alert(`Failed to parse file: ${err.message || 'Unknown error'}`)
      setStatusNotice(`Error parsing ${file.name}: ${err.message}`)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* Top Banner: Centralized Solo Command Hub */}
      <div className="bg-gradient-to-r from-slate-900 via-[#0B2545] to-slate-900 text-white rounded-2xl p-6 sm:p-7 shadow-xl border border-slate-700/80 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2.5">
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-[11px] px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center space-x-1 shadow-sm">
                <Zap className="h-3 w-3 fill-current" />
                <span>Centralized Solo Hub</span>
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                <ShieldCheck className="h-3 w-3" />
                <span>Workers Away / Solo Access</span>
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              All-In-One Centralized Operations Hub
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              Upload customer sales orders, extract line items, allocate local purchases, match heat certificates, generate publication sheets, and approve dispatches — all from this single unified screen.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-center min-w-[85px]">
              <div className="text-[10px] font-semibold text-slate-400">Total Orders</div>
              <div className="text-lg font-black text-amber-400 font-mono">{orders.length}</div>
            </div>
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-center min-w-[85px]">
              <div className="text-[10px] font-semibold text-slate-400">Stock Lots</div>
              <div className="text-lg font-black text-emerald-400 font-mono">{lots.length}</div>
            </div>
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-center min-w-[85px]">
              <div className="text-[10px] font-semibold text-slate-400">Pending Appr.</div>
              <div className="text-lg font-black text-rose-400 font-mono">{pendingApprovals.length}</div>
            </div>
          </div>
        </div>

        {statusNotice && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs font-bold text-emerald-200 flex items-center justify-between space-x-2 animate-in slide-in-from-top-2">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-emerald-300 hover:text-white text-xs font-bold px-2 py-0.5 rounded cursor-pointer"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Fast Order Deliverables & Local Purchase Studio (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Card 1: Direct Sales Order Upload Zone */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500/10 via-slate-50 to-emerald-500/10 px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black">
                  <UploadCloud className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-black text-xs text-slate-900 uppercase tracking-wider">
                    Upload Sales Order in One Place
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    PDF, Scanned PO, or Excel Spreadsheet &bull; Instant Heat &amp; Line Extraction
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                Drag &amp; Drop Ready
              </span>
            </div>

            <div className="p-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleFileUpload(f)
                  e.target.value = ''
                }}
              />

              <div
                onDragOver={e => {
                  e.preventDefault()
                  setIsDragOver(true)
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => {
                  e.preventDefault()
                  setIsDragOver(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFileUpload(f)
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-2.5 ${
                  isDragOver
                    ? 'border-amber-500 bg-amber-50 ring-4 ring-amber-300/30'
                    : 'border-slate-300 hover:border-amber-500 hover:bg-amber-50/40 bg-slate-50/50'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-700 flex items-center justify-center shadow-inner">
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                  ) : (
                    <FileUp className="h-6 w-6 stroke-[2.2]" />
                  )}
                </div>

                <div>
                  <div className="font-bold text-sm text-slate-900">
                    Drag &amp; Drop Sales Order PDF or Excel Here
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    or <span className="text-amber-700 font-bold underline">click to browse</span> from your computer
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400 font-medium flex-wrap justify-center">
                  <span className="bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded font-mono">.PDF</span>
                  <span className="bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded font-mono">.XLSX</span>
                  <span className="bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded font-mono">.CSV</span>
                  <span>&bull; Automatically populates items, certs, and deliverables below</span>
                </div>

                {isUploading && (
                  <div className="flex items-center space-x-2 text-xs font-bold text-amber-800 bg-amber-100 px-3.5 py-1.5 rounded-lg animate-pulse border border-amber-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Parsing order document &amp; linking stock heats... please wait</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: 1-Click Order Deliverables Hub & Active Order Preview */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>1-Click Deliverables Generator</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Select or switch active order to preview &amp; download official sheets.
                </p>
              </div>

              {/* Order Dropdown */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedOrderId}
                  onChange={e => setSelectedOrderId(e.target.value)}
                  className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.so_number} — {o.customer_name} ({o.items.length} items)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload Another Order"
                  className="p-1.5 rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  <FileUp className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Selected Order Summary Card */}
            {selectedOrder && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Sales Order</span>
                    <strong className="text-slate-800">{selectedOrder.so_number}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">PO Number</span>
                    <strong className="text-slate-800">{selectedOrder.po_number || '-'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Client</span>
                    <strong className="text-slate-800 truncate block">{selectedOrder.customer_name}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Status</span>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>

                {/* Line Items Quick Peek */}
                <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                  <div className="flex items-center space-x-1.5 font-medium">
                    <Package className="h-3.5 w-3.5 text-slate-400" />
                    <span>Loaded Items: <strong className="text-slate-900">{selectedOrder.items.length}</strong> lines</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLpModalOpen(true)}
                    className="text-amber-700 hover:text-amber-900 font-bold underline flex items-center space-x-1 cursor-pointer"
                  >
                    <Wrench className="h-3 w-3" />
                    <span>Configure Local Purchase Split &rarr;</span>
                  </button>
                </div>
              </div>
            )}

            {/* 5 Prominent Deliverable Action Buttons */}
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Export Documents (Opens Interactive Modal &amp; Download):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                
                {/* 1. Client Summary */}
                <button
                  type="button"
                  onClick={() => handleOpenPreview('client')}
                  className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/90 text-emerald-950 transition-all text-left flex items-center justify-between group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs">Client Summary (.xlsx)</div>
                      <div className="text-[10px] text-emerald-700">Client Item Numbers &bull; Clean Layout</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* 2. Stores Summary */}
                <button
                  type="button"
                  onClick={() => handleOpenPreview('stores')}
                  className="p-3 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/90 text-blue-950 transition-all text-left flex items-center justify-between group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs">Internal Stores Sheet (.xlsx)</div>
                      <div className="text-[10px] text-blue-700">11 Columns &bull; Full Supplier Details</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-blue-500 group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* 3. CIPL Logistics */}
                <button
                  type="button"
                  onClick={() => handleOpenPreview('cipl_invoice')}
                  className="p-3 rounded-xl border border-purple-200 bg-purple-50/70 hover:bg-purple-100/90 text-purple-950 transition-all text-left flex items-center justify-between group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-xs">
                      <Truck className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs">CIPL Logistics Workbook</div>
                      <div className="text-[10px] text-purple-700">Invoice, Packing, HS Codes &amp; Dims</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-purple-500 group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* 4. Local Purchase Allocation */}
                <button
                  type="button"
                  onClick={() => setIsLpModalOpen(true)}
                  className="p-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 transition-all text-left flex items-center justify-between group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-xs">
                      <Wrench className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs">Local Purchase &amp; PCS Split</div>
                      <div className="text-[10px] text-amber-800">Select Supplier, Items &amp; Pieces</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* Extra 1-Click Quick Exports */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={async () => {
                    setIsExporting(true)
                    try {
                      await generateSupplierPOZip(currentWorksheetData)
                      setStatusNotice('Supplier POs (.zip) generated!')
                    } catch (e: any) {
                      alert('Error: ' + e.message)
                    } finally {
                      setIsExporting(false)
                    }
                  }}
                  disabled={isExporting}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <FileDown className="h-3.5 w-3.5 text-rose-400" />
                  <span>Supplier POs (.zip)</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('stickers')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-300 flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                  <span>Generate QR Stickers</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('sourcing')}
                  className="ml-auto text-xs text-blue-700 hover:underline font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <span>Open Full Sourcing Portal</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              {/* Order Line Items & HSN Code Review Table */}
              {selectedOrder && selectedOrder.items && selectedOrder.items.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => setShowLineItemsReview(!showLineItemsReview)}
                      className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      <Hash className="h-3.5 w-3.5 text-indigo-500" />
                      <span>Line Items &amp; HSN Codes ({selectedOrder.items.length} items)</span>
                      {showLineItemsReview ? (
                        <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleAutoDetectAllHsns}
                        title="Re-run intelligent oilfield classification on all items"
                        className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200 flex items-center space-x-1 transition-colors cursor-pointer"
                      >
                        <Sparkles className="h-3 w-3 text-indigo-600" />
                        <span>Auto-Detect All HSN</span>
                      </button>
                    </div>
                  </div>

                  {showLineItemsReview && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 shadow-inner">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="p-2 w-8 text-center">#</th>
                              <th className="p-2">Item Code &amp; Description</th>
                              <th className="p-2 text-center">Qty</th>
                              <th className="p-2">Make / COO</th>
                              <th className="p-2">HSN / HS Code</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {selectedOrder.items.map((it, idx) => {
                              const desc = it.item_description || it.item_code
                              const currentHsn = it.hs_code || autoDetectHSCode(desc, it.item_code)
                              const isEditing = editingHsnIndex === idx

                              return (
                                <tr key={it.id || idx} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-2 text-center text-slate-400 font-mono text-[11px]">
                                    {it.client_po_item_no || idx + 1}
                                  </td>
                                  <td className="p-2">
                                    <div className="font-bold font-mono text-slate-900 text-[11px] leading-tight">
                                      {it.item_code}
                                    </div>
                                    <div className="text-[10px] text-slate-500 line-clamp-1">
                                      {desc}
                                    </div>
                                    {it.heat_number && (
                                      <div className="text-[10px] text-amber-700 font-mono mt-0.5">
                                        Heat: {it.heat_number}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-2 text-center font-bold text-slate-800 text-[11px] whitespace-nowrap">
                                    {it.required_qty} {it.uom || 'PCS'}
                                  </td>
                                  <td className="p-2 text-[10px] text-slate-600 whitespace-nowrap">
                                    <div className="font-medium text-slate-800">{it.make || 'BENKAN THAILAND'}</div>
                                    <div className="text-slate-400">{it.country_of_origin || 'THAILAND'}</div>
                                  </td>
                                  <td className="p-2 whitespace-nowrap">
                                    {isEditing ? (
                                      <div className="flex items-center space-x-1">
                                        <input
                                          type="text"
                                          value={editingHsnValue}
                                          onChange={e => setEditingHsnValue(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') handleSaveHsn(idx, editingHsnValue)
                                            if (e.key === 'Escape') setEditingHsnIndex(null)
                                          }}
                                          autoFocus
                                          className="w-28 px-1.5 py-0.5 text-xs font-mono border-2 border-indigo-500 rounded bg-white shadow-sm focus:outline-none"
                                          placeholder="e.g. 7307.21.00"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSaveHsn(idx, editingHsnValue)}
                                          className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors cursor-pointer"
                                          title="Save HSN"
                                        >
                                          <Check className="h-3 w-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingHsnIndex(null)}
                                          className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors cursor-pointer"
                                          title="Cancel"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center space-x-1.5">
                                        <span
                                          onClick={() => {
                                            setEditingHsnIndex(idx)
                                            setEditingHsnValue(currentHsn)
                                          }}
                                          className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50/70 text-indigo-900 cursor-pointer hover:bg-indigo-100 hover:border-indigo-400 transition-colors flex items-center space-x-1 group"
                                          title="Click to edit HSN Code"
                                        >
                                          <span>{currentHsn}</span>
                                          <Edit3 className="h-2.5 w-2.5 text-indigo-400 group-hover:text-indigo-700 ml-0.5" />
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Pending Storekeeper Approvals Fast-Pass */}
          {pendingApprovals.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="h-5 w-5 text-amber-700 animate-pulse" />
                  <h3 className="font-bold text-sm text-amber-950">
                    Pending Storekeeper Approvals ({pendingApprovals.length})
                  </h3>
                </div>
                <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                  Solo Override Allowed
                </span>
              </div>
              <p className="text-xs text-amber-900">
                Storekeeper is absent. You can fast-track approve allocated stock to release goods for urgent dispatch:
              </p>

              <div className="space-y-2">
                {pendingApprovals.map(order => (
                  <div
                    key={order.id}
                    className="bg-white border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900">
                        SO: {order.so_number} &bull; {order.customer_name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        PO: {order.po_number} &bull; {order.items.length} line items
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFastTrackApprove(order.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center space-x-1 self-start sm:self-auto shrink-0 shadow-sm"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Fast-Track Approve</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card 4: Approved Orders Ready for Physical Dispatch & Stock Reduction */}
          {approvedOrders.length > 0 && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Truck className="h-5 w-5 text-emerald-700" />
                  <h3 className="font-bold text-sm text-emerald-950">
                    Ready for Physical Dispatch &amp; Stock Deduction ({approvedOrders.length})
                  </h3>
                </div>
                <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">
                  1-Click Stock Reduction
                </span>
              </div>
              <p className="text-xs text-emerald-900 leading-relaxed">
                Orders approved and released for delivery. Click below to immediately deduct reserved inventory from warehouse physical balances:
              </p>

              <div className="space-y-2">
                {approvedOrders.map(order => (
                  <div
                    key={order.id}
                    className="bg-white border border-emerald-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center space-x-1.5">
                        <span>SO: {order.so_number} &bull; {order.customer_name}</span>
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-bold">
                          {order.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        PO: {order.po_number} &bull; {order.items.length} line items &bull; Delivery: {order.required_delivery_date || 'Standard'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFastDispatchOrder(order.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center space-x-1.5 self-start sm:self-auto shrink-0 shadow-sm"
                    >
                      <Truck className="h-4 w-4" />
                      <span>Confirm Dispatch (Deduct Stock)</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: Instant Heat & Stock Lookup Box (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Quick Heat & Stock Lookup */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Flame className="h-5 w-5 text-orange-500" />
                <h3 className="font-bold text-sm text-slate-900">Instant Heat &amp; Stock Finder</h3>
              </div>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                {lots.length} lots
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={heatSearchQuery}
                onChange={e => setHeatSearchQuery(e.target.value)}
                placeholder="Type Heat #, Item Code, or Location (e.g. 889, EB1, SS316)..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50 font-medium"
              />
            </div>

            {/* Live Search Results Table */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredStockLots.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No matching heat numbers or items found.
                </div>
              ) : (
                filteredStockLots.map(lot => {
                  const balance = balances.find(b => b.stock_lot_id === lot.id)
                  const avail = balance ? balance.available_qty : lot.received_qty

                  return (
                    <div
                      key={lot.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 transition-colors text-xs space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-slate-900 leading-tight">
                          {lot.item_description}
                        </div>
                        <span className="bg-emerald-100 text-emerald-800 font-mono font-bold text-[10px] px-1.5 py-0.5 rounded shrink-0">
                          {avail} Avail
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono flex-wrap gap-1">
                        <div>
                          Heat: <strong className="text-orange-700">{lot.heat_number}</strong>
                        </div>
                        <div>
                          Loc: <strong className="text-slate-800">{lot.warehouse_location || 'YARD'}</strong>
                        </div>
                        <div>
                          Make: <span className="text-slate-700">{lot.supplier_name}</span>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between border-t border-slate-200/60">
                        <span className="text-[10px] text-slate-400">
                          YOM: {lot.yom || '-'} &bull; Code: {lot.item_code}
                        </span>
                        <div className="flex items-center space-x-2">
                          {!lot.mtc_ref && (
                            <label className="text-[10px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-0.5 rounded flex items-center space-x-1 cursor-pointer transition-colors shadow-xs">
                              <UploadCloud className="h-2.5 w-2.5" />
                              <span>Upload MTC</span>
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) handleUploadMissingMTCForHeat(file, lot.heat_number, lot.item_code)
                                }}
                              />
                            </label>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenHeatModal(lot.heat_number)}
                            className="text-[10px] text-blue-700 font-bold hover:underline flex items-center space-x-0.5 cursor-pointer"
                          >
                            <span>Trace Heat</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('traceability')}
              className="w-full text-center py-2 text-xs text-slate-600 hover:text-slate-900 font-bold border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Open Full Heat Traceability Ledger &rarr;
            </button>
          </div>

          {/* Quick Hub Shortcuts */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
            <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">
              Fast Jump to Modules:
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => onNavigateTab('stock')}
                className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center space-x-2 text-slate-800"
              >
                <Package className="h-4 w-4 text-emerald-600" />
                <span>Master Stock</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('orders')}
                className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center space-x-2 text-slate-800"
              >
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                <span>Sales Orders</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('local_purchase')}
                className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center space-x-2 text-slate-800"
              >
                <Wrench className="h-4 w-4 text-amber-600" />
                <span>Local Purchases</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('stickers')}
                className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center space-x-2 text-slate-800"
              >
                <Tag className="h-4 w-4 text-purple-600" />
                <span>Stickers &amp; Tags</span>
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* Deliverables Preview Modal */}
      <ExcelDeliverablesPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        initialTab={previewTab}
        data={currentWorksheetData}
        filterMachinedOnly={false}
      />

      {/* Local Purchase & PCS Allocation Modal */}
      <LocalPurchaseAllocationModal
        isOpen={isLpModalOpen}
        onClose={() => setIsLpModalOpen(false)}
        data={currentWorksheetData}
        onApplyLocalPurchase={() => {
          setStatusNotice('Applied Local Purchase configuration!')
          setTimeout(() => setStatusNotice(null), 3000)
        }}
        showToast={msg => {
          setStatusNotice(msg)
          setTimeout(() => setStatusNotice(null), 3000)
        }}
      />

    </div>
  )
}
