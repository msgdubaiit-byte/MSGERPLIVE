import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard,
  Package,
  Boxes,
  Flame,
  FileSpreadsheet,
  CheckSquare,
  FileCheck2,
  Truck,
  RotateCcw,
  BarChart3,
  FileUp,
  Users,
  ScrollText,
  Settings,
  ShoppingBag,
  History,
  Layers,
  FileDown,
  Tag,
  Sparkles,
  Crown,
  Zap,
  Cpu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { db } from '../../services/db'
import { VipAdminCustomizerModal } from '../admin/VipAdminCustomizerModal'

export type NavTabId =
  | 'solo_hub'
  | 'it_console'
  | 'dashboard'
  | 'stock'
  | 'items'
  | 'traceability'
  | 'orders'
  | 'allocation'
  | 'sourcing'
  | 'loc'
  | 'stickers'
  | 'approvals'
  | 'mtc'
  | 'local_purchase'
  | 'dispatch'
  | 'movements'
  | 'returns'
  | 'reports'
  | 'excel'
  | 'users'
  | 'audit'
  | 'settings'

interface SidebarProps {
  activeTab: NavTabId
  onTabChange: (tab: NavTabId) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

interface NavItemDef {
  id: NavTabId
  label: string
  icon: any
  badge?: number
}

interface NavGroupDef {
  title: string
  items: NavItemDef[]
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, collapsed = false, onToggleCollapse }) => {
  const { canAccessModule, currentUser } = useAuth()
  const [isVipModalOpen, setIsVipModalOpen] = useState(false)
  const orders = db.getOrders()
  const pendingApprovalsCount = orders.filter(o => o.status === 'Pending Storekeeper Approval').length
  const pendingMTCCount = orders.filter(o => o.status === 'Approved' && !o.mtc_package_generated).length

  const navGroups: NavGroupDef[] = [
    {
      title: 'Workspace',
      items: [
        { id: 'solo_hub', label: 'Operations Hub', icon: Zap },
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'Inventory',
      items: [
        { id: 'items', label: 'Item Master', icon: Boxes },
        { id: 'stock', label: 'Master Stock', icon: Package },
        { id: 'traceability', label: 'Heat Traceability', icon: Flame },
        { id: 'movements', label: 'Stock Movements', icon: History },
        { id: 'returns', label: 'Returns & Adjustments', icon: RotateCcw },
      ],
    },
    {
      title: 'Sales & Fulfillment',
      items: [
        { id: 'orders', label: 'Sales Orders', icon: FileSpreadsheet },
        { id: 'allocation', label: 'Stock Allocation', icon: Layers },
        { id: 'sourcing', label: 'Sourcing & CIPL', icon: FileDown },
        { id: 'dispatch', label: 'Dispatch & Delivery', icon: Truck },
      ],
    },
    {
      title: 'Procurement & QA',
      items: [
        { id: 'approvals', label: 'Storekeeper Gate', icon: CheckSquare, badge: pendingApprovalsCount },
        { id: 'mtc', label: 'MTC Certificates', icon: FileCheck2, badge: pendingMTCCount },
        { id: 'local_purchase', label: 'Local Purchases', icon: ShoppingBag },
        { id: 'loc', label: 'LOC & Material Tags', icon: Tag },
        { id: 'stickers', label: 'Barcode Stickers', icon: Sparkles },
      ],
    },
    {
      title: 'Reports & Data',
      items: [
        { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
        { id: 'excel', label: 'Import / Export', icon: FileUp },
      ],
    },
    {
      title: 'Administration',
      items: [
        { id: 'it_console', label: 'IT System Config', icon: Cpu },
        { id: 'users', label: 'Users & Roles', icon: Users },
        { id: 'audit', label: 'Audit Logs', icon: ScrollText },
        { id: 'settings', label: 'System Settings', icon: Settings },
      ],
    },
  ]

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-56 lg:w-60'
        } bg-[#1F2437] text-slate-300 flex flex-col border-r border-slate-800 shrink-0 transition-all duration-200`}
    >
      {/* Brand Bar */}
      <div className={`h-14 border-b border-white/10 flex items-center gap-2 shrink-0 ${collapsed ? 'px-2 justify-center' : 'px-3 justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-md bg-white p-1 flex items-center justify-center shrink-0">
              <img
                src="/logo.png"
                alt="MSG"
                className="h-6 w-auto object-contain"
                onError={(e) => {
                  ; (e.target as HTMLElement).style.display = 'none'
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold tracking-wide text-white truncate">MSG Oilfield ERP</div>
              <div className="text-[10px] text-slate-400 truncate">Inventory &amp; Traceability</div>
            </div>
          </div>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Grouped Zoho-style Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((it) => canAccessModule(it.id))
          if (visibleItems.length === 0) return null

          return (
            <div key={group.title}>
              {!collapsed && (
                <div className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400/80">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeTab === item.id

                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={collapsed ? item.label : undefined}
                      onClick={() => onTabChange(item.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs transition-colors cursor-pointer ${isActive
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-white/10 font-medium'
                        }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </div>
                      {!collapsed && item.badge !== undefined && item.badge > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold tabular-nums shrink-0 ${isActive ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-300'
                            }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {currentUser?.role === 'super_admin' && !collapsed && (
          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setIsVipModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Crown className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="truncate">Module Permissions</span>
            </button>
          </div>
        )}
      </nav>

      {/* Clean Connection Footer */}
      <div className="px-3 py-2.5 bg-[#181C2B] border-t border-white/10 text-[10px] text-slate-400">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {!collapsed && <span>Backend Synced</span>}
          </span>
          {!collapsed && <span className="text-slate-500">v2.0</span>}
        </div>
      </div>

      <VipAdminCustomizerModal isOpen={isVipModalOpen} onClose={() => setIsVipModalOpen(false)} />
    </aside>
  )
}
