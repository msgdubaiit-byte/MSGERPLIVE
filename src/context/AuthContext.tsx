// Production Authentication & RBAC Context for MSG Oilfield ERP
import React, { createContext, useContext, useState, useEffect } from 'react'
import { UserProfile, UserRole } from '../types'
import { db } from '../services/db'
import { apiGet, apiPost, apiPut, apiDelete, getAuthToken, setAuthToken, clearAuthToken } from '../services/api'

export const DEFAULT_ROLE_MODULES: Record<UserRole, string[]> = {
  super_admin: [
    'solo_hub', 'dashboard', 'stock', 'items', 'traceability', 'orders', 'allocation', 'sourcing',
    'loc', 'stickers', 'approvals', 'mtc', 'local_purchase', 'dispatch', 'movements',
    'returns', 'reports', 'excel', 'users', 'audit', 'settings'
  ],
  admin_inventory: [
    'solo_hub', 'dashboard', 'stock', 'items', 'traceability', 'orders', 'allocation', 'sourcing',
    'loc', 'stickers', 'approvals', 'mtc', 'local_purchase', 'movements', 'returns', 'reports', 'excel', 'settings'
  ],
  sales_team: [
    'solo_hub', 'dashboard', 'orders', 'sourcing', 'stickers', 'loc', 'stock', 'traceability'
  ],
  storekeeper: [
    'solo_hub', 'approvals', 'stock', 'traceability', 'loc', 'dispatch', 'movements'
  ],
  mtc_controller: [
    'solo_hub', 'mtc', 'traceability', 'orders', 'stock', 'local_purchase'
  ],
  dispatch_team: [
    'solo_hub', 'dispatch', 'orders', 'stickers', 'stock'
  ],
  management_viewer: [
    'solo_hub', 'dashboard', 'reports', 'stock', 'orders', 'audit'
  ],
  it_engineer: [
    'it_console', 'settings', 'users', 'audit', 'excel'
  ],
}

export interface VipPreset {
  id: string
  label: string
  description: string
  badge: string
  badgeColor: string
  modules: string[]
}

export const VIP_PRESETS: VipPreset[] = [
  {
    id: 'workers_away_solo',
    label: '★ Centralized Solo Hub (Workers Away Mode)',
    description: 'Centralized all-in-one hub: 1-click order deliverables, instant heat & stock finder, local purchase split, stickers, and fast approvals in 1 screen.',
    badge: 'Workers Away Fast-Track',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
    modules: ['solo_hub', 'sourcing', 'orders', 'stock', 'stickers', 'local_purchase'],
  },
  {
    id: 'simplified_sales',
    label: 'Simplified Sales Team (4 Options)',
    description: 'Clean & focused for Sales: Sales Orders, Sourcing & CIPL, Stickers, and Dashboard.',
    badge: 'Popular for Sales',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
    modules: ['dashboard', 'orders', 'sourcing', 'stickers'],
  },
  {
    id: 'storekeeper_yard',
    label: 'Storekeeper Yard View (4 Options)',
    description: 'Focused physical operations: Approvals, Master Stock, LOC & Tags, and Heat Traceability.',
    badge: 'Warehouse Yard',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    modules: ['approvals', 'stock', 'traceability', 'loc'],
  },
  {
    id: 'mtc_qa_fast',
    label: 'QA / QC & MTC Controller (3 Options)',
    description: 'Focused compliance: MTC Management, Heat Traceability, and Sales Orders.',
    badge: 'Inspection & MTC',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    modules: ['mtc', 'traceability', 'orders'],
  },
  {
    id: 'logistics_dispatch',
    label: 'Logistics & Dispatch (3 Options)',
    description: 'Physical dispatch & stickers: Dispatch Management, Sales Orders, and Stickers.',
    badge: 'Logistics',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    modules: ['dispatch', 'orders', 'stickers'],
  },
  {
    id: 'ultra_minimal',
    label: 'Ultra Minimalist (2 Options)',
    description: 'Easiest possible screen for beginner team members: Only Dashboard + Sales Orders.',
    badge: 'Ultra Simple',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    modules: ['dashboard', 'orders'],
  },
  {
    id: 'full_power',
    label: 'Full VIP Access (All 20 Options)',
    description: 'Complete unconstrained access to every single module, ledger, Excel studio, and settings.',
    badge: 'VIP Full Access',
    badgeColor: 'bg-red-100 text-red-800 border-red-200',
    modules: [
      'dashboard', 'stock', 'items', 'traceability', 'orders', 'allocation', 'sourcing',
      'loc', 'stickers', 'approvals', 'mtc', 'local_purchase', 'dispatch', 'movements',
      'returns', 'reports', 'excel', 'users', 'audit', 'settings'
    ],
  },
  {
    id: 'it_systems_engineer',
    label: '🛠️ IT Systems Engineer (Software Config Only - No Data Access)',
    description: 'Administrative access to configure all software settings, branding, MTC stamp calibration, document templates, users, permissions, integrations, and backups. Commercial business data is strictly masked & protected.',
    badge: 'IT Config / No Data',
    badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    modules: ['it_console', 'settings', 'users', 'audit', 'excel'],
  },
]

