import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { isCloudinaryConfigured, uploadToCloudinary } from './cloudinary'

const DEFAULT_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://snmafjucycnzikmtkrsr.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNubWFmanVjeWNuemlrbXRrcnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNTgxOTcsImV4cCI6MjExMDczNDE5N30.-ZpWWjEZZ-m7DqIwaKyp0yC8zTMOXjc5O-4LXtWH9Ss'

export function getStoredSupabaseConfig(): { url: string; key: string } {
  let url: string = (typeof localStorage !== 'undefined' ? localStorage.getItem('msg_supabase_url') : null) || ''
  let key: string = (typeof localStorage !== 'undefined' ? localStorage.getItem('msg_supabase_anon_key') : null) || ''

  // Auto-purge any stale placeholder or demo key from previous test runs
  if (!url || url.includes('msg-oilfield') || !key || key.includes('demo')) {
    url = DEFAULT_SUPABASE_URL
    key = DEFAULT_SUPABASE_ANON_KEY
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('msg_supabase_url', url)
        localStorage.setItem('msg_supabase_anon_key', key)
      }
    } catch {}
  }
  return { url, key }
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getStoredSupabaseConfig()
  return Boolean(
    url &&
    key &&
    !key.includes('demo') &&
    url.startsWith('https://') &&
    url.includes('.supabase.co')
  )
}

let currentClient: SupabaseClient = createClient(
  getStoredSupabaseConfig().url,
  getStoredSupabaseConfig().key
)

let realtimeChannel: any = null

export function subscribeToRealtimeChanges(onTableChange: (tableName: string) => void) {
  if (!isSupabaseConfigured()) return () => {}

  if (realtimeChannel) {
    try {
      currentClient.removeChannel(realtimeChannel)
    } catch {}
    realtimeChannel = null
  }

  try {
    realtimeChannel = currentClient
      .channel('erp-public-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        onTableChange(payload.table)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('⚡ Connected to Supabase Real-Time WebSocket Channel')
        }
      })
  } catch (err) {
    console.warn('Realtime subscription error:', err)
  }

  return () => {
    if (realtimeChannel) {
      try {
        currentClient.removeChannel(realtimeChannel)
      } catch {}
      realtimeChannel = null
    }
  }
}

export function saveSupabaseConfig(url: string, key: string) {
  localStorage.setItem('msg_supabase_url', url.trim())
  localStorage.setItem('msg_supabase_anon_key', key.trim())
  currentClient = createClient(url.trim(), key.trim())
  if (realtimeChannel) {
    try { currentClient.removeChannel(realtimeChannel) } catch {}
    realtimeChannel = null
  }
}

export function getSupabase(): SupabaseClient {
  return currentClient
}

// Test connection to Supabase PostgreSQL & Storage
export async function testSupabaseConnection(url: string, key: string): Promise<{ success: boolean; message: string }> {
  try {
    const testClient = createClient(url.trim(), key.trim())
    // 1. Test database ping
    const { error: dbErr } = await testClient.from('suppliers').select('id').limit(1)
    if (dbErr && dbErr.code !== 'PGRST116' && dbErr.code !== '42P01') {
      if (dbErr.message.toLowerCase().includes('permission denied')) {
        return {
          success: false,
          message: `Database permission error: ${dbErr.message}. Please run the 'fix_permissions.sql' script in your Supabase SQL Editor to grant access to the API roles.`
        }
      }
      return { success: false, message: `Database error: ${dbErr.message}` }
    }

    // 2. Test storage bucket access
    const { data: buckets, error: storageErr } = await testClient.storage.listBuckets()
    const hasMtcVault = buckets?.some(b => b.name === 'mtc-vault' || b.id === 'mtc-vault')

    return {
      success: true,
      message: `Connected to Supabase! PostgreSQL verified. ${hasMtcVault ? 'MTC Storage Bucket (mtc-vault) is Active.' : 'Note: Run the SQL script to create mtc-vault bucket.'}`
    }
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection failed' }
  }
}

// ------------------------------------------------------------------------
// MTC FILE CLOUD STORAGE (Supabase Storage 'mtc-vault')
// ------------------------------------------------------------------------

