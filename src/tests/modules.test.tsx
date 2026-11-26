import '@testing-library/jest-dom/vitest'
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { setAuthToken, clearAuthToken } from '../services/api'
import { db } from '../services/db'

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
})
