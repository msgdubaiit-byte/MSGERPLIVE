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
  Crown,
  Building2,
  Plus,
  Search,
  Trash2,
  UserPlus,
  UserCheck,
  UserX,
  Edit3,
  Image as ImageIcon
} from 'lucide-react'
import { db, SystemCustomConfig } from '../../services/db'
import { useAuth, DEFAULT_ROLE_MODULES, VIP_PRESETS } from '../../context/AuthContext'
import { NavTabId } from '../common/Sidebar'
import { UserRole, Supplier, UserProfile } from '../../types'
import { VipAdminCustomizerModal, ALL_ERP_MODULES, ModuleItemDef } from '../admin/VipAdminCustomizerModal'
import {
  getSupabaseEnvConfig,
  testSupabaseConnection,
  isSupabaseConfigured
} from '../../services/supabase'

interface ITSystemConfigConsoleProps {
  onNavigateTab: (tab: NavTabId) => void
}

type ConfigTab =
  | 'branding'
  | 'templates'
  | 'stamp_calibration'
  | 'suppliers_catalog'
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

  // Real-time user list & provisioning state
  const [users, setUsers] = useState<UserProfile[]>(() => db.getUsers())
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [userFilterRole, setUserFilterRole] = useState<string>('all')
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [userFormData, setUserFormData] = useState<{
    employee_name: string
    email: string
    department: string
    role: UserRole
    account_status: 'Active' | 'Inactive' | 'Suspended'
    password?: string
  }>({
    employee_name: '',
    email: '',
    department: 'Commercial Sales',
    role: 'sales_team',
    account_status: 'Active',
    password: ''
  })

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

  // Suppliers state & management
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => db.getSuppliers())
  const [supplierSearch, setSupplierSearch] = useState('')
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false)
  const [newSupplierForm, setNewSupplierForm] = useState<Partial<Supplier>>({
    supplier_name: '',
    supplier_code: '',
    country: 'United Arab Emirates',
    make: '',
    supplier_type: 'local_stockist',
    approved_status: 'Approved',
    contact_person: '',
    contact_email: '',
    contact_phone: ''
  })

  // Subscribe to DB updates for suppliers and users
  useEffect(() => {
    const unsub = db.subscribe(() => {
      setSuppliers(db.getSuppliers())
      setUsers(db.getUsers())
    })
    return unsub
  }, [])

  // User management actions
  const handleOpenAddUser = () => {
    setEditingUserId(null)
    setUserFormData({
      employee_name: '',
      email: '',
      department: 'Commercial Sales',
      role: 'sales_team',
      account_status: 'Active',
      password: ''
    })
    setIsUserModalOpen(true)
  }

  const handleOpenEditUser = (u: UserProfile) => {
    setEditingUserId(u.id)
    setUserFormData({
      employee_name: u.employee_name,
      email: u.email,
      department: u.department,
      role: u.role,
      account_status: u.account_status,
      password: ''
    })
    setIsUserModalOpen(true)
  }

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!userFormData.employee_name.trim() || !userFormData.email.trim()) {
      alert('Please fill in Employee Name and Corporate Email.')
      return
    }

    if (editingUserId) {
      db.updateUser(editingUserId, {
        employee_name: userFormData.employee_name.trim(),
        email: userFormData.email.trim().toLowerCase(),
        department: userFormData.department.trim(),
        role: userFormData.role,
        account_status: userFormData.account_status,
      }, 'it.engineer@msgoilfield.ae')
      setStatusNotice(`Account for "${userFormData.employee_name}" updated successfully!`)
    } else {
      const newUser = db.addUser({
        employee_name: userFormData.employee_name.trim(),
        email: userFormData.email.trim().toLowerCase(),
        department: userFormData.department.trim(),
        role: userFormData.role,
        account_status: userFormData.account_status,
      }, 'it.engineer@msgoilfield.ae')
      setStatusNotice(`New account ${newUser.id} (${newUser.employee_name}) provisioned successfully!`)
      setSelectedUserId(newUser.id)
      setTargetType('user')
    }

    setIsUserModalOpen(false)
    setTimeout(() => setStatusNotice(null), 5000)
  }

  const handleToggleUserStatus = (u: UserProfile) => {
    const nextStatus = u.account_status === 'Active' ? 'Suspended' : 'Active'
    db.updateUser(u.id, { account_status: nextStatus }, 'it.engineer@msgoilfield.ae')
    setStatusNotice(`Employee ${u.employee_name} status updated to ${nextStatus}.`)
    setTimeout(() => setStatusNotice(null), 4000)
  }

  const handleDeleteUserAccount = (u: UserProfile) => {
    if (u.id === 'USR-001') {
      alert('Root IT Administrator account (USR-001) cannot be deleted.')
      return
    }
    if (confirm(`Are you sure you want to delete employee account "${u.employee_name}" (${u.email})?`)) {
      db.deleteUser(u.id, 'it.engineer@msgoilfield.ae')
      setStatusNotice(`Employee account ${u.employee_name} deleted.`)
      setTimeout(() => setStatusNotice(null), 4000)
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch =
        u.employee_name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        u.department.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        u.id.toLowerCase().includes(userSearchQuery.toLowerCase())
      const matchesRole = userFilterRole === 'all' || u.role === userFilterRole
      return matchesSearch && matchesRole
    })
  }, [users, userSearchQuery, userFilterRole])

  // Supabase Cloud Environment State (configured via .env, read-only in UI)
  const supabaseEnvUrl = getSupabaseEnvConfig().url
  const [isSupabaseOnline, setIsSupabaseOnline] = useState(() => isSupabaseConfigured())
  const [isTestingSupabase, setIsTestingSupabase] = useState(false)
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false)
  const [supabaseTestMsg, setSupabaseTestMsg] = useState<string | null>(null)

  const handleTestSupabase = async () => {
    setIsTestingSupabase(true)
    const res = await testSupabaseConnection()
    setIsTestingSupabase(false)
    setSupabaseTestMsg(res.message)
    setIsSupabaseOnline(res.success)
    if (res.success) {
      setStatusNotice('Supabase environment credentials verified! Connected to PostgreSQL & Storage.')
    } else {
      setStatusNotice('Supabase connection notice: ' + res.message)
    }
    setTimeout(() => setStatusNotice(null), 5000)
  }

  const handlePushAllToSupabase = async () => {
    setIsSyncingSupabase(true)
    const res = await db.syncToSupabase()
    setIsSyncingSupabase(false)
    setStatusNotice(res.message)
    setTimeout(() => setStatusNotice(null), 6000)
  }

  const handlePullAllFromSupabase = async () => {
    setIsSyncingSupabase(true)
    const res = await db.pullFromSupabase()
    setIsSyncingSupabase(false)
    setStatusNotice(res.message)
    setTimeout(() => setStatusNotice(null), 5000)
  }

  const handleDownloadSupabaseSQL = () => {
    // Generate blob directly from schema
    const a = document.createElement('a')
    a.href = '/src/supabase/supabase_setup_full.sql'
    a.download = 'supabase_msg_oilfield_setup.sql'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setStatusNotice('Supabase full migration SQL downloaded! Run it in your Supabase SQL Editor.')
    setTimeout(() => setStatusNotice(null), 4000)
  }

  const handlePreloadSuppliers = () => {
    const res = db.preloadAllStandardSuppliers(currentUser?.email || 'it.engineer@msgoilfield.ae')
    setSuppliers(db.getSuppliers())
    setStatusNotice(res.message)
    setTimeout(() => setStatusNotice(null), 5000)
  }

  const handleBulkSupplierFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = reader.result as string
        let importedList: Partial<Supplier>[] = []
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text)
          importedList = Array.isArray(parsed) ? parsed : (parsed.suppliers || [])
        } else {
          // CSV Parser
          const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
            if (cols.length < 2) continue
            const supp: Partial<Supplier> = {
              supplier_name: cols[0],
              supplier_code: cols[1] || cols[0].slice(0, 6).toUpperCase(),
              country: cols[2] || 'United Arab Emirates',
              make: cols[3] || cols[0],
              supplier_type: (cols[4]?.toLowerCase().includes('mill') ? 'mill_manufacturer' : 'local_stockist') as any,
              approved_status: 'Approved',
              contact_person: cols[5] || '',
              contact_email: cols[6] || '',
              contact_phone: cols[7] || ''
            }
            importedList.push(supp)
          }
        }
        if (importedList.length > 0) {
          const res = db.importSuppliersBulk(importedList, currentUser?.email || 'it.engineer@msgoilfield.ae')
          setSuppliers(db.getSuppliers())
          setStatusNotice(res.message)
        } else {
          setStatusNotice('No valid supplier rows found in file.')
        }
      } catch (err: any) {
        setStatusNotice('Error parsing supplier file: ' + err.message)
      }
      setTimeout(() => setStatusNotice(null), 5000)
    }
    reader.readAsText(file)
  }

  const handleAddSingleSupplier = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSupplierForm.supplier_name) return
    db.addSupplier(newSupplierForm, currentUser?.email || 'it.engineer@msgoilfield.ae')
    setSuppliers(db.getSuppliers())
    setIsAddSupplierOpen(false)
    setNewSupplierForm({
      supplier_name: '',
      supplier_code: '',
      country: 'United Arab Emirates',
      make: '',
      supplier_type: 'local_stockist',
      approved_status: 'Approved',
      contact_person: '',
      contact_email: '',
      contact_phone: ''
    })
    setStatusNotice(`Supplier "${newSupplierForm.supplier_name}" registered successfully!`)
    setTimeout(() => setStatusNotice(null), 4000)
  }

  const handleSealImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setConfig(prev => ({ ...prev, customSealDataUrl: dataUrl, sealShape: 'custom_image' }))
      setStatusNotice('Official company seal image uploaded! Live preview updated.')
      setTimeout(() => setStatusNotice(null), 4000)
    }
    reader.readAsDataURL(file)
  }

  const handleSignatureImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setConfig(prev => ({ ...prev, customSignatureDataUrl: dataUrl }))
      setStatusNotice('Inspector signature image uploaded! Live preview updated.')
      setTimeout(() => setStatusNotice(null), 4000)
    }
    reader.readAsDataURL(file)
  }

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

  // Toggle single action privilege and persist to backend
  const handleToggleActionPrivilege = (privilegeKey: string) => {
    setFeaturePermissions(prev => {
      const targetMap = prev[currentTargetKey] ? { ...prev[currentTargetKey] } : {}
      const currentVal = targetMap[privilegeKey] !== undefined ? targetMap[privilegeKey] : true
      targetMap[privilegeKey] = !currentVal
      const next = { ...prev, [currentTargetKey]: targetMap }
      localStorage.setItem('msg_custom_feature_permissions', JSON.stringify(next))
      const enabledKeys = Object.entries(targetMap).filter(([, v]) => v).map(([k]) => k)
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('msg_auth_token') : null
      if (token) {
        fetch(`/api/permissions/${encodeURIComponent(currentTargetKey)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ granular_features: enabledKeys }),
        }).catch(() => {})
      }
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
      <div className="bg-white text-slate-900 rounded-lg p-5 shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-[11px] px-2.5 py-0.5 rounded-full flex items-center space-x-1">
                <Cpu className="h-3 w-3" />
                <span>IT Engineer Software Config</span>
              </span>
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center space-x-1">
                <ShieldCheck className="h-3 w-3" />
                <span>Zero Business Data Access Policy Active</span>
              </span>
              <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium px-2 py-0.5 rounded-full">
                All Commercial Prices Masked
              </span>
            </div>

            <h1 className="text-lg font-semibold text-slate-900">
              IT Systems Architecture &amp; Customization Console
            </h1>
            <p className="text-xs text-slate-500 max-w-3xl">
              Configures software parameters, branding, quality stamp offsets, document publication templates, database backups, and RBAC governance. Sensitive financial data and commercial margins are strictly protected.
            </p>
          </div>

          {/* Quick IT Health Metrics */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap tabular-nums">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-center min-w-[90px]">
              <div className="text-[10px] font-medium text-slate-500">Total Records</div>
              <div className="text-base font-semibold text-slate-900 font-mono">
                {diagnostics.totalLots + diagnostics.totalOrders}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-center min-w-[90px]">
              <div className="text-[10px] font-medium text-slate-500">MTC Verified</div>
              <div className="text-base font-semibold text-emerald-700 font-mono">
                {diagnostics.verifiedMTCs}/{diagnostics.totalMTCs}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-center min-w-[90px]">
              <div className="text-[10px] font-medium text-slate-500">System Health</div>
              <div className="text-xs font-semibold text-emerald-700 font-mono mt-1">100% PASS</div>
            </div>
          </div>
        </div>

        {statusNotice && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs font-medium text-emerald-800 flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-emerald-600 hover:text-emerald-900 text-xs font-semibold px-2 py-0.5 rounded cursor-pointer"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* Zero Data Access Security Warning Card */}
      <div className="bg-white border border-l-4 border-slate-200 border-l-blue-600 rounded-lg p-4 flex items-start space-x-3 text-xs text-slate-800 shadow-xs">
        <Lock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-slate-900 flex items-center space-x-2">
            <span>Commercial Data Privacy Protection Active</span>
            <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] px-1.5 py-0.5 rounded font-mono">Confidentiality Rule #IT-SEC-4</span>
          </div>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            As an IT Systems Engineer, you have administrative authorization to configure software behavior, database schemas, stamp placement, document templates, and API integrations. Commercial customer prices, margins, order values, and billing records are automatically obscured (<code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono font-semibold">•••••• [CONFIDENTIAL]</code>) to safeguard commercial secrecy.
          </p>
        </div>
      </div>

      {/* Tab Navigation Bar */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1.5 border-b border-slate-200 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('roles_governance')}
          className={`px-3.5 py-2 rounded-md transition-colors flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'roles_governance'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
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
          <span>MTC Seal &amp; Stamp Calibrator</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('suppliers_catalog')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'suppliers_catalog'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="h-3.5 w-3.5 text-blue-500" />
          <span>Approved Suppliers &amp; Pre-Upload</span>
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

          {/* SECTION A: ENTERPRISE STAFF ROSTER & USER ACCOUNT PROVISIONING (IT ADMIN ROOT AUTHORITY) */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <UserPlus className="h-5 w-5 text-indigo-600" />
                  <h4 className="font-extrabold text-sm text-slate-900">
                    Enterprise Staff Accounts &amp; User Provisioning Hub
                  </h4>
                  <span className="bg-indigo-100 text-indigo-900 text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-200">
                    IT Engineer Authority
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  As the primary Root IT Administrator, you create and provision employee accounts, assign department roles, set passwords, and manage permissions.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddUser}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer shadow-md self-start sm:self-auto shrink-0"
              >
                <UserPlus className="h-4 w-4" />
                <span>+ Provision New Employee Account</span>
              </button>
            </div>

            {/* Quick Stats & Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-700 font-bold">
                  Total Staff: <strong className="text-indigo-600">{users.length}</strong>
                </span>
                <span className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-700 font-bold">
                  Active: <strong className="text-emerald-600">{users.filter(u => u.account_status === 'Active').length}</strong>
                </span>
                <span className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-700 font-bold">
                  Suspended: <strong className="text-rose-600">{users.filter(u => u.account_status !== 'Active').length}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2 flex-1 md:max-w-md">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search name, email, department..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                </div>
                <select
                  value={userFilterRole}
                  onChange={(e) => setUserFilterRole(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Roles ({users.length})</option>
                  <option value="sales_team">Commercial Sales</option>
                  <option value="storekeeper">Storekeeper / Yard</option>
                  <option value="mtc_controller">QA / MTC Controller</option>
                  <option value="dispatch_team">Dispatch Team</option>
                  <option value="admin_inventory">Inventory Admin</option>
                  <option value="management_viewer">Management Viewer</option>
                  <option value="it_engineer">IT Systems Engineer</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
            </div>

            {/* Employee Accounts Roster Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/90 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">ID &amp; Employee Name</th>
                    <th className="py-2.5 px-3">Corporate Email</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3">Assigned Role</th>
                    <th className="py-2.5 px-3">Active Modules</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Last Login</th>
                    <th className="py-2.5 px-3 text-right">IT Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-400">
                        No employees found matching &quot;{userSearchQuery}&quot;
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => {
                      const userActiveModules = getAllowedModulesForTarget(u.id)
                      const isRootIT = u.id === 'USR-001' || u.role === 'it_engineer'

                      return (
                        <tr
                          key={u.id}
                          className={`hover:bg-indigo-50/30 transition-colors ${
                            selectedUserId === u.id && targetType === 'user' ? 'bg-indigo-50/60 font-semibold' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-600">
                                {u.id}
                              </span>
                              <span className="font-bold text-slate-900">{u.employee_name}</span>
                              {isRootIT && (
                                <span className="bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full font-mono uppercase tracking-wider">
                                  ROOT
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                            {u.email}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                            {u.department}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                              u.role === 'it_engineer'
                                ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                                : u.role === 'super_admin'
                                ? 'bg-red-100 text-red-900 border border-red-200'
                                : u.role === 'sales_team'
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : u.role === 'storekeeper'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                : u.role === 'mtc_controller'
                                ? 'bg-blue-100 text-blue-900 border border-blue-200'
                                : u.role === 'dispatch_team'
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}>
                              {u.role.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserId(u.id)
                                setTargetType('user')
                              }}
                              className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center space-x-1 cursor-pointer"
                              title="Click to load and edit permissions in matrix below"
                            >
                              <span>{userActiveModules.length} Modules</span>
                              <Sliders className="h-3 w-3" />
                            </button>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(u)}
                              disabled={u.id === 'USR-001'}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black cursor-pointer transition-colors ${
                                u.account_status === 'Active'
                                  ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                                  : 'bg-rose-100 text-rose-900 hover:bg-rose-200'
                              } ${u.id === 'USR-001' ? 'opacity-80 cursor-not-allowed' : ''}`}
                            >
                              {u.account_status}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-500 whitespace-nowrap">
                            {u.last_login || 'Never'}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUserId(u.id)
                                  setTargetType('user')
                                }}
                                className="p-1 text-indigo-600 hover:bg-indigo-100 rounded cursor-pointer"
                                title="Configure Granular Permissions in Matrix below"
                              >
                                <Sliders className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditUser(u)}
                                className="p-1 text-slate-600 hover:bg-slate-200 rounded cursor-pointer"
                                title="Edit Employee Details"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              {u.id !== 'USR-001' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUserAccount(u)}
                                  className="p-1 text-rose-600 hover:bg-rose-100 rounded cursor-pointer"
                                  title="Delete Employee Account"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION B: GRANULAR PERMISSION MATRIX HEADER & TARGET SELECTOR */}
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

      {/* TAB 4: MTC QUALITY STAMP & SEAL CALIBRATOR */}
      {activeTab === 'stamp_calibration' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                <Flame className="h-4 w-4 text-orange-500" />
                <span>MTC Quality Stamp, Official Seal &amp; Signature Calibrator</span>
              </h3>
              <p className="text-xs text-slate-500">
                IT Staff full access: change official company seals, upload transparent inspector signatures, calibrate stamp dimensions, and customize designations.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm self-start sm:self-auto"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Stamp &amp; Seal Configuration</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
            {/* Left Controls Column (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Section A: Official Company Seal Image & Style */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="font-extrabold text-slate-900 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <ImageIcon className="h-4 w-4 text-rose-600" />
                    <span>Official Company Seal (Image &amp; Stamp Shape)</span>
                  </div>
                  <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                    IT Configurable
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Official Seal Shape / Mode</label>
                    <select
                      value={config.sealShape || 'rectangular'}
                      onChange={e => setConfig({ ...config, sealShape: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="rectangular">Rectangular Official Stamp (EN 10204 Standard)</option>
                      <option value="round">Round Inspection Seal (Multi-Page Verification)</option>
                      <option value="custom_image">Custom Uploaded High-Res Transparent PNG</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Border Line Width: {config.sealBorderWidth || 2}px</label>
                    <input
                      type="range"
                      min="1"
                      max="6"
                      value={config.sealBorderWidth || 2}
                      onChange={e => setConfig({ ...config, sealBorderWidth: Number(e.target.value) })}
                      className="w-full accent-indigo-600 mt-2"
                    />
                  </div>
                </div>

                {/* Seal Image Upload / Preview */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    {config.customSealDataUrl ? (
                      <img
                        src={config.customSealDataUrl}
                        alt="Company Seal"
                        className="h-12 w-20 object-contain border border-slate-200 rounded p-1 bg-slate-50"
                      />
                    ) : (
                      <div className="h-12 w-20 flex items-center justify-center border border-dashed border-slate-300 rounded text-[10px] text-slate-400 text-center font-bold">
                        Default Vector Seal
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-slate-900">Official Company Seal Graphic</div>
                      <div className="text-[11px] text-slate-500">
                        {config.customSealDataUrl ? 'Custom PNG loaded into PDF Engine' : 'Using default built-in MSG Oilfield seal'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-indigo-200 cursor-pointer flex items-center space-x-1 transition-colors">
                      <FileUp className="h-3.5 w-3.5" />
                      <span>Upload New Seal PNG</span>
                      <input type="file" accept="image/*" onChange={handleSealImageUpload} className="hidden" />
                    </label>
                    {config.customSealDataUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfig(prev => ({ ...prev, customSealDataUrl: undefined, sealShape: 'rectangular' }))
                          setStatusNotice('Reverted to default official vector seal.')
                          setTimeout(() => setStatusNotice(null), 3000)
                        }}
                        className="text-rose-600 hover:text-rose-800 p-1.5 rounded hover:bg-rose-50"
                        title="Remove custom seal"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Section B: QC Inspector Signature & Authority */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="font-extrabold text-slate-900 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <ScrollText className="h-4 w-4 text-indigo-600" />
                    <span>QC Inspector Authority &amp; Signature Graphic</span>
                  </div>
                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                    IT Configurable
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Inspector Sign Code</label>
                    <input
                      type="text"
                      value={config.inspectorSignName || 'MSG/QC-04'}
                      onChange={e => setConfig({ ...config, inspectorSignName: e.target.value })}
                      placeholder="e.g. MSG/QC-04"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Inspector Full Name</label>
                    <input
                      type="text"
                      value={config.mtcInspectorName}
                      onChange={e => setConfig({ ...config, mtcInspectorName: e.target.value })}
                      placeholder="e.g. Tariq Al-Hashimi"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Official Designation</label>
                    <input
                      type="text"
                      value={config.inspectorDesignation || 'Head Storekeeper / Lead QC'}
                      onChange={e => setConfig({ ...config, inspectorDesignation: e.target.value })}
                      placeholder="e.g. Lead QA/QC Material Inspector"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                    />
                  </div>
                </div>

                {/* Signature Image Upload / Preview */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    {config.customSignatureDataUrl ? (
                      <img
                        src={config.customSignatureDataUrl}
                        alt="Inspector Signature"
                        className="h-10 w-24 object-contain border border-slate-200 rounded p-1 bg-slate-50"
                      />
                    ) : (
                      <div className="h-10 w-24 flex items-center justify-center border border-dashed border-slate-300 rounded font-serif italic text-blue-900 text-xs font-bold">
                        {config.inspectorSignName || 'MSG/QC-04'}
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-slate-900">Official Inspector Signature PNG</div>
                      <div className="text-[11px] text-slate-500">
                        {config.customSignatureDataUrl ? 'Custom transparent PNG signature overlay active' : 'Using cursive text font overlay'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-indigo-200 cursor-pointer flex items-center space-x-1 transition-colors">
                      <FileUp className="h-3.5 w-3.5" />
                      <span>Upload Signature PNG</span>
                      <input type="file" accept="image/*" onChange={handleSignatureImageUpload} className="hidden" />
                    </label>
                    {config.customSignatureDataUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfig(prev => ({ ...prev, customSignatureDataUrl: undefined }))
                          setStatusNotice('Reverted to digital cursive inspector signature.')
                          setTimeout(() => setStatusNotice(null), 3000)
                        }}
                        className="text-rose-600 hover:text-rose-800 p-1.5 rounded hover:bg-rose-50"
                        title="Remove custom signature"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Section C: Dimensions, Scale & Coordinates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/70">
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

            {/* Right Live Preview Column (5 cols) */}
            <div className="lg:col-span-5 border-2 border-dashed border-slate-300 rounded-2xl p-4 bg-slate-50 flex flex-col items-center justify-center relative min-h-[360px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 absolute top-3 left-4 flex items-center space-x-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span>Live Certificate Stamping Preview (A4 Canvas)</span>
              </div>

              <div
                style={{
                  transform: `translate(${config.mtcStampOffsetX * 1.5}px, ${config.mtcStampOffsetY * 1.5}px) scale(${config.mtcStampScale / 100})`,
                  borderColor: config.mtcStampColor,
                  borderWidth: `${config.sealBorderWidth || 2}px`,
                  color: config.mtcStampColor
                }}
                className={`p-4 rounded-xl bg-white shadow-lg max-w-sm w-full text-center transition-all select-none ${
                  config.sealShape === 'round' ? 'rounded-full aspect-square flex flex-col justify-center items-center p-6' : ''
                }`}
              >
                {config.customSealDataUrl ? (
                  <div className="mb-2 flex justify-center">
                    <img src={config.customSealDataUrl} alt="Seal Preview" className="h-14 max-w-[180px] object-contain" />
                  </div>
                ) : (
                  <>
                    <div className="font-black text-xs uppercase tracking-wider">{config.companyName}</div>
                    <div className="text-[10px] font-extrabold uppercase mt-1 px-1 border-t border-b border-current py-0.5">
                      {config.mtcStampText}
                    </div>
                  </>
                )}

                <div className="mt-2 text-[9px] font-mono text-left space-y-0.5 border-t border-slate-200/80 pt-1.5 text-slate-700">
                  <div className="flex justify-between">
                    <span>P O No.: <strong className="text-slate-900">PO-ADNOC-7700</strong></span>
                    <span>ITEM No.: <strong className="text-slate-900">01</strong></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>QTY: <strong className="text-slate-900">10 PCS</strong></span>
                    <div className="flex items-center space-x-1">
                      <span className="text-[8px] text-slate-400">SIGN:</span>
                      {config.customSignatureDataUrl ? (
                        <img src={config.customSignatureDataUrl} alt="Signature" className="h-6 max-w-[80px] object-contain inline-block" />
                      ) : (
                        <span className="font-serif italic font-bold text-blue-900 text-[10px]">
                          {config.inspectorSignName || 'MSG/QC-04'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-[8px] text-slate-400 mt-2 font-mono uppercase tracking-wider">
                  Verified by: {config.mtcInspectorName} &bull; {config.inspectorDesignation || 'Lead QC'}
                </div>
              </div>

              <div className="text-[10px] text-slate-500 mt-4 text-center max-w-xs leading-relaxed">
                Applied dynamically on EN 10204 3.1 MTC certificates. Custom seal and signature graphics are permanently embedded during export.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: APPROVED SUPPLIERS CATALOG & PRE-UPLOAD */}
      {activeTab === 'suppliers_catalog' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                <span>Approved Suppliers Catalog &amp; Master Pre-Upload</span>
              </h3>
              <p className="text-xs text-slate-500">
                Pre-load standard international makers and UAE local stockists, or bulk-import supplier rosters via Excel/CSV for all dropdowns.
              </p>
            </div>

            <div className="flex items-center space-x-2 flex-wrap">
              {/* 1-Click Preload All Standard Suppliers */}
              <button
                type="button"
                onClick={handlePreloadSuppliers}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer shadow-sm flex items-center space-x-1.5"
                title="Populate 10 standard makers & UAE stockists"
              >
                <Zap className="h-3.5 w-3.5 text-amber-300" />
                <span>Pre-load / Fetch All Approved Suppliers</span>
              </button>

              {/* Bulk File Upload */}
              <label className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer shadow-sm flex items-center space-x-1.5">
                <UploadCloud className="h-3.5 w-3.5 text-blue-300" />
                <span>Bulk Import (.csv / .json)</span>
                <input type="file" accept=".csv,.json,.txt" onChange={handleBulkSupplierFile} className="hidden" />
              </label>

              {/* Add Single Supplier */}
              <button
                type="button"
                onClick={() => setIsAddSupplierOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer shadow-sm flex items-center space-x-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Supplier</span>
              </button>
            </div>
          </div>

          {/* Quick Filter & Search Bar */}
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by Supplier Name, Code, Make or Country (e.g. Benkan, Delcorte, Promat)..."
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>
            <div className="text-xs text-slate-500 font-bold">
              Total Approved Suppliers: <strong className="text-slate-900 font-mono text-sm">{suppliers.length}</strong>
            </div>
          </div>

          {/* Suppliers Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Supplier Code</th>
                  <th className="py-3 px-4">Company Name</th>
                  <th className="py-3 px-4">Make / Brand</th>
                  <th className="py-3 px-4">Country</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers
                  .filter(s => {
                    const q = supplierSearch.toLowerCase()
                    return (
                      !q ||
                      s.supplier_name.toLowerCase().includes(q) ||
                      (s.supplier_code && s.supplier_code.toLowerCase().includes(q)) ||
                      (s.make && s.make.toLowerCase().includes(q)) ||
                      (s.country && s.country.toLowerCase().includes(q))
                    )
                  })
                  .map((s, idx) => (
                    <tr key={s.id || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{s.supplier_code}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{s.supplier_name}</td>
                      <td className="py-3 px-4 font-semibold text-slate-700">{s.make}</td>
                      <td className="py-3 px-4 text-slate-600">{s.country}</td>
                      <td className="py-3 px-4">
                        {s.supplier_type === 'local_stockist' ? (
                          <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
                            UAE Local Stockist
                          </span>
                        ) : (
                          <span className="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
                            Mill / Maker
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] flex items-center space-x-1 w-max">
                          <Check className="h-3 w-3" />
                          <span>{s.approved_status}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {s.contact_email || s.contact_phone || s.contact_person || '-'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Add Supplier Modal */}
          {isAddSupplierOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-6 py-4 shrink-0">
                  <h4 className="font-semibold text-sm text-slate-900 flex items-center space-x-2">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    <span>Register New Approved Supplier</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsAddSupplierOpen(false)}
                    className="text-slate-400 hover:text-slate-700 font-semibold text-sm"
                  >
                    &times;
                  </button>
                </div>

                <form onSubmit={handleAddSingleSupplier} className="p-6 space-y-3 text-xs overflow-y-auto flex-1">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Company / Supplier Name *</label>
                    <input
                      type="text"
                      required
                      value={newSupplierForm.supplier_name}
                      onChange={e => setNewSupplierForm({ ...newSupplierForm, supplier_name: e.target.value })}
                      placeholder="e.g. MEGA S.P.A. or APEX PIPING FZE"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Supplier Code</label>
                      <input
                        type="text"
                        value={newSupplierForm.supplier_code}
                        onChange={e => setNewSupplierForm({ ...newSupplierForm, supplier_code: e.target.value })}
                        placeholder="e.g. MEGA-IT or APEX-LP"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Make / Brand</label>
                      <input
                        type="text"
                        value={newSupplierForm.make}
                        onChange={e => setNewSupplierForm({ ...newSupplierForm, make: e.target.value })}
                        placeholder="e.g. MEGA ITALY"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Country</label>
                      <input
                        type="text"
                        value={newSupplierForm.country}
                        onChange={e => setNewSupplierForm({ ...newSupplierForm, country: e.target.value })}
                        placeholder="e.g. United Arab Emirates or Italy"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Supplier Type</label>
                      <select
                        value={newSupplierForm.supplier_type}
                        onChange={e => setNewSupplierForm({ ...newSupplierForm, supplier_type: e.target.value as any })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                      >
                        <option value="local_stockist">Local UAE Stockist</option>
                        <option value="mill_manufacturer">Mill / Manufacturer</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Contact Email</label>
                      <input
                        type="email"
                        value={newSupplierForm.contact_email}
                        onChange={e => setNewSupplierForm({ ...newSupplierForm, contact_email: e.target.value })}
                        placeholder="sales@supplier.ae"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
                      <input
                        type="text"
                        value={newSupplierForm.contact_phone}
                        onChange={e => setNewSupplierForm({ ...newSupplierForm, contact_phone: e.target.value })}
                        placeholder="+971 4 ..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsAddSupplierOpen(false)}
                      className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-colors"
                    >
                      Save Supplier
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DATABASE BACKUP & HEALTH */}
      {activeTab === 'database_backup' && (
        <div className="bg-white rounded-lg shadow-xs border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Database Backup, Restore &amp; Health Diagnostics</h3>
              <p className="text-xs text-slate-500">
                1-Click download full database JSON snapshot, restore from file, and verify system integrity.
              </p>
            </div>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Export Card */}
            <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/70 space-y-3">
              <div className="flex items-center space-x-2 text-slate-900 font-semibold text-sm">
                <Download className="h-4 w-4 text-blue-600" />
                <span>1-Click Database Export</span>
              </div>
              <p className="text-xs text-slate-600">
                Exports all items, lots, stock balances, heat numbers, MTC certificates, sales orders, local purchases, and system configs into an encrypted JSON file.
              </p>
              <button
                type="button"
                onClick={handleExportBackup}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-2 rounded-md transition-colors shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Full Database Backup (.json)</span>
              </button>
            </div>

            {/* Restore Card */}
            <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/70 space-y-3">
              <div className="flex items-center space-x-2 text-slate-900 font-semibold text-sm">
                <UploadCloud className="h-4 w-4 text-blue-600" />
                <span>Restore Database from Backup</span>
              </div>
              <p className="text-xs text-slate-600">
                Upload a previously saved <code className="font-semibold">.json</code> backup to restore all tables and configuration parameters instantly.
              </p>
              <label className="w-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs py-2 rounded-md transition-colors flex items-center justify-center space-x-2 cursor-pointer">
                <UploadCloud className="h-3.5 w-3.5 text-slate-500" />
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

      {/* TAB 6: SUPABASE CLOUD BACKEND & MTC STORAGE VAULT */}
      {activeTab === 'integrations' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                <Database className="h-4 w-4 text-emerald-600" />
                <span>Supabase Cloud Backend &amp; MTC Storage Vault</span>
              </h3>
              <p className="text-xs text-slate-500">
                PostgreSQL cloud database for all ERP tables and persistent S3-compatible cloud storage for EN 10204 3.1 MTC certificates.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center space-x-1 ${
                isSupabaseOnline
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isSupabaseOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span>{isSupabaseOnline ? 'Supabase Cloud Connected' : 'Local Storage Mode (Offline)'}</span>
              </span>
            </div>
          </div>

          {/* Supabase Environment Status Box (read-only, configured via .env) */}
          <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 space-y-4 text-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-extrabold text-emerald-950 flex items-center space-x-2">
                <Server className="h-4 w-4 text-emerald-700" />
                <span>Environment-Managed Cloud &amp; Database Credentials (.env)</span>
              </div>
              <button
                type="button"
                onClick={handleDownloadSupabaseSQL}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
                title="Download the full SQL migration script to paste into Supabase"
              >
                <Download className="h-3 w-3 text-emerald-400" />
                <span>Download Setup SQL (.sql)</span>
              </button>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 text-[11px]">
              <p className="text-slate-600">
                PostgreSQL (<code className="bg-slate-100 px-1 rounded font-mono">DATABASE_URL</code>), Supabase, and Cloudinary credentials are configured strictly through environment variables (<code className="bg-slate-100 px-1 rounded font-mono">.env</code> / server environment) rather than editable UI fields.
              </p>
              <div className="font-mono text-slate-800">
                <span className="font-sans font-semibold text-slate-600 mr-2">Supabase Endpoint:</span>
                <span>{supabaseEnvUrl || 'Not set in .env'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
              <div className="text-[11px] text-slate-600 font-medium">
                {supabaseTestMsg ? (
                  <span className={`font-bold ${isSupabaseOnline ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {supabaseTestMsg}
                  </span>
                ) : (
                  <span>Click &quot;Test Connection&quot; to verify .env PostgreSQL and MTC Storage access.</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleTestSupabase}
                disabled={isTestingSupabase}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer shadow-sm flex items-center space-x-1.5"
              >
                {isTestingSupabase ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>{isTestingSupabase ? 'Connecting...' : 'Test Connection'}</span>
              </button>
            </div>
          </div>

          {/* Cloud Synchronization Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Push to Cloud Card */}
            <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/70 space-y-3">
              <div className="flex items-center space-x-2 text-slate-900 font-semibold text-sm">
                <UploadCloud className="h-4 w-4 text-blue-600" />
                <span>Push All ERP &amp; MTC Data to Cloud</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pushes all active inventory lots, balances, orders, approved suppliers, MTC certificate metadata, and system settings directly into Supabase PostgreSQL.
              </p>
              <button
                type="button"
                onClick={handlePushAllToSupabase}
                disabled={isSyncingSupabase}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-2 rounded-md transition-colors shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
              >
                {isSyncingSupabase ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                <span>{isSyncingSupabase ? 'Synchronizing to Cloud...' : 'Push Everything to Supabase Cloud'}</span>
              </button>
            </div>

            {/* Pull from Cloud Card */}
            <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/70 space-y-3">
              <div className="flex items-center space-x-2 text-slate-900 font-semibold text-sm">
                <Download className="h-4 w-4 text-blue-600" />
                <span>Pull &amp; Restore All Data from Cloud</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Fetches latest records from Supabase PostgreSQL tables and synchronizes local state across all modules, orders, and certificates.
              </p>
              <button
                type="button"
                onClick={handlePullAllFromSupabase}
                disabled={isSyncingSupabase}
                className="w-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs py-2 rounded-md transition-colors flex items-center justify-center space-x-2 cursor-pointer"
              >
                {isSyncingSupabase ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-slate-500" />}
                <span>{isSyncingSupabase ? 'Restoring from Cloud...' : 'Pull Latest Data from Supabase'}</span>
              </button>
            </div>
          </div>

          {/* MTC Storage Vault Information Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs">
            <div className="font-extrabold text-slate-900 flex items-center space-x-2">
              <FileText className="h-4 w-4 text-rose-600" />
              <span>MTC Storage Bucket Policy (&apos;mtc-vault&apos;)</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              When Supabase is connected, any PDF uploaded in <strong>Master Stock</strong>, <strong>Centralized Solo Hub</strong>, or <strong>Sales Order Management</strong> is automatically uploaded to the <code className="bg-slate-200 px-1 py-0.5 rounded font-mono font-bold">mtc-vault</code> bucket. Certificates are given immutable public CDN URLs for fast client delivery note packaging.
            </p>
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

      {/* Provision / Edit Employee Account Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-5 py-3.5 text-slate-900 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">
                    {editingUserId ? `Edit Account (${editingUserId})` : 'Provision New Employee Account'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Configured by IT Systems Administrator (Root Provisioner)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-semibold p-1 cursor-pointer shrink-0"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Employee Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={userFormData.employee_name}
                  onChange={(e) => setUserFormData({ ...userFormData, employee_name: e.target.value })}
                  placeholder="e.g. Sarah Connor"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Corporate Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    placeholder="name@msgoilfield.ae"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={userFormData.department}
                    onChange={(e) => setUserFormData({ ...userFormData, department: e.target.value })}
                    placeholder="e.g. Commercial Sales"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Assigned Role
                  </label>
                  <select
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-bold bg-white"
                  >
                    <option value="sales_team">Commercial Sales</option>
                    <option value="storekeeper">Warehouse / Storekeeper</option>
                    <option value="mtc_controller">Quality Assurance / MTC Controller</option>
                    <option value="dispatch_team">Logistics &amp; Dispatch</option>
                    <option value="admin_inventory">Inventory Manager</option>
                    <option value="management_viewer">Management Viewer</option>
                    <option value="it_engineer">IT Systems Engineer</option>
                    <option value="super_admin">Super Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Account Status
                  </label>
                  <select
                    value={userFormData.account_status}
                    onChange={(e) => setUserFormData({ ...userFormData, account_status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-bold bg-white"
                  >
                    <option value="Active">Active (Permitted)</option>
                    <option value="Suspended">Suspended (Blocked)</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Initial Password / Access PIN
                </label>
                <input
                  type="text"
                  value={userFormData.password || ''}
                  onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Employee can use this password to sign in immediately via the enterprise login portal.
                </p>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-[11px] text-indigo-900 leading-relaxed">
                <strong>Granular Access Note:</strong> Upon saving, you can customize this employee&apos;s exact module visibility and line-by-line feature permissions in the Universal Granular Permission Matrix below.
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>{editingUserId ? 'Save Account Changes' : 'Provision Employee Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
