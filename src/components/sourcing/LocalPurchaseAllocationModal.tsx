import React, { useState, useEffect } from 'react'
import { X, Wrench, Download, GitFork, CheckCircle2, Building, FileText, Check, AlertTriangle, Search } from 'lucide-react'
import {
  SourcingLineItem,
  SourcingWorksheetData,
  generateStoresSummaryExcel,
  extractQtyNumber
} from '../../services/sourcingEngine'

interface LocalPurchaseAllocationModalProps {
  isOpen: boolean
  onClose: () => void
  data: SourcingWorksheetData
  onApplyLocalPurchase: (updatedItems: SourcingLineItem[]) => void
  showToast?: (msg: string) => void
}

interface ItemRowState {
  id: string
  sl_no: number
  client_po_item_no: string
  description: string
  totalQty: number
  uom: string
  localQty: number
  localSupplier: string
  isChecked: boolean
}

const COMMON_LOCAL_SUPPLIERS = [
  'AL GHAITH OILFIELD SUPPLIES',
  'AL FALAK MECHANICAL & MACHINE SHOP',
  'PETROTECH ENGINEERING SERVICES',
  'AL SHARQ FABRICATORS LLC',
  'APEX PRECISION MACHINING',
  'GULF PIPING & VALVE SERVICES',
  'LOCAL MACHINE SHOP'
]

