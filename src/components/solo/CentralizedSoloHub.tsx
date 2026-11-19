import React, { useState, useMemo } from 'react'
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
  ArrowRight
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
  estimateUnitWeight
} from '../../services/sourcingEngine'
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

  // Real-time data from local DB
  const orders = db.getOrders()
  const lots = db.getLots()
  const balances = db.getBalances()
  const mtcs = db.getMTCs()

  // Selected Order for Instant Deliverables
  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => orders[0]?.id || '')
  const [heatSearchQuery, setHeatSearchQuery] = useState('')
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Modals state
  const [isLpModalOpen, setIsLpModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [previewTab, setPreviewTab] = useState<SourcingPreviewTab>('client')

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
      const detectedMake = autoDetectMake(desc) || 'BENKAN THAILAND'
      const detectedCOO = autoDetectCountryOfOrigin(detectedMake, desc, '')
      const detectedHS = autoDetectHSCode(desc)
      const unitWt = estimateUnitWeight(desc, it.uom)
      const lineNet = Math.round(it.required_qty * unitWt * 100) / 100
      const lineGross = Math.round(lineNet * 1.15 * 100) / 100

      return {
        id: `SOLO-ITM-${idx + 1}`,
        sl_no: idx + 1,
        client_po_item_no: `${idx + 1}`,
        description: desc,
        qty: it.required_qty,
        uom: it.uom || 'PCS',
        heat_number: it.heat_number || '',
        certificate_number: it.heat_number ? `MTC-${it.heat_number}.pdf` : '',
        make: detectedMake,
        remarks: it.location ? `Yard: ${it.location}` : 'Allocated',
        supplier_name: detectedMake,
        supplier_po_number: `PO-${idx + 1}`,
        hs_code: detectedHS,
        country_of_origin: detectedCOO,
        unit_price: 50,
        total_price: it.required_qty * 50,
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

  // Fast-track approve an order without storekeeper
  const handleFastTrackApprove = (orderId: string) => {
    db.storekeeperApprove(
      orderId,
      currentUser?.employee_name || 'Solo Operator',
      'Approved',
      'Fast-track approved by Solo Operator / Centralized Mode (Staff Absent)'
    )
    setStatusNotice(`Order ${orderId} fast-track approved & released for dispatch!`)
    setTimeout(() => setStatusNotice(null), 4000)
  }

  const handleOpenPreview = (tab: SourcingPreviewTab) => {
    setPreviewTab(tab)
    setIsPreviewModalOpen(true)
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
                <span>Centralized Solo Mode</span>
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                <ShieldCheck className="h-3 w-3" />
                <span>Staff Absent Mode Active</span>
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Centralized Fast-Track Operations Portal
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              Designed for solo operators, after-hours shifts, and emergency management when team members are absent. Perform order processing, heat lookups, local purchase splits, stickers, and fast approvals from this one screen.
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
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs font-bold text-emerald-200 flex items-center space-x-2 animate-in slide-in-from-top-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        )}
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Fast Order Deliverables & Local Purchase Studio (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Box 1: 1-Click Order Deliverables Hub */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>1-Click Deliverables Generator</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Select any sales order to preview and export all official publication sheets.
                </p>
              </div>

              {/* Order Dropdown */}
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
            </div>
          </div>

          {/* Box 2: Pending Storekeeper Approvals Fast-Pass */}
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
