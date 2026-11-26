import React, { useState } from 'react'
import { db } from '../../services/db'
import { exportStockMovements } from '../../services/excelEngine'
import { History, Download, Search, Filter, Flame } from 'lucide-react'

export const StockMovementsLedger: React.FC = () => {
  const movements = db.getMovements()
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const filtered = movements.filter(m => {
    const matchesSearch =
      m.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.heat_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.reference_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.performed_by.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.remarks.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = typeFilter === 'all' || m.movement_type === typeFilter
    return matchesSearch && matchesType
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <History className="h-5 w-5 text-blue-600" />
            <h1 className="text-lg font-semibold text-slate-900">Immutable Stock Movement Ledger</h1>
            <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium px-2 py-0.5 rounded-full">
              Section 5.12 Standard
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete audit trail of every inventory-changing event (Receipts, Reservations, Releases, Dispatches, Returns &amp; Adjustments).
          </p>
        </div>

        <button
          onClick={() => exportStockMovements()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-md shadow-xs transition-colors flex items-center space-x-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export Ledger (.xlsx)</span>
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search Heat#, Item Code, Reference ID, Performed By..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <span className="font-medium text-slate-600">Movement Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-800 font-medium"
          >
            <option value="all">All Movements ({movements.length})</option>
            <option value="Opening Stock">Opening Stock</option>
            <option value="Stock Receipt">Stock Receipt</option>
            <option value="Reservation">Reservation</option>
            <option value="Reservation Release">Reservation Release</option>
            <option value="Dispatch">Dispatch</option>
            <option value="Approved Customer Return">Customer Return</option>
            <option value="Stock Adjustment">Stock Adjustment</option>
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">Timestamp</th>
                <th className="py-3 px-3">Movement Type</th>
                <th className="py-3 px-3">Item Code</th>
                <th className="py-3 px-3">Heat Number</th>
                <th className="py-3 px-3 text-center">Qty Change</th>
                <th className="py-3 px-3 text-center">Prev Balance</th>
                <th className="py-3 px-3 text-center">New Balance</th>
                <th className="py-3 px-3">Reference</th>
                <th className="py-3 px-3">Performed By</th>
                <th className="py-3 px-3">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(m => {
                const isAddition = m.movement_type === 'Stock Receipt' || m.movement_type === 'Reservation Release' || m.movement_type === 'Opening Stock' || m.movement_type === 'Approved Customer Return'

                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap font-mono text-[11px]">{m.timestamp}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                        m.movement_type === 'Reservation' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        m.movement_type === 'Reservation Release' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        m.movement_type === 'Dispatch' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        m.movement_type === 'Stock Receipt' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        m.movement_type === 'Approved Customer Return' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        {m.movement_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">{m.item_code}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">{m.heat_number}</td>
                    <td className="py-2.5 px-3 text-center font-semibold tabular-nums">
                      <span className={isAddition ? 'text-emerald-700' : 'text-slate-800'}>
                        {isAddition ? '+' : '-'}{m.quantity} PCS
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-500">{m.previous_balance}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-900">{m.new_balance}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{m.reference_id}</td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{m.performed_by}</td>
                    <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate" title={m.remarks}>{m.remarks}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
