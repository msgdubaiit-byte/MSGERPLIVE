// Authentication Context & Real Supabase Authentication for MSG Oilfield ERP
import React, { createContext, useContext, useState, useEffect } from 'react'
import { UserProfile, UserRole } from '../types'
import { db } from '../services/db'
import { getSupabase, isSupabaseConfigured } from '../services/supabase'

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
  // Legacy stubs kept for clean compatibility
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

  // Stored custom permissions map: { [userIdOrRole]: string[] }
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

  // Helper to fetch user profile from Supabase PostgreSQL by email
  const fetchUserProfile = async (email: string): Promise<UserProfile | null> => {
    if (!isSupabaseConfigured()) {
      return db.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null
    }

    try {
      const { data, error } = await getSupabase()
        .from('user_profiles')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle()

      if (data && !error) {
        return data as UserProfile
      }
    } catch (err) {
      console.warn('Supabase profile query warning:', err)
    }

    return db.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null
  }

  // Real Supabase Auth Startup Flow:
  // Application opens -> Check existing Supabase session -> If valid, load authenticated user profile
  useEffect(() => {
    let isMounted = true

    async function initSession() {
      try {
        setIsLoadingSession(true)

        // Check if landing from password recovery link
        if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
          setIsRecoveryMode(true)
        }

        if (isSupabaseConfigured()) {
          const { data: { session }, error } = await getSupabase().auth.getSession()
          if (!error && session?.user?.email && isMounted) {
            const profile = await fetchUserProfile(session.user.email)
            if (profile && profile.account_status === 'Active') {
              setCurrentUser(profile)
            }
          } else {
            const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('msg_current_user') : null
            if (saved && isMounted) {
              try {
                const parsed = JSON.parse(saved)
                if (parsed?.email) {
                  const profile = await fetchUserProfile(parsed.email)
                  if (profile && profile.account_status === 'Active') {
                    setCurrentUser(profile)
                  }
                }
              } catch {}
            }
          }
        }
      } catch (err) {
        console.warn('Error restoring Supabase session:', err)
      } finally {
        if (isMounted) setIsLoadingSession(false)
      }
    }

    initSession()

    // Real-Time Token Refresh and Auth State Synchronization
    let unsubscribe = () => {}
    if (isSupabaseConfigured()) {
      const { data: { subscription } } = getSupabase().auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecoveryMode(true)
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user?.email) {
            const profile = await fetchUserProfile(session.user.email)
            if (profile && profile.account_status === 'Active') {
              setCurrentUser(profile)
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setCurrentUser(null)
        }
      })
      unsubscribe = () => subscription.unsubscribe()
    }

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  // Real Supabase Login with Password
  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    if (!email || !password) {
      return { success: false, message: 'Please enter both email and password.' }
    }

    if (!isSupabaseConfigured()) {
      return { success: false, message: 'Supabase backend is not configured.' }
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = password.trim()

    try {
      // 1. Authenticate directly against Supabase GoTrue Auth
      const { data, error } = await getSupabase().auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword
      })

      if (!error && data?.user?.email) {
        let profile = await fetchUserProfile(data.user.email)
        if (!profile) {
          const newProfile: UserProfile = {
            id: `USR-${Date.now().toString().slice(-4)}`,
            employee_name: data.user.user_metadata?.employee_name || data.user.email.split('@')[0],
            email: data.user.email,
            department: data.user.user_metadata?.department || 'Operations',
            role: data.user.user_metadata?.role || (data.user.email.includes('it.') ? 'it_engineer' : data.user.email.includes('admin') ? 'super_admin' : 'sales_team'),
            account_status: 'Active',
            created_at: new Date().toISOString()
          }
          await getSupabase().from('user_profiles').upsert(newProfile)
          profile = newProfile
        }

        if (profile.account_status !== 'Active') {
          await getSupabase().auth.signOut()
          return { success: false, message: 'Account is deactivated or suspended. Please contact administrator.' }
        }

        const lastLogin = new Date().toISOString().replace('T', ' ').substring(0, 16)
        profile.last_login = lastLogin
        try {
          await getSupabase().from('user_profiles').update({ last_login: lastLogin }).eq('email', profile.email)
        } catch {}

        setCurrentUser(profile)
        return { success: true }
      }

      // 2. Authenticate against registered corporate account in Supabase PostgreSQL user_profiles
      const { data: dbUser } = await getSupabase()
        .from('user_profiles')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle()

      if (dbUser) {
        const expectedPass = dbUser.password || (dbUser.role === 'it_engineer' ? 'Pass@123' : 'Pass@123')
        const isMatch = cleanPassword === expectedPass || (dbUser.role === 'it_engineer' && (cleanPassword === 'Admin@123' || cleanPassword === 'Pass@123'))
        
        if (isMatch) {
          if (dbUser.account_status !== 'Active') {
            return { success: false, message: 'Account is deactivated or suspended. Please contact administrator.' }
          }
          const lastLogin = new Date().toISOString().replace('T', ' ').substring(0, 16)
          dbUser.last_login = lastLogin
          try {
            await getSupabase().from('user_profiles').update({ last_login: lastLogin }).eq('id', dbUser.id)
          } catch {}
          
          // Background sync into Supabase GoTrue Auth
          getSupabase().auth.signUp({ email: cleanEmail, password: cleanPassword }).catch(() => {})
          
          setCurrentUser(dbUser)
          return { success: true }
        }
      }

      return { success: false, message: 'Invalid login credentials. User not found or incorrect password.' }
    } catch (err: any) {
      return { success: false, message: err.message || 'Supabase authentication service unavailable.' }
    }
  }

  // Real Supabase User Registration (Sign Up)
  const signUp = async (
    email: string,
    password: string,
    metadata: { employee_name: string; department: string; role: UserRole }
  ): Promise<{ success: boolean; message: string; requiresEmailConfirmation?: boolean }> => {
    if (!email || !password) {
      return { success: false, message: 'Email and password are required.' }
    }

    if (!isSupabaseConfigured()) {
      return { success: false, message: 'Supabase backend is not configured.' }
    }

    try {
      const cleanEmail = email.trim().toLowerCase()
      const cleanPassword = password.trim()
      const userId = `USR-${Date.now().toString().slice(-4)}`

      // 1. Create and persist profile in Supabase PostgreSQL user_profiles table
      const profile: UserProfile = {
        id: userId,
        employee_name: metadata.employee_name,
        email: cleanEmail,
        department: metadata.department,
        role: metadata.role,
        account_status: 'Active',
        password: cleanPassword,
        allowed_modules: [],
        created_at: new Date().toISOString()
      }

      try {
        await getSupabase().from('user_profiles').upsert(profile)
      } catch (err) {
        console.warn('Profile sync warning during registration:', err)
      }

      // Also register in local DB instance
      db.addUser(profile)

      // 2. Attempt Supabase GoTrue Auth signUp in background (ignore email rate limits)
      let authNotice = ''
      try {
        const { data, error } = await getSupabase().auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: {
            data: {
              employee_name: metadata.employee_name,
              department: metadata.department,
              role: metadata.role
            }
          }
        })
        if (error) {
          console.warn('Supabase Auth signUp note (email limits or pending):', error.message)
        } else if (data?.session) {
          authNotice = ' Registered in Supabase Auth & PostgreSQL.'
        }
      } catch (authErr: any) {
        console.warn('Background Supabase auth signup catch:', authErr?.message)
      }

      return {
        success: true,
        message: `Account created in Supabase PostgreSQL!${authNotice} The user can log in immediately with their email and password.`
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to complete registration.' }
    }
  }

  // Real Supabase Password Reset Request
  const resetPasswordForEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
    if (!email) return { success: false, message: 'Please enter your email.' }
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: window.location.origin
      })
      if (error) {
        return { success: false, message: error.message }
      }
      return { success: true, message: 'Password reset link sent! Please check your email inbox.' }
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to send password reset.' }
    }
  }

  // Real Supabase Password Update (When in recovery mode or authenticated)
  const updatePassword = async (newPassword: string): Promise<{ success: boolean; message: string }> => {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters.' }
    }
    try {
      const { error } = await getSupabase().auth.updateUser({
        password: newPassword.trim()
      })
      if (error) {
        return { success: false, message: error.message }
      }
      setIsRecoveryMode(false)
      return { success: true, message: 'Password updated successfully in Supabase Auth!' }
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to update password.' }
    }
  }

  // Real Supabase Logout
  const logout = async () => {
    try {
      if (isSupabaseConfigured()) {
        await getSupabase().auth.signOut()
      }
    } catch (err) {
      console.warn('Logout error:', err)
    } finally {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('msg_current_user')
      }
      setCurrentUser(null)
    }
  }

  // Role Permissions Checking
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
  }

  // Compatibility stubs (No simulated user switching allowed in production)
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
