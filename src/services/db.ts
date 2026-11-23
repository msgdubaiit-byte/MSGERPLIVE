// Database Service for MSG Oilfield Equipment Trading LLC ERP
// Provides reactive state, relational consistency, transaction-safe allocation, cancellation, and dispatch

import {
  Item,
  StockLot,
  StockBalance,
  SalesOrder,
  MTCCertificate,
  LocalPurchaseRecord,
  StockMovement,
  ApprovalRecord,
  DispatchRecord,
  StockReturn,
  StockAdjustment,
  AuditLog,
  Customer,
  Supplier,
  UserProfile,
  ExcelImportJob,
  StockAllocation,
  SalesOrderItem,
  PurchaseType,
} from '../types'
import { uploadedCertificatesCache } from './certificateVault'
import {
  isSupabaseConfigured,
  getSupabase,
  uploadMTCFileToSupabase,
  pushAllTablesToSupabase,
  pullAllTablesFromSupabase,
  subscribeToRealtimeChanges
} from './supabase'
import { autoDetectHSCode, autoDetectMake, autoDetectCountryOfOrigin } from './sourcingEngine'

const STORAGE_KEY_PREFIX = 'msg_oilfield_v1_'

function loadFromStorage<T>(key: string, defaultVal: T): T {
  try {
    const item = localStorage.getItem(STORAGE_KEY_PREFIX + key)
    return item ? JSON.parse(item) : defaultVal
  } catch (e) {
    console.error('Failed to load ' + key, e)
    return defaultVal
  }
}

function saveToStorage<T>(key: string, data: T) {
  try {
    let payload = data
    if (key === 'mtcs' && Array.isArray(data)) {
      payload = data.map((m: any) => {
        if (m.original_file_path && m.original_file_path.startsWith('data:') && m.original_file_path.length > 500) {
          return { ...m, original_file_path: '/sample-mtc.pdf' }
        }
        return m
      }) as any
    }
    localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(payload))
  } catch (e) {
    console.warn('Storage quota notice for ' + key + ' (data preserved in memory):', e)
  }
}

// Initial Customers
const initialCustomers: Customer[] = [
  { id: 'CUST-STS', customer_code: 'STS-BAHRAIN', customer_name: 'Bahrain Special Technical Services (STS) Co. W.L.L', address: 'PO Box 2603, Manama, Kingdom of Bahrain', contact_details: '+973 1783 2000 | procurement@sts-bh.com', status: 'Active', created_at: '2026-03-01' },
  { id: 'CUST-VALORIS', customer_code: 'VALORIS', customer_name: 'Valoris Energy Services Company', address: 'Dammam Port Road, KSA', contact_details: '+966 13 835 1200 | supply@valoris-energy.com', status: 'Active', created_at: '2026-02-15' },
  { id: 'CUST-001', customer_code: 'ADNOC', customer_name: 'ADNOC Refining & Petrochemicals', address: 'Abu Dhabi, UAE', contact_details: '+971 2 6020000', status: 'Active', created_at: '2026-01-10' },
  { id: 'CUST-002', customer_code: 'PETROFAC', customer_name: 'Petrofac Emirates LLC', address: 'Al Markaziyah, Abu Dhabi', contact_details: '+971 2 6265000', status: 'Active', created_at: '2026-01-15' },
  { id: 'CUST-003', customer_code: 'DUBAL', customer_name: 'Emirates Global Aluminium (DUBAL)', address: 'Jebel Ali, Dubai', contact_details: '+971 4 8846666', status: 'Active', created_at: '2026-02-01' },
  { id: 'CUST-004', customer_code: 'NPCC', customer_name: 'National Petroleum Construction Co (NPCC)', address: 'Mussafah, Abu Dhabi', contact_details: '+971 2 5549000', status: 'Active', created_at: '2026-02-10' },
  { id: 'CUST-005', customer_code: 'MCDERMOTT', customer_name: 'McDermott Middle East Inc', address: 'JAFZA, Dubai', contact_details: '+971 4 8835200', status: 'Active', created_at: '2026-03-01' },
  { id: 'CUST-006', customer_code: 'LAMPRELL', customer_name: 'Lamprell Energy Ltd', address: 'Hamriyah Free Zone, Sharjah', contact_details: '+971 6 5282323', status: 'Active', created_at: '2026-03-12' },
  { id: 'CUST-007', customer_code: 'ARCHIRODON', customer_name: 'Archirodon Construction (Overseas) Co', address: 'Al Barsha, Dubai', contact_details: '+971 4 4578000', status: 'Active', created_at: '2026-03-20' },
  { id: 'CUST-008', customer_code: 'DODSAL', customer_name: 'Dodsal Engineering & Construction', address: 'Deira, Dubai', contact_details: '+971 4 2824100', status: 'Active', created_at: '2026-04-05' },
  { id: 'CUST-009', customer_code: 'TARGET', customer_name: 'Target Engineering Construction Co', address: 'Mussafah, Abu Dhabi', contact_details: '+971 2 6714700', status: 'Active', created_at: '2026-04-18' },
  { id: 'CUST-010', customer_code: 'SNCLAVALIN', customer_name: 'SNC-Lavalin Middle East', address: 'Al Reem Island, Abu Dhabi', contact_details: '+971 2 4085000', status: 'Active', created_at: '2026-05-01' },
]

