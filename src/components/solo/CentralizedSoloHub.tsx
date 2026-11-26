import React, { useState, useMemo, useRef, useEffect } from 'react'
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

  useEffect(() => {
    return db.subscribe(() => {
      setDbRefreshKey(k => k + 1)
    })
  }, [])

  // Real-time data from local DB
  const orders = useMemo(() => db.getOrders(), [dbRefreshKey])
  const lots = useMemo(() => db.getLots(), [dbRefreshKey])
  const balances = useMemo(() => db.getBalances(), [dbRefreshKey])
  const mtcs = useMemo(() => db.getMTCs(), [dbRefreshKey])

  // Selected Order for Instant Deliverables (only populated from Sales Order uploaded in this view)
  const [selectedOrderId, setSelectedOrderId] = useState<string>('')
  const [uploadedSessionOrderIds, setUploadedSessionOrderIds] = useState<string[]>([])
  const selectOrderAndSync = (orderId: string, soNumber?: string) => {
    setSelectedOrderId(orderId)
    if (orderId) {
      db.setActiveOrderId(orderId)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('msg_sourcing_active_so_id', orderId)
        if (soNumber) {
          localStorage.setItem('msg_sourcing_active_so_number', soNumber)
        } else {
          localStorage.removeItem('msg_sourcing_active_so_number')
        }
      }
    }
  }
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

  // Fast-track selected order details (strictly scoped to uploaded file in Operations Hub)
  const uploadedSessionOrders = useMemo(() => {
    return orders.filter(o => uploadedSessionOrderIds.includes(o.id))
  }, [orders, uploadedSessionOrderIds])

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return undefined
    return orders.find(o => o.id === selectedOrderId)
  }, [orders, selectedOrderId])

  // Convert selected order into SourcingWorksheetData for 1-click deliverables
  const currentWorksheetData: SourcingWorksheetData = useMemo(() => {
    if (!selectedOrder) {
      return { client: 'Client Name', po_number: 'PO-001', msg_ref: 'SO-001', currency: 'AED', items: [] }
    }

    const items: SourcingLineItem[] = selectedOrder.items.map((it, idx) => {
      const desc = it.item_description || `Item ${it.item_code}`
      const detectedMake = it.make || ''
      const detectedCOO = it.country_of_origin || ''
      const detectedHS = it.hs_code || autoDetectHSCode(desc, it.item_code)
      const unitPrice = Number(it.unit_price ?? (it as any).rate ?? 0)
      const unitWt = estimateUnitWeight(desc, it.uom)
      const lineNet = Math.round(it.required_qty * unitWt * 100) / 100
      const lineGross = Math.round(lineNet * 1.15 * 100) / 100

      return {
        id: `SOLO-ITM-${idx + 1}`,
        sl_no: it.position || idx + 1,
        client_po_item_no: it.client_po_item_no || `${idx + 1}`,
        description: desc,
        qty: it.required_qty,
        uom: it.uom || 'PCS',
        heat_number: it.heat_number || '',
        certificate_number: it.certificate_number || (it.heat_number ? `MTC-${it.heat_number}.pdf` : ''),
        make: detectedMake,
        remarks: it.remarks || (it.location ? `Yard: ${it.location}` : ''),
        supplier_name: it.supplier_name || '',
        supplier_po_number: (it as any).supplier_po_number || '',
        hs_code: detectedHS,
        country_of_origin: detectedCOO,
        unit_price: unitPrice,
        total_price: it.required_qty * unitPrice,
        unit_weight_kg: unitWt,
        total_net_weight_kg: lineNet,
        total_gross_weight_kg: lineGross,
        package_no: (it as any).package_no || `PKG # ${Math.floor(idx / 3) + 1}`,
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
          setUploadedSessionOrderIds(prev => (prev.includes(res.order!.id) ? prev : [res.order!.id, ...prev]))
          selectOrderAndSync(res.order.id, res.order.so_number)
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
          const importedIds = res.orders.map(o => o.id)
          setUploadedSessionOrderIds(prev => [...importedIds, ...prev.filter(id => !importedIds.includes(id))])
          selectOrderAndSync(res.orders[0].id, res.orders[0].so_number)
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
    <div className="space-y-5">
      {/* Zoho-style Clean Page Header */}
      <div className="bg-white rounded-lg border border-slate-200 px-5 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Operations Hub</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload customer POs, generate Client/Stores/CIPL sheets, manage local purchase splits, and verify heats in one workspace.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="border border-slate-200 bg-slate-50 rounded-md px-3 py-1.5 text-center min-w-[78px]">
              <div className="text-[10px] font-medium text-slate-500">Orders</div>
              <div className="text-sm font-bold text-slate-900 tabular-nums">{orders.length}</div>
            </div>
            <div className="border border-slate-200 bg-slate-50 rounded-md px-3 py-1.5 text-center min-w-[78px]">
              <div className="text-[10px] font-medium text-slate-500">Stock Lots</div>
              <div className="text-sm font-bold text-slate-900 tabular-nums">{lots.length}</div>
            </div>
            <div className="border border-slate-200 bg-slate-50 rounded-md px-3 py-1.5 text-center min-w-[78px]">
              <div className="text-[10px] font-medium text-slate-500">Pending</div>
              <div className="text-sm font-bold text-amber-700 tabular-nums">{pendingApprovals.length}</div>
            </div>
          </div>
        </div>

        {statusNotice && (
          <div className="mt-3 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs font-medium text-emerald-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-1.5 cursor-pointer"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* 2-Column Zoho Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Card 1: Direct Sales Order Upload Zone */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-xs text-slate-900">Upload Sales Order Document</h3>
                <p className="text-[11px] text-slate-500">
                  PDF, Scanned PO, or Excel (.xlsx / .csv) with automatic line &amp; heat extraction
                </p>
              </div>
              <span className="text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded">
                .PDF / .XLSX / .CSV
              </span>
            </div>

            <div className="p-4">
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
                className={`border border-dashed rounded-lg p-5 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50 bg-slate-50/40'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <FileUp className="h-5 w-5" />
                  )}
                </div>

                <div>
                  <div className="font-semibold text-xs text-slate-900">
                    Drag &amp; Drop Sales Order PDF or Excel, or{' '}
                    <span className="text-blue-600 hover:underline">browse files</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Extracts items, quantities, HS codes, and prepares export sheets automatically
                  </div>
                </div>

                {isUploading && (
                  <div className="flex items-center gap-2 text-xs font-medium text-blue-700 bg-blue-50 px-3 py-1 rounded border border-blue-200">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Parsing order document...</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Uploaded Order Deliverables & Line Items */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-semibold text-sm text-slate-900">Uploaded Order Deliverables</h3>
                <p className="text-[11px] text-slate-500">
                  Shows details and deliverables strictly for the Sales Order uploaded above.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {uploadedSessionOrders.length > 1 && (
                  <select
                    value={selectedOrderId}
                    onChange={e => selectOrderAndSync(e.target.value)}
                    className="text-xs font-medium bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 max-w-[260px]"
                  >
                    {uploadedSessionOrders.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.so_number} — {o.customer_name} ({o.items.length})
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload Sales Order File"
                  className="p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
                >
                  <FileUp className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!selectedOrder ? (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-md p-6 text-center text-xs text-slate-500">
                No Sales Order uploaded yet. Drop or browse a Sales Order PDF / Excel file above to view its extracted details and generate deliverables.
              </div>
            ) : (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Sales Order</span>
                    <strong className="text-slate-900 font-mono">{selectedOrder.so_number}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">PO Number</span>
                    <strong className="text-slate-900 font-mono">{selectedOrder.po_number || '-'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Client</span>
                    <strong className="text-slate-900 truncate block">{selectedOrder.customer_name}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Status</span>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-700">
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 pt-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                  <span>
                    Loaded Lines: <strong className="text-slate-900 tabular-nums">{selectedOrder.items.length}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsLpModalOpen(true)}
                    className="text-blue-600 hover:text-blue-700 font-medium hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Wrench className="h-3 w-3" />
                    <span>Configure Local Purchase Split</span>
                  </button>
                </div>
              </div>

            {/* Clean Uniform Deliverable Action Tiles */}
            <div>
              <div className="text-[11px] font-medium text-slate-500 mb-2">Export &amp; Preview Documents</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleOpenPreview('client')}
                  className="p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-slate-50/70 transition-colors text-left flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-slate-900">Client Summary (.xlsx)</div>
                      <div className="text-[11px] text-slate-500">Client item numbers &amp; heats</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPreview('stores')}
                  className="p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-slate-50/70 transition-colors text-left flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      <Layers className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-slate-900">Internal Stores (.xlsx)</div>
                      <div className="text-[11px] text-slate-500">11 columns &amp; supplier details</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPreview('cipl_invoice')}
                  className="p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-slate-50/70 transition-colors text-left flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      <Truck className="h-4 w-4 text-slate-700" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-slate-900">CIPL Logistics Workbook</div>
                      <div className="text-[11px] text-slate-500">Invoice, packing &amp; HS codes</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsLpModalOpen(true)}
                  className="p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-slate-50/70 transition-colors text-left flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      <Wrench className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-slate-900">Local Purchase Split</div>
                      <div className="text-[11px] text-slate-500">Allocate suppliers &amp; pieces</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
                </button>
              </div>

              {/* Secondary Export Links */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
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
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileDown className="h-3.5 w-3.5 text-slate-500" />
                  <span>Supplier POs (.zip)</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('stickers')}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 text-slate-500" />
                  <span>QR Stickers</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const targetId = selectedOrder?.id || selectedOrderId
                    if (targetId) selectOrderAndSync(targetId, selectedOrder?.so_number)
                    onNavigateTab('sourcing')
                  }}
                  className="ml-auto text-xs text-blue-600 hover:underline font-medium flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Sourcing Portal</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              {/* Line Items & HSN Code Table */}
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => setShowLineItemsReview(!showLineItemsReview)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-blue-600 cursor-pointer"
                    >
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                      <span>Line Items &amp; HS Codes ({selectedOrder.items.length})</span>
                      {showLineItemsReview ? (
                        <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleAutoDetectAllHsns}
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/70 px-2.5 py-1 rounded border border-blue-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Auto-Detect HS Codes</span>
                    </button>
                  </div>

                  {showLineItemsReview && (
                    <div className="border border-slate-200 rounded-md overflow-hidden">
                      <div className="max-h-64 overflow-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-600 font-semibold text-[11px] uppercase sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-2 w-10 text-center">#</th>
                              <th className="px-3 py-2">Item &amp; Description</th>
                              <th className="px-3 py-2 text-right">Qty</th>
                              <th className="px-3 py-2">Make / Origin</th>
                              <th className="px-3 py-2">HS Code</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {selectedOrder.items.map((it, idx) => {
                              const desc = it.item_description || it.item_code
                              const currentHsn = it.hs_code || autoDetectHSCode(desc, it.item_code)
                              const isEditing = editingHsnIndex === idx

                              return (
                                <tr key={it.id || idx} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">
                                    {it.client_po_item_no || idx + 1}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="font-semibold font-mono text-slate-900 text-[11px]">
                                      {it.item_code}
                                    </div>
                                    <div className="text-[11px] text-slate-500 line-clamp-1">{desc}</div>
                                    {it.heat_number && (
                                      <div className="text-[10px] text-slate-500 font-mono">
                                        Heat: {it.heat_number}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-slate-800 text-[11px] whitespace-nowrap">
                                    {it.required_qty} {it.uom || 'PCS'}
                                  </td>
                                  <td className="px-3 py-2 text-[11px] text-slate-600 whitespace-nowrap">
                                    <div>{it.make || '—'}</div>
                                    <div className="text-[10px] text-slate-400">{it.country_of_origin || '—'}</div>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    {isEditing ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={editingHsnValue}
                                          onChange={e => setEditingHsnValue(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') handleSaveHsn(idx, editingHsnValue)
                                            if (e.key === 'Escape') setEditingHsnIndex(null)
                                          }}
                                          autoFocus
                                          className="w-24 px-1.5 py-0.5 text-xs font-mono border border-blue-500 rounded bg-white focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSaveHsn(idx, editingHsnValue)}
                                          className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
                                        >
                                          <Check className="h-3 w-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingHsnIndex(null)}
                                          className="p-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 cursor-pointer"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingHsnIndex(idx)
                                          setEditingHsnValue(currentHsn)
                                        }}
                                        className="font-mono text-[11px] font-medium px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                                      >
                                        <span>{currentHsn}</span>
                                        <Edit3 className="h-2.5 w-2.5 text-slate-400" />
                                      </button>
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
            </>
            )}
          </div>

          {/* Pending Approvals Fast-Pass */}
          {pendingApprovals.length > 0 && (
            <div className="bg-white border border-slate-200 border-l-4 border-l-amber-500 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <h3 className="font-semibold text-xs text-slate-900">
                    Pending Storekeeper Approvals ({pendingApprovals.length})
                  </h3>
                </div>
                <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                  Solo Fast-Track
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {pendingApprovals.map(order => (
                  <div key={order.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-xs text-slate-900 font-mono">
                        {order.so_number} &bull; <span className="font-sans">{order.customer_name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        PO: {order.po_number} &bull; {order.items.length} lines
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFastTrackApprove(order.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-3 py-1.5 rounded-md cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Approve</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ready for Dispatch */}
          {approvedOrders.length > 0 && (
            <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-emerald-600" />
                  <h3 className="font-semibold text-xs text-slate-900">
                    Ready for Physical Dispatch ({approvedOrders.length})
                  </h3>
                </div>
                <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                  1-Click Stock Deduction
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {approvedOrders.map(order => (
                  <div key={order.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-xs text-slate-900 flex items-center gap-2">
                        <span className="font-mono">{order.so_number}</span>
                        <span className="text-slate-600 font-normal">{order.customer_name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        PO: {order.po_number} &bull; {order.items.length} lines &bull; {order.status}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFastDispatchOrder(order.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3 py-1.5 rounded-md cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      <span>Confirm Dispatch</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Heat & Stock Lookup */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-slate-500" />
                <h3 className="font-semibold text-sm text-slate-900">Heat &amp; Stock Lookup</h3>
              </div>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">{lots.length} lots</span>
            </div>

            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={heatSearchQuery}
                onChange={e => setHeatSearchQuery(e.target.value)}
                placeholder="Search Heat #, Item Code, or Bay..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
              />
            </div>

            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
              {filteredStockLots.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No matching heat numbers or items found.
                </div>
              ) : (
                filteredStockLots.map(lot => {
                  const balance = balances.find(b => b.stock_lot_id === lot.id)
                  const avail = balance ? balance.available_qty : lot.received_qty

                  return (
                    <div key={lot.id} className="py-2.5 text-xs space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-slate-900 leading-snug line-clamp-1">
                          {lot.item_description}
                        </div>
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-semibold text-[10px] px-1.5 py-0.5 rounded shrink-0 tabular-nums">
                          {avail} Avail
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-1">
                        <span>
                          Heat: <strong className="text-slate-800 font-mono">{lot.heat_number}</strong>
                        </span>
                        <span>
                          Loc: <strong className="text-slate-700">{lot.warehouse_location || 'YARD'}</strong>
                        </span>
                        <span className="truncate max-w-[130px]">{lot.supplier_name}</span>
                      </div>

                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-mono">
                          YOM {lot.yom || '-'} &bull; {lot.item_code}
                        </span>
                        <div className="flex items-center gap-2">
                          {!lot.mtc_ref && (
                            <label className="text-[10px] bg-white hover:bg-slate-50 text-rose-600 border border-rose-200 font-medium px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer">
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
                            className="text-[11px] text-blue-600 font-medium hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>Trace</span>
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
              className="w-full text-center py-2 text-xs text-slate-700 hover:text-slate-900 font-medium border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Open Full Heat Traceability
            </button>
          </div>

          {/* Quick Shortcuts */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2.5">
            <h4 className="font-semibold text-xs text-slate-700">Quick Navigation</h4>
            <div className="grid grid-cols-2 gap-2 text-xs font-medium">
              <button
                type="button"
                onClick={() => onNavigateTab('stock')}
                className="p-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-300 flex items-center gap-2 text-slate-700 cursor-pointer"
              >
                <Package className="h-4 w-4 text-slate-500" />
                <span>Master Stock</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('orders')}
                className="p-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-300 flex items-center gap-2 text-slate-700 cursor-pointer"
              >
                <FileSpreadsheet className="h-4 w-4 text-slate-500" />
                <span>Sales Orders</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('local_purchase')}
                className="p-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-300 flex items-center gap-2 text-slate-700 cursor-pointer"
              >
                <Wrench className="h-4 w-4 text-slate-500" />
                <span>Local Purchases</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('stickers')}
                className="p-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-300 flex items-center gap-2 text-slate-700 cursor-pointer"
              >
                <Tag className="h-4 w-4 text-slate-500" />
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
