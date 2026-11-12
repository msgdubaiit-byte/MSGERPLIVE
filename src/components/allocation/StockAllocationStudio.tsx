import React, { useState, useEffect } from 'react'
import { db } from '../../services/db'
import { useAuth } from '../../context/AuthContext'
import {
  Layers,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  Calendar,
  ListChecks,
} from 'lucide-react'

interface StockAllocationStudioProps {
  preselectedOrderId?: string
  onComplete: () => void
}

interface BatchLineChoice {
  lotId: string // 'AUTO_FIFO' or specific lot.id
  qty: number
}

export const StockAllocationStudio: React.FC<StockAllocationStudioProps> = ({ preselectedOrderId, onComplete }) => {
  const { currentUser } = useAuth()
  const orders = db.getOrders()
  const masterStock = db.getMasterStockView()

  // Eligible orders (Draft or Stock Allocated)
  const allocatableOrders = orders.filter(o => o.status === 'Draft' || o.status === 'Stock Allocated')
  const [selectedOrderId, setSelectedOrderId] = useState<string>(preselectedOrderId || allocatableOrders[0]?.id || '')

  const currentOrder = orders.find(o => o.id === selectedOrderId)

  // Selected item line to allocate (for single-line modes)
  const [selectedItemId, setSelectedItemId] = useState<string>(currentOrder?.items[0]?.item_id || '')
  const [allocationMode, setAllocationMode] = useState<'batch_all' | 'fifo' | 'manual'>('batch_all')
  const [manualLotId, setManualLotId] = useState<string>('')
  const [manualQty, setManualQty] = useState<number>(1)

  // Batch choices per item_id (default 'AUTO_FIFO' so it takes all heats automatically)
  const [batchChoices, setBatchChoices] = useState<Record<string, BatchLineChoice>>({})

  // Sync selectedItemId & batchChoices when order changes
  useEffect(() => {
    if (currentOrder) {
      if (currentOrder.items[0] && !currentOrder.items.some(i => i.item_id === selectedItemId)) {
        setSelectedItemId(currentOrder.items[0].item_id)
      }
      const initialChoices: Record<string, BatchLineChoice> = {}
      currentOrder.items.forEach(it => {
        const rem = Math.max(0, it.required_qty - it.allocated_qty)
        initialChoices[it.item_id] = {
          lotId: rem === 0 ? 'ALLOCATED' : 'AUTO_FIFO',
          qty: rem === 0 ? it.allocated_qty : rem,
        }
      })
      setBatchChoices(initialChoices)
    }
  }, [selectedOrderId, currentOrder?.items.length])

  // Find unallocated quantity for the selected item line
  const currentLine = currentOrder?.items.find(i => i.item_id === selectedItemId)
  const remainingNeeded = currentLine ? Math.max(0, currentLine.required_qty - currentLine.allocated_qty) : 0

  // Matching lots for the selected item
  const matchingLots = masterStock.filter(s => s.item_id === selectedItemId && s.available_qty > 0)
  const selectedManualLot = matchingLots.find(l => l.id === manualLotId)
  const uniqueYoms = Array.from(new Set(matchingLots.map(l => l.yom).filter(Boolean))).sort()

  // Auto-select first lot in manual mode if none selected
  useEffect(() => {
    if (allocationMode === 'manual' && matchingLots.length > 0 && !matchingLots.some(l => l.id === manualLotId)) {
      setManualLotId(matchingLots[0].id)
      setManualQty(Math.min(remainingNeeded || matchingLots[0].available_qty, matchingLots[0].available_qty))
    }
  }, [allocationMode, selectedItemId, matchingLots.length])

  // FIFO Preview computation
  const getFIFOPreview = (itemId: string, needed: number) => {
    const lots = masterStock.filter(s => s.item_id === itemId && s.available_qty > 0)
    if (!needed || lots.length === 0) return []
    const sorted = [...lots].sort((a, b) => {
      if (a.stock_receipt_date !== b.stock_receipt_date) return a.stock_receipt_date.localeCompare(b.stock_receipt_date)
      return (a.yom || 2024) - (b.yom || 2024)
    })

    let rem = needed
    const plan: { lot: typeof lots[0]; take: number; remainingAvail: number }[] = []

    for (const lot of sorted) {
      if (rem <= 0) break
      const take = Math.min(rem, lot.available_qty)
      plan.push({
        lot,
        take,
        remainingAvail: lot.available_qty - take,
      })
      rem -= take
    }
    return plan
  }

  const fifoPlan = getFIFOPreview(selectedItemId, remainingNeeded)

  const handleExecuteBatchAll = () => {
    if (!currentOrder) return
    const linesToProcess = currentOrder.items.filter(it => {
      const rem = Math.max(0, it.required_qty - it.allocated_qty)
      const choice = batchChoices[it.item_id]
      return rem > 0 || (choice && choice.lotId !== 'ALLOCATED')
    })

    if (linesToProcess.length === 0) {
      alert('All lines are already allocated and no heat changes were selected.')
      return
    }

    let successCount = 0
    const errors: string[] = []
    const userEmail = currentUser?.email || 'sales@msgoilfield.ae'

    for (const line of linesToProcess) {
      const rem = Math.max(0, line.required_qty - line.allocated_qty)
      const choice = batchChoices[line.item_id] || { lotId: 'AUTO_FIFO', qty: line.required_qty }

      // If line was already allocated and user picked a new heat / AUTO_FIFO, release old reservations first
      if (rem === 0 && choice.lotId !== 'ALLOCATED') {
        db.deallocateLine(currentOrder.id, line.item_id, userEmail)
      }

      const targetRem = rem === 0 ? line.required_qty : rem
      const qtyToAlloc = choice.qty > 0 ? Math.min(choice.qty, targetRem) : targetRem

      if (qtyToAlloc <= 0) continue

      if (choice.lotId === 'AUTO_FIFO') {
        const res = db.allocateFIFO(currentOrder.id, line.item_id, qtyToAlloc, userEmail)
        if (res.success) successCount++
        else errors.push(`${line.item_code}: ${res.message}`)
      } else {
        const res = db.allocateManual(currentOrder.id, line.item_id, choice.lotId, qtyToAlloc, userEmail)
        if (res.success) successCount++
        else errors.push(`${line.item_code}: ${res.message}`)
      }
    }

    if (errors.length > 0) {
      alert(`Allocated ${successCount} line(s).\nWarnings/Errors:\n${errors.join('\n')}`)
    } else {
      alert(`Successfully allocated all ${successCount} order line(s) with selected heats!`)
    }
    onComplete()
  }

  const handleExecuteFIFO = () => {
    if (!currentOrder || !selectedItemId || remainingNeeded <= 0) {
      alert('No remaining quantity needed or item not selected.')
      return
    }

    const res = db.allocateFIFO(
      currentOrder.id,
      selectedItemId,
      remainingNeeded,
      currentUser?.email || 'sales@msgoilfield.ae'
    )

    if (res.success) {
      alert(res.message)
      onComplete()
    } else {
      alert(res.message)
    }
  }

  const handleExecuteManual = () => {
    if (!currentOrder || !selectedItemId || !manualLotId || manualQty <= 0) {
      alert('Please select a specific heat number and quantity.')
      return
    }

    const res = db.allocateManual(
      currentOrder.id,
      selectedItemId,
      manualLotId,
      manualQty,
      currentUser?.email || 'sales@msgoilfield.ae'
    )

    if (res.success) {
      alert(res.message)
      onComplete()
    } else {
      alert(res.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="h-5 w-5 text-red-600" />
            <h1 className="text-base font-bold text-slate-900 uppercase tracking-tight">Stock Allocation Engine</h1>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              Section 8 & 9 Standard
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            By default allocates all available heats across all order lines in 1 click, or customize individual heat numbers with Certificate & YOM details.
          </p>
        </div>

        {/* Order Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-600">Active Sales Order:</span>
          <select
            value={selectedOrderId}
            onChange={(e) => {
              setSelectedOrderId(e.target.value)
              const ord = orders.find(o => o.id === e.target.value)
              if (ord && ord.items[0]) setSelectedItemId(ord.items[0].item_id)
            }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white font-bold text-[#0B2545] shadow-sm"
          >
            {allocatableOrders.length === 0 ? (
              <option value="">No draft or unallocated orders</option>
            ) : (
              allocatableOrders.map(o => (
                <option key={o.id} value={o.id}>
                  {o.so_number} &bull; {o.customer_name} ({o.status})
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {!currentOrder ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-400 text-xs">
          Please select a Sales Order from the dropdown above to begin heat allocation.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Order Items Selector & Committed Reservations */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                1. Order Lines to Allocate
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">{currentOrder.so_number} &bull; {currentOrder.customer_name}</p>
            </div>

            <div className="space-y-2">
              {currentOrder.items.map(item => {
                const isSelected = item.item_id === selectedItemId
                const unalloc = Math.max(0, item.required_qty - item.allocated_qty)
                const isComplete = unalloc === 0
                const allItemLots = masterStock.filter(s => s.item_id === item.item_id)
                const availItemLots = allItemLots.filter(s => s.available_qty > 0)
                const itemYoms = Array.from(new Set(allItemLots.map(l => l.yom).filter(Boolean))).sort()

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.item_id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-red-500 bg-red-50/40 ring-1 ring-red-400'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono font-bold text-xs text-slate-900">{item.item_code}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {isComplete ? 'Fully Allocated' : `${unalloc} Needed`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-1">{item.item_description}</div>
                    <div className="mt-2 text-xs flex justify-between text-slate-600">
                      <span>Required: <strong>{item.required_qty} PCS</strong></span>
                      <span>Allocated: <strong className="text-emerald-700">{item.allocated_qty} PCS</strong></span>
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 flex justify-between">
                      <span>{availItemLots.length} Free / {allItemLots.length} Heat(s)</span>
                      {itemYoms.length > 0 && <span className="font-semibold text-blue-700">YOM: {itemYoms.join(', ')}</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Current Allocations summary for this order */}
            <div className="pt-3 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Committed Heat Reservations</div>
              {currentOrder.allocations.length === 0 ? (
                <div className="text-[11px] text-slate-400 italic">No heats reserved yet for this order.</div>
              ) : (
                <div className="space-y-1.5">
                  {currentOrder.allocations.map(a => {
                    const lotInfo = masterStock.find(s => s.id === a.stock_lot_id)
                    return (
                      <div key={a.id} className="p-2 bg-slate-50 border border-slate-200 rounded text-xs space-y-0.5">
                        <div className="flex justify-between items-center">
                          <span className="font-mono font-bold text-slate-800">🔥 Heat {a.heat_number}</span>
                          <span className="font-bold text-emerald-700">{a.allocated_qty} PCS</span>
                        </div>
                        {lotInfo && (
                          <div className="text-[10px] text-slate-500 flex justify-between">
                            <span>Cert: {lotInfo.certificate_number || 'Pending'}</span>
                            <span>YOM: {lotInfo.yom || 'N/A'}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column (2 cols): Allocation Mode Tabs & Simulator */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
            {/* Mode Switcher */}
            <div className="flex flex-wrap rounded-lg bg-slate-100 p-1 gap-1">
              <button
                onClick={() => setAllocationMode('batch_all')}
                className={`flex-1 py-2 px-2 text-xs font-bold rounded-md transition-all flex items-center justify-center space-x-1.5 ${
                  allocationMode === 'batch_all' ? 'bg-emerald-700 text-white shadow' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListChecks className="h-3.5 w-3.5" />
                <span>All Lines (All Heats Default)</span>
              </button>
              <button
                onClick={() => setAllocationMode('fifo')}
                className={`flex-1 py-2 px-2 text-xs font-bold rounded-md transition-all flex items-center justify-center space-x-1.5 ${
                  allocationMode === 'fifo' ? 'bg-red-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Single Line FIFO</span>
              </button>
              <button
                onClick={() => setAllocationMode('manual')}
                className={`flex-1 py-2 px-2 text-xs font-bold rounded-md transition-all flex items-center justify-center space-x-1.5 ${
                  allocationMode === 'manual' ? 'bg-[#0B2545] text-white shadow' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Flame className="h-3.5 w-3.5" />
                <span>Manual Heat Dropdown</span>
              </button>
            </div>

            {/* MODE 0: BATCH ALL LINES (ALL HEATS BY DEFAULT) */}
            {allocationMode === 'batch_all' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start space-x-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Bulk Order Allocation — All Heats Selected by Default</div>
                      <p className="text-[11px] text-emerald-800 mt-0.5">
                        Saves time by pre-selecting all available heats for every order line automatically. Use the dropdowns below to switch any line&apos;s heat (Certificate # &amp; YOM update live).
                      </p>
                    </div>
                  </div>
                  <select
                    value={
                      currentOrder.items.every(it => (batchChoices[it.item_id]?.lotId || (it.required_qty - it.allocated_qty <= 0 ? 'ALLOCATED' : 'AUTO_FIFO')) === 'AUTO_FIFO')
                        ? 'AUTO_FIFO'
                        : 'CUSTOM'
                    }
                    onChange={(e) => {
                      const mode = e.target.value
                      if (mode === 'AUTO_FIFO') {
                        const updated: Record<string, BatchLineChoice> = {}
                        currentOrder.items.forEach(it => {
                          const rem = Math.max(0, it.required_qty - it.allocated_qty)
                          updated[it.item_id] = {
                            lotId: 'AUTO_FIFO',
                            qty: rem > 0 ? rem : it.required_qty,
                          }
                        })
                        setBatchChoices(updated)
                      } else if (mode === 'KEEP_ALLOCATED') {
                        const updated: Record<string, BatchLineChoice> = {}
                        currentOrder.items.forEach(it => {
                          const rem = Math.max(0, it.required_qty - it.allocated_qty)
                          updated[it.item_id] = {
                            lotId: rem === 0 ? 'ALLOCATED' : 'AUTO_FIFO',
                            qty: rem === 0 ? it.allocated_qty : rem,
                          }
                        })
                        setBatchChoices(updated)
                      }
                    }}
                    className="shrink-0 border border-emerald-300 bg-white text-emerald-950 rounded-lg px-2.5 py-1.5 text-xs font-bold shadow-sm"
                  >
                    <option value="AUTO_FIFO">⚡ All Lines: All Heats (Default FIFO)</option>
                    <option value="KEEP_ALLOCATED">✓ Keep Current Allocations</option>
                    <option value="CUSTOM">🎛️ Custom Per-Line Heat Selection</option>
                  </select>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Item &amp; Heats Available</th>
                          <th className="p-2.5">Select Heat Number</th>
                          <th className="p-2.5">Certificate # &amp; YOM</th>
                          <th className="p-2.5 text-center w-24">Alloc Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentOrder.items.map(line => {
                          const rem = Math.max(0, line.required_qty - line.allocated_qty)
                          const allItemLots = masterStock.filter(s => s.item_id === line.item_id)
                          const availItemLots = allItemLots.filter(s => s.available_qty > 0)
                          const lineAllocs = currentOrder.allocations.filter(a => allItemLots.some(l => l.id === a.stock_lot_id))
                          const itemYoms = Array.from(new Set(allItemLots.map(l => l.yom).filter(Boolean))).sort()
                          const defaultLotId = rem === 0 ? 'ALLOCATED' : 'AUTO_FIFO'
                          const choice = batchChoices[line.item_id] || { lotId: defaultLotId, qty: rem }
                          const selectableLots = rem === 0 ? allItemLots : availItemLots
                          const chosenLot = selectableLots.find(l => l.id === choice.lotId)
                          const autoPlan = getFIFOPreview(line.item_id, rem)

                          return (
                            <tr key={line.id} className={rem === 0 ? 'bg-emerald-50/20 hover:bg-slate-50' : 'hover:bg-slate-50'}>
                              <td className="p-2.5 align-top">
                                <div className="font-mono font-bold text-slate-900">{line.item_code}</div>
                                <div className="text-[10px] text-slate-500 line-clamp-1 max-w-[180px]" title={line.item_description}>
                                  {line.item_description}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded font-semibold text-slate-700">
                                    Req: {line.required_qty} | Need: {rem}
                                  </span>
                                  <span className="bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">
                                    {allItemLots.length} Heat(s){itemYoms.length > 0 ? ` • YOM: ${itemYoms.join(', ')}` : ''}
                                  </span>
                                </div>
                              </td>

                              <td className="p-2.5 align-top">
                                <select
                                  value={choice.lotId}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    const lotObj = selectableLots.find(l => l.id === val)
                                    setBatchChoices(prev => ({
                                      ...prev,
                                      [line.item_id]: {
                                        lotId: val,
                                        qty: rem === 0 ? line.allocated_qty : (lotObj ? Math.min(rem, lotObj.available_qty) : rem),
                                      },
                                    }))
                                  }}
                                  className={`w-full max-w-[240px] border rounded-lg px-2 py-1.5 text-xs font-semibold ${
                                    rem === 0 && choice.lotId === 'ALLOCATED'
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                      : 'border-slate-300 bg-white text-slate-800'
                                  }`}
                                >
                                  {rem === 0 && (
                                    <option value="ALLOCATED">
                                      ✓ Allocated: {lineAllocs.map(a => a.heat_number).join(', ') || 'Committed'}
                                    </option>
                                  )}
                                  <option value="AUTO_FIFO">
                                    ⚡ All Heats (Auto FIFO — {availItemLots.length} avail)
                                  </option>
                                  {selectableLots.map(lot => (
                                    <option key={lot.id} value={lot.id}>
                                      🔥 {lot.heat_number} ({lot.available_qty} avail • YOM {lot.yom || 'N/A'})
                                    </option>
                                  ))}
                                </select>
                              </td>

                              <td className="p-2.5 align-top text-[11px]">
                                {chosenLot ? (
                                  <div className="bg-blue-50/70 border border-blue-200 rounded px-2 py-1 space-y-0.5">
                                    <div className="font-mono font-bold text-slate-800">
                                      🔥 {chosenLot.heat_number}
                                    </div>
                                    <div className="text-blue-950">
                                      Cert #: <strong className="font-mono">{chosenLot.certificate_number || 'Pending'}</strong>
                                    </div>
                                    <div className="text-blue-900">
                                      YOM: <strong>{chosenLot.yom || 'N/A'}</strong> &bull; Avail: <strong>{chosenLot.available_qty} PCS</strong>
                                    </div>
                                    <div className="text-[10px] text-blue-700">Loc: {chosenLot.warehouse_location}</div>
                                  </div>
                                ) : rem === 0 && choice.lotId === 'ALLOCATED' ? (
                                  lineAllocs.length > 0 ? (
                                    <div className="space-y-1">
                                      {lineAllocs.map(a => {
                                        const lotInfo = masterStock.find(s => s.id === a.stock_lot_id)
                                        return (
                                          <div key={a.id} className="bg-emerald-50/70 border border-emerald-200 rounded px-2 py-1 space-y-0.5">
                                            <div className="font-mono font-bold text-emerald-950">
                                              🔥 {a.heat_number} ({a.allocated_qty} PCS)
                                            </div>
                                            <div className="text-[10px] text-emerald-900">
                                              Cert #: <strong className="font-mono">{lotInfo?.certificate_number || 'Pending'}</strong> &bull; YOM: <strong>{lotInfo?.yom || 'N/A'}</strong>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">No reservation record</span>
                                  )
                                ) : autoPlan.length > 0 ? (
                                  <div className="space-y-1">
                                    {autoPlan.map((p, i) => (
                                      <div key={i} className="bg-slate-50 border border-slate-200 rounded px-2 py-1">
                                        <div className="font-mono font-bold text-slate-800">
                                          {p.lot.heat_number} ({p.take} PCS)
                                        </div>
                                        <div className="text-[10px] text-slate-600">
                                          Cert: <strong>{p.lot.certificate_number || 'Pending'}</strong> &bull; YOM: <strong>{p.lot.yom || 'N/A'}</strong>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-red-600 font-semibold">No stock available</span>
                                )}
                              </td>

                              <td className="p-2.5 align-top text-center">
                                {rem === 0 ? (
                                  <span className="font-bold text-emerald-700">{line.allocated_qty}</span>
                                ) : (
                                  <input
                                    type="number"
                                    min={1}
                                    max={chosenLot ? Math.min(rem, chosenLot.available_qty) : rem}
                                    value={choice.qty}
                                    onChange={(e) => {
                                      const val = Math.max(0, Number(e.target.value))
                                      setBatchChoices(prev => ({
                                        ...prev,
                                        [line.item_id]: { ...choice, qty: val },
                                      }))
                                    }}
                                    className="w-16 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs"
                                  />
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleExecuteBatchAll}
                    disabled={
                      !currentOrder.items.some(
                        it =>
                          it.required_qty - it.allocated_qty > 0 ||
                          (batchChoices[it.item_id] && batchChoices[it.item_id].lotId !== 'ALLOCATED')
                      )
                    }
                    className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow transition-colors flex items-center space-x-2"
                  >
                    <span>Commit All Line Allocations (All Selected Heats)</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Selected item status (for Single Line Modes) */}
            {allocationMode !== 'batch_all' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-500">Allocating for: </span>
                  <span className="font-mono font-bold text-slate-900">{currentLine?.item_code}</span>
                </div>
                <div>
                  <span className="text-slate-500">Unallocated Balance Needed: </span>
                  <span className="font-extrabold text-red-700 text-sm">{remainingNeeded} PCS</span>
                </div>
              </div>
            )}

            {/* MODE A: FIFO Allocation Plan */}
            {allocationMode === 'fifo' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-900">
                  <div className="font-bold flex items-center space-x-1 mb-1">
                    <ShieldCheck className="h-4 w-4 text-blue-700" />
                    <span>FIFO Logic (First-In, First-Out by Receipt Date &amp; YOM)</span>
                  </div>
                  <p className="text-[11px] text-blue-800">
                    The system sequentially reserves stock from the oldest registered lots first. If a lot contains fewer units than requested, it drains that lot and automatically pulls the balance from the next oldest heat.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-3 bg-slate-100 font-bold text-xs uppercase text-slate-700">
                    Calculated FIFO Allocation Simulation
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                      <tr>
                        <th className="p-2.5">Heat Number</th>
                        <th className="p-2.5">Certificate #</th>
                        <th className="p-2.5">YOM</th>
                        <th className="p-2.5 text-center">Available Before</th>
                        <th className="p-2.5 text-center font-bold text-red-700">To Allocate</th>
                        <th className="p-2.5 text-center">Available After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fifoPlan.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-400">
                            {remainingNeeded === 0
                              ? 'This line item is already fully allocated.'
                              : 'No available stock lots found for this item.'}
                          </td>
                        </tr>
                      ) : (
                        fifoPlan.map(p => (
                          <tr key={p.lot.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-slate-900">
                              🔥 {p.lot.heat_number}
                              {p.lot.l_code && <span className="ml-1 text-[10px] text-amber-700">({p.lot.l_code})</span>}
                            </td>
                            <td className="p-2.5 font-mono text-slate-600">{p.lot.certificate_number || 'Pending'}</td>
                            <td className="p-2.5 text-slate-600 font-semibold">{p.lot.yom}</td>
                            <td className="p-2.5 text-center font-medium text-slate-600">{p.lot.available_qty} PCS</td>
                            <td className="p-2.5 text-center font-extrabold text-red-600 bg-red-50/50">
                              {p.take} PCS
                            </td>
                            <td className="p-2.5 text-center font-bold text-emerald-700">
                              {p.remainingAvail} PCS
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleExecuteFIFO}
                    disabled={remainingNeeded <= 0 || fifoPlan.length === 0}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow transition-colors flex items-center space-x-2"
                  >
                    <span>Commit FIFO Allocation &amp; Lock Reservation</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* MODE B: Manual Heat Selection Dropdown */}
            {allocationMode === 'manual' && (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <div className="font-bold flex items-center space-x-1 mb-0.5">
                      <Flame className="h-4 w-4 text-amber-700" />
                      <span>Manual Specific Heat Selection</span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Select any heat number from the dropdown below to inspect its Certificate Number and Year of Manufacturing (YOM).
                    </p>
                  </div>
                  <div className="bg-white border border-amber-300 px-3 py-1.5 rounded-lg text-[11px] font-bold text-amber-950">
                    {matchingLots.length} Heat Number(s) Available
                    {uniqueYoms.length > 0 && ` • YOMs: ${uniqueYoms.join(', ')}`}
                  </div>
                </div>

                {matchingLots.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                    <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                    No available heat lots found in stock for {currentLine?.item_code}.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Heat Number Dropdown */}
                    <div>
                      <label className="block font-bold text-slate-700 mb-1.5 text-xs">
                        Select Heat Number (Dropdown):
                      </label>
                      <select
                        value={manualLotId}
                        onChange={(e) => {
                          const id = e.target.value
                          setManualLotId(id)
                          const chosen = matchingLots.find(l => l.id === id)
                          if (chosen) {
                            setManualQty(Math.min(remainingNeeded || chosen.available_qty, chosen.available_qty))
                          }
                        }}
                        className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs bg-white font-bold text-slate-900 shadow-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Click to Choose Heat Number --</option>
                        {matchingLots.map(lot => (
                          <option key={lot.id} value={lot.id}>
                            🔥 Heat: {lot.heat_number} | {lot.available_qty} PCS Avail | YOM: {lot.yom || 'N/A'} | Cert: {lot.certificate_number || 'Pending'} | Loc: {lot.warehouse_location}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Auto-Populated Certificate # & Year of Manufacturing Detail Card */}
                    {selectedManualLot && (
                      <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-blue-700 block">Selected Heat #</span>
                          <span className="font-mono font-extrabold text-slate-900 text-sm">
                            🔥 {selectedManualLot.heat_number}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-blue-700 flex items-center space-x-1">
                            <FileCheck2 className="h-3 w-3" />
                            <span>Certificate Number</span>
                          </span>
                          <span className="font-mono font-extrabold text-blue-950 text-sm">
                            {selectedManualLot.certificate_number || 'Pending Upload'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-blue-700 flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>Year of Mfg (YOM)</span>
                          </span>
                          <span className="font-extrabold text-blue-950 text-sm">
                            {selectedManualLot.yom || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-blue-700 block">Stock &amp; Location</span>
                          <span className="font-bold text-emerald-700">
                            {selectedManualLot.available_qty} PCS
                          </span>
                          <span className="text-[11px] text-slate-600 block">
                            Loc: {selectedManualLot.warehouse_location}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Quantity Input */}
                    {selectedManualLot && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center space-x-3 text-xs">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">Quantity to Allocate (PCS):</label>
                          <input
                            type="number"
                            min="1"
                            max={selectedManualLot.available_qty || 1}
                            value={manualQty}
                            onChange={(e) => setManualQty(Number(e.target.value))}
                            className="border border-slate-300 rounded-lg p-1.5 w-32 font-bold text-center"
                          />
                        </div>
                        <div className="text-slate-500 text-[11px] pt-4">
                          Max available in this heat: <strong>{selectedManualLot.available_qty} PCS</strong>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleExecuteManual}
                        disabled={!manualLotId || manualQty <= 0}
                        className="bg-[#0B2545] hover:bg-[#133C55] disabled:bg-slate-300 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow transition-colors flex items-center space-x-2"
                      >
                        <span>Commit Manual Heat Allocation</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