interface AuthContextType {
  currentUser: UserProfile | null
  currentRole: UserRole
  isAuthenticated: boolean
  isLoadingSession: boolean
  isRecoveryMode: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>
  signUp: (email: string, password: string, metadata: { employee_name: string; department: string; role: UserRole }) => Promise<{ success: boolean; message: string; requiresEmailConfirmation?: boolean }>
  resetPasswordForEmail: (email: string) => Promise<{ success: boolean; message: string }>
  updatePassword: (newPassword: string) => Promise<{ success: boolean; message: string }>
  logout: () => Promise<void>
  hasPermission: (requiredRoles: UserRole[]) => boolean
  canAccessModule: (moduleName: string) => boolean
  customPermissions: Record<string, string[]>
  updateCustomPermissions: (targetKey: string, allowedModules: string[]) => void
  resetCustomPermissions: (targetKey?: string) => void
  getAllowedModulesForTarget: (targetKey: string) => string[]
  switchDemoRole: (role: UserRole) => void
  switchDemoUser: (userId: string) => void
  resetToAdmin: () => void
  isSimulatingRoleOrUser: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const MODULE_PERMISSIONS: Record<string, UserRole[]> = {
  it_console: ['super_admin', 'it_engineer'],
  solo_hub: ['super_admin', 'admin_inventory', 'sales_team', 'storekeeper', 'mtc_controller', 'dispatch_team', 'management_viewer'],
  dashboard: ['super_admin', 'admin_inventory', 'sales_team', 'storekeeper', 'mtc_controller', 'dispatch_team', 'management_viewer'],
  stock: ['super_admin', 'admin_inventory', 'sales_team', 'storekeeper', 'mtc_controller', 'dispatch_team', 'management_viewer'],
  items: ['super_admin', 'admin_inventory', 'sales_team', 'storekeeper', 'management_viewer'],
  traceability: ['super_admin', 'admin_inventory', 'sales_team', 'storekeeper', 'mtc_controller', 'dispatch_team', 'management_viewer'],
  orders: ['super_admin', 'admin_inventory', 'sales_team', 'storekeeper', 'dispatch_team', 'management_viewer'],
  allocation: ['super_admin', 'admin_inventory', 'sales_team'],
  sourcing: ['super_admin', 'admin_inventory', 'sales_team', 'storekeeper', 'mtc_controller', 'management_viewer'],
  loc: ['super_admin', 'admin_inventory', 'sales_team', 'storekeeper', 'mtc_controller', 'management_viewer'],
  stickers: ['super_admin', 'admin_inventory', 'sales_team', 'storekeeper', 'mtc_controller', 'management_viewer'],
  approvals: ['super_admin', 'storekeeper'],
  mtc: ['super_admin', 'admin_inventory', 'mtc_controller', 'sales_team', 'management_viewer'],
  local_purchase: ['super_admin', 'admin_inventory', 'mtc_controller', 'storekeeper', 'management_viewer'],
  dispatch: ['super_admin', 'dispatch_team', 'storekeeper', 'management_viewer'],
  movements: ['super_admin', 'admin_inventory', 'storekeeper', 'management_viewer'],
  returns: ['super_admin', 'admin_inventory', 'storekeeper'],
  reports: ['super_admin', 'admin_inventory', 'sales_team', 'storekeeper', 'mtc_controller', 'dispatch_team', 'management_viewer'],
  excel: ['super_admin', 'admin_inventory', 'it_engineer'],
  users: ['super_admin', 'it_engineer'],
  audit: ['super_admin', 'management_viewer', 'it_engineer'],
  settings: ['super_admin', 'admin_inventory', 'it_engineer'],
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState(true)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    if (currentUser) {
      localStorage.setItem('msg_current_user', JSON.stringify(currentUser))
    } else {
      localStorage.removeItem('msg_current_user')
    }
  }, [currentUser])

  const [customPermissions, setCustomPermissions] = useState<Record<string, string[]>>(() => {
    if (typeof localStorage === 'undefined') return {}
    const saved = localStorage.getItem('msg_custom_module_permissions')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return {}
      }
    }
    return {}
  })

  const syncPermissionsFromBackend = async () => {
    try {
      const res = await apiGet<{ success: boolean; customPermissions: Record<string, string[]>; granularPermissions: Record<string, string[]> }>('/api/permissions')
      if (res.success) {
        setCustomPermissions(res.customPermissions || {})
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('msg_custom_module_permissions', JSON.stringify(res.customPermissions || {}))
        }
      }
    } catch {}
  }

  useEffect(() => {
    let isMounted = true

    async function initSession() {
      try {
        setIsLoadingSession(true)
        const hasExplicitlyLoggedOut =
          typeof sessionStorage !== 'undefined' && sessionStorage.getItem('msg_user_logged_out') === 'true'
        if (hasExplicitlyLoggedOut) {
          setIsLoadingSession(false)
          return
        }

        const token = getAuthToken()
        if (token) {
          const res = await apiGet<{ success: boolean; user: UserProfile }>('/api/auth/me')
          if (res.success && res.user && res.user.account_status === 'Active' && isMounted) {
            await Promise.all([db.refreshFromBackend(), syncPermissionsFromBackend()])
            if (isMounted) {
              setCurrentUser(res.user)
            }
          } else {
            clearAuthToken()
          }
        }
      } catch {
        clearAuthToken()
      } finally {
        if (isMounted) setIsLoadingSession(false)
      }
    }

    initSession()
    return () => {
      isMounted = false
    }
  }, [])

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    if (!email || !password) {
      return { success: false, message: 'Please enter both email and password.' }
    }

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('msg_user_logged_out')
    }

    try {
      const res = await apiPost<{ success: boolean; token: string; user: UserProfile }>('/api/auth/login', {
        email: email.trim().toLowerCase(),
        password: password.trim(),
      })

      if (res.success && res.token && res.user) {
        setAuthToken(res.token)
        // Await full backend bootstrap & permissions before mounting workspace views
        await Promise.all([db.refreshFromBackend(), syncPermissionsFromBackend()])
        setCurrentUser(res.user)
        return { success: true }
      }
      return { success: false, message: 'Invalid login credentials.' }
    } catch (err: any) {
      return { success: false, message: err.message || 'Authentication service unavailable.' }
    }
  }

  const signUp = async (
    email: string,
    password: string,
    metadata: { employee_name: string; department: string; role: UserRole }
  ): Promise<{ success: boolean; message: string; requiresEmailConfirmation?: boolean }> => {
    if (!email || !password) {
      return { success: false, message: 'Email and password are required.' }
    }

    try {
      const res = await apiPost<{ success: boolean; user: UserProfile; message: string }>('/api/auth/signup', {
        email: email.trim().toLowerCase(),
        password: password.trim(),
        employee_name: metadata.employee_name,
        department: metadata.department,
        role: metadata.role,
      })

      if (res.success) {
        await db.refreshFromBackend()
        return {
          success: true,
          message: res.message || 'Account created in production backend!',
        }
      }
      return { success: false, message: 'Registration failed.' }
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to complete registration.' }
    }
  }

  const resetPasswordForEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
    if (!email) return { success: false, message: 'Please enter your email.' }
    return {
      success: true,
      message: `Password reset request logged for ${email}. Administrators can issue new credentials in User Management.`,
    }
  }

  const updatePassword = async (newPassword: string): Promise<{ success: boolean; message: string }> => {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters.' }
    }
    try {
      const res = await apiPost<{ success: boolean; message: string }>('/api/auth/change-password', {
        new_password: newPassword.trim(),
      })
      setIsRecoveryMode(false)
      return { success: res.success, message: res.message || 'Password updated successfully!' }
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to update password.' }
    }
  }

  const logout = async () => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('msg_user_logged_out', 'true')
    }
    clearAuthToken()
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('msg_current_user')
    }
    setCurrentUser(null)
  }

  const hasPermission = (requiredRoles: UserRole[]): boolean => {
    if (!currentUser) return false
    return requiredRoles.includes(currentUser.role)
  }

  const getAllowedModulesForTarget = (targetKey: string): string[] => {
    if (customPermissions[targetKey]) {
      return customPermissions[targetKey]
    }
    const allUsers = db.getUsers()
    const user = allUsers.find(u => u.id === targetKey || u.email === targetKey)
    if (user && customPermissions[user.role]) {
      return customPermissions[user.role]
    }
    if (user && DEFAULT_ROLE_MODULES[user.role]) {
      return DEFAULT_ROLE_MODULES[user.role]
    }
    if (DEFAULT_ROLE_MODULES[targetKey as UserRole]) {
      return DEFAULT_ROLE_MODULES[targetKey as UserRole]
    }
    return DEFAULT_ROLE_MODULES.sales_team
  }

  const canAccessModule = (moduleName: string): boolean => {
    if (!currentUser) return false

    if (currentUser.role === 'super_admin' && (moduleName === 'users' || moduleName === 'settings' || moduleName === 'audit')) {
      return true
    }

    if (customPermissions[currentUser.id]) {
      return customPermissions[currentUser.id].includes(moduleName)
    }

    if (customPermissions[currentUser.role]) {
      return customPermissions[currentUser.role].includes(moduleName)
    }

    const defaultModules = DEFAULT_ROLE_MODULES[currentUser.role]
    if (defaultModules) {
      return defaultModules.includes(moduleName)
    }

    const allowed = MODULE_PERMISSIONS[moduleName]
    return allowed ? allowed.includes(currentUser.role) : true
  }

  const updateCustomPermissions = (targetKey: string, allowedModules: string[]) => {
    setCustomPermissions(prev => {
      const next = { ...prev, [targetKey]: allowedModules }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('msg_custom_module_permissions', JSON.stringify(next))
      }
      return next
    })
    apiPut(`/api/permissions/${encodeURIComponent(targetKey)}`, { allowed_modules: allowedModules }).catch(() => {})
  }

  const resetCustomPermissions = (targetKey?: string) => {
    setCustomPermissions(prev => {
      const next = { ...prev }
      if (targetKey) {
        delete next[targetKey]
      } else {
        return {}
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('msg_custom_module_permissions', JSON.stringify(next))
      }
      return next
    })
    apiDelete(targetKey ? `/api/permissions?target_key=${encodeURIComponent(targetKey)}` : '/api/permissions').catch(() => {})
  }

  const switchDemoRole = (_role: UserRole) => {}
  const switchDemoUser = (_userId: string) => {}
  const resetToAdmin = () => {}
  const isSimulatingRoleOrUser = false

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRole: currentUser?.role || 'management_viewer',
        isAuthenticated: !!currentUser,
        isLoadingSession,
        isRecoveryMode,
        login,
        signUp,
        resetPasswordForEmail,
        updatePassword,
        logout,
        hasPermission,
        canAccessModule,
        customPermissions,
        updateCustomPermissions,
        resetCustomPermissions,
        getAllowedModulesForTarget,
        switchDemoRole,
        switchDemoUser,
        resetToAdmin,
        isSimulatingRoleOrUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
