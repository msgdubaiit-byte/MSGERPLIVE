import React, { useState, useEffect, useMemo } from 'react'
import {
  Cpu,
  ShieldCheck,
  ShieldAlert,
  Settings,
  FileSpreadsheet,
  Flame,
  Package,
  Wrench,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Database,
  Lock,
  EyeOff,
  Eye,
  KeyRound,
  FileText,
  Truck,
  Sparkles,
  Users,
  Server,
  Layers,
  Save,
  RotateCcw,
  Boxes,
  Tag,
  CheckSquare,
  FileCheck2,
  ShoppingBag,
  History,
  BarChart3,
  FileUp,
  ScrollText,
  Zap,
  Check,
  Crown
} from 'lucide-react'
import { db, SystemCustomConfig } from '../../services/db'
import { useAuth, DEFAULT_ROLE_MODULES, VIP_PRESETS } from '../../context/AuthContext'
import { NavTabId } from '../common/Sidebar'
import { UserRole } from '../../types'
import { VipAdminCustomizerModal, ALL_ERP_MODULES, ModuleItemDef } from '../admin/VipAdminCustomizerModal'

interface ITSystemConfigConsoleProps {
  onNavigateTab: (tab: NavTabId) => void
}

type ConfigTab =
  | 'branding'
  | 'templates'
  | 'stamp_calibration'
  | 'roles_governance'
  | 'database_backup'
  | 'integrations'
  | 'privacy_redaction'

interface GranularActionPrivilege {
  key: string
  label: string
  category: string
  description: string
  isSecurityCritical?: boolean
}

const GRANULAR_ACTION_PRIVILEGES: GranularActionPrivilege[] = [
  {
    key: 'can_upload_so_pdf',
    label: 'Sales Order PDF Drag-and-Drop Auto-Parse',
    category: 'Orders & Commercial',
    description: 'Extract customer name, line items, and quantities from PO scans'
  },
  {
    key: 'can_create_orders',
    label: 'Create & Edit Sales Orders',
    category: 'Orders & Commercial',
    description: 'Manually create orders, update line positions, and modify customer references'
  },
  {
    key: 'can_storekeeper_approve',
    label: 'Storekeeper Fast-Track Release & Approvals',
    category: 'Warehouse & Yard',
    description: 'Authorize physical release of allocated stock and release goods for dispatch'
  },
  {
    key: 'can_local_purchase_split',
    label: 'Local Purchase Allocation & Exact PCS Splitting',
    category: 'Warehouse & Yard',
    description: 'Split line items across local suppliers and allocate exact piece quantities'
  },
  {
    key: 'can_export_client_summary',
    label: 'Client Summary (.xlsx) Export',
    category: 'Export Deliverables',
    description: 'Download official customer-facing Excel sheet with clean layout'
  },
  {
    key: 'can_export_stores_summary',
    label: 'Internal Stores Sheet (11-Column .xlsx) Export',
    category: 'Export Deliverables',
    description: 'Download internal operations sheet with heat numbers and warehouse bay details'
  },
  {
    key: 'can_export_cipl',
    label: 'CIPL Logistics Workbook (Commercial Invoice & Packing List)',
    category: 'Export Deliverables',
    description: 'Export multi-sheet workbook with HS codes, net weights, and dimensions'
  },
  {
    key: 'can_export_supplier_po',
    label: 'Supplier POs (.zip) Generation',
    category: 'Export Deliverables',
    description: 'Auto-generate and download zip archive of supplier purchase orders'
  },
  {
    key: 'can_stamp_mtc',
    label: 'MTC Inspection Quality Stamp & Seal Endorsement',
    category: 'Quality Assurance',
    description: 'Digitally stamp and verify EN 10204 3.1 mill test certificates'
  },
  {
    key: 'can_generate_stickers',
    label: 'QR Code Thermal Yard Stickers',
    category: 'Warehouse & Yard',
    description: 'Generate 58mm x 39mm waterproof barcode yard labels'
  },
  {
    key: 'can_view_prices',
    label: 'Commercial Financial Data Visibility',
    category: 'Security & Privacy',
    description: 'View unmasked customer rates, unit prices, and contract values (Unchecked = Masked)',
    isSecurityCritical: true
  },
  {
    key: 'can_backup_database',
    label: 'Full Database JSON Backup & Restore Rights',
    category: 'Security & Privacy',
    description: 'Export or import complete ERP database snapshots',
    isSecurityCritical: true
  }
]