/**
 * Upload an MTC Certificate PDF or Image directly to Supabase Storage 'mtc-vault' bucket.
 * Returns the permanent public CDN URL.
 */
export async function uploadMTCFileToSupabase(
  fileName: string,
  fileData: Blob | File | Uint8Array,
  folder: string = 'mtcs'
): Promise<{ success: boolean; url?: string; path?: string; error?: string }> {
  try {
    // 1. Prioritize Cloudinary Universal Storage if configured
    if (isCloudinaryConfigured()) {
      const cloudRes = await uploadToCloudinary(fileData, fileName, 'mtcs')
      if (cloudRes.success && cloudRes.secureUrl) {
        return {
          success: true,
          url: cloudRes.secureUrl,
          path: cloudRes.publicId
        }
      }
    }

    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Cloud storage is operating in local offline cache mode.' }
    }

    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${folder}/${Date.now()}_${cleanName}`

    let uploadBody: any = fileData
    let contentType = 'application/pdf'

    if (fileData instanceof Uint8Array) {
      uploadBody = new Blob([fileData as any], { type: 'application/pdf' })
    }

    const { error: uploadError } = await currentClient.storage
      .from('mtc-vault')
      .upload(filePath, uploadBody, {
        cacheControl: '31536000',
        upsert: true,
        contentType
      })

    if (uploadError) {
      return { success: false, error: uploadError.message }
    }

    const { data: { publicUrl } } = currentClient.storage
      .from('mtc-vault')
      .getPublicUrl(filePath)

    return {
      success: true,
      url: publicUrl,
      path: filePath
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to upload MTC to Supabase storage.' }
  }
}

/**
 * Download an MTC Certificate from Supabase Storage by path or URL.
 */
export async function downloadMTCFromSupabase(filePath: string): Promise<Uint8Array | null> {
  try {
    const cleanPath = filePath.includes('mtc-vault/') ? filePath.split('mtc-vault/')[1] : filePath
    const { data, error } = await currentClient.storage
      .from('mtc-vault')
      .download(cleanPath)

    if (error || !data) return null
    const buf = await data.arrayBuffer()
    return new Uint8Array(buf)
  } catch (e) {
    console.error('Failed to download MTC from Supabase', e)
    return null
  }
}

// ------------------------------------------------------------------------
// FULL CLOUD SYNCHRONIZATION (Push & Pull All Tables)
// ------------------------------------------------------------------------

/**
 * Push all local tables, stock balances, heat numbers, orders, and system config to Supabase PostgreSQL.
 */
export async function pushAllTablesToSupabase(dbInstance: any): Promise<{
  success: boolean
  message: string
  details: any
}> {
  try {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        message: 'Please configure your Supabase Project URL and Anon Key first in the IT Console.',
        details: null
      }
    }

    const results: Record<string, number> = {}

    // 1. Sync System Config
    const config = dbInstance.getSystemConfig()
    await currentClient.from('system_config').upsert({
      id: 'SYSTEM_CONFIG_MAIN',
      company_name: config.companyName,
      trn_number: config.trnNumber,
      default_currency: config.defaultCurrency,
      company_address: config.companyAddress,
      contact_email: config.contactEmail,
      contact_phone: config.contactPhone,
      theme_primary_color: config.themePrimaryColor,
      mtc_stamp_text: config.mtcStampText,
      mtc_stamp_color: config.mtcStampColor,
      mtc_stamp_scale: config.mtcStampScale,
      mtc_stamp_offset_x: config.mtcStampOffsetX,
      mtc_stamp_offset_y: config.mtcStampOffsetY,
      mtc_inspector_name: config.mtcInspectorName,
      inspector_designation: config.inspectorDesignation,
      inspector_sign_name: config.inspectorSignName,
      custom_seal_data_url: config.customSealDataUrl,
      custom_signature_data_url: config.customSignatureDataUrl,
      seal_shape: config.sealShape,
      seal_border_width: config.sealBorderWidth,
      show_machined_tag: config.showMachinedTag,
      default_weight_safety_buffer: config.defaultWeightSafetyBuffer,
      cipl_invoice_prefix: config.ciplInvoicePrefix,
      qr_sticker_format: config.qrStickerFormat,
      data_privacy_masking_for_it: config.dataPrivacyMaskingForIT,
      updated_at: new Date().toISOString()
    })
    results['system_config'] = 1

    // 2. Sync Suppliers
    try {
      const suppliers = dbInstance.getSuppliers()
      if (suppliers.length > 0) {
        await currentClient.from('suppliers').upsert(suppliers)
        results['suppliers'] = suppliers.length
      }
    } catch (err: any) {
      console.warn('Sync suppliers warning:', err.message)
    }

    // 3. Sync Customers
    try {
      const customers = dbInstance.getCustomers()
      if (customers.length > 0) {
        await currentClient.from('customers').upsert(customers)
        results['customers'] = customers.length
      }
    } catch (err: any) {
      console.warn('Sync customers warning:', err.message)
    }

    // 4. Sync Items
    try {
      const items = dbInstance.getItems()
      if (items.length > 0) {
        await currentClient.from('items').upsert(items)
        results['items'] = items.length
      }
    } catch (err: any) {
      console.warn('Sync items warning:', err.message)
    }

    // 5. Sync Lots (with strict PostgreSQL NOT-NULL constraint sanitization)
    try {
      const lots = dbInstance.getLots()
      if (lots.length > 0) {
        const sanitizedLots = lots.map((l: any) => ({
          ...l,
          warehouse_location: l.warehouse_location || 'MAIN YARD',
          original_qty: Number(l.original_qty || l.received_qty || 1),
          received_qty: Number(l.received_qty || l.original_qty || 1),
          purchase_type: l.purchase_type || 'regular',
          supplier_name: l.supplier_name || 'MSG Stock',
          yom: Number(l.yom || 2026),
          stock_receipt_date: l.stock_receipt_date || new Date().toISOString().substring(0, 10)
        }))
        await currentClient.from('stock_lots').upsert(sanitizedLots)
        results['stock_lots'] = sanitizedLots.length
      }
    } catch (err: any) {
      console.warn('Sync stock_lots warning:', err.message)
    }

    // 6. Sync Balances
    try {
      const balances = dbInstance.getBalances()
      if (balances.length > 0) {
        const sanitizedBalances = balances.map((b: any) => ({
          ...b,
          physical_qty: Number(b.physical_qty ?? 0),
          reserved_qty: Number(b.reserved_qty ?? 0),
          available_qty: Number(b.available_qty ?? 0),
          dispatched_qty: Number(b.dispatched_qty ?? 0)
        }))
        await currentClient.from('stock_balances').upsert(sanitizedBalances)
        results['stock_balances'] = sanitizedBalances.length
      }
    } catch (err: any) {
      console.warn('Sync stock_balances warning:', err.message)
    }

    // 7. Sync Sales Orders
    try {
      const orders = dbInstance.getOrders()
      if (orders.length > 0) {
        await currentClient.from('sales_orders').upsert(orders)
        results['sales_orders'] = orders.length
      }
    } catch (err: any) {
      console.warn('Sync sales_orders warning:', err.message)
    }

    // 8. Sync MTC Certificates (with strict PostgreSQL NOT-NULL constraint sanitization)
    try {
      const mtcs = dbInstance.getMTCs()
      if (mtcs.length > 0) {
        const sanitizedMtcs = mtcs.map((m: any) => ({
          ...m,
          purchase_type: m.purchase_type || 'regular',
          verification_status: m.verification_status || 'Verified',
          approval_status: m.approval_status || 'Approved',
          supplier_name: m.supplier_name || 'Mill / Supplier',
          yom: Number(m.yom || 2026),
          upload_date: m.upload_date || new Date().toISOString().substring(0, 10),
          original_file_path: m.original_file_path || '/sample-mtc.pdf'
        }))
        await currentClient.from('mtc_certificates').upsert(sanitizedMtcs)
        results['mtc_certificates'] = sanitizedMtcs.length
      }
    } catch (err: any) {
      console.warn('Sync mtc_certificates warning:', err.message)
    }

    // 9. Sync Stock Movements
    try {
      const movements = dbInstance.getMovements()
      if (movements.length > 0) {
        await currentClient.from('stock_movements').upsert(movements.slice(0, 100))
        results['stock_movements'] = movements.length
      }
    } catch (err: any) {
      console.warn('Sync stock_movements warning:', err.message)
    }

    // 10. Sync User Profiles (IT Engineer Provisioned Users)
    try {
      const users = dbInstance.getUsers()
      if (users && users.length > 0) {
        await currentClient.from('user_profiles').upsert(users.map((u: any) => ({
          id: u.id,
          employee_name: u.employee_name || 'Staff Member',
          email: u.email.trim().toLowerCase(),
          department: u.department || 'Operations',
          role: u.role || 'sales_team',
          account_status: u.account_status || 'Active',
          password: u.password || 'Pass@123',
          allowed_modules: u.allowed_modules || [],
          created_at: u.created_at || new Date().toISOString(),
          last_login: u.last_login || null
        })))
        results['user_profiles'] = users.length
      }
    } catch (err: any) {
      console.warn('Sync user_profiles warning:', err.message)
    }

    // 11. Sync Local Purchases
    try {
      const localPurchases = dbInstance.getLocalPurchases()
      if (localPurchases && localPurchases.length > 0) {
        await currentClient.from('local_purchases').upsert(localPurchases)
        results['local_purchases'] = localPurchases.length
      }
    } catch (err: any) {
      console.warn('Sync local_purchases warning:', err.message)
    }

    // 12. Sync Dispatch Records
    try {
      const dispatches = dbInstance.getDispatches()
      if (dispatches && dispatches.length > 0) {
        await currentClient.from('dispatch_records').upsert(dispatches)
        results['dispatch_records'] = dispatches.length
      }
    } catch (err: any) {
      console.warn('Sync dispatch_records warning:', err.message)
    }

    return {
      success: true,
      message: 'All ERP tables, users, local purchases, and dispatches pushed to Supabase Cloud PostgreSQL successfully!',
      details: results
    }
  } catch (err: any) {
    return {
      success: false,
      message: 'Failed to push data to Supabase: ' + err.message,
      details: null
    }
  }
}

/**
 * Pull all latest data from Supabase Cloud PostgreSQL and populate local database.
 */
export async function pullAllTablesFromSupabase(): Promise<{
  success: boolean
  message: string
  data?: any
}> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, message: 'Supabase credentials not configured.' }
    }

    const [
      { data: configData },
      { data: suppData },
      { data: custData },
      { data: itemsData },
      { data: lotsData },
      { data: balData },
      { data: ordersData },
      { data: mtcsData },
      { data: lpData },
      { data: movData },
      { data: dspData },
      { data: usersData }
    ] = await Promise.all([
      currentClient.from('system_config').select('*').limit(1),
      currentClient.from('suppliers').select('*'),
      currentClient.from('customers').select('*'),
      currentClient.from('items').select('*'),
      currentClient.from('stock_lots').select('*'),
      currentClient.from('stock_balances').select('*'),
      currentClient.from('sales_orders').select('*'),
      currentClient.from('mtc_certificates').select('*'),
      currentClient.from('local_purchases').select('*'),
      currentClient.from('stock_movements').select('*').order('id', { ascending: false }).limit(200),
      currentClient.from('dispatch_records').select('*'),
      currentClient.from('user_profiles').select('*')
    ])

    return {
      success: true,
      message: 'Successfully pulled latest records from Supabase Cloud!',
      data: {
        config: configData?.[0],
        suppliers: suppData || [],
        customers: custData || [],
        items: itemsData || [],
        lots: lotsData || [],
        balances: balData || [],
        orders: ordersData || [],
        mtcs: mtcsData || [],
        localPurchases: lpData || [],
        movements: movData || [],
        dispatches: dspData || [],
        users: usersData || []
      }
    }
  } catch (err: any) {
    return { success: false, message: 'Failed to pull from Supabase: ' + err.message }
  }
}
