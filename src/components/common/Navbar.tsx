import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { UserRole } from '../../types'
import {
  Search,
  LogOut,
  Bell,
  Database,
  Crown,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ShieldCheck,
  User,
} from 'lucide-react'
import { db } from '../../services/db'
import { VipAdminCustomizerModal } from '../admin/VipAdminCustomizerModal'

interface NavbarProps {
  onSearchSelect: (type: 'heat' | 'order' | 'item' | 'lcode', id: string) => void
  onOpenSettings: () => void
  onOpenGuide?: () => void
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

export const Navbar: React.FC<NavbarProps> = ({
  onSearchSelect,
  onOpenSettings,
  onOpenGuide,
  sidebarCollapsed,
  onToggleSidebar,
}) => {
  const { currentUser, currentRole, logout } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isVipModalOpen, setIsVipModalOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)

  const masterStock = db.getMasterStockView()
  const orders = db.getOrders()

  const searchResults = searchTerm.trim().length > 1 ? {
    heats: masterStock.filter(s =>
      s.heat_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.l_code && s.l_code.toLowerCase().includes(searchTerm.toLowerCase()))
    ).slice(0, 5),
    items: masterStock.filter(s =>
      s.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.item_description.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5),
    orders: orders.filter(o =>
      o.so_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.po_number.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5),
  } : null

  const roleLabels: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    admin_inventory: 'Inventory Manager',
    sales_team: 'Sales Team',
    storekeeper: 'Storekeeper',
    mtc_controller: 'MTC Controller',
    dispatch_team: 'Dispatch Team',
    management_viewer: 'Management Viewer',
    it_engineer: 'IT Systems Engineer',
  }

  const pendingApprovalsCount = orders.filter(o => o.status === 'Pending Storekeeper Approval').length

  return (
    <header className="h-14 bg-white border-b border-slate-200 sticky top-0 z-40 px-4 flex items-center justify-between gap-4">
      {/* Left: Sidebar Toggle + Global Search */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}

        {/* Zoho-style Global Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search Heat #, Item Code, Sales Order, Customer..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setIsSearchOpen(true)
            }}
            onFocus={() => setIsSearchOpen(true)}
            className="w-full bg-slate-50 border border-slate-200 text-xs rounded-md pl-8 pr-3 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />

          {isSearchOpen && searchResults && (
            <div className="absolute left-0 right-0 mt-1.5 bg-white text-slate-800 rounded-lg shadow-lg border border-slate-200 overflow-hidden z-50 text-xs max-h-96 overflow-y-auto">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-slate-500 font-medium">
                <span>Search results for &ldquo;{searchTerm}&rdquo;</span>
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>

              {searchResults.heats.length > 0 && (
                <div className="p-2 border-b border-slate-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 px-2">Heat Numbers &amp; Lots</div>
                  {searchResults.heats.map(h => (
                    <div
                      key={h.id}
                      onClick={() => {
                        onSearchSelect('heat', h.heat_number)
                        setIsSearchOpen(false)
                      }}
                      className="px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-slate-900 font-mono">Heat: {h.heat_number}</span>
                        {h.l_code && (
                          <span className="ml-2 bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded font-mono">
                            {h.l_code}
                          </span>
                        )}
                        <p className="text-[11px] text-slate-500 truncate">{h.item_code} &bull; YOM {h.yom || 'N/A'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-semibold text-emerald-700 tabular-nums">{h.available_qty} PCS</span>
                        <p className="text-[10px] text-slate-400">{h.warehouse_location}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.orders.length > 0 && (
                <div className="p-2 border-b border-slate-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 px-2">Sales Orders</div>
                  {searchResults.orders.map(o => (
                    <div
                      key={o.id}
                      onClick={() => {
                        onSearchSelect('order', o.so_number)
                        setIsSearchOpen(false)
                      }}
                      className="px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-slate-900 font-mono">{o.so_number}</span>
                        <span className="ml-2 text-slate-600">{o.customer_name}</span>
                        <p className="text-[11px] text-slate-500">PO: {o.po_number} &bull; {o.order_date}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                        {o.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.items.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 px-2">Item Catalog</div>
                  {searchResults.items.map(it => (
                    <div
                      key={it.id}
                      onClick={() => {
                        onSearchSelect('item', it.item_code)
                        setIsSearchOpen(false)
                      }}
                      className="px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-slate-900 font-mono">{it.item_code}</span>
                        <p className="text-[11px] text-slate-500 truncate">{it.item_description}</p>
                      </div>
                      <span className="text-slate-400 text-[10px] shrink-0">{it.size}</span>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.heats.length === 0 && searchResults.orders.length === 0 && searchResults.items.length === 0 && (
                <div className="p-4 text-center text-slate-400">No matching records for &ldquo;{searchTerm}&rdquo;</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Calm Commercial Utility Bar */}
      <div className="flex items-center gap-2 shrink-0">
        {pendingApprovalsCount > 0 && (
          <div
            title={`${pendingApprovalsCount} order(s) awaiting Storekeeper verification`}
            className="hidden md:flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-2.5 py-1 rounded-md font-medium"
          >
            <Bell className="h-3.5 w-3.5 text-amber-600" />
            <span className="tabular-nums font-semibold">{pendingApprovalsCount}</span>
            <span className="text-[11px]">Pending Approval</span>
          </div>
        )}

        {currentRole === 'it_engineer' && (
          <div className="hidden lg:flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-slate-700 text-xs font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            <span>IT Config Mode</span>
          </div>
        )}

        {onOpenGuide && (
          <button
            type="button"
            onClick={onOpenGuide}
            title="Walkthrough & User Guide"
            className="p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          title="Database & System Settings"
          className="p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Database className="h-4 w-4" />
        </button>

        {/* User Profile Dropdown */}
        <div className="relative pl-2 border-l border-slate-200">
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen(o => !o)}
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <div className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold">
              {(currentUser?.employee_name || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-900 leading-tight max-w-[140px] truncate">
                {currentUser?.employee_name || 'Administrator'}
              </div>
              <div className="text-[10px] text-slate-500 leading-tight">
                {roleLabels[currentRole] || currentRole}
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {isProfileMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 z-50 text-xs">
              <div className="px-3 py-2 border-b border-slate-100">
                <div className="font-semibold text-slate-900 truncate">{currentUser?.employee_name}</div>
                <div className="text-[11px] text-slate-500 truncate">{currentUser?.email}</div>
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  <User className="h-3 w-3" />
                  <span>{roleLabels[currentRole] || currentRole}</span>
                </div>
              </div>

              {currentRole === 'super_admin' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false)
                    setIsVipModalOpen(true)
                  }}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Crown className="h-3.5 w-3.5 text-amber-600" />
                  <span>Role &amp; Module Customizer</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsProfileMenuOpen(false)
                  onOpenSettings()
                }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Database className="h-3.5 w-3.5 text-slate-500" />
                <span>System &amp; Cloud Sync</span>
              </button>

              <div className="my-1 border-t border-slate-100" />

              <button
                type="button"
                onClick={() => {
                  setIsProfileMenuOpen(false)
                  logout()
                }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-rose-600 hover:bg-rose-50 font-medium cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <VipAdminCustomizerModal
        isOpen={isVipModalOpen}
        onClose={() => setIsVipModalOpen(false)}
      />
    </header>
  )
}