export const ITSystemConfigConsole: React.FC<ITSystemConfigConsoleProps> = ({ onNavigateTab }) => {
  const {
    currentUser,
    currentRole,
    customPermissions,
    updateCustomPermissions,
    getAllowedModulesForTarget
  } = useAuth()

  const [activeTab, setActiveTab] = useState<ConfigTab>('roles_governance')
  const [config, setConfig] = useState<SystemCustomConfig>(() => db.getSystemConfig())
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState(() => db.getSystemDiagnostics())
  const [isVipModalOpen, setIsVipModalOpen] = useState(false)

  // Real-time user list
  const users = db.getUsers()

  // Target selection for RBAC Matrix (Role vs Individual Employee)
  const [targetType, setTargetType] = useState<'role' | 'user'>('role')
  const [selectedRole, setSelectedRole] = useState<UserRole>('sales_team')
  const [selectedUserId, setSelectedUserId] = useState<string>(() => users[0]?.id || '')

  const currentTargetKey = targetType === 'role' ? selectedRole : selectedUserId

  // Local state for module checkboxes of currently selected target
  const [targetModules, setTargetModules] = useState<string[]>(() => {
    return getAllowedModulesForTarget(targetType === 'role' ? selectedRole : selectedUserId)
  })

  // Feature action permissions storage
  const [featurePermissions, setFeaturePermissions] = useState<Record<string, Record<string, boolean>>>(() => {
    const saved = localStorage.getItem('msg_custom_feature_permissions')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return {}
      }
    }
    return {}
  })

  // When selected target changes, load their active modules
  useEffect(() => {
    const key = targetType === 'role' ? selectedRole : selectedUserId
    setTargetModules(getAllowedModulesForTarget(key))
  }, [targetType, selectedRole, selectedUserId, customPermissions])

  // Reload diagnostics periodically or on config change
  useEffect(() => {
    setDiagnostics(db.getSystemDiagnostics())
  }, [config])

  const handleSaveConfig = () => {
    db.updateSystemConfig(config, currentUser?.email || 'it.engineer@msgoilfield.ae')
    setStatusNotice('System custom configuration saved successfully across the ERP platform!')
    setTimeout(() => setStatusNotice(null), 4000)
  }

  const handleExportBackup = () => {
    const jsonStr = db.exportFullDatabaseJSON()
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `msg-oilfield-erp-backup-${new Date().toISOString().substring(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setStatusNotice('Full database JSON backup downloaded successfully!')
    setTimeout(() => setStatusNotice(null), 4000)
  }

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        const res = db.importFullDatabaseJSON(content, currentUser?.email || 'it.engineer@msgoilfield.ae')
        if (res.success) {
          setConfig(db.getSystemConfig())
          setDiagnostics(db.getSystemDiagnostics())
          setStatusNotice(res.message)
        } else {
          alert(res.message)
        }
      } catch (err: any) {
        alert('Failed to read file: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Toggle single module for selected target
  const handleToggleModule = (moduleId: string) => {
    setTargetModules(prev => {
      if (prev.includes(moduleId)) {
        return prev.filter(m => m !== moduleId)
      } else {
        return [...prev, moduleId]
      }
    })
  }

  // Toggle single action privilege
  const handleToggleActionPrivilege = (privilegeKey: string) => {
    setFeaturePermissions(prev => {
      const targetMap = prev[currentTargetKey] ? { ...prev[currentTargetKey] } : {}
      const currentVal = targetMap[privilegeKey] !== undefined ? targetMap[privilegeKey] : true
      targetMap[privilegeKey] = !currentVal
      const next = { ...prev, [currentTargetKey]: targetMap }
      localStorage.setItem('msg_custom_feature_permissions', JSON.stringify(next))
      return next
    })
  }

  const isActionPrivilegeEnabled = (privilegeKey: string): boolean => {
    if (featurePermissions[currentTargetKey] && featurePermissions[currentTargetKey][privilegeKey] !== undefined) {
      return featurePermissions[currentTargetKey][privilegeKey]
    }
    // Default: for it_engineer, price visibility is false
    if (currentTargetKey === 'it_engineer' && privilegeKey === 'can_view_prices') {
      return false
    }
    return true
  }

  // Apply custom modules & feature privileges in 1 click
  const handleApplyPermissions = () => {
    updateCustomPermissions(currentTargetKey, targetModules)
    db.logAudit(
      currentUser?.email || 'it.engineer@msgoilfield.ae',
      'Update Granular RBAC Permissions',
      'IT Administration',
      currentTargetKey,
      null,
      { modulesCount: targetModules.length, target: currentTargetKey }
    )
    setStatusNotice(`✓ Permissions successfully updated for ${currentTargetKey}! Active immediately across ERP without touching code.`)
    setTimeout(() => setStatusNotice(null), 4000)
  }

  // Quick preset buttons
  const handleApplyPresetAll = () => {
    const allIds = ALL_ERP_MODULES.map(m => m.id)
    setTargetModules(allIds)
  }

  const handleApplyPresetSolo = () => {
    setTargetModules(['solo_hub', 'orders', 'sourcing', 'stock', 'stickers', 'local_purchase'])
  }

  const handleResetTargetToDefault = () => {
    if (targetType === 'role') {
      const defs = DEFAULT_ROLE_MODULES[selectedRole] || []
      setTargetModules(defs)
    } else {
      const u = users.find(x => x.id === selectedUserId)
      const defs = u ? DEFAULT_ROLE_MODULES[u.role] || [] : []
      setTargetModules(defs)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* Top Banner: IT Systems Engineer Control Header */}
      <div className="bg-gradient-to-r from-slate-950 via-[#111c33] to-indigo-950 text-white rounded-2xl p-6 sm:p-7 shadow-xl border border-indigo-900/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
              <span className="bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-black text-[11px] px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center space-x-1 shadow-sm">
                <Cpu className="h-3 w-3 fill-current" />
                <span>IT Engineer Software Config</span>
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                <ShieldCheck className="h-3 w-3" />
                <span>Zero Business Data Access Policy Active</span>
              </span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                All Commercial Prices Masked
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center space-x-2">
              <span>IT Systems Architecture &amp; Customization Console</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              Configures software parameters, branding, quality stamp offsets, document publication templates, database backups, and RBAC governance. Sensitive financial data and commercial margins are strictly protected.
            </p>
          </div>

          {/* Quick IT Health Metrics */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-center min-w-[85px]">
              <div className="text-[10px] font-semibold text-slate-400">Total Records</div>
              <div className="text-lg font-black text-indigo-400 font-mono">
                {diagnostics.totalLots + diagnostics.totalOrders}
              </div>
            </div>
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-center min-w-[85px]">
              <div className="text-[10px] font-semibold text-slate-400">MTC Verified</div>
              <div className="text-lg font-black text-emerald-400 font-mono">
                {diagnostics.verifiedMTCs}/{diagnostics.totalMTCs}
              </div>
            </div>
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-center min-w-[85px]">
              <div className="text-[10px] font-semibold text-slate-400">System Health</div>
              <div className="text-xs font-bold text-emerald-300 font-mono mt-1">100% PASS</div>
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

      {/* Zero Data Access Security Warning Card */}
      <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex items-start space-x-3 text-xs text-indigo-950 shadow-sm">
        <Lock className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-extrabold text-indigo-900 flex items-center space-x-1.5">
            <span>Commercial Data Privacy Protection Active</span>
            <span className="bg-indigo-200 text-indigo-900 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">Confidentiality Rule #IT-SEC-4</span>
          </div>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            As an IT Systems Engineer, you have complete administrative authorization to configure software behavior, database schemas, stamp placement, document templates, and API integrations. Commercial customer prices, margins, order values, and billing records are automatically obscured (<code className="bg-indigo-100 text-indigo-900 px-1 py-0.5 rounded font-mono font-bold">•••••• [CONFIDENTIAL]</code>) to safeguard commercial secrecy.
          </p>
        </div>
      </div>

      {/* Tab Navigation Navigation Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 border-b border-slate-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('roles_governance')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'roles_governance'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>User Roles &amp; Granular Permissions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('branding')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'branding'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>Branding &amp; Company Defaults</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'templates'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          <span>Document &amp; Deliverables Customizer</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stamp_calibration')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'stamp_calibration'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Flame className="h-3.5 w-3.5 text-orange-400" />
          <span>MTC Quality Stamp Calibrator</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('database_backup')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'database_backup'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          <span>Database Backup &amp; Health</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('integrations')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'integrations'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Server className="h-3.5 w-3.5" />
          <span>APIs &amp; Integrations</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('privacy_redaction')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'privacy_redaction'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <EyeOff className="h-3.5 w-3.5 text-amber-500" />
          <span>Data Privacy Simulator</span>
        </button>
      </div>

      {/* TAB 1: ROLES GOVERNANCE & GRANULAR PERMISSIONS MATRIX */}
      {activeTab === 'roles_governance' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-indigo-600" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  Universal Granular Permission Matrix (Live UI Access Control)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Grant or revoke access to any module or feature line in real-time. Changes apply instantly without touching code or redeploying.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsVipModalOpen(true)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Crown className="h-4 w-4" />
                <span>Open VIP Visual Customizer</span>
              </button>

              <button
                type="button"
                onClick={handleApplyPermissions}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-md"
              >
                <Check className="h-4 w-4 stroke-[2.5]" />
                <span>Save &amp; Apply Access Immediately</span>
              </button>
            </div>
          </div>

          {/* Target Mode Selector: Role vs Specific User */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-4 text-xs font-bold">
                <span className="text-slate-500 uppercase tracking-wider text-[11px]">Configure Access For:</span>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="targetType"
                    checked={targetType === 'role'}
                    onChange={() => setTargetType('role')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>By Corporate Role</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="targetType"
                    checked={targetType === 'user'}
                    onChange={() => setTargetType('user')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>By Specific Employee</span>
                </label>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap">
                <button
                  type="button"
                  onClick={handleApplyPresetAll}
                  className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg cursor-pointer"
                >
                  ⚡ Select All 21 Modules
                </button>
                <button
                  type="button"
                  onClick={handleApplyPresetSolo}
                  className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 rounded-lg cursor-pointer"
                >
                  ★ Solo Hub Preset
                </button>
                <button
                  type="button"
                  onClick={handleResetTargetToDefault}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3 inline mr-1" />
                  Reset to Default
                </button>
              </div>
            </div>

            {/* Target Select Dropdown / Buttons */}
            {targetType === 'role' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                {(
                  [
                    { role: 'sales_team', label: 'Commercial Sales' },
                    { role: 'storekeeper', label: 'Storekeeper / Yard' },
                    { role: 'mtc_controller', label: 'QA / MTC Controller' },
                    { role: 'dispatch_team', label: 'Dispatch & Logistics' },
                    { role: 'admin_inventory', label: 'Inventory Manager' },
                    { role: 'management_viewer', label: 'Management Viewer' },
                    { role: 'super_admin', label: 'Super Admin' },
                    { role: 'it_engineer', label: 'IT Systems Engineer' },
                  ] as { role: UserRole; label: string }[]
                ).map(r => (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => setSelectedRole(r.role)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      selectedRole === r.role
                        ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-300 font-bold text-slate-900 shadow-sm'
                        : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="font-bold truncate">{r.label}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {targetType === 'role' && selectedRole === r.role
                        ? `${targetModules.length} modules enabled`
                        : `${getAllowedModulesForTarget(r.role).length} modules`}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                {users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      selectedUserId === u.id
                        ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-300 font-bold text-slate-900 shadow-sm'
                        : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="font-bold truncate">{u.employee_name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{u.email} ({u.role})</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Section 1: Module-by-Module Access Matrix (21 Modules) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-xs text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                <Layers className="h-4 w-4 text-indigo-600" />
                <span>1. ERP Modules Visible to {currentTargetKey} ({targetModules.length} of {ALL_ERP_MODULES.length} Active):</span>
              </h4>
              <span className="text-[11px] font-bold text-indigo-700">
                Click any card to toggle visibility
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              {ALL_ERP_MODULES.map(module => {
                const Icon = module.icon
                const isEnabled = targetModules.includes(module.id)

                return (
                  <div
                    key={module.id}
                    onClick={() => handleToggleModule(module.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-2.5 select-none ${
                      isEnabled
                        ? 'border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50 shadow-xs'
                        : 'border-slate-200 bg-slate-50/40 hover:bg-slate-100/70 opacity-60'
                    }`}
                  >
                    <div className="flex items-start space-x-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{module.label}</div>
                        <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{module.description}</div>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      isEnabled ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isEnabled && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 2: Granular Feature Actions (Line-by-Line Controls) */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-xs text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                <Sliders className="h-4 w-4 text-emerald-600" />
                <span>2. Granular Action Privileges &amp; Operations (Line-by-Line Controls):</span>
              </h4>
              <span className="text-[11px] font-bold text-emerald-700">
                Custom feature authorization
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {GRANULAR_ACTION_PRIVILEGES.map(priv => {
                const isEnabled = isActionPrivilegeEnabled(priv.key)

                return (
                  <div
                    key={priv.key}
                    onClick={() => handleToggleActionPrivilege(priv.key)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-2.5 select-none ${
                      isEnabled
                        ? priv.isSecurityCritical
                          ? 'border-amber-400 bg-amber-50/60'
                          : 'border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50'
                        : 'border-slate-200 bg-slate-50/40 hover:bg-slate-100 opacity-60'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                        <span>{priv.label}</span>
                        {priv.isSecurityCritical && (
                          <span className="bg-amber-200 text-amber-900 text-[9px] font-black px-1.5 py-0.2 rounded font-mono">
                            Security Guard
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">{priv.description}</div>
                      <div className="text-[10px] text-slate-400 font-mono uppercase">{priv.category}</div>
                    </div>

                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      isEnabled
                        ? priv.isSecurityCritical
                          ? 'bg-amber-600 border-amber-600 text-white'
                          : 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}>
                      {isEnabled && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-slate-500 font-medium">
              💡 Permissions persist in local database and apply dynamically across all sessions and worker accounts.
            </span>
            <button
              type="button"
              onClick={handleApplyPermissions}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center space-x-1.5 cursor-pointer ml-auto"
            >
              <Check className="h-4 w-4 stroke-[3]" />
              <span>Apply &amp; Save Permissions Now</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: BRANDING & COMPANY DEFAULTS */}
      {activeTab === 'branding' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Company Identity &amp; System Defaults</h3>
              <p className="text-xs text-slate-500">
                Configure corporate legal name, tax identification, currency, and header styling.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Configuration</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Company Legal Display Name</label>
              <input
                type="text"
                value={config.companyName}
                onChange={e => setConfig({ ...config, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Tax / TRN Registration Number</label>
              <input
                type="text"
                value={config.trnNumber}
                onChange={e => setConfig({ ...config, trnNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Default Base Currency</label>
              <select
                value={config.defaultCurrency}
                onChange={e => setConfig({ ...config, defaultCurrency: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="AED">AED (United Arab Emirates Dirham - Dhs)</option>
                <option value="USD">USD (US Dollar - $)</option>
                <option value="SAR">SAR (Saudi Riyal - SR)</option>
                <option value="EUR">EUR (Euro - €)</option>
                <option value="GBP">GBP (British Pound - £)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Support / Sales Email</label>
              <input
                type="email"
                value={config.contactEmail}
                onChange={e => setConfig({ ...config, contactEmail: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Corporate Physical &amp; Yard Address</label>
              <input
                type="text"
                value={config.companyAddress}
                onChange={e => setConfig({ ...config, companyAddress: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DOCUMENT TEMPLATES & DELIVERABLES CUSTOMIZER */}
      {activeTab === 'templates' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Document Templates &amp; Deliverables Customizer</h3>
              <p className="text-xs text-slate-500">
                Control the layout, numbering, and auto-inference behavior for all publication sheets.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Template Rules</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* CIPL Invoice Prefix */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                <Truck className="h-4 w-4 text-purple-600" />
                <span>CIPL Logistics Settings</span>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Commercial Invoice Number Prefix</label>
                <input
                  type="text"
                  value={config.ciplInvoicePrefix}
                  onChange={e => setConfig({ ...config, ciplInvoicePrefix: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Gross Weight Safety Buffer Factor (%)</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={config.defaultWeightSafetyBuffer}
                  onChange={e => setConfig({ ...config, defaultWeightSafetyBuffer: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Default 15% adds realistic pallet &amp; wooden box tare weight to net fittings weight.
                </span>
              </div>
            </div>

            {/* Yard Sticker Settings */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <span>QR Code Yard Sticker Presets</span>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Default Yard Label Roll Format</label>
                <select
                  value={config.qrStickerFormat}
                  onChange={e => setConfig({ ...config, qrStickerFormat: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold"
                >
                  <option value="thermal_4x6">4" x 6" Heavy Industrial Thermal Label</option>
                  <option value="a4_sheet">A4 Sheet (8 Labels per Sheet)</option>
                  <option value="standard_tag">2" x 1" Metallic Valve / Flange Tie-Tag</option>
                </select>
              </div>
              <div className="pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showMachinedTag}
                    onChange={e => setConfig({ ...config, showMachinedTag: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span className="font-semibold text-slate-700">
                    Auto-flag fabricated/machined fittings with dedicated inspection sticker
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MTC QUALITY STAMP CALIBRATOR */}
      {activeTab === 'stamp_calibration' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">MTC Quality Stamp &amp; Seal Calibrator</h3>
              <p className="text-xs text-slate-500">
                Calibrate X/Y coordinate offsets, stamp dimensions, text, and inspector signature overlays on test certificates.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Stamp Calibration</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
            {/* Sliders & Parameters */}
            <div className="lg:col-span-6 space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Quality Endorsement Stamp Text</label>
                <textarea
                  rows={2}
                  value={config.mtcStampText}
                  onChange={e => setConfig({ ...config, mtcStampText: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Stamp Color</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={config.mtcStampColor}
                      onChange={e => setConfig({ ...config, mtcStampColor: e.target.value })}
                      className="h-8 w-10 border border-slate-300 rounded cursor-pointer"
                    />
                    <span className="font-mono font-bold text-slate-800">{config.mtcStampColor}</span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Inspector / QC Name</label>
                  <input
                    type="text"
                    value={config.mtcInspectorName}
                    onChange={e => setConfig({ ...config, mtcInspectorName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between font-bold text-slate-700 mb-1">
                  <span>Stamp Scale: {config.mtcStampScale}%</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="140"
                  value={config.mtcStampScale}
                  onChange={e => setConfig({ ...config, mtcStampScale: Number(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">X Offset (mm): {config.mtcStampOffsetX}</label>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={config.mtcStampOffsetX}
                    onChange={e => setConfig({ ...config, mtcStampOffsetX: Number(e.target.value) })}
                    className="w-full accent-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Y Offset (mm): {config.mtcStampOffsetY}</label>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={config.mtcStampOffsetY}
                    onChange={e => setConfig({ ...config, mtcStampOffsetY: Number(e.target.value) })}
                    className="w-full accent-indigo-600"
                  />
                </div>
              </div>
            </div>

            {/* Visual Calibration Box */}
            <div className="lg:col-span-6 border-2 border-dashed border-slate-300 rounded-2xl p-4 bg-slate-50 flex flex-col items-center justify-center relative min-h-[280px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 absolute top-3 left-4">
                Live Calibrator Preview (A4 Certificate Canvas)
              </div>

              <div
                style={{
                  transform: `translate(${config.mtcStampOffsetX * 2}px, ${config.mtcStampOffsetY * 2}px) scale(${config.mtcStampScale / 100})`,
                  borderColor: config.mtcStampColor,
                  color: config.mtcStampColor
                }}
                className="p-4 rounded-xl border-3 border-solid bg-white/90 shadow-md max-w-xs text-center transition-transform select-none"
              >
                <div className="font-black text-xs uppercase tracking-wider">{config.companyName}</div>
                <div className="text-[10px] font-extrabold uppercase mt-1 px-1 border-t border-b border-current py-0.5">
                  {config.mtcStampText}
                </div>
                <div className="flex items-center justify-between text-[9px] font-bold mt-2 font-mono">
                  <span>DATE: {new Date().toISOString().substring(0, 10)}</span>
                  <span>QC: {config.mtcInspectorName}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 mt-4 text-center">
                Calibrated coordinates automatically apply during dynamic PDF stamping in the MTC engine.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: DATABASE BACKUP & HEALTH */}
      {activeTab === 'database_backup' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Database Backup, Restore &amp; Health Diagnostics</h3>
              <p className="text-xs text-slate-500">
                1-Click download full database JSON snapshot, restore from file, and verify system integrity.
              </p>
            </div>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Export Card */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-gradient-to-br from-indigo-50/50 to-white space-y-3">
              <div className="flex items-center space-x-2 text-indigo-950 font-bold text-sm">
                <Download className="h-5 w-5 text-indigo-600" />
                <span>1-Click Database Export</span>
              </div>
              <p className="text-xs text-slate-600">
                Exports all items, lots, stock balances, heat numbers, MTC certificates, sales orders, local purchases, and system configs into an encrypted JSON file.
              </p>
              <button
                type="button"
                onClick={handleExportBackup}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download Full Database Backup (.json)</span>
              </button>
            </div>

            {/* Restore Card */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-gradient-to-br from-slate-50 to-white space-y-3">
              <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                <UploadCloud className="h-5 w-5 text-blue-600" />
                <span>Restore Database from Backup</span>
              </div>
              <p className="text-xs text-slate-600">
                Upload a previously saved <code className="font-bold">.json</code> backup to restore all tables and configuration parameters instantly.
              </p>
              <label className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer">
                <UploadCloud className="h-4 w-4 text-blue-300" />
                <span>Browse &amp; Restore Backup File</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Diagnostics Summary Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-slate-100/80 px-4 py-2.5 font-extrabold text-slate-800 uppercase tracking-wider text-[11px] flex items-center justify-between">
              <span>System Integrity &amp; Diagnostic Ledger</span>
              <span className="text-emerald-700 font-mono font-bold">{diagnostics.systemHealth}</span>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">Master Items</span>
                <strong className="text-base text-slate-900">{diagnostics.totalItems}</strong>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">Stock Lots</span>
                <strong className="text-base text-slate-900">{diagnostics.totalLots}</strong>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">Physical Pieces</span>
                <strong className="text-base text-emerald-700">{diagnostics.totalPhysicalPcs} PCS</strong>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">MTC Certificates</span>
                <strong className="text-base text-indigo-700">{diagnostics.totalMTCs}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: APIS & INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">API Keys, Supabase &amp; Webhook Integrations</h3>
              <p className="text-xs text-slate-500">
                Manage cloud database endpoints, SMTP servers, and automated notification webhooks.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('settings')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              <span>Open Supabase Cloud Console &rarr;</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                <Server className="h-4 w-4 text-indigo-600" />
                <span>SMTP Alert Mail Server</span>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">SMTP Host</label>
                <input
                  type="text"
                  placeholder="smtp.office365.com / smtp.gmail.com"
                  defaultValue="smtp.msgoilfield.ae"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Port</label>
                <input
                  type="text"
                  placeholder="587"
                  defaultValue="587"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                <Truck className="h-4 w-4 text-emerald-600" />
                <span>Dispatch Alert Webhook (WhatsApp / SMS)</span>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Webhook Endpoint URL</label>
                <input
                  type="text"
                  placeholder="https://api.whatsapp-gateway.com/v1/messages"
                  defaultValue="https://api.msgoilfield.ae/v1/webhooks/dispatch-notify"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Sends automated delivery note notifications to logistics drivers upon order dispatch release.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: DATA PRIVACY & REDACTION SIMULATOR */}
      {activeTab === 'privacy_redaction' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Data Privacy &amp; Commercial Redaction Simulator</h3>
              <p className="text-xs text-slate-500">
                Visual demonstration of how business confidential figures are masked when IT Engineers inspect workflows.
              </p>
            </div>
            <span className="text-[10px] font-black bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-full border border-emerald-300">
              Active Shield Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* Standard Staff View */}
            <div className="border border-slate-300 rounded-2xl p-4 bg-slate-50/80 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                  <Eye className="h-4 w-4 text-blue-600" />
                  <span>Commercial Sales Staff View</span>
                </div>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">Commercial Access</span>
              </div>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Client:</span>
                  <strong className="text-slate-900">Bahrain STS Co. W.L.L</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Unit Price:</span>
                  <strong className="text-slate-900">AED 155.00 / PC</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Commercial Margin:</span>
                  <strong className="text-emerald-700">28.4% Net Profit</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Order Total:</span>
                  <strong className="text-slate-900">AED 42,500.00</strong>
                </div>
              </div>
            </div>

            {/* IT Systems Engineer View (Masked) */}
            <div className="border-2 border-indigo-300 rounded-2xl p-4 bg-indigo-50/50 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-indigo-200">
                <div className="font-extrabold text-indigo-950 flex items-center space-x-1.5">
                  <EyeOff className="h-4 w-4 text-indigo-600" />
                  <span>IT Systems Engineer View (Current)</span>
                </div>
                <span className="bg-indigo-200 text-indigo-900 text-[10px] font-bold px-2 py-0.5 rounded">Confidential Protected</span>
              </div>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Client:</span>
                  <strong className="text-slate-900">Bahrain STS Co. W.L.L</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans">Unit Price:</span>
                  <span className="bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 rounded text-[11px]">•••••• [RESTRICTED]</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans">Commercial Margin:</span>
                  <span className="bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 rounded text-[11px]">•••••• [RESTRICTED]</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans">Order Total:</span>
                  <span className="bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 rounded text-[11px]">•••••• [RESTRICTED]</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visual VIP Customizer Modal */}
      <VipAdminCustomizerModal
        isOpen={isVipModalOpen}
        onClose={() => setIsVipModalOpen(false)}
        onSuccessNotification={(msg) => {
          setStatusNotice(msg)
          setTimeout(() => setStatusNotice(null), 4000)
        }}
      />

    </div>
  )
}
