import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { db } from '../services/db'
import { getAuthToken, setAuthToken, clearAuthToken, apiGet, apiPost } from '../services/api'
import { vetHeatNumber, vetSalesOrder, runFullStockAudit, processChatQuery } from '../services/aiAssistantEngine'
import { parseMSGDescription, parseExcelBuffer } from '../services/excelEngine'
import { autoDetectHSCode, autoDetectMake, autoDetectCountryOfOrigin } from '../services/sourcingEngine'

describe('Frontend API & Token Client', () => {
  beforeEach(() => {
    clearAuthToken()
    vi.restoreAllMocks()
  })

  it('persists and clears auth tokens cleanly', () => {
    expect(getAuthToken()).toBeNull()
    setAuthToken('jwt-test-token')
    expect(getAuthToken()).toBe('jwt-test-token')
    clearAuthToken()
    expect(getAuthToken()).toBeNull()
  })

  it('handles apiGet and apiPost JSON responses and errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, value: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const res = await apiGet('/api/health')
    expect(res.ok).toBe(true)
    expect(res.value).toBe(42)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Forbidden action' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    await expect(apiPost('/api/config', {})).rejects.toThrow('Forbidden action')
  })
})

describe('DBService Full Operational Lifecycle & Backend Sync', () => {
  beforeEach(async () => {
    clearAuthToken()
    localStorage.clear()
    await db.resetToDefault()
  })

  it('creates items, adds FIFO stock lots, allocates, approves, dispatches, cancels, returns, and adjusts stock', () => {
    const itemRes = db.addItem(
      {
        item_code: 'VIT-FLG-200',
        item_description: '2" 150# WNRF Flange ASTM A105N',
        material_grade: 'ASTM A105N',
        specification: 'ASME B16.5',
        size: '2" #150',
        uom: 'PCS',
        unit_price_aed: 45,
        is_active: true,
      },
      'admin@msgoilfield.ae'
    )
    expect(itemRes.success).toBe(true)

    const lotRes = db.addStockLot({
      item_id: itemRes.item!.id,
      heat_number: 'HT-VIT-01',
      yom: 2025,
      quantity: 20,
      purchase_type: 'regular',
      supplier_name: 'WMASS GERMANY',
      warehouse_location: 'BAY-A1',
      userEmail: 'admin@msgoilfield.ae',
    })
    expect(lotRes.success).toBe(true)

    // Local purchase creates L-code and LP record
    const lpLotRes = db.addStockLot({
      item_id: itemRes.item!.id,
      heat_number: 'HT-LP-VIT',
      yom: 2026,
      quantity: 5,
      purchase_type: 'local_purchase',
      supplier_name: 'SHREE OILFIELD SUPPLY LLC',
      warehouse_location: 'LP-BAY',
      userEmail: 'admin@msgoilfield.ae',
    })
    expect(lpLotRes.success).toBe(true)
    expect(db.getLocalPurchases().length).toBeGreaterThanOrEqual(1)

    const orderRes = db.createSalesOrder({
      customer_id: 'CUST-STS',
      customer_name: 'Bahrain Special Technical Services (STS) Co. W.L.L',
      po_number: 'PO-VIT-100',
      required_delivery_date: '2026-12-15',
      items: [
        {
          item_id: itemRes.item!.id,
          item_code: 'VIT-FLG-200',
          item_description: '2" 150# WNRF Flange ASTM A105N',
          uom: 'PCS',
          required_qty: 8,
        },
      ],
      userEmail: 'admin@msgoilfield.ae',
    })
    expect(orderRes.success).toBe(true)
    const order = orderRes.order!
    const lineId = order.items[0].id

    // FIFO allocation
    const allocRes = db.allocateFIFO(order.id, lineId, 8, 'admin@msgoilfield.ae')
    expect(allocRes.success).toBe(true)
    const lotId = (lotRes as any).lotId || db.getLots().find(l => l.heat_number === 'HT-VIT-01')!.id
    expect(db.getBalances().find(b => b.stock_lot_id === lotId)?.available_qty).toBe(12)

    // Submit & Approve
    expect(db.submitForApproval(order.id, 'admin@msgoilfield.ae').success).toBe(true)
    expect(db.storekeeperApprove(order.id, 'Tariq Yard-1', 'Approved', 'Inspected OK').success).toBe(true)

    // Update status
    expect(db.updateOrderStatus(order.id, 'MTC Generated').success).toBe(true)

    // Dispatch 5 of 8
    const latestOrder = db.getOrders().find(o => o.id === order.id)!
    const allocId = latestOrder.allocations[0].id
    const dispRes = db.confirmDispatch(order.id, [{ allocation_id: allocId, dispatch_qty: 5 }], 'DN-VIT-01', 'TRK-VIT', 'admin@msgoilfield.ae', 'Partial')
    expect(dispRes.success).toBe(true)

    // Return 2 PCS + Stock Adjustment
    const retRes = db.recordMaterialReturn(order.id, lotId, 2, 'Excess site return', 'admin@msgoilfield.ae')
    expect(retRes.success).toBe(true)
    const adjRes = db.adjustStock(lotId, 18, 'Annual cycle count', 'admin@msgoilfield.ae')
    expect(adjRes.success).toBe(true)

    // Create & Cancel second SO
    const so2 = db.createSalesOrder({
      customer_id: 'CUST-001',
      customer_name: 'ADNOC',
      po_number: 'PO-VIT-CANCEL',
      required_delivery_date: '2026-12-20',
      items: [{ item_id: itemRes.item!.id, item_code: 'VIT-FLG-200', item_description: 'Flange', uom: 'PCS', required_qty: 3 }],
      userEmail: 'admin@msgoilfield.ae',
    }).order!
    expect(db.allocateFIFO(so2.id, so2.items[0].id, 3, 'admin@msgoilfield.ae').success).toBe(true)
    expect(db.cancelSalesOrder(so2.id, 'Cancelled by customer', 'admin@msgoilfield.ae').success).toBe(true)

    // AI Assistant Vetting & Chatbot
    expect(vetHeatNumber('HT-VIT-01')?.heatNumber).toBe('HT-VIT-01')
    expect(vetSalesOrder('PO-VIT-100')?.clientPo).toBe('PO-VIT-100')
    expect(runFullStockAudit().totalLots).toBeGreaterThanOrEqual(2)
  })

  it('preserves active auth token across resetToDefault and tracks backend sync errors', async () => {
    setAuthToken('keep-this-jwt')
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'))
    await db.resetToDefault()
    expect(getAuthToken()).toBe('keep-this-jwt')
    expect(db.getLastSyncError()).toBe('Network offline')
  })

  it('runs sourcing helpers, Excel parser, and AI chat query engine', async () => {
    expect(autoDetectHSCode('ELBOW 90DEG 2" SCH.80 ASTM A234 WPB')).toMatch(/^7307/)
    expect(autoDetectHSCode('2" Flange SORF CL150 SS316/316L')).toMatch(/^7307/)
    expect(autoDetectMake('BENKAN THAILAND')).toBeTruthy()
    expect(autoDetectCountryOfOrigin('WMASS GERMANY')).toBeTruthy()

    const parsedDesc = parseMSGDescription('ELBOW 90 DEG 2" SCH.80 ASTM A234 WPB')
    expect(parsedDesc.cleanDesc).toContain('ELBOW')

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['ITEM CODE', 'DESCRIPTION', 'HEAT NUMBER', 'QTY', 'LOCATION', 'SUPPLIER'],
      ['ELB-2-80', 'ELBOW 2" SCH80 WPB', 'HT-XL-1', 15, 'BAY-C1', 'BENKAN'],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Stock')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const parsedExcel = parseExcelBuffer(buf)
    expect(parsedExcel.rows.length).toBeGreaterThanOrEqual(1)

    const chatReply = await processChatQuery('vet stock health')
    expect(chatReply.type).toBeDefined()
  })
})
