import React from 'react'
import { db } from '../../services/db'
import { useAuth } from '../../context/AuthContext'
import {
  Package,
  Layers,
  CheckCircle2,
  Truck,
  ArrowRight,
  Plus,
  FileSpreadsheet,
} from 'lucide-react'
import { NavTabId } from '../common/Sidebar'

interface DashboardProps {
  onNavigate: (tab: NavTabId, filter?: string) => void
  onSelectHeat: (heat: string) => void
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onSelectHeat }) => {
  useAuth()

  const masterStock = db.getMasterStockView()
  const orders = db.getOrders()
  const movements = db.getMovements()
  const localPurchases = db.getLocalPurchases()
  const dispatches = db.getDispatches()
  const mtcs = db.getMTCs()

  const totalStockItems = masterStock.length
  const totalPhysicalQty = masterStock.reduce((acc, s) => acc + s.physical_qty, 0)
  const totalAvailableQty = masterStock.reduce((acc, s) => acc + s.available_qty, 0)
  const totalReservedQty = masterStock.reduce((acc, s) => acc + s.reserved_qty, 0)
  const totalDispatchedQty = masterStock.reduce((acc, s) => acc + s.dispatched_qty, 0)
  const lowStockItems = masterStock.filter(s => s.available_qty <= 10).length

  const pendingApprovals = orders.filter(o => o.status === 'Pending Storekeeper Approval')
  const approvedAwaitingMTC = orders.filter(o => o.status === 'Approved' && !o.mtc_package_generated)
  const pendingDispatches = orders.filter(
    o => o.status === 'Approved' || o.status === 'MTC Generated' || o.status === 'Partially Dispatched'
  )
  const cancelledOrders = orders.filter(o => o.status === 'Cancelled')
  const totalLocalPurchases = localPurchases.length
  const totalMTCsUploaded = mtcs.length

  return (
    <div className="space-y-5">
      {/* Zoho-style Clean Page Header */}
      <div className="bg-white rounded-lg border border-slate-200 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Executive Operations Overview</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Live inventory balances, order fulfillment pipeline, and EN 10204 3.1 traceability.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('excel')}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs px-3.5 py-2 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
            <span>Import / Export</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Sales Order</span>
          </button>
        </div>
      </div>

      {/* Primary 4 Inventory KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('stock')}
          className="bg-white p-4 rounded-lg border border-slate-200 hover:border-blue-300 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Physical Inventory</span>
            <Package className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {totalPhysicalQty.toLocaleString()} <span className="text-xs font-medium text-slate-500">PCS</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">{totalStockItems} traceable heat lots</div>
        </div>

        <div
          onClick={() => onNavigate('stock')}
          className="bg-white p-4 rounded-lg border border-slate-200 hover:border-blue-300 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Available to Allocate</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {totalAvailableQty.toLocaleString()} <span className="text-xs font-medium text-slate-500">PCS</span>
          </div>
          <div className="text-[11px] text-emerald-700 mt-1">Ready for sales allocation</div>
        </div>

        <div
          onClick={() => onNavigate('allocation')}
          className="bg-white p-4 rounded-lg border border-slate-200 hover:border-blue-300 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Reserved for Orders</span>
            <Layers className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {totalReservedQty.toLocaleString()} <span className="text-xs font-medium text-slate-500">PCS</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Committed to active SOs</div>
        </div>

        <div
          onClick={() => onNavigate('dispatch')}
          className="bg-white p-4 rounded-lg border border-slate-200 hover:border-blue-300 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Dispatched</span>
            <Truck className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {totalDispatchedQty.toLocaleString()} <span className="text-xs font-medium text-slate-500">PCS</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Supplied to clients</div>
        </div>
      </div>

      {/* Compact Pipeline & Compliance Summary Strip */}
      <div className="bg-white rounded-lg border border-slate-200 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <button
          type="button"
          onClick={() => onNavigate('approvals')}
          className="p-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span>Pending Approval</span>
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">{pendingApprovals.length}</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('mtc')}
          className="p-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            <span>Awaiting MTC</span>
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">{approvedAwaitingMTC.length}</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('dispatch')}
          className="p-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Ready Dispatch</span>
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">{pendingDispatches.length}</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('mtc')}
          className="p-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] text-slate-500 font-medium">MTCs in Vault</div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">{totalMTCsUploaded}</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('local_purchase')}
          className="p-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] text-slate-500 font-medium">Local Purchases</div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">{totalLocalPurchases}</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('stock')}
          className="p-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            <span>Low Stock (&le;10)</span>
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">{lowStockItems}</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('orders', 'Cancelled')}
          className="p-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] text-slate-500 font-medium">Cancelled Orders</div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">{cancelledOrders.length}</div>
        </button>
      </div>

      {/* Operational Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pending Storekeeper Approvals */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50/60">
            <h2 className="text-xs font-semibold text-slate-800">
              Pending Storekeeper Verification ({pendingApprovals.length})
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {pendingApprovals.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No sales orders awaiting physical verification.
              </div>
            ) : (
              pendingApprovals.slice(0, 5).map(ord => (
                <div key={ord.id} className="p-3.5 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="font-semibold text-xs text-slate-900 font-mono">{ord.so_number}</div>
                      <div className="text-xs text-slate-700 mt-0.5">{ord.customer_name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        PO: {ord.po_number} &bull; {ord.order_date}
                      </div>
                    </div>
                    <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 font-medium px-2 py-0.5 rounded shrink-0">
                      Pending Check
                    </span>
                  </div>
                  {ord.allocations.length > 0 && (
                    <div className="mt-2 text-[11px] text-slate-500 truncate">
                      Heats:{' '}
                      <span className="font-mono text-slate-700">
                        {ord.allocations.map(a => `${a.heat_number} (${a.allocated_qty})`).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Stock Movement Ledger */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50/60">
            <h2 className="text-xs font-semibold text-slate-800">Recent Stock Movements</h2>
            <button
              type="button"
              onClick={() => onNavigate('movements')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <span>Full Ledger</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {movements.slice(0, 6).map(m => (
              <div key={m.id} className="px-4 py-3 hover:bg-slate-50 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {m.movement_type}
                    </span>
                    <span className="font-semibold text-slate-800 font-mono">{m.item_code}</span>
                    <button
                      type="button"
                      onClick={() => onSelectHeat(m.heat_number)}
                      className="text-blue-600 hover:underline font-mono text-[11px] cursor-pointer"
                    >
                      Heat {m.heat_number}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">{m.remarks}</div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-semibold text-slate-900 tabular-nums">
                    {m.movement_type === 'Reservation Release' || m.movement_type === 'Stock Receipt' ? '+' : '-'}
                    {m.quantity} PCS
                  </div>
                  <div className="text-[10px] text-slate-400 tabular-nums">{m.timestamp.slice(5, 16)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dispatches & Local Purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50/60">
            <h2 className="text-xs font-semibold text-slate-800">Recent Material Dispatches</h2>
            <button
              type="button"
              onClick={() => onNavigate('dispatch')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <span>View Dispatches</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {dispatches.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No dispatches recorded yet.</div>
            ) : (
              dispatches.slice(0, 4).map(d => (
                <div key={d.id} className="px-4 py-3 flex justify-between items-center text-xs hover:bg-slate-50">
                  <div>
                    <div className="font-semibold text-slate-900 font-mono">
                      {d.so_number} &bull; {d.delivery_note_number}
                    </div>
                    <div className="text-[11px] text-slate-500">{d.customer_name}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium px-2 py-0.5 rounded">
                      Dispatched
                    </span>
                    <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{d.dispatch_date}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50/60">
            <h2 className="text-xs font-semibold text-slate-800">Local UAE Purchases (L-Codes)</h2>
            <button
              type="button"
              onClick={() => onNavigate('local_purchase')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <span>Manage L-Codes</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {localPurchases.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No local purchase L-codes recorded.</div>
            ) : (
              localPurchases.slice(0, 5).map(lp => (
                <div key={lp.id} className="px-4 py-3 flex justify-between items-center text-xs hover:bg-slate-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-800 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                        {lp.l_code}
                      </span>
                      <span className="font-semibold text-slate-800">{lp.item_code}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {lp.supplier_name} &bull; YOM {lp.yom}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                        lp.supplier_mtc_uploaded
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {lp.supplier_mtc_uploaded ? 'Stamped MTC' : 'MTC Missing'}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">{lp.received_qty} PCS</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
