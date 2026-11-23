import React, { useState, useEffect } from 'react'
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
} from 'lucide-react'
import {
  SourcingWorksheetData,
  SourcingLineItem,
  generateStoresSummaryExcel,
  extractQtyNumber,
  extractTotalQtyNumber,
} from '../../services/sourcingEngine'
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

  // Initialize PO Items
  useEffect(() => {
    // Determine default supplier and PO number from existing worksheet items
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
      // An item is included if:
      // 1. It is selected in selectedItemIds
      // 2. OR if no items are selected in selectedItemIds, include all items
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
        included: isSelected,
      }
    })

    setPoItems(rows)
  }, [worksheetData, selectedItemIds])

  const includedItems = poItems.filter(r => r.included)
  const totalPOQty = includedItems.reduce((sum, r) => sum + (r.poQty || 0), 0)
  const totalPOAmount = includedItems.reduce((sum, r) => sum + (r.poQty || 0) * (r.unitPrice || 0), 0)

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

      // If not included in PO, keep original item untouched
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

      // Case 1: Full Qty included in PO
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
          remarks: remarks ? `${remarks}; Local PO: ${activePO}` : `Local PO: ${activePO}`,
          is_machined: true,
        })
        appliedCount++
      }
      // Case 2: Partial Qty -> Split into 2 rows (Remaining in Stock + Local PO row)
      else {
        const remainingQty = Math.round((totalQty - poQty) * 100) / 100
        const origUnitP = orig.unit_price || 0

        // Row 1: Remaining in Main Stock
        newItems.push({
          ...orig,
          qty: `${remainingQty} OF ${totalQty}`,
          total_price: remainingQty * origUnitP,
          remarks: orig.remarks ? `${orig.remarks}; Main Stock` : 'Main Stock',
        })

        // Row 2: Local PO Row
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
          remarks: remarks ? `${remarks}; Local PO: ${activePO}` : `Local PO: ${activePO}`,
          is_machined: true,
        })

        splitCount++
        appliedCount++
      }
    })

    // Sequential renumbering
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

      // Filter only included items
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
        heat_number: '',
        certificate_number: '',
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

  return (
    <div className="space-y-6 animate-fade-in">
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
              Configure supplier, PO number, unit costs, and convert selected items directly into a purchase order.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportPOExcel}
            disabled={isExporting || includedItems.length === 0}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-2 shadow-sm transition-colors cursor-pointer"
            title="Export official Supplier PO to Excel"
          >
            <Download className="h-4 w-4" />
            <span>Download Supplier PO (.xlsx)</span>
          </button>

          <button
            onClick={handleApplyToWorksheet}
            disabled={includedItems.length === 0}
            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-2 shadow-md transition-colors cursor-pointer"
            title="Save and synchronize all PO fields back into main worksheet"
          >
            <Save className="h-4 w-4" />
            <span>Apply &amp; Sync to Worksheet</span>
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
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
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
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
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
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 bg-white"
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

      {/* Line Items Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center space-x-2">
            <h2 className="font-bold text-sm text-slate-800">
              2. PO Line Items &amp; Pricing
            </h2>
            <span className="text-xs bg-slate-200 text-slate-700 font-mono px-2 py-0.5 rounded-full">
              {includedItems.length} of {poItems.length} included
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs">
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
                    className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                  />
                </th>
                <th className="p-2.5 w-12 text-center">SL</th>
                <th className="p-2.5 w-20">PO Item</th>
                <th className="p-2.5 min-w-[280px]">Description &amp; Specifications</th>
                <th className="p-2.5 w-24 text-center">Order Qty</th>
                <th className="p-2.5 w-28 text-center bg-amber-50 text-amber-900 border-b-2 border-amber-400">
                  PO Qty
                  <span className="block text-[9px] text-amber-700 font-normal">Split if partial</span>
                </th>
                <th className="p-2.5 w-28 text-right bg-amber-50 text-amber-900 border-b-2 border-amber-400">
                  Unit Price ({currency})
                </th>
                <th className="p-2.5 w-28 text-right">Line Total ({currency})</th>
                <th className="p-2.5 w-32">Make / Mfr</th>
                <th className="p-2.5 w-28">COO</th>
                <th className="p-2.5 min-w-[150px]">PO Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {poItems.map(r => (
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
                      className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
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
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Summary Bar */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center space-x-4 text-xs">
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
    </div>
  )
}