export const LocalPurchaseAllocationModal: React.FC<LocalPurchaseAllocationModalProps> = ({
  isOpen,
  onClose,
  data,
  onApplyLocalPurchase,
  showToast
}) => {
  const [bulkSupplier, setBulkSupplier] = useState('')
  const [bulkPO, setBulkPO] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [rowStates, setRowStates] = useState<ItemRowState[]>([])
  const [isExporting, setIsExporting] = useState(false)

  // Initialize row states whenever modal opens or data changes
  useEffect(() => {
    if (!isOpen) return

    const keywords = ['machined', 'machining', 'fabricated', 'fabrication', 'made from', 'modified', 'locally', 'local', 'offered', 'l-']
    let defaultSupp = ''
    let defaultPO = ''

    // Detect if any item already has a local supplier assigned
    for (const it of data.items) {
      if (it.supplier_name && it.supplier_name.toUpperCase() !== 'STOCK' && it.supplier_name.toUpperCase() !== 'BENKAN THAILAND') {
        defaultSupp = it.supplier_name
        if (it.supplier_po_number) defaultPO = it.supplier_po_number
        break
      }
    }

    setBulkSupplier(defaultSupp || 'AL GHAITH OILFIELD SUPPLIES')
    setBulkPO(defaultPO || 'LP-PO-01')

    const initialStates: ItemRowState[] = data.items.map((it, idx) => {
      const qNum = extractQtyNumber(it.qty)
      const descLower = `${it.description || ''} ${it.remarks || ''}`.toLowerCase()
      const isMachined = keywords.some(k => descLower.includes(k)) || it.is_machined || (it.supplier_name && it.supplier_name.toUpperCase() !== 'STOCK' && it.supplier_name.toUpperCase() !== 'BENKAN THAILAND')

      return {
        id: it.id,
        sl_no: it.sl_no || idx + 1,
        client_po_item_no: it.client_po_item_no || `${idx + 1}`,
        description: it.description,
        totalQty: qNum,
        uom: it.uom || 'PCS',
        localQty: qNum,
        localSupplier: it.supplier_name && it.supplier_name.toUpperCase() !== 'STOCK' ? it.supplier_name : (defaultSupp || 'AL GHAITH OILFIELD SUPPLIES'),
        isChecked: Boolean(isMachined)
      }
    })

    setRowStates(initialStates)
  }, [isOpen, data])

  if (!isOpen) return null

  const handleToggleSelectAll = (checked: boolean) => {
    setRowStates(prev => prev.map(r => ({ ...r, isChecked: checked })))
  }

  const handleSelectMachinedOnly = () => {
    const keywords = ['machined', 'machining', 'fabricated', 'fabrication', 'made from', 'modified', 'locally', 'local', 'offered', 'l-']
    let count = 0
    setRowStates(prev =>
      prev.map(r => {
        const descLower = r.description.toLowerCase()
        const isMatch = keywords.some(k => descLower.includes(k))
        if (isMatch) count++
        return { ...r, isChecked: isMatch }
      })
    )
    if (showToast) showToast(`Selected ${count} Machined/Fabricated/Local items.`)
  }

  const handleBulkApplySupplier = () => {
    if (!bulkSupplier.trim()) {
      alert('Please enter a Local Supplier name.')
      return
    }
    const trimmed = bulkSupplier.trim()
    setRowStates(prev =>
      prev.map(r => (r.isChecked ? { ...r, localSupplier: trimmed } : r))
    )
    if (showToast) showToast(`Applied "${trimmed}" to selected items!`)
  }

  const handleUpdateLocalQty = (id: string, val: number) => {
    setRowStates(prev =>
      prev.map(r => (r.id === id ? { ...r, localQty: Math.max(0, val) } : r))
    )
  }

  const handleUpdateRowSupplier = (id: string, val: string) => {
    setRowStates(prev =>
      prev.map(r => (r.id === id ? { ...r, localSupplier: val } : r))
    )
  }

  const handleToggleRowCheck = (id: string) => {
    setRowStates(prev =>
      prev.map(r => (r.id === id ? { ...r, isChecked: !r.isChecked } : r))
    )
  }

  // Action 1: Download Separate Local Purchase Excel
  const handleDownloadSeparateExcel = async () => {
    const checkedRows = rowStates.filter(r => r.isChecked && r.localQty > 0)
    if (checkedRows.length === 0) {
      alert('Please select at least one item with quantity greater than 0.')
      return
    }

    setIsExporting(true)
    try {
      const selectedIds = new Set(checkedRows.map(r => r.id))
      const rowStateMap = new Map(checkedRows.map(r => [r.id, r]))

      const localItems: SourcingLineItem[] = data.items
        .filter(it => selectedIds.has(it.id))
        .map((it, idx) => {
          const state = rowStateMap.get(it.id)!
          const unitRate = it.unit_price || 0
          const localTotal = state.localQty * unitRate

          return {
            ...it,
            sl_no: idx + 1,
            qty: state.localQty,
            total_price: localTotal,
            supplier_name: state.localSupplier || bulkSupplier || 'LOCAL PURCHASE',
            supplier_po_number: bulkPO || it.supplier_po_number || `LP-PO-${idx + 1}`,
            remarks: 'Local Purchase'
          }
        })

      const exportData: SourcingWorksheetData = {
        ...data,
        msg_ref: `${data.msg_ref || 'MSG'}_LOCAL_PURCHASE`,
        items: localItems
      }

      await generateStoresSummaryExcel(exportData, false)
      if (showToast) showToast(`Downloaded separate Local Purchase Sheet with ${localItems.length} items!`)
    } catch (err: any) {
      alert('Error generating Local Purchase sheet: ' + err.message)
    } finally {
      setIsExporting(false)
    }
  }

  // Action 2: Apply & Split on Worksheet
  const handleApplyToWorksheet = () => {
    const checkedRows = rowStates.filter(r => r.isChecked && r.localQty > 0)
    if (checkedRows.length === 0) {
      alert('Please select at least one item to apply.')
      return
    }

    const rowStateMap = new Map(checkedRows.map(r => [r.id, r]))
    const newItems: SourcingLineItem[] = []
    let splitCount = 0
    let appliedCount = 0

    data.items.forEach(originalItem => {
      const state = rowStateMap.get(originalItem.id)

      if (!state) {
        newItems.push(originalItem)
        return
      }

      const totalQty = state.totalQty
      const localQty = state.localQty
      const supplierName = state.localSupplier || bulkSupplier || 'LOCAL PURCHASE'
      const supplierPO = bulkPO || originalItem.supplier_po_number || 'LP-PO'

      // Case 1: Full Allocation (Local Qty == Total Qty)
      if (localQty >= totalQty) {
        newItems.push({
          ...originalItem,
          qty: totalQty,
          supplier_name: supplierName,
          supplier_po_number: supplierPO,
          remarks: originalItem.remarks ? `${originalItem.remarks}; Local Purchase` : 'Local Purchase',
          is_machined: true
        })
        appliedCount++
      } 
      // Case 2: Partial Allocation -> Split into 2 rows (Remaining in Stock + Local Qty from Local Supplier)
      else {
        const remainingQty = Math.round((totalQty - localQty) * 100) / 100
        const unitRate = originalItem.unit_price || 0

        // Row 1: Remaining in Main Stock
        newItems.push({
          ...originalItem,
          qty: `${remainingQty} OF ${totalQty}`,
          total_price: remainingQty * unitRate,
          remarks: originalItem.remarks ? `${originalItem.remarks}; Main Stock` : 'Main Stock'
        })

        // Row 2: Local Purchase Split Row
        newItems.push({
          ...originalItem,
          id: `${originalItem.id}-LP-${Date.now()}`,
          client_po_item_no: originalItem.client_po_item_no,
          qty: `${localQty} OF ${totalQty}`,
          total_price: localQty * unitRate,
          supplier_name: supplierName,
          supplier_po_number: supplierPO,
          remarks: 'Local Purchase',
          is_machined: true
        })

        splitCount++
        appliedCount++
      }
    })

    // Sequential renumbering of SL NO
    const renumbered = newItems.map((it, idx) => ({ ...it, sl_no: idx + 1 }))
    onApplyLocalPurchase(renumbered)
    onClose()

    if (showToast) {
      showToast(`Applied Local Supplier: ${appliedCount} items allocated (${splitCount} split into separate local lines)!`)
    }
  }

  const selectedCount = rowStates.filter(r => r.isChecked).length
  const filteredRows = rowStates.filter(r => {
    if (!searchFilter.trim()) return true
    const q = searchFilter.toLowerCase()
    return r.description.toLowerCase().includes(q) || r.client_po_item_no.toLowerCase().includes(q) || r.localSupplier.toLowerCase().includes(q)
  })

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm overflow-y-auto p-2 sm:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Top Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-700 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base tracking-wide text-white">Local Purchase &amp; Supplier Allocation</h3>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {selectedCount} Selected
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Choose Local Supplier, select which items to procure, and specify exact PCS to split or export separately.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-slate-50 space-y-4">
          
          {/* Supplier & PO Header Configuration Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-5">
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                  <Building className="h-3.5 w-3.5 text-amber-600 mr-1" />
                  Local Supplier Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="lpSuppliersDatalist"
                    value={bulkSupplier}
                    onChange={e => setBulkSupplier(e.target.value)}
                    placeholder="Select or type Local Supplier..."
                    className="w-full text-xs font-medium border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <datalist id="lpSuppliersDatalist">
                    {COMMON_LOCAL_SUPPLIERS.map((s, idx) => (
                      <option key={idx} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                  <FileText className="h-3.5 w-3.5 text-blue-600 mr-1" />
                  Local Supplier PO #
                </label>
                <input
                  type="text"
                  value={bulkPO}
                  onChange={e => setBulkPO(e.target.value)}
                  placeholder="e.g. LP-PO-2026-001"
                  className="w-full text-xs font-mono border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="sm:col-span-3 flex items-end">
                <button
                  type="button"
                  onClick={handleBulkApplySupplier}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center space-x-1"
                >
                  <Check className="h-3.5 w-3.5 text-amber-400" />
                  <span>Apply to Selected</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Toolbar & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <button
                type="button"
                onClick={handleSelectMachinedOnly}
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
              >
                <Wrench className="h-3.5 w-3.5 text-amber-700" />
                <span>Select Machined / Local Items</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleSelectAll(true)}
                className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold px-2 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => handleToggleSelectAll(false)}
                className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold px-2 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Deselect All
              </button>
            </div>

            <div className="w-full sm:w-64 relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Search items..."
                className="w-full text-xs pl-8 pr-2.5 py-1 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Items Allocation Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[380px]">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-900 text-white sticky top-0 z-10 text-left">
                  <tr>
                    <th className="p-2.5 text-center w-10">
                      <input
                        type="checkbox"
                        checked={rowStates.length > 0 && rowStates.every(r => r.isChecked)}
                        onChange={e => handleToggleSelectAll(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-0 cursor-pointer"
                      />
                    </th>
                    <th className="p-2.5 text-center w-12 font-mono">#</th>
                    <th className="p-2.5 text-center w-20 font-mono">Client #</th>
                    <th className="p-2.5 min-w-[220px]">Item Description</th>
                    <th className="p-2.5 text-center w-24">Total Qty</th>
                    <th className="p-2.5 text-center w-36">Local Qty (PCS)</th>
                    <th className="p-2.5 text-center w-36">Remaining Balance</th>
                    <th className="p-2.5 min-w-[180px]">Local Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRows.map(row => {
                    const diff = Math.round((row.totalQty - row.localQty) * 100) / 100
                    const isFull = Math.abs(diff) < 0.0001
                    const isExceeded = row.localQty > row.totalQty
                    const isSplit = row.localQty > 0 && row.localQty < row.totalQty

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${row.isChecked ? 'bg-amber-50/60' : 'hover:bg-slate-50'}`}
                      >
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={row.isChecked}
                            onChange={() => handleToggleRowCheck(row.id)}
                            className="rounded text-amber-600 focus:ring-0 cursor-pointer"
                          />
                        </td>
                        <td className="p-2 text-center font-mono text-slate-500 font-semibold">{row.sl_no}</td>
                        <td className="p-2 text-center font-mono font-bold text-slate-700">{row.client_po_item_no}</td>
                        <td className="p-2">
                          <div className="font-semibold text-slate-800 line-clamp-2" title={row.description}>
                            {row.description}
                          </div>
                        </td>
                        <td className="p-2 text-center font-mono font-bold text-slate-700">
                          {row.totalQty} <span className="text-[10px] text-slate-400 font-normal">{row.uom}</span>
                        </td>
                        <td className="p-2 text-center">
                          <div className="inline-flex items-center space-x-1 border border-slate-300 rounded px-1.5 py-0.5 bg-white">
                            <input
                              type="number"
                              min="0"
                              max={row.totalQty}
                              step="any"
                              value={row.localQty}
                              onChange={e => handleUpdateLocalQty(row.id, parseFloat(e.target.value) || 0)}
                              className="w-16 text-center font-mono font-bold text-amber-900 focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400">{row.uom}</span>
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          {isFull && (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center space-x-1">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              <span>Full Allocation (0 rem)</span>
                            </span>
                          )}
                          {isSplit && (
                            <span className="bg-blue-100 text-blue-800 border border-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center space-x-1">
                              <GitFork className="h-3 w-3 text-blue-600" />
                              <span>Split: {diff} in Stock</span>
                            </span>
                          )}
                          {isExceeded && (
                            <span className="bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center space-x-1">
                              <AlertTriangle className="h-3 w-3 text-rose-600" />
                              <span>Exceeds Total!</span>
                            </span>
                          )}
                          {row.localQty <= 0 && (
                            <span className="bg-slate-100 text-slate-500 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                              0 PCS
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            list="lpSuppliersDatalist"
                            value={row.localSupplier}
                            onChange={e => handleUpdateRowSupplier(row.id, e.target.value)}
                            placeholder="Local Supplier..."
                            className="w-full text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleApplyToWorksheet}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
            >
              <GitFork className="h-4 w-4" />
              <span>Apply &amp; Split on Worksheet</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadSeparateExcel}
              disabled={isExporting}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
            >
              <Download className="h-4 w-4" />
              <span>Download Local Purchase (.xlsx)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
