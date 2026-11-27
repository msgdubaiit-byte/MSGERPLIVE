import '@testing-library/jest-dom/vitest'
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { setAuthToken, clearAuthToken } from '../services/api'
import { db } from '../services/db'
import type { SourcingWorksheetData } from '../services/sourcingEngine'
import {
  registerUploadedCertificate,
  uploadedCertificatesCache,
  extractNormalizedSize,
} from '../services/certificateVault'

import { CentralizedSoloHub } from '../components/solo/CentralizedSoloHub'
import { ITSystemConfigConsole } from '../components/it/ITSystemConfigConsole'
import { Dashboard } from '../components/dashboard/Dashboard'
import { MasterStock } from '../components/inventory/MasterStock'
import { ItemMaster } from '../components/inventory/ItemMaster'
import { SalesOrderManagement } from '../components/orders/SalesOrderManagement'
import { StockAllocationStudio } from '../components/allocation/StockAllocationStudio'
import { TechnicalSourcingPortal } from '../components/sourcing/TechnicalSourcingPortal'
import { LOCManagementPortal } from '../components/loc/LOCManagementPortal'
import { StickerGeneratorPortal } from '../components/stickers/StickerGeneratorPortal'
import { StorekeeperApprovals } from '../components/approvals/StorekeeperApprovals'
import { MTCManagement } from '../components/mtc/MTCManagement'
import { LocalPurchaseManager } from '../components/localPurchase/LocalPurchaseManager'
import { DispatchManager } from '../components/dispatch/DispatchManager'
import { StockMovementsLedger } from '../components/movements/StockMovementsLedger'
import { ReturnsAndAdjustments } from '../components/returns/ReturnsAndAdjustments'
import { CustomerReportsAnalytics } from '../components/reports/CustomerReportsAnalytics'
import { ReportsCenter } from '../components/reports/ReportsCenter'
import { ExcelStudio } from '../components/excel/ExcelStudio'
import { UserManagement } from '../components/users/UserManagement'
import { AuditLogsView } from '../components/audit/AuditLogsView'
import { SettingsView } from '../components/settings/SettingsView'
import { SummarySheetModal } from '../components/orders/SummarySheetModal'
import { ClearDataModal } from '../components/common/ClearDataModal'
import { HeatTraceabilityModal } from '../components/inventory/HeatTraceabilityModal'
import { OnboardingGuideModal } from '../components/common/OnboardingGuideModal'
import { PDFPreviewModal } from '../components/common/PDFPreviewModal'
import { BulkCertificateUploadModal } from '../components/mtc/BulkCertificateUploadModal'
import { VipAdminCustomizerModal } from '../components/admin/VipAdminCustomizerModal'
import { InPageCertificateTab } from '../components/sourcing/InPageCertificateTab'
import { InPagePurchaseOrderTab } from '../components/sourcing/InPagePurchaseOrderTab'
import { InPageCIPLTab } from '../components/sourcing/InPageCIPLTab'
import { generateCIPLPdfBytes, generatePackingLabelsPdfBytes } from '../services/ciplDocuments'
import { ERPChatbot } from '../components/chat/ERPChatbot'

const ADMIN_USER = {
  id: 'USR-002',
  employee_name: 'Admin Controller',
  email: 'admin@msgoilfield.ae',
  department: 'Management',
  role: 'super_admin',
  account_status: 'Active',
  allowed_modules: [],
  created_at: '2026-01-01',
}

function mockBackendFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('manifest.json')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/api/auth/me')) {
      return new Response(JSON.stringify({ success: true, user: ADMIN_USER }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/api/permissions')) {
      return new Response(
        JSON.stringify({ success: true, customPermissions: {}, granularPermissions: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    if (url.includes('/api/bootstrap')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            config: db.getSystemConfig(),
            suppliers: db.getSuppliers(),
            customers: db.getCustomers(),
            items: db.getItems(),
            lots: db.getLots(),
            balances: db.getBalances(),
            orders: db.getOrders(),
            mtcs: db.getMTCs(),
            localPurchases: db.getLocalPurchases(),
            movements: db.getMovements(),
            approvals: db.getApprovals(),
            dispatches: db.getDispatches(),
            returns: db.getReturns(),
            adjustments: db.getAdjustments(),
            importJobs: db.getImportJobs(),
            users: db.getUsers(),
            audits: db.getAudits(),
            sourcingDrafts: [],
            locDrafts: [],
            storedFiles: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response(JSON.stringify({ success: true, drafts: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

describe('All 22 UI Modules, Auth Shell & Interactive Modals', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    clearAuthToken()
    localStorage.clear()
    sessionStorage.clear()
    await db.resetToDefault()
  })

  it('renders LoginPage when unauthenticated', async () => {
    const { container } = render(<App />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/admin@msgoilfield\.ae/i)).toBeInTheDocument()
    })
    expect(container.textContent).toContain('MSG Oilfield')
  })

  it('renders authenticated shell and navigates across sidebar views', async () => {
    mockBackendFetch()
    setAuthToken('test-admin-jwt')

    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeInTheDocument()
    })

    const navButtons = screen.getByRole('navigation').querySelectorAll('button')
    expect(navButtons.length).toBeGreaterThanOrEqual(15)

    // Navigate through every visible sidebar module button
    for (const btn of Array.from(navButtons)) {
      fireEvent.click(btn)
    }
  })

  it('renders every ERP workspace module cleanly inside AuthProvider', async () => {
    mockBackendFetch()
    setAuthToken('test-admin-jwt')

    const item = db.addItem(
      {
        item_code: 'MOD-ELB-1',
        item_description: '2" Elbow Sch80 WPB',
        material_grade: 'ASTM A234 WPB',
        specification: 'ASME B16.9',
        size: '2" Sch 80',
        uom: 'PCS',
        unit_price_aed: 35,
        is_active: true,
      },
      'admin@msgoilfield.ae'
    ).item!

    db.addStockLot({
      item_id: item.id,
      heat_number: 'HT-MOD-1',
      yom: 2025,
      quantity: 10,
      purchase_type: 'regular',
      supplier_name: 'BENKAN CORPORATION',
      warehouse_location: 'BAY-1',
      userEmail: 'admin@msgoilfield.ae',
    })

    const order = db.createSalesOrder({
      customer_id: 'CUST-STS',
      customer_name: 'STS Bahrain',
      po_number: 'PO-MOD-1',
      required_delivery_date: '2026-12-20',
      items: [
        {
          item_id: item.id,
          item_code: item.item_code,
          item_description: item.item_description,
          uom: 'PCS',
          required_qty: 4,
        },
      ],
      userEmail: 'admin@msgoilfield.ae',
    }).order!

    const noop = () => {}
    const modules: React.ReactElement[] = [
      <CentralizedSoloHub key="solo_hub" onNavigateTab={noop} onOpenHeatModal={noop} />,
      <ITSystemConfigConsole key="it_console" onNavigateTab={noop} />,
      <Dashboard key="dashboard" onNavigate={noop} onSelectHeat={noop} />,
      <MasterStock key="stock" onSelectHeat={noop} onOpenImport={noop} onPreviewMTC={noop} />,
      <ItemMaster key="items" />,
      <SalesOrderManagement key="orders" onSelectOrder={noop} onNavigateToAllocation={noop} onPreviewMTC={noop} />,
      <StockAllocationStudio key="allocation" preselectedOrderId={order.id} onComplete={noop} />,
      <TechnicalSourcingPortal key="sourcing" />,
      <LOCManagementPortal key="loc" />,
      <StickerGeneratorPortal key="stickers" />,
      <StorekeeperApprovals key="approvals" />,
      <MTCManagement key="mtc" onPreviewMTC={noop} />,
      <LocalPurchaseManager key="local_purchase" onPreviewMTC={noop} />,
      <DispatchManager key="dispatch" />,
      <StockMovementsLedger key="movements" />,
      <ReturnsAndAdjustments key="returns" />,
      <CustomerReportsAnalytics key="reports" onNavigateToSourcing={noop} onPreviewMTC={noop} />,
      <ReportsCenter key="reports_center" />,
      <ExcelStudio key="excel" onPreviewMTC={noop} />,
      <UserManagement key="users" />,
      <AuditLogsView key="audit" />,
      <SettingsView key="settings" />,
      // Modals & Assistant (including closed -> open transitions for hook stability)
      <SummarySheetModal key="sum_closed" isOpen={false} onClose={noop} order={null as any} onOrderUpdated={noop} />,
      <SummarySheetModal key="sum_open" isOpen={true} onClose={noop} order={order} onOrderUpdated={noop} />,
      <ClearDataModal key="clear_modal" isOpen={true} onClose={noop} />,
      <HeatTraceabilityModal key="heat_modal" heatNumber="HT-MOD-1" onClose={noop} onPreviewMTC={noop} />,
      <OnboardingGuideModal key="guide_modal" isOpen={true} forceOpen={true} onClose={noop} />,
      <PDFPreviewModal key="pdf_modal" docName="MTC-1.pdf" itemCode={item.item_code} heatNumber="HT-MOD-1" onClose={noop} />,
      <BulkCertificateUploadModal key="bulk_mtc_modal" isOpen={true} onClose={noop} />,
      <VipAdminCustomizerModal key="vip_modal" isOpen={true} onClose={noop} />,
      <InPageCertificateTab
        key="cert_tab"
        worksheetData={{
          id: 'WS-1',
          client: 'STS Bahrain',
          po_number: 'PO-1',
          msg_ref: 'MSG-1',
          order_date: '2026-11-26',
          currency: 'USD',
          items: [
            {
              id: 'I-1',
              sl_no: 1,
              client_po_item_no: '10',
              description: '2" Elbow Sch80',
              qty: 5,
              uom: 'PCS',
              heat_number: 'HT-MOD-1',
              certificate_number: 'MTC-1',
              make: 'BENKAN',
              remarks: '',
              supplier_name: 'BENKAN CORPORATION',
              supplier_po_number: '',
              hs_code: '73079300',
              country_of_origin: 'Thailand',
              unit_price: 20,
              total_price: 100,
              unit_weight_kg: 1,
              total_net_weight_kg: 5,
              total_gross_weight_kg: 5.5,
              package_type: 'Pallet',
              package_no: '1',
            },
          ],
          saved_at: '2026-11-26',
        }}
        onApply={noop}
        onBack={noop}
        showToast={noop}
      />,
      <InPagePurchaseOrderTab
        key="po_tab"
        worksheetData={{
          id: 'WS-1',
          client: 'STS Bahrain',
          po_number: 'PO-1',
          msg_ref: 'MSG-1',
          order_date: '2026-11-26',
          currency: 'USD',
          items: [
            {
              id: 'I-1',
              sl_no: 1,
              client_po_item_no: '10',
              description: '2" Elbow Sch80',
              qty: 5,
              uom: 'PCS',
              heat_number: 'HT-MOD-1',
              certificate_number: 'MTC-1',
              make: 'BENKAN',
              remarks: '',
              supplier_name: 'BENKAN CORPORATION',
              supplier_po_number: '',
              hs_code: '73079300',
              country_of_origin: 'Thailand',
              unit_price: 20,
              total_price: 100,
              unit_weight_kg: 1,
              total_net_weight_kg: 5,
              total_gross_weight_kg: 5.5,
              package_type: 'Pallet',
              package_no: '1',
            },
          ],
          saved_at: '2026-11-26',
        }}
        selectedItemIds={new Set(['I-1'])}
        onApply={noop}
        onBack={noop}
        showToast={noop}
      />,
      <ERPChatbot key="chatbot" onNavigateTab={noop} onOpenTraceability={noop} onPreviewMTC={noop} />,
    ]

    for (const el of modules) {
      const { unmount, container } = render(<AuthProvider>{el}</AuthProvider>)
      await waitFor(() => {
        expect(container).toBeTruthy()
      })
      unmount()
    }
  })

  it('keeps the selected Operations Hub order synced when opening Sourcing Portal and exposes Uploaded MTC Vault', async () => {
    mockBackendFetch()
    setAuthToken('test-admin-jwt')

    const orderA = db.createSalesOrder({
      customer_id: 'CUST-STS',
      customer_name: 'Client Alpha',
      po_number: 'PO-ALPHA',
      required_delivery_date: '2026-12-20',
      items: [{ item_code: 'ITEM-ALPHA', item_description: 'Alpha Valve', uom: 'PCS', required_qty: 2 }],
      userEmail: 'admin@msgoilfield.ae',
    }).order!

    const orderB = db.createSalesOrder({
      customer_id: 'CUST-001',
      customer_name: 'Client Beta',
      po_number: 'PO-BETA',
      required_delivery_date: '2026-12-21',
      items: [{ item_code: 'ITEM-BETA', item_description: 'Beta Flange', uom: 'PCS', required_qty: 5 }],
      userEmail: 'admin@msgoilfield.ae',
    }).order!

    // Stale msg_sourcing_active_so_id points to orderA, while activeOrderId is switched to orderB
    localStorage.setItem('msg_sourcing_active_so_id', orderA.id)
    db.setActiveOrderId(orderB.id)

    const { unmount } = render(
      <AuthProvider>
        <TechnicalSourcingPortal />
      </AuthProvider>
    )
    await waitFor(() => {
      expect(screen.getByDisplayValue('PO-BETA')).toBeInTheDocument()
    })
    unmount()

    // Unique SO IDs even across multiple rapid creates + so_number fallback resolution
    const orderC = db.createSalesOrder({
      customer_name: 'OIS MIDDLE EAST',
      so_number: 'MSG-1126-2227',
      po_number: 'PO261393B',
      required_delivery_date: '2026-12-22',
      items: [{ item_code: 'ITEM-OIS', item_description: 'OIS Weld Neck Flange', uom: 'PCS', required_qty: 2 }],
      userEmail: 'admin@msgoilfield.ae',
    }).order!
    expect(orderC.id).not.toBe(orderA.id)
    expect(orderC.id).not.toBe(orderB.id)

    db.setActiveOrderId(orderC.id)
    localStorage.setItem('msg_sourcing_active_so_id', orderC.id)
    localStorage.setItem('msg_sourcing_active_so_number', orderC.so_number)
    const portalOrderCRender = render(
      <AuthProvider>
        <TechnicalSourcingPortal />
      </AuthProvider>
    )
    await waitFor(() => {
      expect(screen.getByDisplayValue('PO261393B')).toBeInTheDocument()
      expect(screen.getByDisplayValue('MSG-1126-2227')).toBeInTheDocument()
    })
    portalOrderCRender.unmount()

    const hubRender = render(
      <AuthProvider>
        <CentralizedSoloHub onNavigateTab={() => {}} onOpenHeatModal={() => {}} />
      </AuthProvider>
    )
    await waitFor(() => {
      expect(screen.getByText(/No Sales Order uploaded yet/i)).toBeInTheDocument()
    })
    expect(screen.queryByText('PO-ALPHA')).not.toBeInTheDocument()
    expect(screen.queryByText('PO-BETA')).not.toBeInTheDocument()
    hubRender.unmount()

    render(
      <AuthProvider>
        <MTCManagement onPreviewMTC={() => {}} />
      </AuthProvider>
    )
    await waitFor(() => {
      expect(screen.getByText(/Uploaded MTC Vault/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Registered Stock MTCs/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Uploaded PDF File/i).length).toBeGreaterThan(0)
  })

  it('disables preview/download actions when selected item has no heat number or no available MTC', async () => {
    mockBackendFetch()
    uploadedCertificatesCache.clear()
    const validPdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
    registerUploadedCertificate('valid-cert.pdf', validPdfBytes, 'valid-cert.pdf', 'HT-VALID-1')

    const makeItem = (id: string, sl: number, desc: string, heat: string, cert: string) => ({
      id,
      sl_no: sl,
      client_po_item_no: String(sl * 10),
      description: desc,
      qty: 5,
      uom: 'PCS',
      heat_number: heat,
      certificate_number: cert,
      make: 'BENKAN',
      remarks: '',
      supplier_name: 'BENKAN',
      supplier_po_number: '',
      hs_code: '73079300',
      country_of_origin: 'Thailand',
      unit_price: 20,
      total_price: 100,
      unit_weight_kg: 1,
      total_net_weight_kg: 5,
      total_gross_weight_kg: 5.5,
      package_type: 'Pallet',
      package_no: '1',
    })

    const { rerender, unmount } = render(
      <InPageCertificateTab
        worksheetData={{
          id: 'WS-MTC-TEST',
          client: 'Test Client',
          po_number: 'PO-MTC-TEST',
          msg_ref: 'MSG-MTC-TEST',
          order_date: '2026-11-27',
          currency: 'USD',
          items: [
            makeItem('I-VALID', 1, 'Item With MTC', 'HT-VALID-1', 'valid-cert.pdf'),
            makeItem('I-NO-HEAT', 2, 'Item Without Heat', '', ''),
            makeItem('I-NO-MTC', 3, 'Item Missing MTC', 'HT-MISSING-999', ''),
          ],
          saved_at: '2026-11-27',
        }}
        onApply={() => {}}
        onBack={() => {}}
        showToast={() => {}}
      />
    )

    // Row-level Preview and Download buttons: enabled only for Item 1 (has heat + MTC)
    const enabledPreviewBtns = screen.getAllByTitle('Preview certificate with MSG True-Copy stamp')
    const enabledDownloadBtns = screen.getAllByTitle('Download stamped certificate (.pdf)')
    expect(enabledPreviewBtns).toHaveLength(1)
    expect(enabledDownloadBtns).toHaveLength(1)
    expect(enabledPreviewBtns[0]).toBeEnabled()
    expect(enabledDownloadBtns[0]).toBeEnabled()

    const noHeatDisabledBtns = screen.getAllByTitle('Select a Heat Number first')
    expect(noHeatDisabledBtns.length).toBeGreaterThanOrEqual(2)
    noHeatDisabledBtns.forEach(btn => expect(btn).toBeDisabled())

    const noMtcDisabledBtns = screen.getAllByTitle('No MTC certificate available for this item')
    expect(noMtcDisabledBtns).toHaveLength(2)
    noMtcDisabledBtns.forEach(btn => expect(btn).toBeDisabled())

    // Preview modal is closed by default so it does not block the left-hand table
    expect(screen.queryByRole('dialog', { name: /Live Stamped Certificate Preview/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download All \(\.zip\)/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Download Complete MTC \(\.pdf\)/i })).toBeEnabled()

    // Clicking Preview on Item 1 opens the popup modal with Refresh, Download Stamped MTC, and Close
    fireEvent.click(enabledPreviewBtns[0])
    const dialog = await screen.findByRole('dialog', { name: /Live Stamped Certificate Preview/i })
    expect(dialog).toBeInTheDocument()

    const footerDownload = screen.getByRole('button', { name: /Download Stamped MTC/i })
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i })
    await waitFor(() => {
      expect(footerDownload).toBeEnabled()
      expect(refreshBtn).toBeEnabled()
    })

    // Close button dismisses the preview popup
    fireEvent.click(screen.getByRole('button', { name: /Close preview/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Live Stamped Certificate Preview/i })).not.toBeInTheDocument()
    })

    // When no items in worksheet have an MTC, bulk download buttons are also disabled
    rerender(
      <InPageCertificateTab
        worksheetData={{
          id: 'WS-MTC-NONE',
          client: 'Test Client',
          po_number: 'PO-MTC-NONE',
          msg_ref: 'MSG-MTC-NONE',
          order_date: '2026-11-27',
          currency: 'USD',
          items: [
            makeItem('I-NO-HEAT', 1, 'Item Without Heat', '', ''),
            makeItem('I-NO-MTC', 2, 'Item Missing MTC', 'HT-MISSING-999', ''),
          ],
          saved_at: '2026-11-27',
        }}
        onApply={() => {}}
        onBack={() => {}}
        showToast={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /Download All \(\.zip\)/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Download Complete MTC \(\.pdf\)/i })).toBeDisabled()

    unmount()
    uploadedCertificatesCache.clear()
  })

  it('disables Sourcing & CIPL worksheet MTC actions for items without heat number or available MTC', async () => {
    mockBackendFetch()
    uploadedCertificatesCache.clear()
    db.resetToDefault()
    setAuthToken('mock-token-admin')

    const validPdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
    registerUploadedCertificate('valid-cert.pdf', validPdfBytes, 'valid-cert.pdf', 'HT-VALID-1')

    const mixedOrder = db.createSalesOrder({
      customer_name: 'Mixed MTC Client',
      so_number: 'SO-MIXED-MTC',
      po_number: 'PO-MIXED-MTC',
      required_delivery_date: '2026-12-25',
      items: [
        { item_code: 'ITM-1', item_description: 'Valid Fitting', uom: 'PCS', required_qty: 2, heat_number: 'HT-VALID-1' },
        { item_code: 'ITM-2', item_description: 'No Heat Fitting', uom: 'PCS', required_qty: 3, heat_number: '' },
        { item_code: 'ITM-3', item_description: 'Missing MTC Fitting', uom: 'PCS', required_qty: 4, heat_number: 'HT-NO-FILE' },
      ],
      userEmail: 'admin@msgoilfield.ae',
    }).order!

    db.setActiveOrderId(mixedOrder.id)
    localStorage.setItem('msg_sourcing_active_so_id', mixedOrder.id)

    const mixedRender = render(
      <AuthProvider>
        <TechnicalSourcingPortal />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('PO-MIXED-MTC')).toBeInTheDocument()
    })

    // Row 1 (HT-VALID-1 with registered PDF) has enabled MTC view & cert buttons
    expect(screen.getAllByTitle('View, Preview & Download MTC Certificate')).toHaveLength(1)
    expect(screen.getByTitle('View, Preview & Download MTC Certificate')).toBeEnabled()
    expect(screen.getAllByTitle('Create & customize EN 10204 3.1 Certificate for this item')).toHaveLength(1)
    expect(screen.getByTitle('Create & customize EN 10204 3.1 Certificate for this item')).toBeEnabled()

    // Row 2 (no heat) and Row 3 (no MTC file) have disabled MTC actions
    const noHeatButtons = screen.getAllByTitle('Select a Heat Number first')
    expect(noHeatButtons).toHaveLength(2)
    noHeatButtons.forEach(btn => expect(btn).toBeDisabled())

    const noMtcButtons = screen.getAllByTitle('No MTC certificate available for this item')
    expect(noMtcButtons).toHaveLength(2)
    noMtcButtons.forEach(btn => expect(btn).toBeDisabled())

    // 1-Click Direct Download package button is enabled because Row 1 has an MTC
    expect(screen.getByTitle('1-Click Direct Download Complete Stamped MTC Package (.pdf)')).toBeEnabled()
    mixedRender.unmount()

    // Order with no items having an available MTC disables the 1-click package download button
    const emptyMtcOrder = db.createSalesOrder({
      customer_name: 'No MTC Client',
      so_number: 'SO-NO-MTC',
      po_number: 'PO-NO-MTC',
      required_delivery_date: '2026-12-26',
      items: [
        { item_code: 'ITM-4', item_description: 'Unassigned Fitting', uom: 'PCS', required_qty: 1, heat_number: '' },
      ],
      userEmail: 'admin@msgoilfield.ae',
    }).order!

    db.setActiveOrderId(emptyMtcOrder.id)
    localStorage.setItem('msg_sourcing_active_so_id', emptyMtcOrder.id)

    const emptyRender = render(
      <AuthProvider>
        <TechnicalSourcingPortal />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('PO-NO-MTC')).toBeInTheDocument()
    })
    expect(screen.getByTitle('Select a Heat Number with an available MTC first')).toBeDisabled()
    emptyRender.unmount()
    uploadedCertificatesCache.clear()
  })

  it('filters Heat dropdown by item size, displays Stock Qty & YOM, and auto-fills Make & MTC Cert Ref', async () => {
    expect(extractNormalizedSize('FULL COUPLING 1/2" 3000# NPT A105N')).toBe('0.5')
    expect(extractNormalizedSize('CONC RED 4" X 2" SCH.80 A234 WPB')).toBe('4x2')
    expect(extractNormalizedSize('WNRF FLANGE DN150 150# SCH.40 A105N')).toBe('6')
    expect(extractNormalizedSize('BLIND FLANGE RF 1.5, 150# ASA 105N-HN 24-71510')).toBe('1.5')

    const mockManifest = [
      {
        fileName: 'FULL COUPLING 0.5 INCH, 3000#, NPT, A105N, ASME B16.11, HDG- HN-VASB (QTY-25)-2013.pdf',
        url: '/certificates/FULL%20COUPLING%200.5%20INCH.pdf',
        heatNumber: '2013',
        fileSize: 12000,
      },
      {
        fileName: 'WNRF 6 INCH, 150#, SCH.80, A105N MFF-HN-70590.pdf',
        url: '/certificates/WNRF%206%20INCH.pdf',
        heatNumber: '70590',
        fileSize: 15000,
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('manifest.json')) {
        return new Response(JSON.stringify(mockManifest), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    uploadedCertificatesCache.clear()
    db.resetToDefault()
    setAuthToken('mock-token-admin')

    const item1 = db.addItem({
      item_code: 'CPL-0.5-3000',
      item_description: 'FULL COUPLING 1/2 INCH 3000# NPT A105N',
      material_grade: 'A105N',
      specification: 'ASME B16.11',
      size: '0.5"',
      uom: 'PCS',
      unit_price_aed: 15,
      is_active: true,
    }, 'admin@msgoilfield.ae').item!

    db.addStockLot({
      item_id: item1.id,
      heat_number: '2013',
      yom: 2013,
      quantity: 42,
      purchase_type: 'regular',
      supplier_name: 'MELESI',
      warehouse_location: 'YARD-1',
      mtc_ref: mockManifest[0].fileName,
      userEmail: 'admin@msgoilfield.ae',
    })

    const order = db.createSalesOrder({
      customer_name: 'Size Filter Client',
      so_number: 'SO-SIZE-FILTER',
      po_number: 'PO-SIZE-FILTER',
      required_delivery_date: '2026-12-28',
      items: [
        { item_code: 'CPL-0.5-3000', item_description: 'FULL COUPLING 1/2" 3000# NPT A105N', uom: 'PCS', required_qty: 10 },
      ],
      userEmail: 'admin@msgoilfield.ae',
    }).order!

    db.setActiveOrderId(order.id)
    localStorage.setItem('msg_sourcing_active_so_id', order.id)

    const { unmount } = render(
      <AuthProvider>
        <TechnicalSourcingPortal />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('PO-SIZE-FILTER')).toBeInTheDocument()
    })

    // Open Heat dropdown on the Sourcing & CIPL worksheet row
    const dropdownBtn = screen.getByTitle(/Select from authentic Heat Numbers/i)
    fireEvent.click(dropdownBtn)

    // Size filter is active for 0.5": shows heat 2013 with Stock: 42 & YOM: 2013, hides 6" heat 70590
    await waitFor(() => {
      expect(screen.getByText(/Item Size: 0\.5"/i)).toBeInTheDocument()
      expect(screen.getByText('Stock: 42')).toBeInTheDocument()
      expect(screen.getByText('YOM: 2013')).toBeInTheDocument()
    })
    expect(screen.queryByText('70590')).not.toBeInTheDocument()

    // Select heat 2013 option -> auto-fills Heat #, Make/MFR, and MTC Cert Ref
    fireEvent.click(screen.getByText('Stock: 42'))

    await waitFor(() => {
      expect(screen.getByDisplayValue('2013')).toBeInTheDocument()
      expect(screen.getByDisplayValue(mockManifest[0].fileName)).toBeInTheDocument()
      expect(screen.getByDisplayValue('MELESI ITALY')).toBeInTheDocument()
    })

    unmount()
  })

  it('disables Local Purchase for in-stock items and requires L-Code for non-stock items', async () => {
    mockBackendFetch()
    uploadedCertificatesCache.clear()
    db.resetToDefault()
    setAuthToken('mock-token-admin')

    const stockItem = db.addItem({
      item_code: 'RED-6X3-S40',
      item_description: 'CONC. RED. 6" X 3", SCH.40, BW, SMLS, ASTM A/ SA 234 WPB',
      material_grade: 'A234 WPB',
      specification: 'ASME B16.9',
      size: '6x3',
      uom: 'PCS',
      unit_price_aed: 92.65,
      is_active: true,
    }, 'admin@msgoilfield.ae').item!

    db.addStockLot({
      item_id: stockItem.id,
      heat_number: '65P20M035',
      yom: 2025,
      quantity: 12,
      purchase_type: 'regular',
      supplier_name: 'BENKAN THAILAND',
      warehouse_location: 'YARD-1',
      userEmail: 'admin@msgoilfield.ae',
    })

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onApplyMock = vi.fn()
    const onBackMock = vi.fn()

    const wsData = {
      id: 'WS-LP-TEST',
      client: 'Test Client',
      po_number: 'PO-LP-TEST',
      msg_ref: 'MSG-LP-TEST',
      order_date: '2026-11-27',
      currency: 'USD',
      items: [
        {
          id: 'ROW-IN-STOCK',
          sl_no: 1,
          client_po_item_no: '10',
          description: 'CONC. RED. 6" X 3", SCH.40, BW, SMLS, ASTM A/ SA 234 WPB',
          qty: 4,
          uom: 'PCS',
          heat_number: '65P20M035',
          certificate_number: '',
          make: 'BENKAN THAILAND',
          remarks: '',
          supplier_name: 'STOCK',
          supplier_po_number: '',
          hs_code: '73079300',
          country_of_origin: 'Thailand',
          unit_price: 92.65,
          total_price: 370.6,
          unit_weight_kg: 2,
          total_net_weight_kg: 8,
          total_gross_weight_kg: 9,
          package_type: 'Pallet',
          package_no: '1',
        },
        {
          id: 'ROW-NON-STOCK',
          sl_no: 2,
          client_po_item_no: '20',
          description: 'CONC. RED. 8" X 6", SCH.40, NON-STOCK ITEM',
          qty: 2,
          uom: 'PCS',
          heat_number: '',
          certificate_number: '',
          make: '',
          remarks: '',
          supplier_name: '',
          supplier_po_number: '',
          hs_code: '73079300',
          country_of_origin: '',
          unit_price: 136.5,
          total_price: 273,
          unit_weight_kg: 3,
          total_net_weight_kg: 6,
          total_gross_weight_kg: 7,
          package_type: 'Pallet',
          package_no: '1',
        },
      ],
      saved_at: '2026-11-27',
    }

    const { unmount } = render(
      <InPagePurchaseOrderTab
        worksheetData={wsData}
        selectedItemIds={new Set()}
        onApply={onApplyMock}
        onBack={onBackMock}
        showToast={() => {}}
      />
    )

    // Row 1 (available in stock) MUST NOT appear in Purchase Order selection list
    expect(screen.queryByText(/CONC\. RED\. 6" X 3"/i)).not.toBeInTheDocument()
    expect(screen.getByText(/1 Stock item\(s\) hidden/i)).toBeInTheDocument()

    // Row 2 (non-stock) appears and is checked, with L-Code dropdown
    const eligibleCheckbox = screen.getByTitle('Select non-stock item for Local Purchase')
    expect(eligibleCheckbox).toBeEnabled()
    expect(eligibleCheckbox).toBeChecked()

    const lCodeSelect = screen.getByLabelText('L-Code for item 20') as HTMLSelectElement
    expect(lCodeSelect).toBeEnabled()
    expect(lCodeSelect.value).toBe('')

    // Trying to apply without selecting an L-Code blocks submission and alerts
    fireEvent.click(screen.getByRole('button', { name: /Apply to Worksheet/i }))
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Please select an L-Code/i))
    expect(onApplyMock).not.toHaveBeenCalled()

    // Selecting an L-Code allows Apply to Worksheet and persists L-Code on the non-stock item
    fireEvent.change(lCodeSelect, { target: { value: 'L-20' } })
    fireEvent.click(screen.getByRole('button', { name: /Apply to Worksheet/i }))
    expect(onApplyMock).toHaveBeenCalledTimes(1)
    const appliedItems = onApplyMock.mock.calls[0][0]
    expect(appliedItems[0].l_code).toBeFalsy()
    expect(appliedItems[1].l_code).toBe('L-20')
    expect(appliedItems[1].is_local).toBe(true)
    expect(appliedItems[1].purchase_type).toBe('local_purchase')

    alertSpy.mockRestore()
    unmount()
  })

  it('supports collapsing the sidebar and toggling full-screen workspace and worksheet modes', async () => {
    mockBackendFetch()
    db.resetToDefault()
    setAuthToken('mock-token-admin')

    const { unmount } = render(<App />)

    await waitFor(() => {
      expect(screen.getByText('MSG Oilfield ERP')).toBeInTheDocument()
    })

    // Sidebar minimize/expand button directly on the sidebar
    fireEvent.click(screen.getByRole('button', { name: /Minimize sidebar/i }))
    expect(screen.queryByText('MSG Oilfield ERP')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Expand sidebar/i }))
    expect(screen.getByText('MSG Oilfield ERP')).toBeInTheDocument()

    // App-level full-screen mode hides sidebar & navbar and shows Exit Full Screen
    fireEvent.click(screen.getByRole('button', { name: /Enable full screen/i }))
    expect(screen.queryByText('MSG Oilfield ERP')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exit Full Screen/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Exit Full Screen/i }))
    expect(screen.getByText('MSG Oilfield ERP')).toBeInTheDocument()

    // Navigate to Sourcing & CIPL and toggle worksheet full-screen mode
    fireEvent.click(screen.getByRole('button', { name: /Sourcing & CIPL/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Full screen worksheet/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Full screen worksheet/i }))
    expect(screen.getByRole('button', { name: /Exit sheet full screen/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Exit sheet full screen/i }))
    expect(screen.getByRole('button', { name: /Full screen worksheet/i })).toBeInTheDocument()

    unmount()
  })

  it('allows hiding/showing individual columns, collapsing custom panels, and flipping toolbars left/right', async () => {
    mockBackendFetch()
    localStorage.removeItem('msg_sourcing_show_metadata')
    localStorage.removeItem('msg_sourcing_show_exports')
    localStorage.removeItem('msg_sourcing_toolbar_flip')
    localStorage.removeItem('msg_sourcing_hidden_cols')
    localStorage.removeItem('msg_sourcing_col_order')
    db.resetToDefault()
    setAuthToken('mock-token-admin')

    const order = db.createSalesOrder({
      customer_name: 'Layout Test Client',
      so_number: 'SO-LAYOUT-1',
      po_number: 'PO-LAYOUT-1',
      required_delivery_date: '2026-12-28',
      items: [
        { item_code: 'ITM-L1', item_description: '1" Elbow Sch80', uom: 'PCS', required_qty: 2 },
      ],
      userEmail: 'admin@msgoilfield.ae',
    }).order!

    db.setActiveOrderId(order.id)
    localStorage.setItem('msg_sourcing_active_so_id', order.id)

    const { unmount } = render(
      <AuthProvider>
        <TechnicalSourcingPortal />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('PO-LAYOUT-1')).toBeInTheDocument()
    })

    // 1. Hide an individual column header directly via its header button
    expect(screen.getByRole('columnheader', { name: /Packaging \(CIPL\)/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Packaging (CIPL) column' }))
    expect(screen.queryByRole('columnheader', { name: /Packaging \(CIPL\)/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Customize columns and panels' })).toHaveTextContent('Columns (1 hidden)')

    // 2. Open Customize menu -> reorder a column and reset layout
    fireEvent.click(screen.getByRole('button', { name: 'Customize columns and panels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move Heat Number left' }))
    fireEvent.click(screen.getByRole('button', { name: /Reset/i }))
    expect(screen.getByRole('columnheader', { name: /Packaging \(CIPL\)/i })).toBeInTheDocument()

    // 3. Hide Order Details Panel and Deliverables Panel, then restore them
    fireEvent.click(screen.getByRole('button', { name: /Hide Panel/i }))
    expect(screen.queryByText(/Order Details & Shipping Metadata/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Deliverables Toolbar panel' }))
    expect(screen.queryByText(/Auto-Detect All \(COO, HS, Wt\)/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /\+ Show Order Details/i }))
    expect(screen.getByText(/Order Details & Shipping Metadata/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /\+ Show Deliverables Toolbar/i }))
    expect(screen.getByText(/Auto-Detect All \(COO, HS, Wt\)/i)).toBeInTheDocument()

    // 4. Flip toolbar left <-> right
    const flipBtn = screen.getByRole('button', { name: 'Flip toolbar side' })
    expect(flipBtn).toHaveTextContent('Flip L/R')
    fireEvent.click(flipBtn)
    expect(flipBtn).toHaveTextContent('Toolbar: Left')
    fireEvent.click(flipBtn)
    expect(flipBtn).toHaveTextContent('Flip L/R')

    unmount()
  })

  it('allows hiding and repositioning the floating ERP Assistant widget without obstructing table controls', async () => {
    const noop = () => {}
    const { container, unmount } = render(
      <AuthProvider>
        <ERPChatbot onNavigateTab={noop} onOpenTraceability={noop} onPreviewMTC={noop} />
      </AuthProvider>
    )

    // Starts visible at bottom-right
    expect(screen.getByText('ERP Assistant')).toBeInTheDocument()
    const wrapper = container.querySelector('[data-assistant-position="bottom-right"]')
    expect(wrapper).not.toBeNull()

    // 1. Reposition via corner picker menu
    fireEvent.click(screen.getByRole('button', { name: 'Reposition ERP Assistant' }))
    fireEvent.click(screen.getByRole('button', { name: /Top Left/i }))
    expect(container.querySelector('[data-assistant-position="top-left"]')).not.toBeNull()
    expect(localStorage.getItem('msg_erp_assistant_position')).toBe('top-left')

    // 2. Hide ERP Assistant via 1-click Hide button
    fireEvent.click(screen.getByRole('button', { name: 'Hide ERP Assistant' }))
    expect(screen.queryByText('Find, Vet & Download')).not.toBeInTheDocument()
    expect(localStorage.getItem('msg_erp_assistant_hidden')).toBe('true')
    const restoreBtn = screen.getByRole('button', { name: 'Show ERP Assistant' })
    expect(restoreBtn).toBeInTheDocument()

    // 3. Restore ERP Assistant and verify drawer header also keeps reposition controls
    fireEvent.click(restoreBtn)
    expect(screen.getByText('Find, Vet & Download')).toBeInTheDocument()
    expect(localStorage.getItem('msg_erp_assistant_hidden')).toBe('false')

    fireEvent.click(screen.getByText('ERP Assistant'))
    expect(screen.getByText('MSG ERP Co-Pilot')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reposition ERP Assistant' }))
    fireEvent.click(screen.getByRole('button', { name: /Bottom Left/i }))
    expect(container.querySelector('[data-assistant-position="bottom-left"]')).not.toBeNull()

    unmount()
  })

  it('keeps stock unchanged on heat selection, deducts only on Apply/Apply Stock Items or Approval, and prevents duplicate allocation', async () => {
    mockBackendFetch()
    db.resetToDefault()
    setAuthToken('mock-token-admin')

    const item = db.addItem({
      item_code: 'CAP-APPLY-6',
      item_description: 'CAP 6", SCH.40, BW, SMLS, A234 WPB',
      material_grade: 'A234 WPB',
      specification: 'ASME B16.9',
      size: '6"',
      uom: 'PCS',
      unit_price_aed: 60,
      is_active: true,
    }, 'admin@msgoilfield.ae').item!

    const lotRes = db.addStockLot({
      item_id: item.id,
      heat_number: '65N10028',
      yom: 2023,
      quantity: 10,
      purchase_type: 'regular',
      supplier_name: 'BENKAN',
      warehouse_location: 'Yard-1',
      mtc_ref: 'MTC-65N10028.pdf',
      userEmail: 'admin@msgoilfield.ae',
    })
    expect(lotRes.success).toBe(true)

    const created = db.createSalesOrder({
      customer_id: 'CUST-STS',
      customer_name: 'Apply Test Client',
      so_number: 'SO-APPLY-1',
      po_number: 'PO-APPLY-1',
      required_delivery_date: '2026-12-30',
      items: [
        {
          item_id: item.id,
          item_code: item.item_code,
          item_description: item.item_description,
          required_qty: 6,
          client_po_item_no: '1',
          position: 1,
          supplier_name: 'STOCK',
        },
        {
          item_id: item.id,
          item_code: item.item_code,
          item_description: item.item_description,
          required_qty: 6,
          client_po_item_no: '2',
          position: 2,
          supplier_name: 'STOCK',
        },
      ],
      userEmail: 'sales@msg.ae',
    })
    expect(created.success).toBe(true)
    db.setActiveOrderId(created.order!.id)
    localStorage.setItem('msg_sourcing_active_so_id', created.order!.id)

    const { unmount } = render(
      <AuthProvider>
        <TechnicalSourcingPortal />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('PO-APPLY-1')).toBeInTheDocument()
    })

    // 1. Selecting heat number before clicking Apply keeps stock unchanged at 10
    const heatInputs = screen.getAllByPlaceholderText('Select / type Heat #')
    fireEvent.change(heatInputs[0], { target: { value: '65N10028' } })
    expect(db.getAvailableStockQtyForHeat('65N10028')).toBe(10)

    // 2. Clicking per-item Apply deducts 6 -> remaining available becomes 4
    const applyRow1 = screen.getByRole('button', { name: 'Apply stock item 1' })
    fireEvent.click(applyRow1)
    expect(db.getAvailableStockQtyForHeat('65N10028')).toBe(4)
    expect(screen.getByRole('button', { name: 'Apply stock item 1' })).toHaveTextContent('Applied')
    expect(screen.getByRole('button', { name: 'Apply stock item 1' })).toBeDisabled()

    // 3. Selecting same heat on row 2 (qty 6 > remaining 4) and clicking Apply Stock Items rejects over-allocation
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const refreshedInputs = screen.getAllByPlaceholderText('Select / type Heat #')
    fireEvent.change(refreshedInputs[1], { target: { value: '65N10028' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Stock Items' }))

    expect(alertSpy).toHaveBeenCalled()
    expect(db.getAvailableStockQtyForHeat('65N10028')).toBe(4)
    alertSpy.mockRestore()

    // 4. Subsequent order with selected heat deducts remaining stock upon Storekeeper Approval
    const order2 = db.createSalesOrder({
      customer_id: 'CUST-STS',
      customer_name: 'Approve Deduct Client',
      so_number: 'SO-APPLY-2',
      po_number: 'PO-APPLY-2',
      required_delivery_date: '2026-12-31',
      items: [
        {
          item_id: item.id,
          item_code: item.item_code,
          item_description: item.item_description,
          heat_number: '65N10028',
          required_qty: 3,
          client_po_item_no: '1',
          position: 1,
          supplier_name: 'STOCK',
        },
      ],
      userEmail: 'sales@msg.ae',
    }).order!
    expect(db.getAvailableStockQtyForHeat('65N10028')).toBe(4)
    const appRes = db.storekeeperApprove(order2.id, 'Tariq Yard-1', 'Approved', 'Verified physical count')
    expect(appRes.success).toBe(true)
    expect(db.getAvailableStockQtyForHeat('65N10028')).toBe(1)

    unmount()
  })

  it('supports Create Purchase Order popup workflow: hides stock items, retains checkboxes on Add More Items, calculates costing, and excludes created PO items from subsequent lists', async () => {
    mockBackendFetch()
    uploadedCertificatesCache.clear()
    db.resetToDefault()
    setAuthToken('mock-token-admin')

    const stockItem = db.addItem({
      item_code: 'CAP-STK-4',
      item_description: 'CAP 4" SCH.40 IN-STOCK FITTING',
      material_grade: 'A234 WPB',
      specification: 'ASME B16.9',
      size: '4"',
      uom: 'PCS',
      unit_price_aed: 45,
      is_active: true,
    }, 'admin@msgoilfield.ae').item!

    db.addStockLot({
      item_id: stockItem.id,
      heat_number: 'STK-HT-400',
      yom: 2025,
      quantity: 20,
      purchase_type: 'regular',
      supplier_name: 'BENKAN THAILAND',
      warehouse_location: 'YARD-1',
      userEmail: 'admin@msgoilfield.ae',
    })

    let worksheetState: SourcingWorksheetData = {
      id: 'WS-PO-FLOW',
      client: 'Qatar Energy Contractor',
      po_number: 'CLIENT-PO-88',
      msg_ref: 'MSG-26-88',
      order_date: '2026-11-27',
      currency: 'AED' as const,
      items: [
        {
          id: 'ROW-STOCK',
          sl_no: 1,
          client_po_item_no: '10',
          description: 'CAP 4" SCH.40 IN-STOCK FITTING',
          qty: 5,
          uom: 'PCS',
          heat_number: 'STK-HT-400',
          certificate_number: '',
          make: 'BENKAN',
          remarks: '',
          supplier_name: 'STOCK',
          supplier_po_number: '',
          hs_code: '73079300',
          country_of_origin: 'Thailand',
          unit_price: 45,
          total_price: 225,
          unit_weight_kg: 1,
          total_net_weight_kg: 5,
          total_gross_weight_kg: 6,
          package_type: 'Pallet',
          package_no: '1',
        },
        {
          id: 'ROW-LCODE',
          sl_no: 2,
          client_po_item_no: '20',
          description: 'CUSTOM MACHINED FLANGE L-CODE ITEM',
          qty: 10,
          uom: 'PCS',
          heat_number: '',
          certificate_number: '',
          make: '',
          remarks: '',
          supplier_name: '',
          supplier_po_number: '',
          hs_code: '73079100',
          country_of_origin: '',
          unit_price: 0,
          total_price: 0,
          unit_weight_kg: 2,
          total_net_weight_kg: 20,
          total_gross_weight_kg: 23,
          package_type: 'Pallet',
          package_no: '1',
          l_code: 'L-20',
          is_local: true,
          purchase_type: 'local_purchase' as const,
        },
        {
          id: 'ROW-NONSTK',
          sl_no: 3,
          client_po_item_no: '30',
          description: 'NON-STOCK SPECIAL REDUCER',
          qty: 8,
          uom: 'PCS',
          heat_number: '',
          certificate_number: '',
          make: '',
          remarks: '',
          supplier_name: '',
          supplier_po_number: '',
          hs_code: '73079300',
          country_of_origin: '',
          unit_price: 0,
          total_price: 0,
          unit_weight_kg: 2,
          total_net_weight_kg: 16,
          total_gross_weight_kg: 18,
          package_type: 'Pallet',
          package_no: '1',
        },
      ],
      saved_at: '2026-11-27',
    }

    const Wrapper = () => {
      const [ws, setWs] = React.useState(worksheetState)
      return (
        <InPagePurchaseOrderTab
          worksheetData={ws}
          selectedItemIds={new Set(['ROW-LCODE', 'ROW-NONSTK'])}
          onApply={(updated) => {
            worksheetState = { ...ws, items: updated }
            setWs(worksheetState)
          }}
          onBack={() => {}}
          showToast={() => {}}
        />
      )
    }

    const { unmount } = render(<Wrapper />)

    // 1. Only L-Code and Non-Stock items appear; Stock item does not appear
    expect(screen.queryByText(/CAP 4" SCH\.40 IN-STOCK FITTING/i)).not.toBeInTheDocument()
    expect(screen.getByText(/CUSTOM MACHINED FLANGE L-CODE ITEM/i)).toBeInTheDocument()
    expect(screen.getByText(/NON-STOCK SPECIAL REDUCER/i)).toBeInTheDocument()

    // 2. Open Create PO popup showing only selected items
    fireEvent.click(screen.getAllByRole('button', { name: /Create PO/i })[0])
    const dialog = screen.getByRole('dialog', { name: 'Create PO Modal' })
    expect(dialog).toBeInTheDocument()

    // 3. Remove Item 30 from popup, enter Supplier Unit Price 125 for Item 20 with partial PO Qty 6
    fireEvent.click(screen.getByRole('button', { name: 'Remove Item 30' }))
    expect(screen.queryByRole('button', { name: 'Remove Item 30' })).not.toBeInTheDocument()

    // Click Add More Items -> returns to selection page while Item 20 stays checked & Item 30 is unchecked
    fireEvent.click(screen.getAllByRole('button', { name: 'Add More Items' })[0])
    expect(screen.queryByRole('dialog', { name: 'Create PO Modal' })).not.toBeInTheDocument()
    const checkboxes = screen.getAllByTitle('Select non-stock item for Local Purchase') as HTMLInputElement[]
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()

    // Reopen Create PO popup, set Supplier Unit Price = 125 & partial PO Qty = 6 on Item 20
    fireEvent.click(screen.getAllByRole('button', { name: /Create PO/i })[0])
    fireEvent.change(screen.getByLabelText('Popup PO Qty for item 20'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Supplier Unit Price for item 20'), { target: { value: '125' } })
    expect(screen.getAllByText(/AED 750\.00/i).length).toBeGreaterThanOrEqual(2)

    // Confirm & Create PO -> partial PO (6 of 10) leaves ONLY remaining 4 pending for Item 20 + Item 30
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Create PO/i }))

    await waitFor(() => {
      // Ordered slice (6) does NOT appear; pending qty (4) & remaining non-stock item (8) appear
      expect(screen.getByText(/4 PCS/)).toBeInTheDocument()
      expect(screen.getByText(/8 PCS/)).toBeInTheDocument()
      expect(screen.queryByText(/6 PCS/)).not.toBeInTheDocument()
    })
    const createdSlice = worksheetState.items.find(it => it.po_created)
    expect(createdSlice?.supplier_unit_price).toBe(125)
    expect(createdSlice?.supplier_total_price).toBe(750)

    unmount()
  })

  it('provides supplier-wise PO tabs, receipt Heat/Cert entry, item rejection with reason, and Rejected Items reorder into New or Existing PO with traceability', async () => {
    mockBackendFetch()
    uploadedCertificatesCache.clear()
    db.resetToDefault()
    setAuthToken('mock-token-admin')

    let wsItems: any[] = [
      {
        id: 'SUPP-A-1',
        sl_no: 1,
        client_po_item_no: '1',
        description: 'MACHINED ELBOW 4" SCH.40',
        qty: 5,
        uom: 'PCS',
        heat_number: '',
        certificate_number: '',
        make: '',
        remarks: '',
        supplier_name: 'AL GHAITH OILFIELD SUPPLIES',
        supplier_po_number: 'LP-PO-2611-01',
        hs_code: '73079300',
        country_of_origin: '',
        unit_price: 100,
        total_price: 500,
        supplier_unit_price: 100,
        supplier_total_price: 500,
        unit_weight_kg: 2,
        total_net_weight_kg: 10,
        total_gross_weight_kg: 11.5,
        package_type: 'Pallet',
        package_no: '1',
        l_code: 'L-1',
        is_local: true,
        purchase_type: 'local_purchase',
        po_created: true,
        po_ordered_qty: 5,
      },
      {
        id: 'SUPP-B-1',
        sl_no: 2,
        client_po_item_no: '2',
        description: 'CUSTOM FLANGE 6" 300#',
        qty: 4,
        uom: 'PCS',
        heat_number: 'HT-B-99',
        certificate_number: 'MTC-B-99.pdf',
        make: '',
        remarks: '',
        supplier_name: 'PETROTECH ENGINEERING SERVICES',
        supplier_po_number: 'LP-PO-2611-02',
        hs_code: '73079100',
        country_of_origin: '',
        unit_price: 150,
        total_price: 600,
        supplier_unit_price: 150,
        supplier_total_price: 600,
        unit_weight_kg: 3,
        total_net_weight_kg: 12,
        total_gross_weight_kg: 13.8,
        package_type: 'Pallet',
        package_no: '1',
        l_code: 'L-2',
        is_local: true,
        purchase_type: 'local_purchase',
        po_created: true,
        po_ordered_qty: 4,
      },
    ]

    const wsBase = {
      id: 'WS-SUPP-REJECT',
      client: 'Client X',
      po_number: 'PO-CLIENT-99',
      msg_ref: 'MSG-26-99',
      order_date: '2026-11-27',
      currency: 'AED' as const,
      items: wsItems,
      saved_at: '2026-11-27',
    }

    const Wrapper = () => {
      const [itemsState, setItemsState] = React.useState(wsItems)
      return (
        <InPagePurchaseOrderTab
          worksheetData={{ ...wsBase, items: itemsState }}
          selectedItemIds={new Set()}
          onApply={(updated) => {
            wsItems = updated
            setItemsState(updated)
          }}
          onBack={() => {}}
          showToast={() => {}}
        />
      )
    }

    const { unmount } = render(<Wrapper />)

    // 1. Separate supplier tabs are visible
    const suppATab = screen.getByRole('button', { name: /AL GHAITH OILFIELD SUPPLIES/i })
    const suppBTab = screen.getByRole('button', { name: /PETROTECH ENGINEERING SERVICES/i })
    expect(suppATab).toBeInTheDocument()
    expect(suppBTab).toBeInTheDocument()

    // 2. Open Supplier A tab -> enter received Heat Number & Certificate Number
    fireEvent.click(suppATab)
    fireEvent.change(screen.getByLabelText('Receipt Heat Number for item 1'), { target: { value: 'HT-REC-01' } })
    fireEvent.change(screen.getByLabelText('Receipt Certificate Number for item 1'), { target: { value: 'CERT-REC-01.pdf' } })
    expect(wsItems.find(x => x.id === 'SUPP-A-1')?.heat_number).toBe('HT-REC-01')
    expect(wsItems.find(x => x.id === 'SUPP-A-1')?.certificate_number).toBe('CERT-REC-01.pdf')

    // 3. Reject item with discrepancy reason -> disappears from Supplier A active list and appears under Rejected Items tab
    fireEvent.click(screen.getByRole('button', { name: 'Reject item 1' }))
    expect(screen.getByRole('dialog', { name: 'Reject Material Modal' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Rejection Reason'), { target: { value: 'Certificate heat mismatch on inspection' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Reject' }))

    // Switch to Rejected Items tab -> pending rejected item appears with original PO & reason
    fireEvent.click(screen.getByRole('button', { name: /Rejected Items/i }))
    expect(screen.getByText(/Certificate heat mismatch on inspection/i)).toBeInTheDocument()
    expect(screen.getByText('LP-PO-2611-01')).toBeInTheDocument()

    // 4. Add rejected item to Existing PO (PETROTECH ENGINEERING SERVICES -> LP-PO-2611-02)
    fireEvent.click(screen.getByLabelText('Select rejected item 1'))
    fireEvent.change(screen.getByLabelText('Existing Purchase Order Dropdown'), { target: { value: 'LP-PO-2611-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to Existing Purchase Order' }))

    // Rejected item is removed from pending list and retained in traceability log with Original PO -> Reason -> Replacement PO
    expect(screen.getByText(/No rejected items pending reorder/i)).toBeInTheDocument()
    expect(screen.getByText(/Rejected Material Traceability/i)).toBeInTheDocument()
    expect(screen.getAllByText('LP-PO-2611-01').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('LP-PO-2611-02').length).toBeGreaterThanOrEqual(1)

    unmount()
  })

  it('supports Create CIPL tab, multi-package split, persistent item weights, Certificate Excel weight import, and individual Packing Labels with PDF/Excel output', async () => {
    mockBackendFetch()
    db.resetToDefault()
    localStorage.clear()
    setAuthToken('mock-token-admin')

    const wsItems: any[] = [
      {
        id: 'CIPL-1',
        sl_no: 1,
        client_po_item_no: '10',
        description: 'ELBOW 8", 90DEG, SCH.40, A234 WPB',
        qty: 10,
        uom: 'PCS',
        heat_number: '68C00M104',
        certificate_number: 'MTC-68C00M104.pdf',
        make: 'BENKAN',
        remarks: '',
        supplier_name: 'STOCK',
        supplier_po_number: '',
        hs_code: '73079300',
        country_of_origin: 'Thailand',
        unit_price: 55,
        total_price: 550,
        unit_weight_kg: 0,
        total_net_weight_kg: 0,
        total_gross_weight_kg: 0,
        package_type: 'Pallet',
        package_no: '1',
      },
    ]

    const Wrapper = () => {
      const [itemsState, setItemsState] = React.useState(wsItems)
      return (
        <InPageCIPLTab
          worksheetData={{
            id: 'WS-CIPL-10',
            client: 'ADNOC Offshore',
            po_number: 'PO-CIPL-100',
            msg_ref: 'MSG-26-100',
            order_date: '2026-11-27',
            currency: 'AED',
            items: itemsState,
            saved_at: '2026-11-27',
          }}
          onApply={(updated) => setItemsState(updated)}
          onBack={() => {}}
          showToast={() => {}}
        />
      )
    }

    const { unmount } = render(<Wrapper />)

    // 1. Enter unit weight manually (12.5 kg) -> net weight updates to 125 kg and saves in DB
    fireEvent.change(screen.getByLabelText('Unit weight kg for item 1'), { target: { value: '12.5' } })
    expect(screen.getByLabelText('Net weight kg for item 1')).toHaveValue(125)
    expect(db.getRecordedItemWeight('ELBOW 8", 90DEG, SCH.40, A234 WPB')?.unit_weight_kg).toBe(12.5)

    // 2. Add Package #2 and split Item 1 across Package #1 and Package #2
    fireEvent.click(screen.getByRole('button', { name: 'Split item 1 across packages' }))
    expect(screen.getByLabelText('Package 1 Type')).toBeInTheDocument()
    expect(screen.getByLabelText('Package 2 Type')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Package 2 Dimensions'), { target: { value: '150 X 100 X 90 CM' } })

    // 3. Switch to Preview & Edit CIPL template view
    fireEvent.click(screen.getByRole('button', { name: /2\. Preview & Edit CIPL/i }))
    expect(screen.getByLabelText('CIPL Template Selector')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('CIPL Template Selector'), { target: { value: 'oilfield_detailed' } })
    expect(screen.getAllByText(/Oilfield Detailed/i).length).toBeGreaterThanOrEqual(2)

    // 4. Switch to Packing Labels view -> individual labels rendered for Package #1 & Package #2
    fireEvent.click(screen.getByRole('button', { name: /3\. Create Packing Labels/i }))
    expect(screen.getByText(/PACKAGE #1 OF 2/i)).toBeInTheDocument()
    expect(screen.getByText(/PACKAGE #2 OF 2/i)).toBeInTheDocument()

    // 5. Verify PDF byte generation succeeds for both CIPL and Packing Labels
    const ciplPdf = await generateCIPLPdfBytes({
      client: 'ADNOC Offshore',
      consigneeAddress: 'Abu Dhabi',
      poNumber: 'PO-CIPL-100',
      msgRef: 'MSG-26-100',
      invoiceNumber: 'MSG-26-100-CI',
      invoiceDate: '2026-11-27',
      currency: 'AED',
      template: 'oilfield_detailed',
      labelTemplate: 'warehouse_standard',
      items: [
        { ...wsItems[0], qty: '5 OF 10', unit_weight_kg: 12.5, total_net_weight_kg: 62.5, package_no: '1' },
        { ...wsItems[0], id: 'CIPL-2', qty: '5 OF 10', unit_weight_kg: 12.5, total_net_weight_kg: 62.5, package_no: '2' },
      ],
      packages: [
        { id: 'P1', packageNo: '1', packageType: 'PALLET', dimensions: '120 X 80 X 100 CM', tareWeightKg: 15 },
        { id: 'P2', packageNo: '2', packageType: 'WOODEN BOX', dimensions: '150 X 100 X 90 CM', tareWeightKg: 20 },
      ],
    })
    expect(ciplPdf.slice(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]))

    const labelsPdf = await generatePackingLabelsPdfBytes({
      client: 'ADNOC Offshore',
      consigneeAddress: 'Abu Dhabi',
      poNumber: 'PO-CIPL-100',
      msgRef: 'MSG-26-100',
      invoiceNumber: 'MSG-26-100-CI',
      invoiceDate: '2026-11-27',
      currency: 'AED',
      template: 'standard',
      labelTemplate: 'warehouse_standard',
      items: [
        { ...wsItems[0], qty: '5 OF 10', unit_weight_kg: 12.5, total_net_weight_kg: 62.5, package_no: '1' },
        { ...wsItems[0], id: 'CIPL-2', qty: '5 OF 10', unit_weight_kg: 12.5, total_net_weight_kg: 62.5, package_no: '2' },
      ],
      packages: [
        { id: 'P1', packageNo: '1', packageType: 'PALLET', dimensions: '120 X 80 X 100 CM', tareWeightKg: 15 },
        { id: 'P2', packageNo: '2', packageType: 'WOODEN BOX', dimensions: '150 X 100 X 90 CM', tareWeightKg: 20 },
      ],
    })
    expect(labelsPdf.slice(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]))

    unmount()

    // 6. Future instance for the same item auto-retrieves the recorded 12.5 kg weight from DB
    const secondRender = render(
      <InPageCIPLTab
        worksheetData={{
          id: 'WS-CIPL-NEXT',
          client: 'Future Client',
          po_number: 'PO-FUTURE',
          msg_ref: 'MSG-26-999',
          order_date: '2026-12-01',
          currency: 'AED',
          items: [{ ...wsItems[0], id: 'FUTURE-1', unit_weight_kg: 0, total_net_weight_kg: 0 }],
          saved_at: '2026-12-01',
        }}
        onApply={() => {}}
        onBack={() => {}}
        showToast={() => {}}
      />
    )
    expect(screen.getByLabelText('Unit weight kg for item 1')).toHaveValue(12.5)
    expect(screen.getByText('From DB')).toBeInTheDocument()
    secondRender.unmount()
  })

  it('awaits full backend bootstrap before mounting authenticated workspace on login and coalesces concurrent refreshes', async () => {
    clearAuthToken()
    localStorage.clear()
    await db.resetToDefault()

    const bootstrapOrder = {
      id: 'ORD-BOOT-FIRST',
      so_number: 'SO-2026-FIRST',
      po_number: 'FAB-2026-017',
      customer_id: 'CUST-FAB',
      customer_name: 'FAB EQUIPMENT SUPPLY FZE',
      order_date: '2026-11-27',
      required_delivery_date: '2026-12-15',
      status: 'Pending Storekeeper Approval',
      created_by: 'admin@msgoilfield.ae',
      allocations: [],
      items: [
        {
          id: 'SOI-BOOT-1',
          sales_order_id: 'ORD-BOOT-FIRST',
          item_id: 'ITEM-001',
          item_code: 'CAP-10-40',
          item_description: 'CAP 10", SCH.40, BW, SMLS',
          required_qty: 2,
          allocated_qty: 0,
          dispatched_qty: 0,
          uom: 'PCS',
          line_status: 'Pending',
        },
      ],
      created_at: '2026-11-27',
      updated_at: '2026-11-27',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/login')) {
        return new Response(
          JSON.stringify({ success: true, token: 'jwt-fresh-login', user: ADMIN_USER }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('/api/permissions')) {
        return new Response(
          JSON.stringify({ success: true, customPermissions: {}, granularPermissions: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('/api/bootstrap')) {
        await new Promise(r => setTimeout(r, 30))
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              config: db.getSystemConfig(),
              suppliers: [],
              customers: [],
              items: [],
              lots: [],
              balances: [],
              orders: [bootstrapOrder],
              mtcs: [],
              localPurchases: [],
              movements: [],
              approvals: [],
              dispatches: [],
              returns: [],
              adjustments: [],
              importJobs: [],
              users: [ADMIN_USER],
              audits: [],
              sourcingDrafts: [],
              locDrafts: [],
              storedFiles: [],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    })

    // 1. Concurrent refreshFromBackend calls coalesce cleanly onto the same promise
    setAuthToken('jwt-fresh-login')
    const [r1, r2] = await Promise.all([db.refreshFromBackend(), db.refreshFromBackend()])
    expect(r1).toBe(true)
    expect(r2).toBe(true)
    expect(db.getOrders().some(o => o.so_number === 'SO-2026-FIRST')).toBe(true)

    // 2. Logging in through UI loads fresh orders BEFORE rendering workspace (no page switch needed)
    clearAuthToken()
    await db.resetToDefault()
    const { unmount } = render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/admin@msgoilfield\.ae/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/admin@msgoilfield\.ae/i), {
      target: { value: 'admin@msgoilfield.ae' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Enter password/i), {
      target: { value: 'Admin123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }))

    await waitFor(() => {
      expect(screen.getByText(/SO-2026-FIRST/i)).toBeInTheDocument()
    })

    unmount()
  })
})