// Initial Master Items
const initialItems: Item[] = [
  { id: 'ITEM-001', item_code: 'WSO15150F316', item_description: '1/2" Flange SORF CL150 SS316/SS316L', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '1/2" #150', uom: 'PCS', unit_price_aed: 22.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-002', item_code: 'WSO20150F316', item_description: '3/4" Flange SORF CL150 SS316/SS316L', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '3/4" #150', uom: 'PCS', unit_price_aed: 32.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-003', item_code: 'WSO40150F316', item_description: '1 1/2" Flange SORF CL150 SS316/SS316L', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '1 1/2" #150', uom: 'PCS', unit_price_aed: 70.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-004', item_code: 'WSO30150F316', item_description: '1 1/4" Flange SORF CL150 SS316/SS316L', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '1 1/4" #150', uom: 'PCS', unit_price_aed: 70.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-005', item_code: 'EL9050S80WPBBENKAN-STOCK', item_description: 'ELBOW 2", 90DEG, SCH.80, LR, BW, SMLS, ASTM A234 WPB', material_grade: 'ASTM A234 WPB', specification: 'ASME B16.9', size: '2" Sch 80', uom: 'PCS', unit_price_aed: 26.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-006', item_code: 'EL9080S40WPBBENKAN-STOCK', item_description: 'ELBOW 3", 90DEG, SCH.40, LR, BW, SMLS, ASTM A234 WPB', material_grade: 'ASTM A234 WPB', specification: 'ASME B16.9', size: '3" Sch 40', uom: 'PCS', unit_price_aed: 48.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-007', item_code: 'WSO80150F316-LOC', item_description: '3" Flange SORF CL150 SS316/SS316L (Item #8 - Local Purchase)', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '3" #150', uom: 'PCS', unit_price_aed: 155.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-008', item_code: 'WSO100150F316-LOC', item_description: '4" Flange SORF CL150 SS316/SS316L (Item #9 - Local Purchase)', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '4" #150', uom: 'PCS', unit_price_aed: 195.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-009', item_code: 'WN15150S80RFA105SRI-STOCK', item_description: 'FLANGE 1/2", 150#, SCH.80, WNRF, SA105N, ASME B16.5', material_grade: 'ASTM A105N', specification: 'ASME B16.5', size: '1/2" #150', uom: 'PCS', unit_price_aed: 15.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-010', item_code: 'WN150150S80RFA105GB-STOCK', item_description: 'WNRF 6", 150#, SCH.80, ASTM A105N, ASME B16.5', material_grade: 'ASTM A105N', specification: 'ASME B16.5', size: '6" #150', uom: 'PCS', unit_price_aed: 180.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-011', item_code: 'CPL253KNPTA105GB-STOCK', item_description: 'FULL COUPLING 1", 3000#, NPT, A105N, ASME B16.11', material_grade: 'ASTM A105N', specification: 'ASME B16.11', size: '1" 3000#', uom: 'PCS', unit_price_aed: 10.0, is_active: true, created_at: '2026-01-01' },
  { id: 'ITEM-012', item_code: 'WSW20150S40F316', item_description: '3/4" Flange SWRF CL150 Sch 40S SS316/SS316L', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '3/4" Sch 40', uom: 'PCS', unit_price_aed: 33.0, is_active: true, created_at: '2026-01-01' },
]

// Production Stock Lots (Populated from Supabase Cloud)
const initialLots: StockLot[] = []

// Production Balances
const initialBalances: StockBalance[] = []

// Production Local Purchase Records
const initialLocalPurchases: LocalPurchaseRecord[] = []

// Production MTC Certificates
const initialMTCs: MTCCertificate[] = []

// Production Sales Orders
const initialOrders: SalesOrder[] = []


// Production Movements
const initialMovements: StockMovement[] = []


// Initial Users with IT Administrator as USR-001 (Root Initial Administrator & System Provisioner)
export const initialUsers: UserProfile[] = [
  { id: 'USR-001', employee_name: 'Alex Turner (IT Engineer)', email: 'it.engineer@msgoilfield.ae', department: 'IT Systems & Architecture', role: 'it_engineer', account_status: 'Active', created_at: '2026-01-01', last_login: '2026-11-19 10:00' },
  { id: 'USR-002', employee_name: 'Zaid Al-Mansoor', email: 'admin@msgoilfield.ae', department: 'Executive Management', role: 'super_admin', account_status: 'Active', created_at: '2026-01-01', last_login: '2026-10-29 08:00' },
]

export interface SystemCustomConfig {
  companyName: string
  trnNumber: string
  defaultCurrency: string
  companyAddress: string
  contactEmail: string
  contactPhone: string
  themePrimaryColor: string
  mtcStampText: string
  mtcStampColor: string
  mtcStampScale: number
  mtcStampOffsetX: number
  mtcStampOffsetY: number
  mtcInspectorName: string
  inspectorDesignation: string
  inspectorSignName: string
  customSealDataUrl?: string
  customSignatureDataUrl?: string
  sealShape: 'rectangular' | 'round' | 'custom_image'
  sealBorderWidth: number
  showMachinedTag: boolean
  defaultWeightSafetyBuffer: number
  ciplInvoicePrefix: string
  qrStickerFormat: 'thermal_4x6' | 'a4_sheet' | 'standard_tag'
  enableAuditLogging: boolean
  sessionTimeoutMinutes: number
  dataPrivacyMaskingForIT: boolean
}

export const defaultSystemCustomConfig: SystemCustomConfig = {
  companyName: 'MSG OILFIELD EQUIPMENT TRADING LLC',
  trnNumber: '100293847500003',
  defaultCurrency: 'AED',
  companyAddress: 'Industrial Area 2, Al Qusais, P.O. Box 92831, Dubai, United Arab Emirates',
  contactEmail: 'sales@msgoilfield.ae',
  contactPhone: '+971 4 288 1234',
  themePrimaryColor: '#0B2545',
  mtcStampText: 'CERTIFIED TRUE COPY OF ORIGINAL / MSG QA/QC APPROVED',
  mtcStampColor: '#D32F2F',
  mtcStampScale: 100,
  mtcStampOffsetX: 0,
  mtcStampOffsetY: 0,
  mtcInspectorName: 'QA/QC Lead Inspector',
  inspectorDesignation: 'Senior QA/QC Materials Inspector',
  inspectorSignName: 'MSG/QC-04',
  customSealDataUrl: '',
  customSignatureDataUrl: '',
  sealShape: 'rectangular',
  sealBorderWidth: 2,
  showMachinedTag: true,
  defaultWeightSafetyBuffer: 15,
  ciplInvoicePrefix: 'CIPL-INV-',
  qrStickerFormat: 'thermal_4x6',
  enableAuditLogging: true,
  sessionTimeoutMinutes: 60,
  dataPrivacyMaskingForIT: true,
}

export const initialSuppliers: Supplier[] = [
  { id: 'SUPP-001', supplier_code: 'WMASS', supplier_name: 'WMASS FLANGES & FITTINGS GMBH', country: 'Germany', make: 'WMASS GERMANY', supplier_type: 'international_maker', approved_status: 'Approved', contact_person: 'Hans Becker', contact_email: 'sales@wmass.de', created_at: '2024-01-15' },
  { id: 'SUPP-002', supplier_code: 'BENKAN', supplier_name: 'BENKAN CORPORATION', country: 'Thailand', make: 'BENKAN THAILAND', supplier_type: 'international_maker', approved_status: 'Approved', contact_person: 'Somchai Prasert', contact_email: 'export@benkan.co.th', created_at: '2024-02-10' },
  { id: 'SUPP-003', supplier_code: 'MEGA', supplier_name: 'MEGA SPA FITTINGS & VALVES', country: 'Italy', make: 'MEGA ITALY', supplier_type: 'international_maker', approved_status: 'Approved', contact_person: 'Marco Rossi', contact_email: 'sales@mega-spa.it', created_at: '2024-03-05' },
  { id: 'SUPP-004', supplier_code: 'ULMA', supplier_name: 'ULMA PIPING S. COOP.', country: 'Spain', make: 'ULMA SPAIN', supplier_type: 'international_maker', approved_status: 'Approved', contact_person: 'Javier Lopez', contact_email: 'info@ulmapiping.com', created_at: '2024-04-12' },
  { id: 'SUPP-005', supplier_code: 'DELCORTE', supplier_name: 'DELCORTE SAS', country: 'France', make: 'DELCORTE FRANCE', supplier_type: 'international_maker', approved_status: 'Approved', contact_person: 'Pierre Dubois', contact_email: 'contact@delcorte.fr', created_at: '2024-05-20' },
  { id: 'SUPP-006', supplier_code: 'SRI', supplier_name: 'SRI FLANGES & FORGINGS PVT LTD', country: 'India', make: 'SRI FLANGES', supplier_type: 'international_maker', approved_status: 'Approved', contact_person: 'Rajesh Nair', contact_email: 'sales@sriflanges.com', created_at: '2024-06-01' },
  { id: 'SUPP-007', supplier_code: 'SHREE-LP', supplier_name: 'SHREE OILFIELD SUPPLY LLC', country: 'United Arab Emirates', make: 'LOCAL UAE STOCK', supplier_type: 'local_stockist', approved_status: 'Approved', contact_person: 'Sunil Sharma', contact_email: 'procurement@shreeoilfield.ae', contact_phone: '+971 4 288 9988', created_at: '2026-01-10' },
  { id: 'SUPP-008', supplier_code: 'PROMAT-LP', supplier_name: 'PROMAT BD MIDDLE EAST FZE', country: 'United Arab Emirates', make: 'PROMAT STOCK', supplier_type: 'local_stockist', approved_status: 'Approved', contact_person: 'David Clark', contact_email: 'sales@promatme.ae', contact_phone: '+971 4 883 4511', created_at: '2026-02-15' },
  { id: 'SUPP-009', supplier_code: 'ALJEBA-LP', supplier_name: 'AL JEBA OILFIELD TRADING LLC', country: 'United Arab Emirates', make: 'UAE PIPING', supplier_type: 'local_stockist', approved_status: 'Approved', contact_person: 'Ahmed Al-Kindi', contact_email: 'orders@aljeba.ae', contact_phone: '+971 4 332 1100', created_at: '2026-03-20' },
  { id: 'SUPP-010', supplier_code: 'APEX-LP', supplier_name: 'APEX PIPING & TUBULARS FZE', country: 'United Arab Emirates', make: 'APEX STOCK', supplier_type: 'local_stockist', approved_status: 'Approved', contact_person: 'Khurram Khan', contact_email: 'info@apexpiping.ae', contact_phone: '+971 6 526 8899', created_at: '2026-04-05' },
]

// Helper for conflict-free intelligent entity merging between local memory and cloud
function mergeEntities<T extends { id: string }>(localList: T[], remoteList: T[]): T[] {
  if (!remoteList || !Array.isArray(remoteList)) return localList || []
  if (!localList || localList.length === 0) return remoteList
  const remoteMap = new Map(remoteList.map(item => [item.id, item]))
  const result: T[] = [...remoteList]
  for (const loc of localList) {
    if (loc && loc.id && !remoteMap.has(loc.id)) {
      result.unshift(loc)
    }
  }
  return result
}

// Database singleton and state provider
class DBService {
  private suppliers: Supplier[] = []
  private customers: Customer[] = []
  private items: Item[] = []
  private lots: StockLot[] = []
  private balances: StockBalance[] = []
  private orders: SalesOrder[] = []
  private mtcs: MTCCertificate[] = []
  private localPurchases: LocalPurchaseRecord[] = []
  private movements: StockMovement[] = []
  private approvals: ApprovalRecord[] = []
  private dispatches: DispatchRecord[] = []
  private returns: StockReturn[] = []
  private adjustments: StockAdjustment[] = []
  private audits: AuditLog[] = []
  private importJobs: ExcelImportJob[] = []
  private users: UserProfile[] = []
  private systemConfig: SystemCustomConfig = defaultSystemCustomConfig

  private listeners: (() => void)[] = []
  private autoSyncTimer: any = null
  private syncTimeout: any = null
  private isPullingCloud: boolean = false
  private lastLocalWriteTime: number = 0
  private realtimeDebounceTimer: any = null

  constructor() {
    this.init()
    this.startSupabaseAutoSync()
  }

  private init() {
    this.customers = loadFromStorage('customers', initialCustomers)
    this.items = loadFromStorage('items', initialItems)
    this.lots = loadFromStorage('lots', initialLots)
    this.balances = loadFromStorage('balances', initialBalances)
    this.orders = loadFromStorage('orders', initialOrders)
    // Production: orders synchronized from Supabase Cloud

    // Self-healing sanitizer: verify every order item's allocated_qty against real active allocations
    for (const order of this.orders) {
      if (order.status === 'Cancelled' || order.status === 'Dispatched') continue
      for (const item of order.items) {
        const lineAllocs = (order.allocations || []).filter(
          a => (a.sales_order_item_id === item.id || (a as any).so_item_id === item.id) && a.allocation_status !== 'Released'
        )
        const totalLineAllocated = lineAllocs.reduce((sum, a) => sum + (a.allocated_qty || 0), 0)
        item.allocated_qty = totalLineAllocated
        if (item.dispatched_qty >= item.required_qty && item.required_qty > 0) {
          item.line_status = 'Dispatched'
        } else if (totalLineAllocated >= item.required_qty && item.required_qty > 0) {
          item.line_status = 'Allocated'
        } else {
          item.line_status = 'Pending'
        }
      }
      const allLinesAllocated = order.items.length > 0 && order.items.every(i => (i.allocated_qty || 0) >= i.required_qty)
      if (allLinesAllocated && order.status === 'Draft') {
        order.status = 'Stock Allocated'
      } else if (!allLinesAllocated && order.status === 'Stock Allocated') {
        order.status = 'Draft'
      }
    }
    this.mtcs = loadFromStorage('mtcs', initialMTCs)
    this.localPurchases = loadFromStorage('localPurchases', initialLocalPurchases)
    this.movements = loadFromStorage('movements', initialMovements)
    this.approvals = loadFromStorage('approvals', [])
    this.dispatches = loadFromStorage('dispatches', [])
    this.returns = loadFromStorage('returns', [])
    this.adjustments = loadFromStorage('adjustments', [])
    this.audits = loadFromStorage('audits', [])
    this.importJobs = loadFromStorage('importJobs', [])
    this.users = loadFromStorage('users', initialUsers)
    this.systemConfig = loadFromStorage('systemConfig', defaultSystemCustomConfig)
    this.suppliers = loadFromStorage('suppliers', initialSuppliers)
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notify() {
    this.listeners.forEach(l => l())
  }

  // Getters
  public getSuppliers() { return [...this.suppliers] }
  public getCustomers() { return [...this.customers] }
  public getItems() { return [...this.items] }
  public getLots() { return [...this.lots] }
  public getBalances() { return [...this.balances] }
  public getOrders() { return [...this.orders] }
  public getMTCs() { return [...this.mtcs] }
  public getLocalPurchases() { return [...this.localPurchases] }
  public getMovements() { return [...this.movements] }
  public getApprovals() { return [...this.approvals] }
  public getDispatches() { return [...this.dispatches] }
  public getReturns() { return [...this.returns] }
  public getAdjustments() { return [...this.adjustments] }
  public getAudits() { return [...this.audits] }
  public getImportJobs() { return [...this.importJobs] }
  public getUsers() { return [...this.users] }

  // Combined Master Stock View
  public getMasterStockView() {
    return this.lots.map(lot => {
      const bal = this.balances.find(b => b.stock_lot_id === lot.id) || {
        physical_qty: 0,
        reserved_qty: 0,
        available_qty: 0,
        dispatched_qty: 0
      }
      const item = this.items.find(i => i.id === lot.item_id)
      const mtc = this.mtcs.find(m => m.stock_lot_id === lot.id)

      return {
        ...lot,
        material_grade: item?.material_grade || '',
        specification: item?.specification || '',
        size: item?.size || '',
        uom: item?.uom || 'PCS',
        unit_price_aed: item?.unit_price_aed || 0,
        physical_qty: bal.physical_qty,
        reserved_qty: bal.reserved_qty,
        available_qty: bal.available_qty,
        dispatched_qty: bal.dispatched_qty,
        mtc_status: mtc ? (mtc.stamped_file_path ? 'Stamped & Verified' : mtc.verification_status) : 'Missing MTC',
        mtc_pages: mtc?.pages || 0,
        mtc_id: mtc?.id,
        certificate_number: mtc?.certificate_reference || (lot as any).certificate_number || ''
      }
    })
  }

  // FIFO Allocation Engine (targets specific line by unique order item id or item_id)
  public allocateFIFO(orderId: string, lineId: string, requiredQty: number, userEmail: string) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) return { success: false, message: 'Order not found' }

    const orderItem = order.items.find(i => i.id === lineId) || order.items.find(i => i.item_id === lineId)
    if (!orderItem) return { success: false, message: 'Order line not found' }

    const item = this.items.find(i => i.id === orderItem.item_id || i.item_code.toUpperCase() === orderItem.item_code.toUpperCase())
    const itemCode = orderItem.item_code?.toUpperCase().trim() || item?.item_code?.toUpperCase().trim() || ''

    // Find available lots for this item by catalog ID or by item_code
    const matchingLots = this.lots
      .filter(l => 
        (orderItem.item_id && l.item_id === orderItem.item_id) ||
        (l.item_code && l.item_code.toUpperCase().trim() === itemCode)
      )
      .map(lot => {
        const bal = this.balances.find(b => b.stock_lot_id === lot.id)
        return { lot, balance: bal }
      })
      .filter(x => x.balance && x.balance.available_qty > 0)

    // Sort FIFO: stock_receipt_date ASC, then yom ASC, then id ASC
    matchingLots.sort((a, b) => {
      if (a.lot.stock_receipt_date !== b.lot.stock_receipt_date) {
        return a.lot.stock_receipt_date.localeCompare(b.lot.stock_receipt_date)
      }
      return (a.lot.yom || 2024) - (b.lot.yom || 2024)
    })

    const totalAvailable = matchingLots.reduce((sum, x) => sum + (x.balance?.available_qty || 0), 0)
    if (totalAvailable < requiredQty) {
      return {
        success: false,
        message: `Insufficient stock for ${orderItem.item_code}. Required: ${requiredQty} PCS, Total Available: ${totalAvailable} PCS.`
      }
    }

    let remaining = requiredQty
    const allocatedLots: { heat_number: string; qty: number; yom: number; lot_id: string }[] = []

    for (const match of matchingLots) {
      if (remaining <= 0) break
      const take = Math.min(remaining, match.balance!.available_qty)

      // Update balance
      match.balance!.reserved_qty += take
      match.balance!.available_qty -= take
      match.balance!.updated_at = new Date().toISOString()

      // Record Allocation directly for this order line
      const allocId = 'ALC-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
      order.allocations.push({
        id: allocId,
        sales_order_item_id: orderItem.id,
        sales_order_id: order.id,
        stock_lot_id: match.lot.id,
        heat_number: match.lot.heat_number,
        allocated_qty: take,
        released_qty: 0,
        dispatched_qty: 0,
        allocation_status: 'Allocated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      // Record Movement
      this.movements.unshift({
        id: 'MOV-' + Date.now() + '-' + Math.floor(Math.random() * 100),
        stock_lot_id: match.lot.id,
        item_code: orderItem.item_code,
        heat_number: match.lot.heat_number,
        movement_type: 'Reservation',
        quantity: take,
        reference_type: 'SalesOrder',
        reference_id: order.so_number,
        previous_balance: match.balance!.available_qty + take,
        new_balance: match.balance!.available_qty,
        performed_by: userEmail,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        remarks: `FIFO Reservation for ${order.so_number} Line ${orderItem.item_code} (${take} PCS)`
      })

      allocatedLots.push({
        heat_number: match.lot.heat_number,
        qty: take,
        yom: match.lot.yom,
        lot_id: match.lot.id
      })

      remaining -= take
    }

    // Update sales order item allocated quantity, heat number, and certificate reference
    orderItem.allocated_qty += requiredQty
    orderItem.line_status = orderItem.allocated_qty >= orderItem.required_qty ? 'Allocated' : 'Pending'
    if (allocatedLots.length > 0) {
      orderItem.heat_number = allocatedLots.map(a => a.heat_number).join(', ')
      const firstHeat = allocatedLots[0].heat_number
      const mtc = this.mtcs.find(m => m.heat_number.toUpperCase() === firstHeat.toUpperCase())
      orderItem.certificate_number = mtc?.certificate_reference || `MTC-${firstHeat}.pdf`
    }

    // Update order status if all items allocated
    const allAllocated = order.items.every(i => (i.allocated_qty || 0) >= i.required_qty && i.required_qty > 0)
    if (allAllocated) {
      order.status = 'Stock Allocated'
    }

    this.saveAll()
    this.logAudit(userEmail, 'FIFO Stock Allocation', 'Sales Orders', order.so_number, null, { allocatedLots })
    this.notify()

    return {
      success: true,
      allocated: allocatedLots,
      message: `Successfully allocated ${requiredQty} PCS across ${allocatedLots.length} heat(s).`
    }
  }

  // Manual Heat Number Selection (targets specific line by unique order item id or item_id)
  public allocateManual(orderId: string, lineId: string, stockLotId: string, requiredQty: number, userEmail: string) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) return { success: false, message: 'Order not found' }

    const orderItem = order.items.find(i => i.id === lineId) || order.items.find(i => i.item_id === lineId)
    if (!orderItem) return { success: false, message: 'Order line not found' }

    const lot = this.lots.find(l => l.id === stockLotId)
    if (!lot) return { success: false, message: 'Stock lot not found' }

    const bal = this.balances.find(b => b.stock_lot_id === stockLotId)
    if (!bal || bal.available_qty < requiredQty) {
      return {
        success: false,
        message: `Insufficient stock in Heat ${lot.heat_number}. Required: ${requiredQty} PCS, Available: ${bal?.available_qty || 0} PCS.`
      }
    }

    // Deduct available, add to reserved
    bal.reserved_qty += requiredQty
    bal.available_qty -= requiredQty
    bal.updated_at = new Date().toISOString()

    const allocId = 'ALC-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
    order.allocations.push({
      id: allocId,
      sales_order_item_id: orderItem.id,
      sales_order_id: order.id,
      stock_lot_id: lot.id,
      heat_number: lot.heat_number,
      allocated_qty: requiredQty,
      released_qty: 0,
      dispatched_qty: 0,
      allocation_status: 'Allocated',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    // Record Movement
    this.movements.unshift({
      id: 'MOV-' + Date.now() + '-' + Math.floor(Math.random() * 100),
      stock_lot_id: lot.id,
      item_code: orderItem.item_code,
      heat_number: lot.heat_number,
      movement_type: 'Reservation',
      quantity: requiredQty,
      reference_type: 'SalesOrder',
      reference_id: order.so_number,
      previous_balance: bal.available_qty + requiredQty,
      new_balance: bal.available_qty,
      performed_by: userEmail,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      remarks: `Manual Heat Selection: ${lot.heat_number} reserved for ${order.so_number} Line ${orderItem.item_code} (${requiredQty} PCS)`
    })

    orderItem.allocated_qty += requiredQty
    orderItem.line_status = orderItem.allocated_qty >= orderItem.required_qty ? 'Allocated' : 'Pending'
    orderItem.heat_number = lot.heat_number
    const mtc = this.mtcs.find(m => m.stock_lot_id === lot.id || m.heat_number.toUpperCase() === lot.heat_number.toUpperCase())
    orderItem.certificate_number = mtc?.certificate_reference || `MTC-${lot.heat_number}.pdf`

    const allAllocated = order.items.every(i => (i.allocated_qty || 0) >= i.required_qty && i.required_qty > 0)
    if (allAllocated) {
      order.status = 'Stock Allocated'
    }

    this.saveAll()
    this.logAudit(userEmail, 'Manual Heat Allocation', 'Sales Orders', order.so_number, null, { heat: lot.heat_number, qty: requiredQty })
    this.notify()

    return {
      success: true,
      message: `Successfully allocated ${requiredQty} PCS from Heat ${lot.heat_number}.`
    }
  }

  // Release existing reservations for a single order line so a new heat can be allocated
  public deallocateLine(orderId: string, lineId: string, userEmail: string) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) return { success: false, message: 'Order not found' }

    const orderItem = order.items.find(i => i.id === lineId) || order.items.find(i => i.item_id === lineId)
    if (!orderItem) return { success: false, message: 'Order line not found' }

    const toRemove = order.allocations.filter(
      a => a.sales_order_item_id === orderItem.id || (a as any).so_item_id === orderItem.id
    )

    for (const alloc of toRemove) {
      const bal = this.balances.find(b => b.stock_lot_id === alloc.stock_lot_id)
      if (bal) {
        bal.reserved_qty = Math.max(0, bal.reserved_qty - alloc.allocated_qty)
        bal.available_qty += alloc.allocated_qty
        bal.updated_at = new Date().toISOString()
      }
    }

    const removedIds = new Set(toRemove.map(a => a.id))
    order.allocations = order.allocations.filter(a => !removedIds.has(a.id))
    orderItem.allocated_qty = 0
    orderItem.line_status = 'Pending'

    if (order.status === 'Stock Allocated') {
      order.status = 'Draft'
    }

    order.status = 'Draft'

    this.saveAll()
    this.logAudit(userEmail, 'Release Line Allocation', 'Sales Orders', order.so_number, null, { lineId })
    this.notify()

    return { success: true, message: 'Line reservations released.' }
  }

  // Submit Order for Storekeeper Physical Approval
  public submitForApproval(orderId: string, userEmail: string) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) return { success: false, message: 'Order not found' }
    if (order.status !== 'Stock Allocated') {
      return { success: false, message: 'Stock must be allocated before submitting for storekeeper approval.' }
    }

    order.status = 'Pending Storekeeper Approval'
    order.updated_at = new Date().toISOString()

    this.saveAll()
    this.logAudit(userEmail, 'Submitted for Approval', 'Sales Orders', order.so_number)
    this.notify()
    return { success: true, message: 'Sales Order submitted to Storekeeper approval queue.' }
  }

  // Storekeeper Approval Action
  public storekeeperApprove(orderId: string, approverName: string, status: 'Approved' | 'Rejected' | 'Correction Requested', remarks: string) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) return { success: false, message: 'Order not found' }

    if (status === 'Approved') {
      order.status = 'Approved'
      order.approved_by = approverName
      order.store_remarks = remarks
    } else if (status === 'Rejected') {
      order.status = 'Draft'
      order.store_remarks = `Rejected: ${remarks}`
    } else {
      order.status = 'Draft'
      order.store_remarks = `Correction requested: ${remarks}`
    }

    order.updated_at = new Date().toISOString()

    // Record Approval
    this.approvals.unshift({
      id: 'APR-' + Date.now(),
      sales_order_id: order.id,
      so_number: order.so_number,
      approval_type: 'Storekeeper Physical Verification',
      approval_status: status,
      approved_by: approverName,
      approval_date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      remarks: remarks
    })

    this.saveAll()
    this.logAudit(approverName, `Storekeeper ${status}`, 'Approvals', order.so_number, null, { remarks })
    this.notify()
    return { success: true, message: `Storekeeper status recorded: ${status}` }
  }

  // Cancel Sales Order with Comprehensive Reservation Release Safeguards
  public cancelSalesOrder(orderId: string, reason: string, userEmail: string) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) return { success: false, message: 'Order not found' }

    if (order.status === 'Cancelled') {
      return { success: false, message: 'Order is already cancelled' }
    }

    // Safety check: Fully Dispatched orders cannot be cancelled to restore stock without formal return
    if (order.status === 'Dispatched') {
      return {
        success: false,
        message: 'Order is fully dispatched. Dispatched materials cannot be restored by cancellation. Please create an authorized Return.'
      }
    }

    // Release only undispatched reservations
    for (const alloc of order.allocations) {
      if (alloc.allocation_status === 'Allocated') {
        const bal = this.balances.find(b => b.stock_lot_id === alloc.stock_lot_id)
        const unreleased = alloc.allocated_qty - alloc.dispatched_qty

        if (bal && unreleased > 0) {
          bal.reserved_qty -= unreleased
          bal.available_qty += unreleased
          bal.updated_at = new Date().toISOString()

          alloc.released_qty = unreleased
          alloc.allocation_status = 'Released'
          alloc.updated_at = new Date().toISOString()

          // Log movement
          this.movements.unshift({
            id: 'MOV-' + Date.now() + '-' + Math.floor(Math.random() * 100),
            stock_lot_id: alloc.stock_lot_id,
            item_code: order.items.find(i => i.id === alloc.sales_order_item_id)?.item_code || '',
            heat_number: alloc.heat_number,
            movement_type: 'Reservation Release',
            quantity: unreleased,
            reference_type: 'SalesOrderCancellation',
            reference_id: order.so_number,
            previous_balance: bal.available_qty - unreleased,
            new_balance: bal.available_qty,
            performed_by: userEmail,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
            remarks: `Order Cancelled: ${reason}. ${unreleased} PCS restored to available stock.`
          })
        }
      }
    }

    order.status = 'Cancelled'
    order.cancellation_date = new Date().toISOString().replace('T', ' ').substring(0, 16)
    order.cancellation_reason = reason
    order.updated_at = new Date().toISOString()

    this.saveAll()
    this.logAudit(userEmail, 'Cancel Sales Order', 'Sales Orders', order.so_number, null, { reason })
    this.notify()

    return {
      success: true,
      message: `Sales Order ${order.so_number} cancelled. Outstanding reservations released back to available stock.`
    }
  }

  // Confirm Dispatch
  public confirmDispatch(
    orderId: string,
    dispatchItems: { allocation_id: string; dispatch_qty: number }[],
    deliveryNote: string,
    deliveryRef: string,
    userEmail: string,
    remarks: string
  ) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) return { success: false, message: 'Order not found' }

    if (order.status !== 'Approved' && order.status !== 'MTC Generated' && order.status !== 'Partially Dispatched') {
      return { success: false, message: 'Only storekeeper-approved orders can be dispatched.' }
    }

    const itemsSummary: { item_code: string; heat_number: string; quantity: number }[] = []

    for (const item of dispatchItems) {
      const alloc = order.allocations.find(a => a.id === item.allocation_id)
      if (!alloc) continue

      const remainingAlloc = alloc.allocated_qty - alloc.dispatched_qty
      if (item.dispatch_qty > remainingAlloc) {
        return {
          success: false,
          message: `Dispatch quantity (${item.dispatch_qty}) exceeds approved allocation balance (${remainingAlloc}) for Heat ${alloc.heat_number}.`
        }
      }

      const bal = this.balances.find(b => b.stock_lot_id === alloc.stock_lot_id)
      if (bal) {
        // Physical stock reduces by dispatched qty
        // Reserved stock reduces by dispatched qty
        // Available stock remains unchanged (already subtracted during reservation)
        bal.physical_qty -= item.dispatch_qty
        bal.reserved_qty -= item.dispatch_qty
        bal.dispatched_qty += item.dispatch_qty
        bal.updated_at = new Date().toISOString()

        alloc.dispatched_qty += item.dispatch_qty
        if (alloc.dispatched_qty >= alloc.allocated_qty) {
          alloc.allocation_status = 'Dispatched'
        }

        const soItem = order.items.find(i => i.id === alloc.sales_order_item_id)
        if (soItem) {
          soItem.dispatched_qty += item.dispatch_qty
          if (soItem.dispatched_qty >= soItem.required_qty) {
            soItem.line_status = 'Dispatched'
          }
        }

        itemsSummary.push({
          item_code: soItem?.item_code || '',
          heat_number: alloc.heat_number,
          quantity: item.dispatch_qty
        })

        // Immutable stock movement
        this.movements.unshift({
          id: 'MOV-' + Date.now() + '-' + Math.floor(Math.random() * 100),
          stock_lot_id: alloc.stock_lot_id,
          item_code: soItem?.item_code || '',
          heat_number: alloc.heat_number,
          movement_type: 'Dispatch',
          quantity: item.dispatch_qty,
          reference_type: 'DeliveryNote',
          reference_id: deliveryNote,
          previous_balance: bal.physical_qty + item.dispatch_qty,
          new_balance: bal.physical_qty,
          performed_by: userEmail,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
          remarks: `Dispatched ${item.dispatch_qty} PCS against ${order.so_number} (DN: ${deliveryNote})`
        })
      }
    }

    // Determine overall order status
    const allDispatched = order.items.every(i => i.dispatched_qty >= i.required_qty)
    order.status = allDispatched ? 'Dispatched' : 'Partially Dispatched'
    order.updated_at = new Date().toISOString()

    // Record Dispatch
    const dispId = 'DSP-' + Date.now()
    this.dispatches.unshift({
      id: dispId,
      sales_order_id: order.id,
      so_number: order.so_number,
      dispatch_reference: deliveryRef || `DSP-${Date.now().toString().slice(-4)}`,
      dispatch_date: new Date().toISOString().substring(0, 10),
      delivery_note_number: deliveryNote,
      customer_name: order.customer_name,
      dispatched_by: userEmail,
      delivery_remarks: remarks,
      items_summary: itemsSummary,
      created_at: new Date().toISOString()
    })

    this.saveAll()
    this.logAudit(userEmail, 'Dispatch Confirmed', 'Dispatch', order.so_number, null, { deliveryNote, itemsSummary })
    this.notify()

    return {
      success: true,
      message: `Dispatch confirmed for ${order.so_number}. Delivery Note: ${deliveryNote}`
    }
  }

  // Material Return
  public recordMaterialReturn(orderId: string, stockLotId: string, qty: number, reason: string, userEmail: string) {
    const order = this.orders.find(o => o.id === orderId)
    const lot = this.lots.find(l => l.id === stockLotId)
    const bal = this.balances.find(b => b.stock_lot_id === stockLotId)

    if (!lot || !bal) return { success: false, message: 'Stock lot not found' }

    // Physical stock increases, available stock increases
    bal.physical_qty += qty
    bal.available_qty += qty
    bal.dispatched_qty = Math.max(0, bal.dispatched_qty - qty)
    bal.updated_at = new Date().toISOString()

    const retId = 'RET-' + Date.now()
    this.returns.unshift({
      id: retId,
      sales_order_id: orderId,
      so_number: order?.so_number || 'N/A',
      stock_lot_id: stockLotId,
      item_code: lot.item_code,
      heat_number: lot.heat_number,
      returned_qty: qty,
      return_date: new Date().toISOString().substring(0, 10),
      reason,
      authorized_by: userEmail,
      acceptance_status: 'Accepted',
      created_at: new Date().toISOString()
    })

    this.movements.unshift({
      id: 'MOV-' + Date.now() + '-' + Math.floor(Math.random() * 100),
      stock_lot_id: stockLotId,
      item_code: lot.item_code,
      heat_number: lot.heat_number,
      movement_type: 'Approved Customer Return',
      quantity: qty,
      reference_type: 'CustomerReturn',
      reference_id: retId,
      previous_balance: bal.physical_qty - qty,
      new_balance: bal.physical_qty,
      performed_by: userEmail,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      remarks: `Material Return: ${qty} PCS accepted back into inventory. Reason: ${reason}`
    })

    this.saveAll()
    this.logAudit(userEmail, 'Material Return Accepted', 'Returns', lot.heat_number, null, { qty, reason })
    this.notify()

    return { success: true, message: `Material Return recorded. ${qty} PCS restored to physical and available inventory.` }
  }

  // Stock Adjustment (Manager Authorized)
  public adjustStock(stockLotId: string, newPhysicalQty: number, reason: string, userEmail: string) {
    const lot = this.lots.find(l => l.id === stockLotId)
    const bal = this.balances.find(b => b.stock_lot_id === stockLotId)

    if (!lot || !bal) return { success: false, message: 'Stock lot not found' }

    const oldPhysical = bal.physical_qty
    const diff = newPhysicalQty - oldPhysical

    if (newPhysicalQty < bal.reserved_qty) {
      return {
        success: false,
        message: `New physical quantity (${newPhysicalQty}) cannot be less than currently reserved quantity (${bal.reserved_qty}).`
      }
    }

    bal.physical_qty = newPhysicalQty
    bal.available_qty = newPhysicalQty - bal.reserved_qty
    bal.updated_at = new Date().toISOString()

    const adjId = 'ADJ-' + Date.now()
    this.adjustments.unshift({
      id: adjId,
      stock_lot_id: stockLotId,
      item_code: lot.item_code,
      heat_number: lot.heat_number,
      original_balance: oldPhysical,
      adjusted_balance: newPhysicalQty,
      difference_qty: diff,
      reason,
      requested_by: userEmail,
      approved_by: userEmail,
      status: 'Approved',
      created_at: new Date().toISOString()
    })

    this.movements.unshift({
      id: 'MOV-' + Date.now() + '-' + Math.floor(Math.random() * 100),
      stock_lot_id: stockLotId,
      item_code: lot.item_code,
      heat_number: lot.heat_number,
      movement_type: 'Stock Adjustment',
      quantity: diff,
      reference_type: 'Adjustment',
      reference_id: adjId,
      previous_balance: oldPhysical,
      new_balance: newPhysicalQty,
      performed_by: userEmail,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      remarks: `Stock Adjustment: ${diff > 0 ? '+' : ''}${diff} PCS. Reason: ${reason}`
    })

    this.saveAll()
    this.logAudit(userEmail, 'Stock Adjustment', 'Inventory', lot.heat_number, { oldPhysical }, { newPhysicalQty, reason })
    this.notify()

    return { success: true, message: `Stock adjusted for Heat ${lot.heat_number} from ${oldPhysical} to ${newPhysicalQty} PCS.` }
  }

  // Create Sales Order
  public createSalesOrder(orderData: {
    customer_id?: string
    customer_name?: string
    po_number: string
    so_number?: string
    required_delivery_date: string
    items: { item_id?: string; item_code?: string; item_description?: string; heat_number?: string; location?: string; required_qty: number; client_po_item_no?: string; position?: number }[]
    po_document_name?: string
    po_document_url?: string
    userEmail: string
  }) {
    let customer = orderData.customer_id ? this.customers.find(c => c.id === orderData.customer_id) : null
    if (!customer && orderData.customer_name) {
      customer = this.customers.find(c => c.customer_name.toLowerCase().trim() === orderData.customer_name!.toLowerCase().trim())
      if (!customer) {
        // Register new customer on the fly
        const newCust: Customer = {
          id: 'CUST-' + (this.customers.length + 1).toString().padStart(3, '0'),
          customer_code: 'CUST-' + (this.customers.length + 1).toString().padStart(3, '0'),
          customer_name: orderData.customer_name.trim(),
          address: 'Dubai / Abu Dhabi, UAE',
          contact_details: 'procurement@client.ae',
          status: 'Active',
          created_at: new Date().toISOString()
        }
        this.customers.push(newCust)
        customer = newCust
      }
    }
    if (!customer) {
      customer = this.customers[0] || {
        id: 'CUST-001',
        customer_code: 'CUST-001',
        customer_name: 'Valued Client',
        address: 'UAE',
        contact_details: 'sales@client.ae',
        status: 'Active',
        created_at: new Date().toISOString()
      }
    }

    const count = this.orders.length + 116
    const soNumber = orderData.so_number?.trim() || `SO-2026-${count}`
    const orderId = `ORD-${count}`

    const allocations: StockAllocation[] = []

    const soItems = orderData.items.map((item, idx) => {
      let itm = item.item_id ? this.items.find(i => i.id === item.item_id) : null
      if (!itm && item.item_code) {
        itm = this.items.find(i => i.item_code.toLowerCase().trim() === item.item_code!.toLowerCase().trim())
        if (!itm) {
          // Add item if missing
          itm = {
            id: 'ITEM-' + (this.items.length + 1).toString().padStart(3, '0'),
            item_code: item.item_code.trim().toUpperCase(),
            item_description: item.item_description?.trim() || `Oilfield Material ${item.item_code}`,
            material_grade: 'ASTM A234 WPB / SS316',
            specification: 'ASME B16.9 / B16.5',
            size: 'Standard',
            uom: 'PCS',
            unit_price_aed: 50,
            is_active: true,
            created_at: new Date().toISOString()
          }
          this.items.push(itm)
        } else if (item.item_description && (!itm.item_description || itm.item_description.startsWith('Oilfield Material '))) {
          itm.item_description = item.item_description.trim()
        }
      }

      const itemId = itm?.id || `ITEM-${idx + 1}`
      const itemCode = itm?.item_code || item.item_code || 'GENERIC-ITEM'
      const soItemId = `SOI-${count}-${idx + 1}`

      let allocatedQty = 0
      let lineStatus: 'Pending' | 'Allocated' = 'Pending'

      // Check if heat number was specified in the PDF / form
      const specifiedHeat = item.heat_number?.trim()
      if (specifiedHeat) {
        // Find or create matching stock lot with this heat number
        let lot = this.lots.find(l => 
          l.heat_number.toUpperCase() === specifiedHeat.toUpperCase() &&
          (l.item_code.toLowerCase() === itemCode.toLowerCase() || l.item_id === itemId)
        )

        // If not found by item code, find by heat number directly
        if (!lot) {
          lot = this.lots.find(l => l.heat_number.toUpperCase() === specifiedHeat.toUpperCase())
        }

        if (!lot) {
          const newLotId = 'LOT-' + Date.now().toString().slice(-4) + '-' + (idx + 1)
          const isLocal = /^L[-_0-9]/i.test(itemCode) || /LOCAL/i.test(itemCode) || (!itemCode.toUpperCase().includes('STOCK') && /^L/i.test(itemCode))
          const purchaseType: PurchaseType = isLocal ? 'local_purchase' : 'regular'

          const newLot: StockLot = {
            id: newLotId,
            item_id: itemId,
            item_code: itemCode,
            item_description: item.item_description?.trim() || itm?.item_description || `Oilfield Material ${itemCode}`,
            heat_number: specifiedHeat,
            yom: 2026,
            original_qty: item.required_qty + 20,
            received_qty: item.required_qty + 20,
            purchase_type: purchaseType,
            l_code: isLocal ? itemCode : undefined,
            supplier_name: isLocal ? 'Local UAE Supplier' : 'BENKAN THAILAND',
            warehouse_location: item.location || 'LN: BB10',
            stock_receipt_date: new Date().toISOString().substring(0, 10),
            mtc_ref: `MTC-${specifiedHeat}.pdf`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          this.lots.push(newLot)
          lot = newLot

          if (isLocal) {
            this.localPurchases.unshift({
              id: 'LP-' + Date.now().toString().slice(-4) + '-' + (idx + 1),
              l_code: itemCode,
              item_id: itemId,
              item_code: itemCode,
              stock_lot_id: newLotId,
              supplier_name: 'Local UAE Supplier',
              purchase_reference: orderData.po_number || 'LPO-LOCAL',
              purchase_date: new Date().toISOString().substring(0, 10),
              received_qty: item.required_qty + 20,
              yom: 2026,
              supplier_mtc_uploaded: true,
              created_by: orderData.userEmail || 'System Auto-Link',
              created_at: new Date().toISOString()
            })
          }

          // Create balance with stock
          this.balances.push({
            id: 'BAL-' + newLotId,
            stock_lot_id: newLotId,
            physical_qty: item.required_qty + 20,
            reserved_qty: 0,
            available_qty: item.required_qty + 20,
            dispatched_qty: 0,
            updated_at: new Date().toISOString()
          })

          // Auto-create verified MTC certificate for this heat number
          const newCert: MTCCertificate = {
            id: 'MTC-' + specifiedHeat,
            item_id: itemId,
            item_code: itemCode,
            stock_lot_id: newLotId,
            heat_number: specifiedHeat,
            certificate_reference: `MTC-${specifiedHeat}.pdf`,
            original_file_path: '/sample-mtc.pdf',
            purchase_type: 'regular',
            supplier_name: 'BENKAN THAILAND',
            upload_date: new Date().toISOString().substring(0, 10),
            uploaded_by: orderData.userEmail || 'System Auto-Link',
            verification_status: 'Verified',
            approval_status: 'Approved',
            pages: 2,
            yom: 2026,
            created_at: new Date().toISOString()
          }
          this.mtcs.unshift(newCert)
        }

        const validLot = lot as StockLot
        // Allocate from this lot and reduce available balance
        const bal = this.balances.find(b => b.stock_lot_id === validLot.id)
        if (bal) {
          const qtyToAllocate = Math.min(item.required_qty, bal.available_qty > 0 ? bal.available_qty : item.required_qty)
          if (bal.available_qty < qtyToAllocate) {
            bal.physical_qty += qtyToAllocate
            bal.available_qty += qtyToAllocate
          }
          bal.reserved_qty += qtyToAllocate
          bal.available_qty -= qtyToAllocate
          bal.updated_at = new Date().toISOString()

          allocatedQty = qtyToAllocate
          lineStatus = 'Allocated'

          let matchedMtc = this.mtcs.find(m => m.heat_number.toUpperCase() === specifiedHeat.toUpperCase())
          if (!matchedMtc && specifiedHeat && !specifiedHeat.startsWith('LOT-')) {
            matchedMtc = {
              id: 'MTC-' + specifiedHeat,
              item_id: itemId,
              item_code: itemCode,
              stock_lot_id: validLot.id,
              heat_number: specifiedHeat,
              certificate_reference: `MTC-${specifiedHeat}.pdf`,
              original_file_path: '/sample-mtc.pdf',
              purchase_type: 'regular',
              supplier_name: (item as any).supplier_name || 'BENKAN THAILAND',
              upload_date: new Date().toISOString().substring(0, 10),
              uploaded_by: orderData.userEmail || 'System Auto-Link',
              verification_status: 'Verified',
              approval_status: 'Approved',
              pages: 2,
              yom: 2026,
              created_at: new Date().toISOString()
            }
            this.mtcs.unshift(matchedMtc)
          }

          allocations.push({
            id: 'ALC-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000),
            sales_order_item_id: soItemId,
            sales_order_id: orderId,
            stock_lot_id: validLot.id,
            heat_number: specifiedHeat,
            mtc_certificate_id: matchedMtc?.id,
            allocated_qty: qtyToAllocate,
            released_qty: 0,
            dispatched_qty: 0,
            allocation_status: 'Allocated',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

          this.movements.unshift({
            id: 'MOV-' + Date.now() + '-' + idx,
            stock_lot_id: validLot.id,
            item_code: itemCode,
            heat_number: specifiedHeat,
            movement_type: 'Reservation',
            quantity: qtyToAllocate,
            reference_type: 'SalesOrder',
            reference_id: soNumber,
            previous_balance: bal.available_qty + qtyToAllocate,
            new_balance: bal.available_qty,
            performed_by: orderData.userEmail,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
            remarks: `Direct Heat Assignment: ${specifiedHeat} reserved for ${soNumber} (${qtyToAllocate} PCS)`
          })
        }
      }

      const existingCert = this.mtcs.find(m => specifiedHeat && m.heat_number.toUpperCase() === specifiedHeat.toUpperCase())

      const resolvedDesc = item.item_description?.trim() || itm?.item_description || `Oilfield Fitting ${itemCode}`
      const explicitHS = (item as any).hs_code || (item as any).hsCode || ''
      const resolvedHS = autoDetectHSCode(resolvedDesc, itemCode, explicitHS)
      const resolvedMake = (item as any).make || autoDetectMake(resolvedDesc) || ''
      const resolvedCOO = (item as any).country_of_origin || (item as any).countryOfOrigin || ''
      const resolvedUnitPrice = (item as any).unit_price ?? (item as any).rate ?? (item as any).unitPrice ?? itm?.unit_price_aed ?? 0
      const resolvedUom = (item as any).uom || itm?.uom || 'PCS'

      return {
        id: soItemId,
        sales_order_id: orderId,
        item_id: itemId,
        item_code: itemCode,
        item_description: resolvedDesc,
        heat_number: specifiedHeat,
        certificate_number: existingCert?.certificate_reference || (specifiedHeat ? `MTC-${specifiedHeat}.pdf` : undefined),
        location: item.location,
        client_po_item_no: (item as any).client_po_item_no || String((item as any).position || idx + 1),
        position: (item as any).position || idx + 1,
        make: resolvedMake,
        supplier_name: (item as any).supplier_name || (item as any).supplierName || '',
        supplier_po_number: (item as any).supplier_po_number || '',
        package_type: (item as any).package_type || (item as any).packageType || 'Pallet',
        package_no: (item as any).package_no || (item as any).packageNo || `${Math.floor(idx / 3) + 1}`,
        hs_code: resolvedHS,
        country_of_origin: resolvedCOO,
        unit_price: resolvedUnitPrice,
        required_qty: item.required_qty,
        allocated_qty: allocatedQty,
        dispatched_qty: 0,
        uom: resolvedUom,
        line_status: lineStatus
      }
    })

    const allAllocated = soItems.every(i => i.allocated_qty >= i.required_qty && i.allocated_qty > 0)

    const newOrder: SalesOrder = {
      id: orderId,
      so_number: soNumber,
      po_number: orderData.po_number || 'PO-PENDING',
      customer_id: customer.id,
      customer_name: customer.customer_name,
      order_date: new Date().toISOString().substring(0, 10),
      required_delivery_date: orderData.required_delivery_date || new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
      status: allAllocated ? 'Stock Allocated' : 'Draft',
      created_by: orderData.userEmail,
      mtc_package_generated: false,
      po_document_name: orderData.po_document_name,
      po_document_url: orderData.po_document_url,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: soItems,
      allocations: allocations
    }

    this.orders.unshift(newOrder)
    this.lastLocalWriteTime = Date.now()
    this.saveAll()

    // Immediate direct write to Supabase Cloud so the order persists instantly
    if (isSupabaseConfigured()) {
      Promise.resolve(getSupabase().from('sales_orders').upsert(newOrder)).then((res: any) => {
        if (res?.error) console.warn('Direct order push error:', res.error)
      }).catch((err: any) => console.warn('Direct order push catch:', err))

      if (allocations.length > 0) {
        const sanitizedLots = this.lots.map(l => ({
          ...l,
          warehouse_location: l.warehouse_location || 'MAIN YARD',
          original_qty: Number(l.original_qty || l.received_qty || 1),
          received_qty: Number(l.received_qty || l.original_qty || 1),
          purchase_type: l.purchase_type || 'regular',
          supplier_name: l.supplier_name || 'MSG Stock',
          yom: Number(l.yom || 2026),
          stock_receipt_date: l.stock_receipt_date || new Date().toISOString().substring(0, 10)
        }))
        const sanitizedBalances = this.balances.map(b => ({
          ...b,
          physical_qty: Number(b.physical_qty ?? 0),
          reserved_qty: Number(b.reserved_qty ?? 0),
          available_qty: Number(b.available_qty ?? 0),
          dispatched_qty: Number(b.dispatched_qty ?? 0)
        }))
        const sanitizedMtcs = this.mtcs.map(m => ({
          ...m,
          purchase_type: m.purchase_type || 'regular',
          verification_status: m.verification_status || 'Verified',
          approval_status: m.approval_status || 'Approved',
          yom: Number(m.yom || 2026),
          original_file_path: m.original_file_path || '/sample-mtc.pdf'
        }))
        Promise.resolve(getSupabase().from('stock_lots').upsert(sanitizedLots)).catch(() => {})
        Promise.resolve(getSupabase().from('stock_balances').upsert(sanitizedBalances)).catch(() => {})
        Promise.resolve(getSupabase().from('mtc_certificates').upsert(sanitizedMtcs)).catch(() => {})
      }
    }

    this.logAudit(orderData.userEmail, 'Create Sales Order', 'Sales Orders', soNumber, null, newOrder)
    this.notify()

    return {
      success: true,
      order: newOrder,
      message: `Sales Order ${soNumber} created successfully.${allocations.length > 0 ? ` Automatically assigned ${allocations.length} Heat Certificate(s) and reserved stock.` : ''}`
    }
  }

  // Update Sales Order and apply changes everywhere (items, heats, suppliers, PO, client)
  public updateSalesOrder(updatedData: {
    id: string
    so_number?: string
    po_number?: string
    customer_name?: string
    required_delivery_date?: string
    bapco_transmittal?: string
    items?: Partial<SalesOrderItem>[]
  }): { success: boolean; order?: SalesOrder; message?: string } {
    const order = this.orders.find(o => o.id === updatedData.id)
    if (!order) {
      return { success: false, message: 'Sales Order not found' }
    }

    if (updatedData.so_number) order.so_number = updatedData.so_number.trim()
    if (updatedData.po_number) order.po_number = updatedData.po_number.trim()
    if (updatedData.customer_name) order.customer_name = updatedData.customer_name.trim()
    if (updatedData.required_delivery_date) order.required_delivery_date = updatedData.required_delivery_date
    if (updatedData.bapco_transmittal !== undefined) order.bapco_transmittal = updatedData.bapco_transmittal

    if (updatedData.items && updatedData.items.length > 0) {
      const remainingIds = new Set(updatedData.items.map(i => i.id).filter(Boolean))

      // Clean up allocations for removed/deleted line items
      if (order.allocations && order.allocations.length > 0) {
        order.allocations = order.allocations.filter(a => {
          const lId = a.sales_order_item_id || a.so_item_id
          return !lId || remainingIds.has(lId)
        })
      }

      // Rebuild order.items preserving split batches and order
      const newItems: SalesOrderItem[] = updatedData.items.map((upItem, idx) => {
        let existing = order.items.find(i => i.id === upItem.id)
        if (!existing && upItem.position) {
          existing = order.items.find(i => i.position === upItem.position && i.client_po_item_no === upItem.client_po_item_no)
        }

        const fallbackItem = order.items[0]
        const resolvedId = upItem.id || `SO-ITEM-${Date.now()}-${idx + 1}`
        const resolvedPosition = upItem.position || idx + 1
        const resolvedCode = upItem.item_code || existing?.item_code || fallbackItem?.item_code || `ITEM-${resolvedPosition}`
        const resolvedItemId = existing?.item_id || fallbackItem?.item_id || `CAT-${resolvedPosition}`

        const mergedItem: SalesOrderItem = {
          id: resolvedId,
          sales_order_id: order.id,
          item_id: resolvedItemId,
          item_code: resolvedCode,
          item_description: upItem.item_description !== undefined ? upItem.item_description : (existing?.item_description || ''),
          client_po_item_no: upItem.client_po_item_no !== undefined ? upItem.client_po_item_no : (existing?.client_po_item_no || String(resolvedPosition)),
          position: resolvedPosition,
          required_qty: upItem.required_qty !== undefined ? upItem.required_qty : (existing?.required_qty || 1),
          allocated_qty: upItem.heat_number ? (upItem.required_qty || existing?.required_qty || 1) : (existing?.allocated_qty || 0),
          dispatched_qty: existing?.dispatched_qty || 0,
          uom: upItem.uom !== undefined ? upItem.uom : (existing?.uom || 'EA'),
          heat_number: upItem.heat_number !== undefined ? upItem.heat_number : (existing?.heat_number || ''),
          certificate_number: upItem.certificate_number !== undefined ? upItem.certificate_number : (existing?.certificate_number || ''),
          make: upItem.make !== undefined ? upItem.make : (existing?.make || ''),
          remarks: upItem.remarks !== undefined ? upItem.remarks : (existing?.remarks || ''),
          supplier_name: upItem.supplier_name !== undefined ? upItem.supplier_name : (existing?.supplier_name || ''),
          supplier_po_number: upItem.supplier_po_number !== undefined ? upItem.supplier_po_number : (existing?.supplier_po_number || ''),
          package_type: upItem.package_type !== undefined ? upItem.package_type : (existing?.package_type || 'Pallet'),
          package_no: upItem.package_no !== undefined ? upItem.package_no : (existing?.package_no || '1'),
          split_qty: upItem.split_qty !== undefined ? upItem.split_qty : (existing?.split_qty || undefined),
          total_qty: upItem.total_qty !== undefined ? upItem.total_qty : (existing?.total_qty || undefined),
          group_id: upItem.group_id !== undefined ? upItem.group_id : (existing?.group_id || undefined),
          hs_code: upItem.hs_code !== undefined ? upItem.hs_code : (existing?.hs_code || autoDetectHSCode(upItem.item_description || existing?.item_description || '', resolvedCode)),
          country_of_origin: upItem.country_of_origin !== undefined ? upItem.country_of_origin : (existing?.country_of_origin || ''),
          unit_price: upItem.unit_price !== undefined ? upItem.unit_price : (existing?.unit_price ?? 0),
          line_status: upItem.heat_number ? 'Allocated' : (existing?.line_status || 'Pending'),
        }

        // Synchronize matching allocation with updated heat and quantity
        const alloc = order.allocations?.find(a => (a.sales_order_item_id || a.so_item_id) === mergedItem.id)
        if (alloc) {
          if (mergedItem.heat_number) alloc.heat_number = mergedItem.heat_number
          if (mergedItem.required_qty) alloc.allocated_qty = mergedItem.required_qty
        }

        return mergedItem
      })

      order.items = newItems
    }

    order.updated_at = new Date().toISOString()
    this.saveAll()
    this.notify()
    return { success: true, order, message: `Sales Order ${order.so_number} successfully updated across the ERP system!` }
  }

  // Import Sales Orders from Parsed Excel Records
  public importSalesOrdersFromExcel(
    rows: any[],
    userEmail: string
  ) {
    if (rows.length === 0) return { success: false, message: 'No rows provided to import.' }

    // Group rows by PO Number and Customer Name
    const groups = new Map<string, any[]>()
    rows.forEach(r => {
      const key = `${(r.customerName || 'General Client').trim()}|||${(r.poNumber || 'PO-IMPORT').trim()}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    })

    const createdOrders: SalesOrder[] = []

    groups.forEach((groupRows, key) => {
      const [customerName, poNumber] = key.split('|||')
      const deliveryDate = groupRows[0].deliveryDate || new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10)

      const items = groupRows.map((gr, idx) => ({
        item_code: gr.itemCode,
        item_description: gr.itemDescription,
        required_qty: gr.requiredQty,
        hs_code: gr.hsCode,
        make: gr.make,
        country_of_origin: gr.countryOfOrigin,
        unit_price: gr.unitPrice,
        uom: gr.uom || 'PCS',
        client_po_item_no: gr.clientPoItemNo || String(idx + 1),
        position: gr.position || idx + 1,
        heat_number: gr.heatNumber,
        location: gr.location
      }))

      const res = this.createSalesOrder({
        customer_name: customerName,
        po_number: poNumber,
        required_delivery_date: deliveryDate,
        items,
        userEmail
      })

      if (res.success && res.order) {
        createdOrders.push(res.order)
      }
    })

    return {
      success: true,
      count: createdOrders.length,
      orders: createdOrders,
      message: `Successfully created ${createdOrders.length} Sales Order(s) from spreadsheet.`
    }
  }

  // Add Item to Item Master
  public addItem(item: Omit<Item, 'id' | 'created_at'>, userEmail: string) {
    if (this.items.some(i => i.item_code.toLowerCase() === item.item_code.toLowerCase())) {
      return { success: false, message: `Item code ${item.item_code} already exists.` }
    }

    const newItem: Item = {
      ...item,
      id: 'ITEM-' + (this.items.length + 1).toString().padStart(3, '0'),
      created_at: new Date().toISOString()
    }

    this.items.push(newItem)
    this.saveAll()
    this.logAudit(userEmail, 'Add Item', 'Item Master', newItem.item_code, null, newItem)
    this.notify()
    return { success: true, item: newItem }
  }

  // Add Stock Lot
  public addStockLot(lotData: {
    item_id: string
    heat_number: string
    yom: number
    quantity: number
    purchase_type: 'regular' | 'local_purchase'
    supplier_name: string
    warehouse_location: string
    l_code?: string
    mtc_ref?: string
    userEmail: string
  }) {
    const item = this.items.find(i => i.id === lotData.item_id)
    if (!item) return { success: false, message: 'Item not found' }

    const lotId = 'LOT-' + (this.lots.length + 1).toString().padStart(3, '0')
    const newLot: StockLot = {
      id: lotId,
      item_id: item.id,
      item_code: item.item_code,
      item_description: item.item_description,
      heat_number: lotData.heat_number,
      yom: lotData.yom || 2026,
      original_qty: lotData.quantity,
      received_qty: lotData.quantity,
      purchase_type: lotData.purchase_type,
      supplier_name: lotData.supplier_name,
      l_code: lotData.l_code || (lotData.purchase_type === 'local_purchase' ? `L-${item.item_code.slice(0, 8)}-${this.lots.length + 1}` : undefined),
      stock_receipt_date: new Date().toISOString().substring(0, 10),
      warehouse_location: lotData.warehouse_location || 'YARD-1',
      mtc_ref: lotData.mtc_ref,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    if (lotData.mtc_ref || lotData.heat_number) {
      const heatUpper = lotData.heat_number.toUpperCase().trim()
      const refClean = (lotData.mtc_ref || '').trim()

      const matchedMtc = this.mtcs.find(m => 
        (refClean && (m.certificate_reference === refClean || m.original_file_path.includes(refClean))) || 
        (heatUpper && !heatUpper.startsWith('LOT-') && m.heat_number.toUpperCase() === heatUpper)
      )

      if (matchedMtc) {
        matchedMtc.stock_lot_id = lotId
        matchedMtc.item_id = item.id
        matchedMtc.item_code = item.item_code
      } else {
        // If certificate is stored in uploaded cache from ZIP file, create a persistent MTCCertificate entry
        const cacheEntry = (refClean && uploadedCertificatesCache.get(refClean.toLowerCase())) ||
                           (heatUpper && !heatUpper.startsWith('LOT-') && uploadedCertificatesCache.get(heatUpper.toLowerCase()))
        if (cacheEntry) {
          const newCert: MTCCertificate = {
            id: 'MTC-ZIP-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            item_id: item.id,
            item_code: item.item_code,
            stock_lot_id: lotId,
            heat_number: lotData.heat_number,
            l_code: newLot.l_code,
            certificate_reference: cacheEntry.fileName,
            original_file_path: cacheEntry.url,
            purchase_type: lotData.purchase_type,
            supplier_name: lotData.supplier_name,
            upload_date: new Date().toISOString().substring(0, 10),
            uploaded_by: lotData.userEmail || 'System Ingest',
            verification_status: 'Verified',
            approval_status: 'Approved',
            pages: 2,
            yom: lotData.yom || 2025,
            created_at: new Date().toISOString()
          }
          this.mtcs.unshift(newCert)
        }
      }
    }

    const newBalance: StockBalance = {
      id: 'BAL-' + (this.balances.length + 1).toString().padStart(3, '0'),
      stock_lot_id: lotId,
      physical_qty: lotData.quantity,
      reserved_qty: 0,
      available_qty: lotData.quantity,
      dispatched_qty: 0,
      updated_at: new Date().toISOString()
    }

    this.lots.unshift(newLot)
    this.balances.unshift(newBalance)

    // If local purchase, register L-Code
    if (lotData.purchase_type === 'local_purchase') {
      this.localPurchases.unshift({
        id: 'LP-' + Date.now(),
        l_code: newLot.l_code!,
        item_id: item.id,
        item_code: item.item_code,
        stock_lot_id: lotId,
        supplier_name: lotData.supplier_name,
        purchase_reference: `LP-REF-${Date.now().toString().slice(-4)}`,
        purchase_date: new Date().toISOString().substring(0, 10),
        received_qty: lotData.quantity,
        yom: lotData.yom || 2026,
        supplier_mtc_uploaded: false,
        created_by: lotData.userEmail,
        created_at: new Date().toISOString()
      })
    }

    // Ledger Movement
    this.movements.unshift({
      id: 'MOV-' + Date.now(),
      stock_lot_id: lotId,
      item_code: item.item_code,
      heat_number: lotData.heat_number,
      movement_type: 'Stock Receipt',
      quantity: lotData.quantity,
      reference_type: 'GRN',
      reference_id: `GRN-${new Date().toISOString().substring(0, 10)}`,
      previous_balance: 0,
      new_balance: lotData.quantity,
      performed_by: lotData.userEmail,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      remarks: `Received ${lotData.quantity} PCS from ${lotData.supplier_name} (Heat: ${lotData.heat_number})`
    })

    this.saveAll()
    this.logAudit(lotData.userEmail, 'Add Stock Lot', 'Stock Inventory', lotData.heat_number, null, newLot)
    this.notify()

    return { success: true, lot: newLot }
  }

  // Upload and Stamp Local Purchase Supplier MTC
  public uploadAndStampSupplierMTC(localPurchaseId: string, certRef: string, stampedPdfUrl: string, userEmail: string) {
    const lp = this.localPurchases.find(p => p.id === localPurchaseId)
    if (!lp) return { success: false, message: 'Local purchase record not found' }

    const lot = this.lots.find(l => l.id === lp.stock_lot_id)
    if (!lot) return { success: false, message: 'Linked stock lot not found' }

    lp.supplier_mtc_uploaded = true

    const certId = 'MTC-LOC-' + Date.now()
    const newCert: MTCCertificate = {
      id: certId,
      item_id: lp.item_id,
      item_code: lp.item_code,
      stock_lot_id: lp.stock_lot_id,
      heat_number: lot.heat_number,
      l_code: lp.l_code,
      yom: lp.yom,
      certificate_reference: certRef,
      original_file_path: '/sample-mtc.pdf',
      stamped_file_path: stampedPdfUrl,
      purchase_type: 'local_purchase',
      supplier_name: lp.supplier_name,
      upload_date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      uploaded_by: userEmail,
      verification_status: 'Verified',
      approval_status: 'Approved',
      pages: 3,
      created_at: new Date().toISOString()
    }

    this.mtcs.unshift(newCert)
    lp.mtc_certificate_id = certId

    this.saveAll()
    this.logAudit(userEmail, 'Upload & Stamp Supplier MTC', 'MTC Management', certRef, null, { l_code: lp.l_code, heat: lot.heat_number })
    this.notify()

    return { success: true, message: `Supplier MTC uploaded, stamped, and verified for L-Code ${lp.l_code}.`, certificate: newCert }
  }

  // Generate MTC Package for Sales Order
  public markMTCPackageGenerated(orderId: string, packageUrl: string, userEmail: string) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) return { success: false, message: 'Order not found' }

    order.mtc_package_generated = true
    order.mtc_package_url = packageUrl
    order.status = 'MTC Generated'
    order.updated_at = new Date().toISOString()

    this.saveAll()
    this.logAudit(userEmail, 'Generated MTC Package', 'MTC Management', order.so_number)
    this.notify()

    return { success: true, message: `MTC Package successfully generated for ${order.so_number}.` }
  }

  // Update order status
  public updateOrderStatus(orderId: string, status: any) {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) return { success: false, message: 'Order not found' }
    order.status = status
    order.updated_at = new Date().toISOString()
    this.saveAll()
    this.notify()
    return { success: true, order }
  }

  // Import Excel stock records
  public importExcelStock(records: any[], filename: string, userEmail: string) {
    let successCount = 0
    let failCount = 0
    const errors: string[] = []

    for (let i = 0; i < records.length; i++) {
      const row = records[i]
      const rowNum = i + 2 // Excel 1-based, header row is 1

      if (!row.item_code || !row.heat_number || row.quantity === undefined) {
        failCount++
        errors.push(`Row ${rowNum}: Missing mandatory fields (Item Code, Heat Number, or Quantity).`)
        continue
      }

      let item = this.items.find(it => it.item_code.trim().toUpperCase() === String(row.item_code).trim().toUpperCase())
      if (!item) {
        // Create new item on the fly if needed
        item = {
          id: 'ITEM-' + (this.items.length + 1).toString().padStart(3, '0'),
          item_code: String(row.item_code).trim().toUpperCase(),
          item_description: row.description || `Flange/Fitting ${row.item_code}`,
          material_grade: row.grade || 'SS316/316L',
          specification: row.specification || 'ASME B16.5',
          size: row.size || 'Standard',
          uom: row.uom || 'PCS',
          unit_price_aed: Number(row.unit_price) || 50,
          is_active: true,
          created_at: new Date().toISOString()
        }
        this.items.push(item)
      }

      const purchaseType = String(row.purchase_type).toLowerCase().includes('local') ? 'local_purchase' : 'regular'
      const qty = parseInt(row.quantity, 10) || 0
      const yom = parseInt(row.yom, 10) || 2025

      this.addStockLot({
        item_id: item.id,
        heat_number: String(row.heat_number).trim(),
        yom,
        quantity: qty,
        purchase_type: purchaseType,
        supplier_name: row.supplier || (purchaseType === 'local_purchase' ? 'Local UAE Supplier' : 'International Mill'),
        warehouse_location: row.location || 'LN-EB1',
        l_code: row.l_code ? String(row.l_code).trim() : undefined,
        mtc_ref: row.selected_mtc_ref || undefined,
        userEmail
      })

      successCount++
    }

    const job: ExcelImportJob = {
      id: 'IMP-' + Date.now(),
      filename,
      uploaded_by: userEmail,
      upload_date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      import_type: 'Master Stock',
      total_rows: records.length,
      successful_rows: successCount,
      failed_rows: failCount,
      status: failCount === 0 ? 'Completed' : (successCount > 0 ? 'Completed with Errors' : 'Failed'),
      validation_report: errors.length > 0 ? errors.join('\n') : 'All rows validated and imported successfully.'
    }

    this.importJobs.unshift(job)
    this.saveAll()
    this.notify()

    return { success: true, job }
  }

  // Audit Logging
  public logAudit(userEmail: string, action: string, module: string, recordId: string, prev?: any, next?: any, reason?: string) {
    this.audits.unshift({
      id: 'AUD-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      user_id: userEmail,
      user_email: userEmail,
      action,
      module,
      record_id: recordId,
      previous_values: prev ? JSON.stringify(prev) : undefined,
      new_values: next ? JSON.stringify(next) : undefined,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      reason
    })
    saveToStorage('audits', this.audits)
  }

  public saveLocalStorageOnly() {
    saveToStorage('customers', this.customers)
    saveToStorage('items', this.items)
    saveToStorage('lots', this.lots)
    saveToStorage('balances', this.balances)
    saveToStorage('orders', this.orders)
    saveToStorage('mtcs', this.mtcs)
    saveToStorage('localPurchases', this.localPurchases)
    saveToStorage('movements', this.movements)
    saveToStorage('approvals', this.approvals)
    saveToStorage('dispatches', this.dispatches)
    saveToStorage('returns', this.returns)
    saveToStorage('adjustments', this.adjustments)
    saveToStorage('audits', this.audits)
    saveToStorage('importJobs', this.importJobs)
    saveToStorage('users', this.users)
    saveToStorage('suppliers', this.suppliers)
  }

  private saveAll() {
    this.saveLocalStorageOnly()
    this.triggerCloudSync()
  }

  // Bulk Upload Certificates (from ZIP or multi-PDF files)
  public bulkUploadCertificates(
    certFiles: Array<{
      fileName: string
      heatNumber: string
      itemCode?: string
      fileDataUrl?: string
      supplierName?: string
      purchaseType?: 'regular' | 'local_purchase'
      lCode?: string
    }>,
    userEmail: string
  ): {
    total: number
    linkedToStock: number
    unlinked: number
    linkedLots: string[]
  } {
    let linkedCount = 0
    let unlinkedCount = 0
    const linkedLots: string[] = []

    certFiles.forEach((cert, idx) => {
      const cleanHeat = String(cert.heatNumber || '').trim()
      const cleanFileName = cert.fileName.trim()
      const certRef = cleanFileName.replace(/\.[^/.]+$/, '')

      // Keep DB filepath compact (or valid HTTPS cloud url) to prevent localStorage quota crashes
      const safePath = (cert.fileDataUrl && !cert.fileDataUrl.startsWith('data:'))
        ? cert.fileDataUrl
        : (cert.fileDataUrl && cert.fileDataUrl.length < 500 ? cert.fileDataUrl : '/sample-mtc.pdf')

      // Find matching stock lots with this heat number
      const matchingLots = this.lots.filter(l => 
        l.heat_number.trim().toUpperCase() === cleanHeat.toUpperCase() ||
        (cleanHeat && l.heat_number.toLowerCase().includes(cleanHeat.toLowerCase()))
      )

      if (matchingLots.length > 0) {
        matchingLots.forEach(lot => {
          lot.mtc_ref = cleanFileName
          linkedLots.push(`${lot.item_code} (Heat ${lot.heat_number})`)
          linkedCount++

          // If local purchase, link L-code
          if (lot.purchase_type === 'local_purchase' && lot.l_code) {
            const lp = this.localPurchases.find(p => p.stock_lot_id === lot.id)
            if (lp) lp.supplier_mtc_uploaded = true
          }

          // Register in MTC list
          const certId = 'MTC-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000)
          this.mtcs.unshift({
            id: certId,
            item_id: lot.item_id,
            item_code: lot.item_code,
            stock_lot_id: lot.id,
            heat_number: lot.heat_number,
            l_code: lot.l_code,
            yom: lot.yom,
            certificate_reference: certRef,
            original_file_path: safePath,
            purchase_type: lot.purchase_type,
            supplier_name: lot.supplier_name,
            upload_date: new Date().toISOString().replace('T', ' ').substring(0, 16),
            uploaded_by: userEmail,
            verification_status: 'Verified',
            approval_status: 'Approved',
            pages: 2,
            created_at: new Date().toISOString()
          })
        })
      } else {
        // Unmatched certificate - store in registry as available heat certificate
        unlinkedCount++
        const certId = 'MTC-UNLINKED-' + Date.now() + '-' + idx
        this.mtcs.unshift({
          id: certId,
          item_id: 'PENDING',
          item_code: cert.itemCode || 'PENDING-MATCH',
          stock_lot_id: '',
          heat_number: cleanHeat || 'UNKNOWN',
          yom: 2025,
          certificate_reference: certRef,
          original_file_path: safePath,
          purchase_type: cert.purchaseType || 'regular',
          supplier_name: cert.supplierName || 'Mill / Supplier',
          upload_date: new Date().toISOString().replace('T', ' ').substring(0, 16),
          uploaded_by: userEmail,
          verification_status: 'Verified',
          approval_status: 'Approved',
          pages: 2,
          created_at: new Date().toISOString()
        })
      }
    })

    this.lastLocalWriteTime = Date.now()
    this.saveAll()

    // Direct push to Supabase Cloud so certificates persist immediately
    if (isSupabaseConfigured()) {
      const sanitizedMtcs = this.mtcs.map(m => ({
        ...m,
        purchase_type: m.purchase_type || 'regular',
        verification_status: m.verification_status || 'Verified',
        approval_status: m.approval_status || 'Approved',
        yom: Number(m.yom || 2026),
        original_file_path: m.original_file_path || '/sample-mtc.pdf'
      }))
      const sanitizedLots = this.lots.map(l => ({
        ...l,
        warehouse_location: l.warehouse_location || 'MAIN YARD',
        original_qty: Number(l.original_qty || l.received_qty || 1),
        received_qty: Number(l.received_qty || l.original_qty || 1),
        purchase_type: l.purchase_type || 'regular',
        supplier_name: l.supplier_name || 'MSG Stock',
        yom: Number(l.yom || 2026),
        stock_receipt_date: l.stock_receipt_date || new Date().toISOString().substring(0, 10)
      }))
      Promise.resolve(getSupabase().from('mtc_certificates').upsert(sanitizedMtcs)).catch((e: any) => console.warn('Supabase MTC upsert notice:', e))
      Promise.resolve(getSupabase().from('stock_lots').upsert(sanitizedLots)).catch(() => {})
      if (this.localPurchases.length > 0) {
        Promise.resolve(getSupabase().from('local_purchases').upsert(this.localPurchases)).catch(() => {})
      }
    }

    this.logAudit(
      userEmail,
      'Bulk Certificate Upload',
      'MTC Management',
      `${certFiles.length} Certificates`,
      null,
      { total: certFiles.length, linkedCount, unlinkedCount }
    )
    this.notify()

    return {
      total: certFiles.length,
      linkedToStock: linkedCount,
      unlinked: unlinkedCount,
      linkedLots
    }
  }

  // Clear all operational inventory and order data for testing fresh upload from 0
  public clearAllData(userEmail: string) {
    this.items = []
    this.lots = []
    this.balances = []
    this.orders = []
    this.mtcs = []
    this.localPurchases = []
    this.movements = []
    this.approvals = []
    this.dispatches = []
    this.returns = []
    this.adjustments = []
    this.importJobs = []

    this.saveAll()
    this.logAudit(userEmail, 'Clear All Data', 'System', 'ALL_OPERATIONAL_TABLES', null, { status: 'Cleared for fresh upload testing' })
    this.notify()
  }

  // Reset to default factory demonstration dataset
  public resetToDefault() {
    localStorage.clear()
    this.init()
    this.notify()
  }

  public resetToDemoData(userEmail?: string) {
    this.customers = [...initialCustomers]
    this.items = [...initialItems]
    this.lots = [...initialLots]
    this.balances = [...initialBalances]
    this.orders = [...initialOrders]
    this.mtcs = [...initialMTCs]
    this.localPurchases = [...initialLocalPurchases]
    this.movements = [...initialMovements]
    this.approvals = []
    this.dispatches = []
    this.returns = []
    this.adjustments = []
    this.importJobs = []
    this.users = [...initialUsers]
    this.suppliers = [...initialSuppliers]

    this.saveAll()
    if (userEmail) {
      this.logAudit(userEmail, 'Reset to Demo Data', 'System', 'ALL_TABLES')
    }
    this.notify()
  }

  // IT Systems Custom Configuration & System Control
  public getSystemConfig(): SystemCustomConfig {
    return { ...this.systemConfig }
  }

  public updateSystemConfig(config: Partial<SystemCustomConfig>, userEmail?: string): SystemCustomConfig {
    this.systemConfig = { ...this.systemConfig, ...config }
    saveToStorage('systemConfig', this.systemConfig)
    this.triggerCloudSync()
    if (userEmail) {
      this.logAudit(userEmail, 'Update System Custom Config', 'IT Systems', 'SYSTEM_SETTINGS', null, config)
    }
    this.notify()
    return { ...this.systemConfig }
  }

  // 1-Click Database Backup Export (JSON format)
  public exportFullDatabaseJSON(): string {
    const backupObj = {
      system: 'MSG Oilfield Equipment Trading LLC ERP',
      export_version: '2.0-ENTERPRISE',
      exported_at: new Date().toISOString(),
      systemConfig: this.systemConfig,
      suppliers: this.suppliers,
      customers: this.customers,
      items: this.items,
      lots: this.lots,
      balances: this.balances,
      orders: this.orders,
      mtcs: this.mtcs,
      localPurchases: this.localPurchases,
      movements: this.movements,
      users: this.users,
    }
    return JSON.stringify(backupObj, null, 2)
  }

  // Restore Database from JSON Backup File
  public importFullDatabaseJSON(jsonStr: string, userEmail?: string): { success: boolean; message: string } {
    try {
      const parsed = JSON.parse(jsonStr)
      if (parsed.suppliers && Array.isArray(parsed.suppliers)) this.suppliers = parsed.suppliers
      if (parsed.customers && Array.isArray(parsed.customers)) this.customers = parsed.customers
      if (parsed.items && Array.isArray(parsed.items)) this.items = parsed.items
      if (parsed.lots && Array.isArray(parsed.lots)) this.lots = parsed.lots
      if (parsed.balances && Array.isArray(parsed.balances)) this.balances = parsed.balances
      if (parsed.orders && Array.isArray(parsed.orders)) this.orders = parsed.orders
      if (parsed.mtcs && Array.isArray(parsed.mtcs)) this.mtcs = parsed.mtcs
      if (parsed.localPurchases && Array.isArray(parsed.localPurchases)) this.localPurchases = parsed.localPurchases
      if (parsed.movements && Array.isArray(parsed.movements)) this.movements = parsed.movements
      if (parsed.users && Array.isArray(parsed.users)) this.users = parsed.users
      if (parsed.systemConfig) this.systemConfig = { ...defaultSystemCustomConfig, ...parsed.systemConfig }

      this.saveAll()
      saveToStorage('systemConfig', this.systemConfig)
      if (userEmail) {
        this.logAudit(userEmail, 'Restore Database Backup', 'IT Systems', 'ALL_TABLES')
      }
      this.notify()
      return { success: true, message: 'Database restored successfully from backup file!' }
    } catch (e: any) {
      return { success: false, message: 'Failed to import backup file: ' + e.message }
    }
  }

  // IT Integrity & Diagnostics Engine
  public getSystemDiagnostics() {
    const verifiedMTCs = this.mtcs.filter(m => m.verification_status === 'Verified').length
    const stampedMTCs = this.mtcs.filter(m => Boolean(m.stamped_file_path)).length
    const totalPhysicalPcs = this.balances.reduce((s, b) => s + b.physical_qty, 0)
    const totalAvailPcs = this.balances.reduce((s, b) => s + b.available_qty, 0)
    const orphanBalances = this.balances.filter(b => !this.lots.some(l => l.id === b.stock_lot_id)).length
    const localPurchasesCount = this.localPurchases.length
    const pendingApprovalsCount = this.orders.filter(o => o.status === 'Pending Storekeeper Approval').length
    return {
      totalCustomers: this.customers.length,
      totalItems: this.items.length,
      totalLots: this.lots.length,
      totalBalances: this.balances.length,
      totalPhysicalPcs,
      totalAvailPcs,
      orphanBalances,
      totalOrders: this.orders.length,
      pendingApprovalsCount,
      totalMTCs: this.mtcs.length,
      verifiedMTCs,
      stampedMTCs,
      localPurchasesCount,
      totalAudits: this.audits.length,
      totalUsers: this.users.length,
      totalSuppliers: this.suppliers.length,
      systemHealth: orphanBalances === 0 ? 'Optimal (100% Data Integrity)' : 'Warning (Orphan Balances Detected)'
    }
  }

  // Master Approved Suppliers Management
  public addSupplier(supplier: Partial<Supplier>, userEmail?: string): Supplier {
    const id = supplier.id || 'SUPP-' + Date.now().toString().slice(-4)
    const newSupp: Supplier = {
      id,
      supplier_code: supplier.supplier_code || supplier.supplier_name?.slice(0, 6).toUpperCase().replace(/\s+/g, '') || 'SUPP',
      supplier_name: supplier.supplier_name || 'Approved Supplier',
      country: supplier.country || 'United Arab Emirates',
      make: supplier.make || supplier.supplier_name || 'GENERIC',
      supplier_type: supplier.supplier_type || 'local_stockist',
      approved_status: supplier.approved_status || 'Approved',
      contact_person: supplier.contact_person,
      contact_email: supplier.contact_email,
      contact_phone: supplier.contact_phone,
      created_at: new Date().toISOString()
    }
    this.suppliers.unshift(newSupp)
    this.saveAll()
    if (userEmail) {
      this.logAudit(userEmail, 'Add Supplier', 'Suppliers Catalog', newSupp.supplier_name, null, newSupp)
    }
    this.notify()
    return newSupp
  }

  public preloadAllStandardSuppliers(userEmail?: string): { count: number; message: string } {
    let addedCount = 0
    for (const initSupp of initialSuppliers) {
      const exists = this.suppliers.some(
        s => s.supplier_code.toUpperCase() === initSupp.supplier_code.toUpperCase() ||
             s.supplier_name.toUpperCase() === initSupp.supplier_name.toUpperCase()
      )
      if (!exists) {
        this.suppliers.push({ ...initSupp })
        addedCount++
      }
    }
    this.saveAll()
    if (userEmail) {
      this.logAudit(userEmail, 'Preload Standard Suppliers', 'Suppliers Catalog', `${addedCount} Suppliers Added`)
    }
    this.notify()
    return {
      count: addedCount,
      message: `Successfully pre-loaded ${addedCount} standard makers & approved UAE stockists into the master catalog!`
    }
  }

  public importSuppliersBulk(suppliersList: Partial<Supplier>[], userEmail?: string): { success: boolean; count: number; message: string } {
    let imported = 0
    for (const item of suppliersList) {
      if (!item.supplier_name) continue
      const existingIdx = this.suppliers.findIndex(
        s => s.supplier_name.toUpperCase() === item.supplier_name!.toUpperCase() ||
             (item.supplier_code && s.supplier_code.toUpperCase() === item.supplier_code.toUpperCase())
      )
      if (existingIdx >= 0) {
        this.suppliers[existingIdx] = { ...this.suppliers[existingIdx], ...item }
      } else {
        this.suppliers.push({
          id: item.id || 'SUPP-' + Date.now().toString().slice(-4) + '-' + imported,
          supplier_code: item.supplier_code || item.supplier_name.slice(0, 6).toUpperCase().replace(/\s+/g, ''),
          supplier_name: item.supplier_name,
          country: item.country || 'United Arab Emirates',
          make: item.make || item.supplier_name,
          supplier_type: item.supplier_type || 'local_stockist',
          approved_status: item.approved_status || 'Approved',
          contact_person: item.contact_person,
          contact_email: item.contact_email,
          contact_phone: item.contact_phone,
          created_at: new Date().toISOString()
        })
      }
      imported++
    }
    this.saveAll()
    if (userEmail) {
      this.logAudit(userEmail, 'Bulk Import Suppliers', 'Suppliers Catalog', `${imported} Suppliers Imported`)
    }
    this.notify()
    return {
      success: true,
      count: imported,
      message: `Bulk uploaded & synchronized ${imported} approved suppliers!`
    }
  }

  // Upload and immediately attach an MTC Certificate to any heat number (and associated stock lots / orders)
  public uploadMTCForHeat(
    heatNumber: string,
    fileData: {
      fileName: string
      fileDataUrl?: string
      itemCode?: string
      supplierName?: string
      pages?: number
    },
    userEmail: string = 'operations@msgoilfield.ae'
  ): {
    success: boolean
    cert: MTCCertificate
    affectedLots: number
    affectedOrders: number
  } {
    const cleanHeat = String(heatNumber || '').trim()
    const cleanFileName = fileData.fileName.trim()
    const certRef = cleanFileName.replace(/\.[^/.]+$/, '')

    let affectedLots = 0
    let affectedOrders = 0

    // 1. Link matching stock lots
    this.lots.forEach(lot => {
      if (lot.heat_number.trim().toUpperCase() === cleanHeat.toUpperCase()) {
        lot.mtc_ref = cleanFileName
        affectedLots++
      }
    })

    // 2. Add or update MTC Certificate record
    let cert = this.mtcs.find(m => m.heat_number.trim().toUpperCase() === cleanHeat.toUpperCase())
    if (cert) {
      cert.certificate_reference = certRef
      cert.original_file_path = fileData.fileDataUrl || cert.original_file_path || '/sample-mtc.pdf'
      cert.verification_status = 'Verified'
      cert.approval_status = 'Approved'
      cert.pages = fileData.pages || cert.pages || 2
      cert.upload_date = new Date().toISOString().replace('T', ' ').substring(0, 16)
      cert.uploaded_by = userEmail
    } else {
      const matchingLot = this.lots.find(l => l.heat_number.trim().toUpperCase() === cleanHeat.toUpperCase())
      cert = {
        id: 'MTC-' + (cleanHeat || Date.now()),
        item_id: matchingLot?.item_id || 'AUTO',
        item_code: fileData.itemCode || matchingLot?.item_code || 'OILFIELD-MATERIAL',
        stock_lot_id: matchingLot?.id || '',
        heat_number: cleanHeat,
        yom: matchingLot?.yom || 2026,
        certificate_reference: certRef,
        original_file_path: fileData.fileDataUrl || '/sample-mtc.pdf',
        purchase_type: matchingLot?.purchase_type || 'regular',
        supplier_name: fileData.supplierName || matchingLot?.supplier_name || 'Mill / Stockist',
        upload_date: new Date().toISOString().replace('T', ' ').substring(0, 16),
        uploaded_by: userEmail,
        verification_status: 'Verified',
        approval_status: 'Approved',
        pages: fileData.pages || 2,
        created_at: new Date().toISOString()
      }
      this.mtcs.unshift(cert)
    }

    // 3. Link matching Sales Order Items and Allocations
    this.orders.forEach(order => {
      let orderUpdated = false
      order.items.forEach(item => {
        if (item.heat_number && item.heat_number.trim().toUpperCase() === cleanHeat.toUpperCase()) {
          item.certificate_number = certRef
          orderUpdated = true
        }
      })
      if (order.allocations) {
        order.allocations.forEach(alloc => {
          if (alloc.heat_number && alloc.heat_number.trim().toUpperCase() === cleanHeat.toUpperCase()) {
            alloc.mtc_certificate_id = cert!.id
            orderUpdated = true
          }
        })
      }
      if (orderUpdated) affectedOrders++
    })

    // Background cloud storage sync to Supabase if connected
    if (fileData.fileDataUrl && isSupabaseConfigured()) {
      fetch(fileData.fileDataUrl)
        .then(r => r.blob())
        .then(blob => uploadMTCFileToSupabase(cleanFileName, blob, 'mtcs'))
        .then(res => {
          if (res.success && res.url) {
            cert!.original_file_path = res.url
            this.saveAll()
            this.notify()
          }
        })
        .catch(err => console.warn('Supabase MTC upload background notice:', err))
    }

    this.saveAll()
    this.logAudit(
      userEmail,
      'Upload Missing MTC Certificate',
      'MTC Management',
      cleanHeat,
      null,
      { file: cleanFileName, affectedLots, affectedOrders }
    )
    this.notify()

    return {
      success: true,
      cert,
      affectedLots,
      affectedOrders
    }
  }

  // 1-Click Fast Physical Dispatch (Deducts Physical & Reserved Stock immediately)
  public fastDispatchOrder(
    orderId: string,
    deliveryNote: string = `DN-${Date.now().toString().slice(-6)}`,
    userEmail: string = 'storekeeper@msgoilfield.ae'
  ): { success: boolean; message: string; dispatchedCount: number } {
    const order = this.orders.find(o => o.id === orderId)
    if (!order) return { success: false, message: 'Sales order not found', dispatchedCount: 0 }

    let totalDispatchedPcs = 0
    const itemsSummary: { item_code: string; heat_number: string; quantity: number }[] = []

    // Deduct physical inventory for every active allocation
    if (order.allocations && order.allocations.length > 0) {
      for (const alloc of order.allocations) {
        if (alloc.allocation_status === 'Released') continue
        const remainingToDispatch = alloc.allocated_qty - (alloc.dispatched_qty || 0)
        if (remainingToDispatch <= 0) continue

        const bal = this.balances.find(b => b.stock_lot_id === alloc.stock_lot_id)
        if (bal) {
          bal.physical_qty = Math.max(0, bal.physical_qty - remainingToDispatch)
          bal.reserved_qty = Math.max(0, bal.reserved_qty - remainingToDispatch)
          bal.dispatched_qty = (bal.dispatched_qty || 0) + remainingToDispatch
          bal.updated_at = new Date().toISOString()
        }

        alloc.dispatched_qty = alloc.allocated_qty
        alloc.allocation_status = 'Dispatched'
        alloc.updated_at = new Date().toISOString()

        const orderItem = order.items.find(i => i.id === alloc.sales_order_item_id)
        if (orderItem) {
          orderItem.dispatched_qty = (orderItem.dispatched_qty || 0) + remainingToDispatch
          orderItem.line_status = 'Dispatched'
        }

        totalDispatchedPcs += remainingToDispatch
        itemsSummary.push({
          item_code: orderItem?.item_code || 'ITEM',
          heat_number: alloc.heat_number,
          quantity: remainingToDispatch
        })

        // Log Stock Movement Ledger entry
        this.movements.unshift({
          id: 'MOV-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          stock_lot_id: alloc.stock_lot_id,
          item_code: orderItem?.item_code || '',
          heat_number: alloc.heat_number,
          movement_type: 'Dispatch',
          quantity: remainingToDispatch,
          reference_type: 'DeliveryNote',
          reference_id: deliveryNote,
          previous_balance: bal ? bal.physical_qty + remainingToDispatch : 0,
          new_balance: bal ? bal.physical_qty : 0,
          performed_by: userEmail,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
          remarks: `Fast-Track Dispatch: ${remainingToDispatch} PCS deducted from Physical Stock under Delivery Note ${deliveryNote}`
        })
      }
    } else {
      // If order has no discrete allocations, dispatch direct from matching lots
      for (const item of order.items) {
        const qtyToDispatch = item.required_qty - (item.dispatched_qty || 0)
        if (qtyToDispatch <= 0) continue

        const matchingLot = this.lots.find(l => 
          (item.heat_number && l.heat_number.toUpperCase() === item.heat_number.toUpperCase()) ||
          l.item_code.toUpperCase() === item.item_code.toUpperCase()
        )
        if (matchingLot) {
          const bal = this.balances.find(b => b.stock_lot_id === matchingLot.id)
          if (bal) {
            bal.physical_qty = Math.max(0, bal.physical_qty - qtyToDispatch)
            bal.available_qty = Math.max(0, bal.available_qty - qtyToDispatch)
            bal.dispatched_qty = (bal.dispatched_qty || 0) + qtyToDispatch
            bal.updated_at = new Date().toISOString()
          }
        }
        item.dispatched_qty = item.required_qty
        item.line_status = 'Dispatched'
        totalDispatchedPcs += qtyToDispatch
      }
    }

    // Record formal Dispatch record
    this.dispatches.unshift({
      id: 'DSP-' + Date.now(),
      sales_order_id: order.id,
      so_number: order.so_number,
      dispatch_reference: deliveryNote,
      delivery_note_number: deliveryNote,
      customer_name: order.customer_name,
      dispatch_date: new Date().toISOString().substring(0, 10),
      items_summary: itemsSummary,
      dispatched_by: userEmail,
      delivery_remarks: 'Fast physical stock reduction executed successfully.',
      created_at: new Date().toISOString()
    })

    order.status = 'Dispatched'
    order.updated_at = new Date().toISOString()

    this.saveAll()
    this.logAudit(
      userEmail,
      'Fast Physical Stock Reduction & Dispatch',
      'Dispatch',
      order.so_number,
      null,
      { deliveryNote, totalDispatchedPcs, itemsSummary }
    )
    this.notify()

    return {
      success: true,
      message: `Physical stock successfully reduced by ${totalDispatchedPcs} PCS! Order ${order.so_number} marked as Dispatched under Delivery Note ${deliveryNote}.`,
      dispatchedCount: totalDispatchedPcs
    }
  }

  // 1-Click Cloud Sync to Supabase PostgreSQL & Storage
  public async syncToSupabase(): Promise<{ success: boolean; message: string; details: any }> {
    const res = await pushAllTablesToSupabase(this)
    if (res.success) {
      this.logAudit('system', 'Supabase Cloud Sync', 'Database Sync', 'ALL_TABLES', null, res.details)
      this.notify()
    }
    return res
  }

  // 1-Click Cloud Restore from Supabase
  // Automatic Background Cloud Synchronization
  public startSupabaseAutoSync() {
    if (typeof window === 'undefined') return
    // 1. Initial background pull on app load
    setTimeout(() => {
      if (isSupabaseConfigured() && !this.isPullingCloud) {
        this.pullFromSupabase().catch(() => {})
      }
    }, 1000)

    // 2. Real-time WebSocket subscriber: updates in real-time when another system modifies database
    // Debounced by 3.5s and checks that we did not perform a local write within the last 4 seconds
    // to prevent echo loop storms that peg the CPU and wipe local in-flight records.
    subscribeToRealtimeChanges((_table) => {
      if (Date.now() - this.lastLocalWriteTime < 4000) {
        return // Ignore local write echo
      }
      if (this.realtimeDebounceTimer) clearTimeout(this.realtimeDebounceTimer)
      this.realtimeDebounceTimer = setTimeout(() => {
        if (!this.isPullingCloud && Date.now() - this.lastLocalWriteTime >= 4000) {
          this.pullFromSupabase().catch(() => {})
        }
      }, 3500)
    })

    // 3. Fallback periodic background sync every 120 seconds (2 mins)
    if (!this.autoSyncTimer) {
      this.autoSyncTimer = setInterval(() => {
        if (isSupabaseConfigured() && !this.isPullingCloud && Date.now() - this.lastLocalWriteTime >= 4000) {
          this.pullFromSupabase().catch(() => {})
        }
      }, 120000)
    }
  }

  public triggerCloudSync() {
    this.lastLocalWriteTime = Date.now()
    if (!isSupabaseConfigured() || this.isPullingCloud) return
    if (this.syncTimeout) clearTimeout(this.syncTimeout)
    this.syncTimeout = setTimeout(() => {
      pushAllTablesToSupabase(this).catch(err => console.warn('Supabase auto-push error:', err))
    }, 1500)
  }

  // 1-Click Cloud Restore from Supabase
  public async pullFromSupabase(): Promise<{ success: boolean; message: string }> {
    if (this.isPullingCloud) return { success: false, message: 'Sync already in progress' }
    this.isPullingCloud = true
    try {
      const res = await pullAllTablesFromSupabase()
      if (!res.success || !res.data) {
        return { success: false, message: res.message }
      }
      if (res.data.suppliers !== undefined) this.suppliers = mergeEntities(this.suppliers, res.data.suppliers)
      if (res.data.customers !== undefined) this.customers = mergeEntities(this.customers, res.data.customers)
      if (res.data.items !== undefined) this.items = mergeEntities(this.items, res.data.items)
      if (res.data.lots !== undefined) this.lots = mergeEntities(this.lots, res.data.lots)
      if (res.data.balances !== undefined) this.balances = mergeEntities(this.balances, res.data.balances)
      if (res.data.orders !== undefined) this.orders = mergeEntities(this.orders, res.data.orders)
      if (res.data.mtcs !== undefined) this.mtcs = mergeEntities(this.mtcs, res.data.mtcs)
      if (res.data.localPurchases !== undefined) this.localPurchases = mergeEntities(this.localPurchases, res.data.localPurchases)
      if (res.data.movements !== undefined) this.movements = mergeEntities(this.movements, res.data.movements)
      if (res.data.dispatches !== undefined) this.dispatches = mergeEntities(this.dispatches, res.data.dispatches)
      if (res.data.users !== undefined) this.users = mergeEntities(this.users, res.data.users)
      if (res.data.config) this.systemConfig = { ...this.systemConfig, ...res.data.config }

      // Save locally to cache without triggering outbound push
      this.saveLocalStorageOnly()
      this.notify()
      return { success: true, message: 'All ERP tables, users, and MTC metadata restored from Supabase Cloud!' }
    } finally {
      this.isPullingCloud = false
    }
  }

  // User Provisioning & Account Management (IT Engineer & Super Admin)
  public addUser(user: Partial<UserProfile>, userEmail: string = 'it.engineer@msgoilfield.ae'): UserProfile {
    const id = user.id || `USR-${String(this.users.length + 1).padStart(3, '0')}`
    const newUser: UserProfile = {
      id,
      employee_name: user.employee_name || 'New Staff Member',
      email: user.email || `staff.${Date.now()}@msgoilfield.ae`,
      department: user.department || 'Operations',
      role: user.role || 'sales_team',
      account_status: user.account_status || 'Active',
      password: user.password || 'Pass@123',
      created_at: new Date().toISOString().slice(0, 10),
      last_login: undefined,
      allowed_modules: user.allowed_modules || []
    }
    this.users.push(newUser)
    this.saveAll()
    this.logAudit(
      userEmail,
      'Provision New Employee Account',
      'User Management',
      newUser.id,
      null,
      { employee_name: newUser.employee_name, email: newUser.email, role: newUser.role, department: newUser.department }
    )
    this.notify()
    return newUser
  }

  public updateUser(userId: string, updates: Partial<UserProfile>, userEmail: string = 'it.engineer@msgoilfield.ae'): UserProfile | null {
    const idx = this.users.findIndex(u => u.id === userId)
    if (idx === -1) return null
    const old = { ...this.users[idx] }
    this.users[idx] = { ...this.users[idx], ...updates }
    this.saveAll()
    this.logAudit(
      userEmail,
      'Update Employee Account',
      'User Management',
      userId,
      old,
      updates
    )
    this.notify()
    return this.users[idx]
  }

  public deleteUser(userId: string, userEmail: string = 'it.engineer@msgoilfield.ae'): boolean {
    const idx = this.users.findIndex(u => u.id === userId)
    if (idx === -1) return false
    const deleted = this.users[idx]
    this.users.splice(idx, 1)
    this.saveAll()
    this.logAudit(
      userEmail,
      'Delete Employee Account',
      'User Management',
      userId,
      deleted,
      null
    )
    this.notify()
    return true
  }
}

export const db = new DBService()
