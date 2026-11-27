import React, { useState, useEffect, useRef } from 'react'
import {
  FileSpreadsheet,
  FileDown,
  Upload,
  Plus,
  Trash2,
  Copy,
  Split,
  Sparkles,
  Save,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  Boxes,
  Truck,
  DollarSign,
  Globe,
  Archive,
  Tag,
  Eye,
  Download,
  Wrench,
  ShoppingCart,
  LayoutGrid,
  UploadCloud,
  Maximize2,
  Minimize2,
  EyeOff,
  Columns3,
  ArrowLeftRight,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  RotateCcw,
  Check,
} from 'lucide-react'
import { ExcelDeliverablesPreviewModal, SourcingPreviewTab } from './ExcelDeliverablesPreviewModal'
import { LocalPurchaseAllocationModal } from './LocalPurchaseAllocationModal'
import { InPagePurchaseOrderTab } from './InPagePurchaseOrderTab'
import { InPageCertificateTab } from './InPageCertificateTab'
import { InPageCIPLTab } from './InPageCIPLTab'
import { HeatNumberCombobox } from './HeatNumberCombobox'
import {
  SourcingWorksheetData,
  SourcingLineItem,
  generateClientSummaryExcel,
  generateStoresSummaryExcel,
  generateCIPLLogisticExcel,
  generateSupplierPOZip,
  autoDetectMake,
  autoDetectCountryOfOrigin,
  autoDetectHSCode,
  estimateUnitWeight,
  isMeaningfulItem,
  saveSourcingDraft,
  getSourcingDrafts,
  deleteSourcingDraft,
  generateStickerSummaryExcel,
  extractQtyNumber,
  extractTotalQtyNumber,
  isItemAvailableInStock,
} from '../../services/sourcingEngine'
import {
  generateStickersPdf,
  downloadStickerPdfBlob,
  StickerItem,
  parseLocFromRemarks,
} from '../../services/stickerEngine'
import { parseCustomerSOPDF } from '../../services/pdfEngine'
import {
  registerUploadedCertificate,
  detectHeatNumberFromFilename,
  getVaultManifest,
  hasSelectedHeatNumber,
  hasAvailableMtcForItem,
  ManifestCertificate,
} from '../../services/zipExtractor'
import { db } from '../../services/db'
import { SalesOrder } from '../../types'

export type PortalActiveTab = 'worksheet' | 'purchase_order' | 'create_certificate' | 'create_cipl'

export type WorksheetColumnKey =
  | 'po_item'
  | 'description'
  | 'qty'
  | 'packaging'
  | 'heat_number'
  | 'certificate_number'
  | 'make'
  | 'supplier_name'
  | 'supplier_po_number'
  | 'hs_code'
  | 'coo'
  | 'price'
  | 'actions'

interface WorksheetColumnDef {
  key: WorksheetColumnKey
  label: string
  subLabel?: string
  thClass: string
}

const WORKSHEET_COLUMN_DEFS: WorksheetColumnDef[] = [
  { key: 'po_item', label: 'PO Item', thClass: 'w-20' },
  { key: 'description', label: 'Description & Machining Spec', thClass: 'min-w-[260px]' },
  { key: 'qty', label: 'Qty / UOM', thClass: 'w-24 text-center' },
  { key: 'packaging', label: 'Packaging (CIPL)', subLabel: 'Pallet / Box / #', thClass: 'w-32 text-center' },
  { key: 'heat_number', label: 'Heat Number', thClass: 'w-32' },
  { key: 'certificate_number', label: 'MTC Cert Ref', thClass: 'w-32' },
  { key: 'make', label: 'MAKE / Mfr', thClass: 'w-36' },
  { key: 'supplier_name', label: 'Supplier Name', thClass: 'w-36' },
  { key: 'supplier_po_number', label: 'Supplier PO #', subLabel: 'Stores / CIPL', thClass: 'w-36' },
  { key: 'hs_code', label: 'HS Tariff', thClass: 'w-28' },
  { key: 'coo', label: 'COO', thClass: 'w-24' },
  { key: 'price', label: 'Price', thClass: 'w-24 text-right' },
  { key: 'actions', label: 'Actions', thClass: 'w-20 text-center' },
]

const DEFAULT_COLUMN_ORDER: WorksheetColumnKey[] = WORKSHEET_COLUMN_DEFS.map(c => c.key)
const COLUMN_DEF_MAP = new Map(WORKSHEET_COLUMN_DEFS.map(c => [c.key, c]))

export const TechnicalSourcingPortal: React.FC = () => {
  // Database orders subscription
  const [orders, setOrders] = useState<SalesOrder[]>(() => db.getOrders())
  useEffect(() => {
    const unsub = db.subscribe(() => {
      setOrders([...db.getOrders()])
    })
    return () => unsub()
  }, [])

  // Deduplicate orders by id / so_number
  const uniqueOrders = Array.from(new Map(orders.map(o => [o.id || o.so_number, o])).values())

  // In-Page Navigation State
  const [activePortalTab, setActivePortalTab] = useState<PortalActiveTab>('worksheet')
  const [activeCertItemId, setActiveCertItemId] = useState<string>('')
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())

  // Worksheet State
  const [clientName, setClientName] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [msgRef, setMsgRef] = useState('')
  const [currency, setCurrency] = useState<'AED' | 'USD'>('AED')
  const [portOfLoading, setPortOfLoading] = useState('')
  const [portOfDischarge, setPortOfDischarge] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [filterMachinedOnly, setFilterMachinedOnly] = useState(false)

  // Items State
  const [items, setItems] = useState<SourcingLineItem[]>([])

  // UI State
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isLocalPurchaseModalOpen, setIsLocalPurchaseModalOpen] = useState(false)
  const [isSheetFullscreen, setIsSheetFullscreen] = useState(false)
  const [previewTab, setPreviewTab] = useState<SourcingPreviewTab>('client')

  // Workspace Customization State (collapse panels, hide/reorder columns, flip toolbar L <-> R)
  const [showMetadataPanel, setShowMetadataPanel] = useState<boolean>(() => {
    try { return localStorage.getItem('msg_sourcing_show_metadata') !== 'false' } catch { return true }
  })
  const [showExportsPanel, setShowExportsPanel] = useState<boolean>(() => {
    try { return localStorage.getItem('msg_sourcing_show_exports') !== 'false' } catch { return true }
  })
  const [toolbarFlipSide, setToolbarFlipSide] = useState<boolean>(() => {
    try { return localStorage.getItem('msg_sourcing_toolbar_flip') === 'true' } catch { return false }
  })
  const [hiddenColumns, setHiddenColumns] = useState<WorksheetColumnKey[]>(() => {
    try {
      const raw = localStorage.getItem('msg_sourcing_hidden_cols')
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter(k => COLUMN_DEF_MAP.has(k)) : []
    } catch {
      return []
    }
  })
  const [columnOrder, setColumnOrder] = useState<WorksheetColumnKey[]>(() => {
    try {
      const raw = localStorage.getItem('msg_sourcing_col_order')
      const parsed = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((k): k is WorksheetColumnKey => COLUMN_DEF_MAP.has(k))
        const missing = DEFAULT_COLUMN_ORDER.filter(k => !valid.includes(k))
        return [...valid, ...missing]
      }
    } catch {
      // ignore
    }
    return DEFAULT_COLUMN_ORDER
  })
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { localStorage.setItem('msg_sourcing_show_metadata', String(showMetadataPanel)) } catch {}
  }, [showMetadataPanel])
  useEffect(() => {
    try { localStorage.setItem('msg_sourcing_show_exports', String(showExportsPanel)) } catch {}
  }, [showExportsPanel])
  useEffect(() => {
    try { localStorage.setItem('msg_sourcing_toolbar_flip', String(toolbarFlipSide)) } catch {}
  }, [toolbarFlipSide])
  useEffect(() => {
    try { localStorage.setItem('msg_sourcing_hidden_cols', JSON.stringify(hiddenColumns)) } catch {}
  }, [hiddenColumns])
  useEffect(() => {
    try { localStorage.setItem('msg_sourcing_col_order', JSON.stringify(columnOrder)) } catch {}
  }, [columnOrder])

  useEffect(() => {
    if (!isColumnsMenuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setIsColumnsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [isColumnsMenuOpen])

  const toggleColumnVisibility = (key: WorksheetColumnKey) => {
    setHiddenColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]))
  }

  const moveColumn = (key: WorksheetColumnKey, direction: -1 | 1) => {
    setColumnOrder(prev => {
      const idx = prev.indexOf(key)
      const nextIdx = idx + direction
      if (idx === -1 || nextIdx < 0 || nextIdx >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[nextIdx]] = [copy[nextIdx], copy[idx]]
      return copy
    })
  }

  const resetWorkspaceLayout = () => {
    setShowMetadataPanel(true)
    setShowExportsPanel(true)
    setToolbarFlipSide(false)
    setHiddenColumns([])
    setColumnOrder(DEFAULT_COLUMN_ORDER)
  }

  const visibleColumns = columnOrder.filter(k => !hiddenColumns.includes(k))

  useEffect(() => {
    if (!isSheetFullscreen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSheetFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isSheetFullscreen])
  const [draftsList, setDraftsList] = useState<SourcingWorksheetData[]>([])
  const [vaultManifest, setVaultManifest] = useState<ManifestCertificate[]>([])
  useEffect(() => {
    getVaultManifest()
      .then(list => {
        if (Array.isArray(list)) setVaultManifest(list)
      })
      .catch(() => {})
  }, [])
  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => {
    const saved = db.getActiveOrderId() || localStorage.getItem('msg_sourcing_active_so_id')
    return (saved && uniqueOrders.some(o => o.id === saved)) ? saved : (uniqueOrders[0]?.id || '')
  })

  const handleOpenPreview = (tab: SourcingPreviewTab) => {
    setPreviewTab(tab)
    setIsPreviewModalOpen(true)
  }

  useEffect(() => {
    setDraftsList(getSourcingDrafts())
    const initialOrders = db.getOrders()
    if (initialOrders.length > 0) {
      const saved = db.getActiveOrderId() || localStorage.getItem('msg_sourcing_active_so_id')
      const savedSoNumber = localStorage.getItem('msg_sourcing_active_so_number')
      const matched =
        (saved && initialOrders.find(o => o.id === saved)) ||
        (savedSoNumber && initialOrders.find(o => o.so_number === savedSoNumber))
      if (matched) {
        handleLoadFromOrder(matched.id)
      } else {
        // Fallback visually without overwriting an in-flight saved active SO preference
        handleLoadFromOrder(initialOrders[0].id, true)
      }
    }
  }, [])

  // Keep worksheet synced when orders finish loading asynchronously or when active SO changes
  useEffect(() => {
    if (orders.length === 0) return
    const saved = db.getActiveOrderId() || localStorage.getItem('msg_sourcing_active_so_id')
    const savedSoNumber = localStorage.getItem('msg_sourcing_active_so_number')
    const target =
      (saved && orders.find(o => o.id === saved)) ||
      (savedSoNumber && orders.find(o => o.so_number === savedSoNumber)) ||
      (poNumber && orders.find(o => o.po_number === poNumber)) ||
      (msgRef && orders.find(o => o.so_number === msgRef || (o as any).msg_ref === msgRef))

    if (target) {
      if (target.id !== selectedOrderId || items.length === 0) {
        if (items.length === 0 || (selectedOrderId && selectedOrderId !== target.id)) {
          handleLoadFromOrder(target.id)
        } else {
          // Bind matching dropdown id without overwriting an already-loaded worksheet
          setSelectedOrderId(target.id)
        }
      }
    } else if (!selectedOrderId || !orders.some(o => o.id === selectedOrderId)) {
      if (items.length === 0) {
        handleLoadFromOrder(orders[0].id, true)
      }
    }
  }, [orders])

  // Checkbox helpers
  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItemIds(new Set(items.map(it => it.id)))
    } else {
      setSelectedItemIds(new Set())
    }
  }

  const handleConvertToPO = () => {
    if (selectedItemIds.size === 0 && items.length > 0) {
      setSelectedItemIds(new Set(items.filter(it => !isItemInStock(it)).map(it => it.id)))
    }
    setActivePortalTab('purchase_order')
  }

  const handleOpenCreateCertificate = (targetId?: string) => {
    const idToCert = targetId || Array.from(selectedItemIds)[0] || items[0]?.id || ''
    setActiveCertItemId(idToCert)
    setActivePortalTab('create_certificate')
  }

  // Auto-clear notice after 4 seconds
  useEffect(() => {
    if (statusNotice) {
      const timer = setTimeout(() => setStatusNotice(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [statusNotice])

  // Current Worksheet Object
  const currentWorksheetData: SourcingWorksheetData = {
    client: clientName,
    po_number: poNumber,
    msg_ref: msgRef,
    currency,
    port_of_loading: portOfLoading,
    port_of_discharge: portOfDischarge,
    payment_terms: paymentTerms,
    items,
    filter_machined_only: filterMachinedOnly,
  }

  const storedFiles = db.getStoredFiles()
  const dbMtcs = db.getMTCs()
  const masterStock = db.getMasterStockView()
  const hasItemMtc = (it?: SourcingLineItem | null) =>
    hasAvailableMtcForItem(it, vaultManifest, storedFiles, dbMtcs)
  const isItemInStock = (it?: SourcingLineItem | null) =>
    Boolean(it && isItemAvailableInStock(it, masterStock))
  const availableMtcCount = items.filter(it => hasItemMtc(it)).length
  const selectedMtcCount = items.filter(it => selectedItemIds.has(it.id) && hasItemMtc(it)).length
  const nonStockCount = items.filter(it => !isItemInStock(it)).length
  const selectedNonStockCount = items.filter(it => selectedItemIds.has(it.id) && !isItemInStock(it)).length

  // Handle PDF Upload & Auto-Populate
  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const parsed = await parseCustomerSOPDF(file)
      if (parsed.customerName) setClientName(parsed.customerName)
      if (parsed.poNumber) setPoNumber(parsed.poNumber)
      setMsgRef(`MSG-${new Date().toISOString().substring(2, 4)}${new Date().getMonth() + 1}-2026`)

      const newItems: SourcingLineItem[] = parsed.items.map((it, idx) => {
        const desc = it.itemDescription || `${it.itemCode} Oilfield Material`
        const detectedMake = (it as any).make || ''
        const detectedCOO = (it as any).countryOfOrigin || (it as any).country_of_origin || ''
        const detectedHS = autoDetectHSCode(desc)
        const unitWt = estimateUnitWeight(desc, 'PCS')
        const lineNet = Math.round(it.requiredQty * unitWt * 100) / 100
        const lineGross = Math.round(lineNet * 1.15 * 100) / 100
        const unitP = Number(it.rate || 0)
        const isMachined = isMeaningfulItem({ description: desc })

        const pos = it.position || idx + 1
        return {
          id: `ITM-PDF-${pos}-${Date.now()}`,
          sl_no: pos,
          client_po_item_no: it.clientPoItemNo || `${pos}`,
          description: desc,
          qty: it.requiredQty || 1,
          uom: 'PCS',
          heat_number: it.heatNumber || '',
          certificate_number: it.heatNumber ? `MTC-${it.heatNumber}.pdf` : '',
          make: detectedMake,
          remarks: isMachined ? 'Machined/Fabricated item' : (it.location ? `Loc: ${it.location}` : ''),
          supplier_name: (it as any).supplierName || (it as any).supplier_name || '',
          supplier_po_number: (it as any).supplierPoNumber || (it as any).supplier_po_number || '',
          hs_code: detectedHS,
          country_of_origin: detectedCOO,
          unit_price: unitP,
          total_price: (it.requiredQty || 1) * unitP,
          unit_weight_kg: unitWt,
          total_net_weight_kg: lineNet,
          total_gross_weight_kg: lineGross,
          package_no: `PKG # ${Math.floor(idx / 3) + 1}`,
          is_machined: isMachined,
        }
      })

      setItems(newItems)

      // Automatically register the uploaded PDF as a real-time Sales Order in db & Supabase Cloud
      const generatedSoNum = parsed.soNumber || `SO-2026-${db.getOrders().length + 116}`
      const createdRes = db.createSalesOrder({
        customer_name: parsed.customerName || 'Valued Client',
        po_number: parsed.poNumber || `PO-${Date.now().toString().slice(-4)}`,
        so_number: generatedSoNum,
        required_delivery_date: new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
        items: newItems.map(it => ({
          item_code: (it as any).item_code || `ITEM-${it.sl_no}`,
          item_description: it.description,
          heat_number: it.heat_number,
          required_qty: extractQtyNumber(it.qty),
          client_po_item_no: it.client_po_item_no,
          position: it.sl_no,
          unit_price: it.unit_price,
          uom: it.uom,
          make: it.make,
          country_of_origin: it.country_of_origin,
          hs_code: it.hs_code,
          package_no: it.package_no,
          remarks: it.remarks,
          supplier_name: it.supplier_name,
          supplier_po_number: it.supplier_po_number,
        })),
        po_document_name: file.name,
        userEmail: 'sales@msgoilfield.ae'
      })

      if (createdRes.success && createdRes.order) {
        setSelectedOrderId(createdRes.order.id)
        db.setActiveOrderId(createdRes.order.id)
        localStorage.setItem('msg_sourcing_active_so_id', createdRes.order.id)

        // Map order's actual line IDs onto items so future updates target exact items
        const mappedItems: SourcingLineItem[] = newItems.map((it, idx) => {
          const matchedOrderItem = createdRes.order!.items[idx]
          return {
            ...it,
            id: matchedOrderItem?.id || it.id
          }
        })
        setItems(mappedItems)
        setStatusNotice(`Extracted ${newItems.length} lines & created real-time Sales Order ${createdRes.order.so_number} saved to local DB & Supabase Cloud!`)
      } else {
        setStatusNotice(`Extracted ${newItems.length} line items from ${file.name} successfully!`)
      }
    } catch (err: any) {
      alert('Error parsing PDF: ' + err.message)
    } finally {
      setIsUploading(false)
    }
  }

  // Load from existing Sales Order
  const handleLoadFromOrder = (orderId: string, skipActiveSync: boolean = false) => {
    const allOrders = db.getOrders()
    const order = allOrders.find(o => o.id === orderId) || orders.find(o => o.id === orderId) || uniqueOrders.find(o => o.id === orderId)
    if (!order) return

    setSelectedOrderId(orderId)
    if (!skipActiveSync) {
      db.setActiveOrderId(orderId)
      localStorage.setItem('msg_sourcing_active_so_id', orderId)
      if (order.so_number) {
        localStorage.setItem('msg_sourcing_active_so_number', order.so_number)
      }
    }
    setClientName(order.customer_name || '')
    setPoNumber(order.po_number || '')
    setMsgRef(order.so_number || order.msg_ref || '')
    setPortOfLoading((order as any).port_of_loading || '')
    setPortOfDischarge((order as any).port_of_discharge || '')
    setPaymentTerms((order as any).payment_terms || '')

    const newItems: SourcingLineItem[] = (order.items || []).map((it, idx) => {
      const desc = it.item_description || `Item ${it.item_code}`
      const detectedMake = it.make || ''
      const detectedCOO = (it as any).country_of_origin || (it as any).countryOfOrigin || ''
      const detectedHS = it.hs_code || autoDetectHSCode(desc, it.item_code)
      const recordedWt = db.getRecordedItemWeight(desc, it.item_code, it.heat_number)
      const existingWt = Number((it as any).unit_weight_kg || 0)
      const unitWt = existingWt > 0 ? existingWt : (recordedWt?.unit_weight_kg || estimateUnitWeight(desc, it.uom))
      const lineNet = Number((it as any).total_net_weight_kg || 0) || Math.round(it.required_qty * unitWt * 100) / 100
      const lineGross = Number((it as any).total_gross_weight_kg || 0) || Math.round(lineNet * 1.15 * 100) / 100
      const isMachined = isMeaningfulItem({ description: desc })
      const orderUnitPrice = Number((it as any).unit_price ?? (it as any).rate ?? (it as any).price ?? 0)

      return {
        id: it.id || `ITM-ORD-${idx + 1}`,
        sl_no: (it as any).position || idx + 1,
        client_po_item_no: (it as any).client_po_item_no || `${idx + 1}`,
        description: desc,
        qty: it.required_qty,
        uom: it.uom || 'PCS',
        heat_number: it.heat_number || '',
        certificate_number: it.certificate_number || (it.heat_number ? `MTC-${it.heat_number}.pdf` : ''),
        make: detectedMake,
        remarks: it.remarks || (it.location ? `Yard: ${it.location}` : ''),
        supplier_name: (it as any).supplier_name || '',
        supplier_po_number: (it as any).supplier_po_number || '',
        hs_code: detectedHS,
        country_of_origin: detectedCOO,
        unit_price: orderUnitPrice,
        total_price: it.required_qty * orderUnitPrice,
        unit_weight_kg: unitWt,
        total_net_weight_kg: lineNet,
        total_gross_weight_kg: lineGross,
        package_no: (it as any).package_no || `PKG # ${Math.floor(idx / 3) + 1}`,
        is_machined: isMachined,
        l_code: (it as any).l_code || '',
        is_local: (it as any).is_local,
        purchase_type: (it as any).purchase_type,
        supplier_unit_price: (it as any).supplier_unit_price,
        supplier_total_price: (it as any).supplier_total_price,
        po_ordered_qty: (it as any).po_ordered_qty,
        po_created: (it as any).po_created,
        is_rejected: (it as any).is_rejected,
        rejection_reason: (it as any).rejection_reason,
        rejected_at: (it as any).rejected_at,
        original_po_number: (it as any).original_po_number,
        original_supplier_name: (it as any).original_supplier_name,
        replacement_po_number: (it as any).replacement_po_number,
        replacement_supplier_name: (it as any).replacement_supplier_name,
        reordered: (it as any).reordered,
      }
    })

    setItems(newItems)
    setStatusNotice(`Loaded ${newItems.length} line items from order ${order.so_number}!`)
  }

  const syncItemsToOrder = (updatedList: SourcingLineItem[]) => {
    if (!selectedOrderId) return
    try {
      db.updateSalesOrder({
        id: selectedOrderId,
        customer_name: clientName,
        po_number: poNumber,
        so_number: msgRef,
        items: updatedList.map(it => ({
          id: it.id,
          position: it.sl_no,
          client_po_item_no: it.client_po_item_no,
          item_description: it.description,
          heat_number: it.heat_number,
          certificate_number: it.certificate_number,
          make: it.make,
          country_of_origin: it.country_of_origin,
          required_qty: extractQtyNumber(it.qty),
          unit_price: it.unit_price,
          unit_weight_kg: it.unit_weight_kg,
          total_net_weight_kg: it.total_net_weight_kg,
          total_gross_weight_kg: it.total_gross_weight_kg,
          uom: it.uom,
          remarks: it.remarks,
          supplier_name: it.supplier_name,
          supplier_po_number: it.supplier_po_number,
          package_type: it.package_type,
          package_no: it.package_no,
          hs_code: it.hs_code,
          split_qty: (it as any).split_qty,
          total_qty: (it as any).total_qty,
          group_id: (it as any).group_id,
          l_code: it.l_code,
          is_local: it.is_local,
          purchase_type: it.purchase_type,
          supplier_unit_price: it.supplier_unit_price,
          supplier_total_price: it.supplier_total_price,
          po_ordered_qty: it.po_ordered_qty,
          po_created: it.po_created,
          is_rejected: it.is_rejected,
          rejection_reason: it.rejection_reason,
          rejected_at: it.rejected_at,
          original_po_number: it.original_po_number,
          original_supplier_name: it.original_supplier_name,
          replacement_po_number: it.replacement_po_number,
          replacement_supplier_name: it.replacement_supplier_name,
          reordered: it.reordered,
        }))
      })
    } catch {
      // ignore
    }
  }

  const handleApplyHeatSelection = (
    id: string,
    heat: string,
    meta?: { fileName?: string; isBenkan?: boolean; make?: string; countryOfOrigin?: string }
  ) => {
    const trimmedHeat = heat.trim()
    setItems(prev => {
      const updatedList = prev.map(it => {
        if (it.id !== id) return it
        const updated: SourcingLineItem = {
          ...it,
          heat_number: heat,
          certificate_number: !trimmedHeat ? '' : (meta?.fileName || ''),
          make: meta?.make || (meta?.isBenkan ? 'BENKAN THAILAND CORP' : it.make),
          country_of_origin: meta?.countryOfOrigin || (meta?.isBenkan ? 'Thailand' : it.country_of_origin),
        }
        return updated
      })
      syncItemsToOrder(updatedList)
      return updatedList
    })
  }

  // Update item field
  const handleUpdateItem = (id: string, field: keyof SourcingLineItem, value: any) => {
    setItems(prev => {
      const updatedList = prev.map(it => {
        if (it.id !== id) return it
        const updated = { ...it, [field]: value }

        // Recalculate price & weights on quantity or price change
        const numQ = extractQtyNumber(updated.qty)
        if (field === 'qty' || field === 'unit_price') {
          updated.total_price = numQ * (updated.unit_price || 0)
        }
        if (field === 'qty' || field === 'unit_weight_kg') {
          updated.total_net_weight_kg = Math.round(numQ * (updated.unit_weight_kg || 0) * 100) / 100
          updated.total_gross_weight_kg = Math.round(updated.total_net_weight_kg * 1.15 * 100) / 100
        }
        if (field === 'description' || field === 'remarks') {
          updated.is_machined = isMeaningfulItem({ description: updated.description, remarks: updated.remarks })
        }
        if (field === 'heat_number') {
          const heatVal = String(value || '').trim()
          if (!heatVal) {
            updated.certificate_number = ''
          } else {
            const combined = `${updated.description || ''} ${updated.remarks || ''}`
            // Auto-fill Certificate Number if empty
            if (!updated.certificate_number) {
              const certMatch = combined.match(/\b(?:CERT|CERTIFICATE|MTC)\s*(?:NUMBER|NO|#)?\s*[:.-]?\s*([A-Za-z0-9_\-\.\/]+)/i)
              if (certMatch && certMatch[1] && !['NO', 'NUMBER', 'N/A', '-', ''].includes(certMatch[1].toUpperCase())) {
                updated.certificate_number = certMatch[1].trim()
              } else {
                updated.certificate_number = `MTC-${heatVal}`
              }
            }
            // Auto-fill Location from description if present
            const locMatch = combined.match(/\b(?:LN|LOC|LOCATION)\s*[:.-]?\s*([A-Za-z0-9_\-]+)/i)
            if (locMatch && locMatch[1]) {
              const locCode = locMatch[1].trim().toUpperCase()
              const currRem = (updated.remarks || '').trim()
              if (!currRem.toUpperCase().includes(locCode)) {
                updated.remarks = currRem ? `${currRem}; LN: ${locCode}` : `LN: ${locCode}`
              }
            }
          }
        }
        return updated
      })

      syncItemsToOrder(updatedList)
      return updatedList
    })
  }

  // Split item (Multi-heat / Partial Split with X OF Y notation)
  const handleSplitItem = (idx: number) => {
    const parent = items[idx]
    if (!parent) return

    const rawQty = String(parent.qty || '1').trim()
    const currentBatchQty = extractQtyNumber(rawQty)
    const totalQty = (parent as any).total_qty || extractTotalQtyNumber(rawQty) || currentBatchQty

    if (currentBatchQty <= 1 && totalQty <= 1) {
      alert(`Item #${parent.client_po_item_no || parent.sl_no} has total quantity of ${totalQty} ${parent.uom}. Cannot split 1 pc into multiple integer units.`)
      return
    }
    if (currentBatchQty <= 1) {
      alert(`This batch already has a quantity of 1 ${parent.uom}. Cannot split further.`)
      return
    }

    let split1 = 1
    let split2 = 1

    if (totalQty === 2 && currentBatchQty === 2) {
      // Direct clean split 1 OF 2 and 1 OF 2 without prompt
      split1 = 1
      split2 = 1
    } else {
      const defaultVal = Math.floor(currentBatchQty / 2) || 1
      const inputVal = prompt(
        `Split Item #${parent.client_po_item_no || parent.sl_no} (${currentBatchQty} ${parent.uom} available in this batch of ${totalQty} total).\n\nEnter Qty for 1st batch (e.g. ${defaultVal} for "${defaultVal} OF ${totalQty}"):`,
        String(defaultVal)
      )
      if (inputVal === null) return // Cancelled
      split1 = parseFloat(inputVal)
      if (isNaN(split1) || split1 <= 0 || split1 >= currentBatchQty) {
        alert(`Please enter a valid partial quantity between 1 and ${currentBatchQty - 1}`)
        return
      }
      split2 = currentBatchQty - split1
    }

    const fmtTotal = Number.isInteger(totalQty) ? totalQty : Math.round(totalQty * 100) / 100
    const fmt1 = Number.isInteger(split1) ? split1 : Math.round(split1 * 100) / 100
    const fmt2 = Number.isInteger(split2) ? split2 : Math.round(split2 * 100) / 100

    const groupId = (parent as any).group_id || `grp-${parent.client_po_item_no || parent.sl_no}`

    const updatedParent: SourcingLineItem = {
      ...parent,
      qty: `${fmt1} OF ${fmtTotal}`,
      split_qty: `${fmt1} OF ${fmtTotal}`,
      total_price: split1 * parent.unit_price,
      total_net_weight_kg: Math.round(split1 * parent.unit_weight_kg * 100) / 100,
      total_gross_weight_kg: Math.round(split1 * parent.unit_weight_kg * 1.15 * 100) / 100,
      group_id: groupId,
      total_qty: fmtTotal,
    }

    const splitChild: SourcingLineItem = {
      ...parent,
      id: `ITM-SPLIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      sl_no: parent.sl_no,
      client_po_item_no: parent.client_po_item_no,
      qty: `${fmt2} OF ${fmtTotal}`,
      split_qty: `${fmt2} OF ${fmtTotal}`,
      total_price: split2 * parent.unit_price,
      total_net_weight_kg: Math.round(split2 * parent.unit_weight_kg * 100) / 100,
      total_gross_weight_kg: Math.round(split2 * parent.unit_weight_kg * 1.15 * 100) / 100,
      heat_number: '',
      certificate_number: '',
      remarks: `${parent.remarks || ''} [Split Part 2 - Alternate Heat]`.trim(),
      group_id: groupId,
      total_qty: fmtTotal,
      parent_sl_no: parent.sl_no,
    }

    const updated = [...items]
    updated.splice(idx, 1, updatedParent, splitChild)
    setItems(updated)
    setStatusNotice(`Item #${parent.client_po_item_no || parent.sl_no} split into "${fmt1} OF ${fmtTotal}" and "${fmt2} OF ${fmtTotal}"!`)
  }

  const isRowStockApplicable = (it?: SourcingLineItem | null) => {
    if (!it) return false
    const supp = (it.supplier_name || '').trim().toUpperCase()
    if (it.is_local || it.purchase_type === 'local_purchase' || supp === 'LOCAL') return false
    const heat = (it.heat_number || '').trim().toUpperCase()
    const hasLotForHeat = Boolean(heat && masterStock.some(s => (s.heat_number || '').trim().toUpperCase() === heat))
    return supp === 'STOCK' || hasLotForHeat || isItemInStock(it)
  }

  const activeOrder = uniqueOrders.find(o => o.id === selectedOrderId) || null

  const getLineAppliedState = (it: SourcingLineItem) => {
    const qtyNeeded = extractQtyNumber(it.qty)
    const heatNorm = (it.heat_number || '').trim().toUpperCase()
    const activeAllocs = (activeOrder?.allocations || []).filter(
      a => (a.sales_order_item_id === it.id || (a as any).so_item_id === it.id) && a.allocation_status !== 'Released'
    )
    const appliedQty = activeAllocs.reduce((sum, a) => sum + Number(a.allocated_qty || 0), 0)
    const appliedHeatMatches = activeAllocs.length > 0 && activeAllocs.every(a => (a.heat_number || '').trim().toUpperCase() === heatNorm)
    const isAppliedExact = Boolean(heatNorm && appliedQty > 0 && appliedHeatMatches && Math.abs(appliedQty - qtyNeeded) < 1e-6)
    const remainingAvail = heatNorm ? db.getAvailableStockQtyForHeat(it.heat_number) : 0
    return { appliedQty, isAppliedExact, remainingAvail }
  }

  const ensureWorksheetOrderSynced = (): { orderId: string; idMap: Map<string, string> } | null => {
    const idMap = new Map<string, string>()
    const existing = selectedOrderId ? db.getOrders().find(o => o.id === selectedOrderId) : null
    if (existing) {
      db.updateSalesOrder({
        id: existing.id,
        customer_name: clientName || existing.customer_name,
        po_number: poNumber || existing.po_number,
        so_number: msgRef || existing.so_number,
        items: items.map(it => ({
          id: it.id,
          position: it.sl_no,
          client_po_item_no: it.client_po_item_no,
          item_description: it.description,
          heat_number: it.heat_number,
          certificate_number: it.certificate_number,
          make: it.make,
          country_of_origin: it.country_of_origin,
          required_qty: extractQtyNumber(it.qty),
          unit_price: it.unit_price,
          unit_weight_kg: it.unit_weight_kg,
          total_net_weight_kg: it.total_net_weight_kg,
          total_gross_weight_kg: it.total_gross_weight_kg,
          uom: it.uom,
          remarks: it.remarks,
          supplier_name: it.supplier_name,
          supplier_po_number: it.supplier_po_number,
          package_type: it.package_type,
          package_no: it.package_no,
          hs_code: it.hs_code,
          split_qty: (it as any).split_qty,
          total_qty: (it as any).total_qty,
          group_id: (it as any).group_id,
          l_code: it.l_code,
          is_local: it.is_local,
          purchase_type: it.purchase_type,
          supplier_unit_price: it.supplier_unit_price,
          supplier_total_price: it.supplier_total_price,
          po_ordered_qty: it.po_ordered_qty,
          po_created: it.po_created,
          is_rejected: it.is_rejected,
          rejection_reason: it.rejection_reason,
          rejected_at: it.rejected_at,
          original_po_number: it.original_po_number,
          original_supplier_name: it.original_supplier_name,
          replacement_po_number: it.replacement_po_number,
          replacement_supplier_name: it.replacement_supplier_name,
          reordered: it.reordered,
        }))
      })
      items.forEach(it => idMap.set(it.id, it.id))
      return { orderId: existing.id, idMap }
    }

    const newSoNum = msgRef.trim() || `SO-2026-${db.getOrders().length + 116}`
    const created = db.createSalesOrder({
      customer_name: clientName.trim() || 'Valued Client',
      po_number: poNumber.trim() || 'PO-NEW',
      so_number: newSoNum,
      required_delivery_date: new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
      items: items.map(it => ({
        item_code: (it as any).item_code || `ITEM-${it.sl_no}`,
        item_description: it.description,
        heat_number: it.heat_number,
        required_qty: extractQtyNumber(it.qty),
        client_po_item_no: it.client_po_item_no,
        position: it.sl_no,
        unit_price: it.unit_price,
        uom: it.uom,
        make: it.make,
        country_of_origin: it.country_of_origin,
        hs_code: it.hs_code,
        package_no: it.package_no,
        remarks: it.remarks,
        supplier_name: it.supplier_name,
        supplier_po_number: it.supplier_po_number,
      })),
      userEmail: 'sales@msgoilfield.ae'
    })
    if (!created.success || !created.order) {
      alert('Failed to sync order before applying stock: ' + created.message)
      return null
    }
    setSelectedOrderId(created.order.id)
    db.setActiveOrderId(created.order.id)
    localStorage.setItem('msg_sourcing_active_so_id', created.order.id)
    const mappedItems = items.map((it, idx) => {
      const canonicalId = created.order!.items[idx]?.id || it.id
      idMap.set(it.id, canonicalId)
      return { ...it, id: canonicalId }
    })
    setItems(mappedItems)
    return { orderId: created.order.id, idMap }
  }

  const runApplyStockEntries = (targetRows: SourcingLineItem[]) => {
    if (targetRows.length === 0) {
      alert('No stock items with a selected Heat Number are queued to apply.')
      return
    }
    const synced = ensureWorksheetOrderSynced()
    if (!synced) return

    const batchRes = db.applyWorksheetStockBatch(
      synced.orderId,
      targetRows.map(it => ({
        lineId: synced.idMap.get(it.id) || it.id,
        heatNumber: it.heat_number,
        qty: extractQtyNumber(it.qty)
      })),
      'sales@msgoilfield.ae'
    )

    if (batchRes.errors.length > 0) {
      alert(batchRes.errors.join('\n'))
    }
    if (batchRes.appliedCount > 0) {
      setStatusNotice(
        `Applied ${batchRes.appliedCount} stock item(s) and deducted quantities from backend inventory.`
      )
    } else if (batchRes.alreadyCount > 0 && batchRes.errors.length === 0) {
      setStatusNotice(`Selected stock item(s) are already applied (${batchRes.alreadyCount}).`)
    }
  }

  const handleApplySingleStockItem = (itemId: string) => {
    const target = items.find(it => it.id === itemId)
    if (!target) return
    runApplyStockEntries([target])
  }

  const handleApplyBulkStockItems = () => {
    const checkedStock = items.filter(it => selectedItemIds.has(it.id) && isRowStockApplicable(it) && hasSelectedHeatNumber(it.heat_number))
    const fallbackStock = items.filter(it => isRowStockApplicable(it) && hasSelectedHeatNumber(it.heat_number) && !getLineAppliedState(it).isAppliedExact)
    const targets = checkedStock.length > 0 ? checkedStock : fallbackStock
    runApplyStockEntries(targets)
  }

  const applicableStockWithHeat = items.filter(it => isRowStockApplicable(it) && hasSelectedHeatNumber(it.heat_number))
  const pendingApplyStockCount = applicableStockWithHeat.filter(it => !getLineAppliedState(it).isAppliedExact).length

  // Add blank item
  const handleAddItem = () => {
    const nextSl = items.length > 0 ? Math.max(...items.map(i => i.sl_no)) + 1 : 1
    const newItem: SourcingLineItem = {
      id: `ITM-NEW-${Date.now()}`,
      sl_no: nextSl,
      client_po_item_no: `${nextSl}`,
      description: '',
      qty: 1,
      uom: 'PCS',
      heat_number: '',
      certificate_number: '',
      make: '',
      remarks: '',
      supplier_name: '',
      supplier_po_number: '',
      hs_code: '',
      country_of_origin: '',
      unit_price: 0,
      total_price: 0,
      unit_weight_kg: 0,
      total_net_weight_kg: 0,
      total_gross_weight_kg: 0,
      package_no: `PKG # 01`,
      is_machined: false,
    }
    setItems([...items, newItem])
  }

  // Delete item
  const handleDeleteItem = (id: string) => {
    if (items.length <= 1) {
      alert('Cannot delete all items. At least 1 item is required.')
      return
    }

    const itemToRemove = items.find(it => it.id === id)
    const remainingItems = items.filter(it => it.id !== id)

    if (itemToRemove) {
      const cNo = String(itemToRemove.client_po_item_no || '').trim()
      const groupId = (itemToRemove as any).group_id

      const siblings = remainingItems.filter(it =>
        (groupId && (it as any).group_id === groupId) ||
        (cNo && String(it.client_po_item_no || '').trim() === cNo)
      )

      if (siblings.length === 1) {
        const sib = siblings[0]
        const fullQty = (sib as any).total_qty || extractTotalQtyNumber(sib.qty) || extractQtyNumber(sib.qty)
        sib.qty = fullQty
        delete (sib as any).group_id
        delete (sib as any).total_qty
        delete (sib as any).split_qty
      } else if (siblings.length > 1) {
        let newTotal = 0
        siblings.forEach(s => {
          newTotal += extractQtyNumber(s.qty)
        })
        const fmtTotal = Number.isInteger(newTotal) ? newTotal : Math.round(newTotal * 100) / 100
        siblings.forEach(s => {
          const curr = extractQtyNumber(s.qty)
          const fmtCurr = Number.isInteger(curr) ? curr : Math.round(curr * 100) / 100
          s.qty = `${fmtCurr} OF ${fmtTotal}`
          s.split_qty = `${fmtCurr} OF ${fmtTotal}`
            ; (s as any).total_qty = fmtTotal
        })
      }
    }

    setItems(remainingItems)
    setStatusNotice('Item removed successfully. View updated on this page.')
  }

  // Save draft
  const handleSaveDraft = () => {
    const saved = saveSourcingDraft(currentWorksheetData)
    setDraftsList(getSourcingDrafts())
    setStatusNotice(`Worksheet draft saved successfully (${saved.id})!`)
  }

  // Save or Synchronize entire Sourcing Worksheet to real-time Sales Order in DB & Supabase Cloud
  const handleSaveToSalesOrder = () => {
    if (items.length === 0) {
      alert('Please add or upload at least one line item before saving to Sales Order.')
      return
    }

    try {
      const activeSo = selectedOrderId ? db.getOrders().find(o => o.id === selectedOrderId) : null

      if (activeSo) {
        // Update existing Sales Order
        const res = db.updateSalesOrder({
          id: activeSo.id,
          customer_name: clientName || activeSo.customer_name,
          po_number: poNumber || activeSo.po_number,
          so_number: msgRef || activeSo.so_number,
          items: items.map(it => ({
            id: it.id,
            position: it.sl_no,
            client_po_item_no: it.client_po_item_no,
            item_description: it.description,
            heat_number: it.heat_number,
            certificate_number: it.certificate_number,
            make: it.make,
            country_of_origin: it.country_of_origin,
            required_qty: extractQtyNumber(it.qty),
            unit_price: it.unit_price,
            uom: it.uom,
            remarks: it.remarks,
            supplier_name: it.supplier_name,
            supplier_po_number: it.supplier_po_number,
            package_type: it.package_type,
            package_no: it.package_no,
            hs_code: it.hs_code,
            split_qty: (it as any).split_qty,
            total_qty: (it as any).total_qty,
            group_id: (it as any).group_id,
          }))
        })

        if (res.success) {
          db.setActiveOrderId(activeSo.id)
          localStorage.setItem('msg_sourcing_active_so_id', activeSo.id)
          setStatusNotice(`Sales Order ${res.order?.so_number || activeSo.so_number} successfully saved to local DB & synced to Supabase Cloud!`)
        } else {
          alert('Failed to save Sales Order: ' + res.message)
        }
      } else {
        // Create new real-time Sales Order
        const newSoNum = msgRef.trim() || `SO-2026-${db.getOrders().length + 116}`
        const res = db.createSalesOrder({
          customer_name: clientName.trim() || 'Valued Client',
          po_number: poNumber.trim() || 'PO-NEW',
          so_number: newSoNum,
          required_delivery_date: new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
          items: items.map(it => ({
            item_code: (it as any).item_code || `ITEM-${it.sl_no}`,
            item_description: it.description,
            heat_number: it.heat_number,
            required_qty: extractQtyNumber(it.qty),
            client_po_item_no: it.client_po_item_no,
            position: it.sl_no,
            unit_price: it.unit_price,
            uom: it.uom,
            make: it.make,
            country_of_origin: it.country_of_origin,
            hs_code: it.hs_code,
            package_no: it.package_no,
            remarks: it.remarks,
            supplier_name: it.supplier_name,
            supplier_po_number: it.supplier_po_number,
          })),
          userEmail: 'sales@msgoilfield.ae'
        })

        if (res.success && res.order) {
          setSelectedOrderId(res.order.id)
          db.setActiveOrderId(res.order.id)
          localStorage.setItem('msg_sourcing_active_so_id', res.order.id)

          // Remap item ids to order's item ids
          const mappedItems: SourcingLineItem[] = items.map((it, idx) => {
            const matchedOrderItem = res.order!.items[idx]
            return {
              ...it,
              id: matchedOrderItem?.id || it.id
            }
          })
          setItems(mappedItems)
          setStatusNotice(`New Sales Order ${res.order.so_number} created and synchronized to Supabase Cloud!`)
        } else {
          alert('Failed to create Sales Order: ' + res.message)
        }
      }
    } catch (err: any) {
      alert('Error saving Sales Order: ' + err.message)
    }
  }

  // Restore draft
  const handleRestoreDraft = (draft: SourcingWorksheetData) => {
    setClientName(draft.client)
    setPoNumber(draft.po_number)
    setMsgRef(draft.msg_ref)
    if (draft.currency) setCurrency(draft.currency as any)
    if (draft.port_of_loading) setPortOfLoading(draft.port_of_loading)
    if (draft.port_of_discharge) setPortOfDischarge(draft.port_of_discharge)
    if (draft.payment_terms) setPaymentTerms(draft.payment_terms)
    setItems(draft.items)
    setIsDraftsModalOpen(false)
    setStatusNotice(`Restored worksheet draft from ${new Date(draft.saved_at || '').toLocaleDateString()}!`)
  }

  // Auto-Detect All Missing
  const handleAutoDetectAll = () => {
    const updated = items.map(it => {
      // Preserve make strictly as-is
      const make = it.make || ''

      const existingCoo = (it.country_of_origin || '').trim()
      const coo = existingCoo
        ? existingCoo
        : (make ? autoDetectCountryOfOrigin(make, it.description, it.remarks) : '')

      const hs = (it.hs_code || '').trim() ? it.hs_code : autoDetectHSCode(it.description)
      const unitWt = it.unit_weight_kg || estimateUnitWeight(it.description, it.uom)
      const isMach = isMeaningfulItem({ description: it.description, remarks: it.remarks })

      const numQ = extractQtyNumber(it.qty)
      return {
        ...it,
        make,
        country_of_origin: coo,
        hs_code: hs,
        unit_weight_kg: unitWt,
        total_net_weight_kg: Math.round(numQ * unitWt * 100) / 100,
        total_gross_weight_kg: Math.round(numQ * unitWt * 1.15 * 100) / 100,
        is_machined: isMach,
      }
    })
    setItems(updated)
    setStatusNotice('Auto-detected missing specifications while preserving all your custom Makes and Origins!')
  }

  // Grand Totals
  const totalAmount = items.reduce((sum, i) => sum + i.total_price, 0)
  const totalNetWt = items.reduce((sum, i) => sum + i.total_net_weight_kg, 0)
  const totalGrossWt = items.reduce((sum, i) => sum + i.total_gross_weight_kg, 0)

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-lg shadow-xs border border-slate-200">
        <div className={`flex flex-col lg:items-center justify-between gap-4 ${toolbarFlipSide ? 'lg:flex-row-reverse' : 'lg:flex-row'}`}>
          <div>
            <div className="flex items-center space-x-2.5 mb-1">
              <h1 className="text-lg font-semibold text-slate-900">
                Technical Sourcing, PO Split &amp; CIPL Portal
              </h1>
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium px-2 py-0.5 rounded-full">
                Automated Sync
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Manage multi-heat splits, auto-detect HS codes &amp; weights, and export Client Summary, Internal Stores Excel, CIPL Logistics, and Supplier PO packages.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Unified Active Sales Order Selector */}
            <div className="bg-slate-50 border border-slate-300 rounded-md px-3 py-1.5 flex items-center space-x-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase shrink-0">Active SO:</span>
              <select
                value={uniqueOrders.some(o => o.id === selectedOrderId) ? selectedOrderId : ''}
                onChange={e => {
                  const newId = e.target.value
                  setSelectedOrderId(newId)
                  db.setActiveOrderId(newId)
                  localStorage.setItem('msg_sourcing_active_so_id', newId)
                  handleLoadFromOrder(newId)
                }}
                className="bg-transparent text-slate-900 text-xs font-semibold focus:outline-none cursor-pointer max-w-[220px] truncate"
              >
                {!uniqueOrders.some(o => o.id === selectedOrderId) && (
                  <option value="" disabled>
                    {uniqueOrders.length === 0 ? 'Loading orders...' : '-- Select Active SO --'}
                  </option>
                )}
                {uniqueOrders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.so_number} - {o.po_number} ({o.customer_name})
                  </option>
                ))}
              </select>
            </div>

            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              onChange={handlePDFUpload}
              className="hidden"
            />
            <button
              onClick={() => pdfInputRef.current?.click()}
              disabled={isUploading}
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs px-3 py-2 rounded-md flex items-center space-x-1.5 transition-colors disabled:opacity-50"
              title="Upload Customer PO PDF directly into this worksheet"
            >
              <Upload className="h-3.5 w-3.5 text-slate-500" />
              <span>{isUploading ? 'Parsing PO...' : 'Upload PO (PDF)'}</span>
            </button>

            <button
              onClick={handleSaveDraft}
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs px-3 py-2 rounded-md flex items-center space-x-1.5 transition-colors"
              title="Save worksheet draft"
            >
              <Save className="h-3.5 w-3.5 text-slate-500" />
              <span>Save Draft</span>
            </button>

            <button
              onClick={() => setIsDraftsModalOpen(true)}
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs px-3 py-2 rounded-md flex items-center space-x-1.5 transition-colors"
            >
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <span>Drafts ({draftsList.length})</span>
            </button>

            <button
              onClick={handleSaveToSalesOrder}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-md flex items-center space-x-1.5 shadow-sm transition-colors"
              title="Save worksheet directly as a Sales Order in local database & Supabase Cloud"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>Save to Sales Order</span>
            </button>
          </div>
        </div>

        {statusNotice && (
          <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{statusNotice}</span>
          </div>
        )}
      </div>

      {/* Header Metadata Controls (Collapsible / Hideable) */}
      {showMetadataPanel ? (
      <div className="bg-white p-4 rounded-lg shadow-xs border border-slate-200 space-y-3">
        <div className={`flex items-center justify-between gap-2 pb-2 border-b border-slate-100 ${toolbarFlipSide ? 'flex-row-reverse' : ''}`}>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Order Details &amp; Shipping Metadata
          </span>
          <button
            type="button"
            onClick={() => setShowMetadataPanel(false)}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded hover:bg-slate-100 flex items-center gap-1 cursor-pointer transition-colors"
            title="Hide Order Details panel"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            <span>Hide Panel</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Client / Customer</label>
          <input
            type="text"
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Customer PO Number</label>
          <input
            type="text"
            value={poNumber}
            onChange={e => setPoNumber(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-semibold text-slate-800 focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">MSG Reference #</label>
          <input
            type="text"
            value={msgRef}
            onChange={e => setMsgRef(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-indigo-700 focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Loaded Sales Order</label>
          <select
            value={uniqueOrders.some(o => o.id === selectedOrderId) ? selectedOrderId : ''}
            onChange={e => {
              if (e.target.value) handleLoadFromOrder(e.target.value)
            }}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 bg-emerald-50/50 border-emerald-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            {!uniqueOrders.some(o => o.id === selectedOrderId) && (
              <option value="" disabled>
                {uniqueOrders.length === 0 ? 'Loading sales orders...' : '-- Select Sales Order --'}
              </option>
            )}
            {uniqueOrders.map(o => (
              <option key={o.id} value={o.id}>
                {o.so_number} - {o.customer_name} ({o.items.length} items)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Currency</label>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value as any)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white"
          >
            <option value="AED">AED - United Arab Emirates Dirham</option>
            <option value="USD">USD - US Dollar ($)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Port of Loading</label>
          <input
            type="text"
            value={portOfLoading}
            onChange={e => setPortOfLoading(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Port of Discharge</label>
          <input
            type="text"
            value={portOfDischarge}
            onChange={e => setPortOfDischarge(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Payment Terms</label>
          <input
            type="text"
            value={paymentTerms}
            onChange={e => setPaymentTerms(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800"
          />
        </div>
        </div>
      </div>
      ) : null}

      {/* Compact Restore Bar for Hidden Panels */}
      {(!showMetadataPanel || !showExportsPanel) && (
        <div className={`bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 flex flex-wrap items-center gap-2 text-xs ${toolbarFlipSide ? 'flex-row-reverse' : ''}`}>
          <span className="text-[11px] font-semibold text-slate-500">Hidden Panels:</span>
          {!showMetadataPanel && (
            <button
              type="button"
              onClick={() => setShowMetadataPanel(true)}
              className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-medium text-[11px] cursor-pointer"
            >
              + Show Order Details
            </button>
          )}
          {!showExportsPanel && (
            <button
              type="button"
              onClick={() => setShowExportsPanel(true)}
              className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-medium text-[11px] cursor-pointer"
            >
              + Show Deliverables Toolbar
            </button>
          )}
        </div>
      )}

      {/* Portal In-Page Tab Navigation Bar */}
      <div className={`bg-white p-2 rounded-lg shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3 ${toolbarFlipSide ? 'flex-row-reverse' : ''}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActivePortalTab('worksheet')}
            className={`px-3.5 py-2 rounded-md font-semibold text-xs flex items-center space-x-2 transition-colors cursor-pointer ${activePortalTab === 'worksheet'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Sourcing Worksheet</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${activePortalTab === 'worksheet' ? 'bg-blue-500 text-white' : 'bg-white text-slate-700 font-mono'}`}>
              {items.length}
            </span>
          </button>

          <button
            type="button"
            onClick={handleConvertToPO}
            className={`px-3.5 py-2 rounded-md font-semibold text-xs flex items-center space-x-2 transition-colors cursor-pointer ${activePortalTab === 'purchase_order'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
              }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>Create Purchase Order</span>
            {selectedItemIds.size > 0 && (
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono px-1.5 py-0.5 rounded-full">
                {selectedItemIds.size}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateCertificate()}
            className={`px-3.5 py-2 rounded-md font-semibold text-xs flex items-center space-x-2 transition-colors cursor-pointer ${activePortalTab === 'create_certificate'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
              }`}
          >
            <FileCheck2 className="h-3.5 w-3.5" />
            <span>MTC Certificates</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePortalTab('create_cipl')}
            className={`px-3.5 py-2 rounded-md font-semibold text-xs flex items-center space-x-2 transition-colors cursor-pointer ${activePortalTab === 'create_cipl'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
              }`}
          >
            <Truck className="h-3.5 w-3.5" />
            <span>Create CIPL</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenPreview('client')}
            className="px-3.5 py-2 rounded-md font-semibold text-xs flex items-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5 text-slate-500" />
            <span>Preview Deliverables</span>
          </button>
        </div>

        {/* Quick Context Action Buttons */}
        {activePortalTab === 'worksheet' && (
          <div className="flex items-center space-x-2">
            {selectedItemIds.size > 0 ? (
              <div className="flex items-center space-x-2 bg-blue-50 px-3 py-1 rounded-md border border-blue-200">
                <span className="text-xs font-semibold text-blue-800 tabular-nums">
                  {selectedItemIds.size} selected
                </span>
                <button
                  type="button"
                  disabled={selectedNonStockCount === 0}
                  onClick={handleConvertToPO}
                  title={selectedNonStockCount === 0 ? 'Selected items are available in stock — Local Purchase disabled' : 'Create Local Purchase Order for selected non-stock item(s)'}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-xs px-2.5 py-1 rounded flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  <ShoppingCart className="h-3 w-3" />
                  <span>Create Purchase Order</span>
                </button>
                <button
                  type="button"
                  disabled={selectedMtcCount === 0}
                  onClick={() => handleOpenCreateCertificate()}
                  title={selectedMtcCount === 0 ? 'Select a Heat Number with an available MTC for selected item(s) first' : 'Open MTC Hub for selected item(s)'}
                  className="bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed border border-slate-300 text-slate-700 font-semibold text-xs px-2.5 py-1 rounded flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  <FileCheck2 className="h-3 w-3" />
                  <span>MTC Hub</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleConvertToPO}
                  className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                  title="Create Purchase Order for L-Code and non-stock items"
                >
                  <ShoppingCart className="h-3.5 w-3.5 text-slate-500" />
                  <span>Create Purchase Order</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenCreateCertificate()}
                  className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                  title="Upload, Preview & Download MTC Certificates"
                >
                  <FileCheck2 className="h-3.5 w-3.5 text-slate-500" />
                  <span>MTC Certificates</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* In-Page PO Tab View */}
      {activePortalTab === 'purchase_order' && (
        <InPagePurchaseOrderTab
          worksheetData={currentWorksheetData}
          selectedItemIds={selectedItemIds}
          onApply={(updatedItems, stayInTab) => {
            setItems(updatedItems)
            syncItemsToOrder(updatedItems)
            setSelectedItemIds(prev => {
              const orderedIds = new Set(updatedItems.filter(it => it.po_created).map(it => it.id))
              const next = new Set<string>()
              prev.forEach(id => {
                if (!orderedIds.has(id)) next.add(id)
              })
              return next
            })
            if (!stayInTab) {
              setActivePortalTab('worksheet')
            }
          }}
          onBack={() => setActivePortalTab('worksheet')}
          showToast={msg => setStatusNotice(msg)}
        />
      )}

      {/* In-Page CIPL & Packing Labels Workbench */}
      {activePortalTab === 'create_cipl' && (
        <InPageCIPLTab
          worksheetData={currentWorksheetData}
          onApply={(updatedItems, stayInTab) => {
            setItems(updatedItems)
            syncItemsToOrder(updatedItems)
            if (!stayInTab) {
              setActivePortalTab('worksheet')
            }
          }}
          onBack={() => setActivePortalTab('worksheet')}
          showToast={msg => setStatusNotice(msg)}
        />
      )}

      {/* In-Page Certificate Studio View */}
      {activePortalTab === 'create_certificate' && (
        <InPageCertificateTab
          worksheetData={currentWorksheetData}
          activeItemId={activeCertItemId}
          onApply={(itemId, certDetails) => {
            setItems(prev => {
              const next = prev.map(it => {
                if (it.id !== itemId) return it
                return {
                  ...it,
                  heat_number: certDetails.heat_number,
                  certificate_number: certDetails.certificate_number,
                  make: certDetails.make || it.make,
                  country_of_origin: certDetails.country_of_origin || it.country_of_origin,
                }
              })
              if (selectedOrderId) {
                try {
                  db.updateSalesOrder({
                    id: selectedOrderId,
                    items: next.map(it => ({
                      id: it.id,
                      item_description: it.description,
                      heat_number: it.heat_number,
                      certificate_number: it.certificate_number,
                      make: it.make,
                      country_of_origin: it.country_of_origin,
                      required_qty: extractQtyNumber(it.qty),
                      unit_price: it.unit_price,
                      remarks: it.remarks,
                      supplier_name: it.supplier_name,
                      supplier_po_number: it.supplier_po_number,
                      package_type: it.package_type,
                      package_no: it.package_no,
                      hs_code: it.hs_code,
                    }))
                  })
                } catch (e) {
                  console.warn('Could not sync cert details to order:', e)
                }
              }
              return next
            })
          }}
          onBack={() => setActivePortalTab('worksheet')}
          showToast={msg => setStatusNotice(msg)}
        />
      )}

      {/* Worksheet Tab Content */}
      {activePortalTab === 'worksheet' && (
        <>

          {/* Action Export Buttons Banner (Hideable & Flippable) */}
          {showExportsPanel && (
          <div className={`bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col items-center justify-between gap-3 ${toolbarFlipSide ? 'md:flex-row-reverse' : 'md:flex-row'}`}>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleAutoDetectAll}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md flex items-center space-x-1.5 shadow-xs transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Detect All (COO, HS, Wt)</span>
              </button>

              <label className="inline-flex items-center space-x-2 text-xs font-medium text-slate-700 cursor-pointer ml-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
                <input
                  type="checkbox"
                  checked={filterMachinedOnly}
                  onChange={e => setFilterMachinedOnly(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                <span>Filter Machined / Fab Items Only</span>
              </label>

              <button
                type="button"
                onClick={() => setShowExportsPanel(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Hide Deliverables Toolbar panel"
                aria-label="Hide Deliverables Toolbar panel"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Deliverable Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* 1. Client Summary: Opens Preview & Download Modal */}
              <div className="inline-flex rounded-md overflow-hidden border border-slate-300">
                <button
                  onClick={() => handleOpenPreview('client')}
                  className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs px-3 py-1.5 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Open Client Summary Preview & Download Modal"
                >
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                  <span>Client Summary</span>
                </button>
                <button
                  onClick={async () => {
                    setIsExporting(true)
                    try {
                      await generateClientSummaryExcel(currentWorksheetData, filterMachinedOnly)
                      setStatusNotice('Client Summary (.xlsx) downloaded successfully!')
                    } catch (err: any) {
                      alert('Error exporting Client Summary: ' + err.message)
                    } finally {
                      setIsExporting(false)
                    }
                  }}
                  disabled={isExporting}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-2 py-1.5 border-l border-slate-300 transition-colors cursor-pointer"
                  title="Direct 1-Click Instant Download (.xlsx)"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 2. Stores Internal Excel: Opens Preview & Download Modal */}
              <div className="inline-flex rounded-md overflow-hidden border border-slate-300">
                <button
                  onClick={() => handleOpenPreview('stores')}
                  className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs px-3 py-1.5 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Open Stores Sheet Preview & Download Modal"
                >
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                  <span>Stores Sheet</span>
                </button>
                <button
                  onClick={async () => {
                    setIsExporting(true)
                    try {
                      await generateStoresSummaryExcel(currentWorksheetData, filterMachinedOnly)
                      setStatusNotice('Stores Summary (.xlsx) downloaded successfully!')
                    } catch (err: any) {
                      alert('Error exporting Stores Summary: ' + err.message)
                    } finally {
                      setIsExporting(false)
                    }
                  }}
                  disabled={isExporting}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-2 py-1.5 border-l border-slate-300 transition-colors cursor-pointer"
                  title="Direct 1-Click Instant Download (.xlsx)"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Local Purchase Sheet */}
              <div className="inline-flex rounded-md overflow-hidden border border-slate-300">
                <button
                  disabled={nonStockCount === 0}
                  onClick={() => setIsLocalPurchaseModalOpen(true)}
                  className="bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-slate-700 font-medium text-xs px-3 py-1.5 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title={nonStockCount === 0 ? 'All items are available in stock — Local Purchase disabled' : 'Open Local Purchase Modal (Select Local Supplier, Non-Stock Items & L-Codes)'}
                >
                  <Wrench className="h-3.5 w-3.5 text-slate-500" />
                  <span>Local Purchase</span>
                </button>
                <button
                  onClick={async () => {
                    setIsExporting(true)
                    try {
                      const localItems = currentWorksheetData.items.filter(it => isMeaningfulItem({ description: it.description, remarks: it.remarks }) || (it.supplier_name && it.supplier_name.toUpperCase() !== 'STOCK'))
                      const targetItems = localItems.length > 0 ? localItems : currentWorksheetData.items
                      await generateStoresSummaryExcel({ ...currentWorksheetData, items: targetItems }, false)
                      setStatusNotice(`Exported ${targetItems.length} Local Purchase item(s) to separate Excel!`)
                    } catch (err: any) {
                      alert('Error exporting Local Purchase sheet: ' + err.message)
                    } finally {
                      setIsExporting(false)
                    }
                  }}
                  disabled={isExporting}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-2 py-1.5 border-l border-slate-300 transition-colors cursor-pointer"
                  title="Direct 1-Click Instant Download (.xlsx)"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 3. Sticker Summary Sheet */}
              <div className="inline-flex rounded-md overflow-hidden border border-slate-300">
                <button
                  onClick={() => handleOpenPreview('summary')}
                  className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs px-3 py-1.5 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Open Sticker Summary Preview & Download Modal"
                >
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                  <span>Sticker Summary</span>
                </button>
                <button
                  onClick={async () => {
                    setIsExporting(true)
                    try {
                      await generateStickerSummaryExcel(currentWorksheetData)
                      setStatusNotice('Sticker Summary Sheet (.xlsx) downloaded successfully!')
                    } catch (err: any) {
                      alert('Error exporting Sticker Summary Sheet: ' + err.message)
                    } finally {
                      setIsExporting(false)
                    }
                  }}
                  disabled={isExporting}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-2 py-1.5 border-l border-slate-300 transition-colors cursor-pointer"
                  title="Direct 1-Click Instant Download (.xlsx)"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 4. CIPL Logistics */}
              <div className="inline-flex rounded-md overflow-hidden border border-slate-300">
                <button
                  onClick={() => handleOpenPreview('cipl_invoice')}
                  className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs px-3 py-1.5 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Open CIPL Logistics Builder & Preview Modal"
                >
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                  <span>CIPL (.xlsx)</span>
                </button>
                <button
                  onClick={async () => {
                    setIsExporting(true)
                    try {
                      await generateCIPLLogisticExcel(currentWorksheetData)
                      setStatusNotice('CIPL Logistics (.xlsx) downloaded successfully!')
                    } catch (err: any) {
                      alert('Error exporting CIPL: ' + err.message)
                    } finally {
                      setIsExporting(false)
                    }
                  }}
                  disabled={isExporting}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-2 py-1.5 border-l border-slate-300 transition-colors cursor-pointer"
                  title="Direct 1-Click Instant Download (.xlsx)"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 5. Supplier POs ZIP Package */}
              <button
                onClick={async () => {
                  setIsExporting(true)
                  try {
                    await generateSupplierPOZip(currentWorksheetData)
                    setStatusNotice('Supplier Purchase Orders package (.zip) generated and downloaded!')
                  } catch (err: any) {
                    alert('Error generating Supplier PO package: ' + err.message)
                  } finally {
                    setIsExporting(false)
                  }
                }}
                disabled={isExporting}
                className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors"
                title="Generate & download official Supplier PO PDFs in ZIP bundle"
              >
                <Archive className="h-3.5 w-3.5 text-slate-500" />
                <span>{isExporting ? 'Generating ZIP...' : 'Supplier POs (.zip)'}</span>
              </button>

              {/* 6. Exact 58mm x 39mm Item Stickers PDF */}
              <button
                onClick={async () => {
                  setIsExporting(true)
                  try {
                    const stickerItems: StickerItem[] = currentWorksheetData.items.map((it, idx) => ({
                      sl_no: it.sl_no || (idx + 1),
                      client_po_item_no: it.client_po_item_no || String(it.sl_no || idx + 1),
                      description: it.description || '',
                      po_qty: it.qty || 0,
                      uom: it.uom || 'Ea',
                      heat_number: it.heat_number || '-',
                      certificate_number: it.certificate_number || '-',
                      make: it.make || 'DELCORTE, FRANCE',
                      supplier: it.supplier_name || 'MSG OILFIELD STORES',
                      remarks: it.remarks || 'LOCATION-1',
                      loc: it.remarks || 'LOCATION-1',
                      po_number: currentWorksheetData.po_number || poNumber,
                      client_name: currentWorksheetData.client || clientName,
                    }))
                    const pdfBytes = await generateStickersPdf({
                      client_name: currentWorksheetData.client || clientName,
                      po_number: currentWorksheetData.po_number || poNumber,
                      msg_ref: currentWorksheetData.msg_ref || msgRef,
                      items: stickerItems,
                    })
                    const safeName = (poNumber || 'so').replace(/[^a-zA-Z0-9]/g, '_')
                    downloadStickerPdfBlob(pdfBytes, `stickers_${safeName}_final.pdf`)
                    setStatusNotice('Material Item Stickers (58mm × 39mm) PDF exported successfully matching exact layout!')
                  } catch (err: any) {
                    alert('Error generating Material Stickers: ' + err.message)
                  } finally {
                    setIsExporting(false)
                  }
                }}
                disabled={isExporting}
                className="bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm transition-colors"
                title="Generate & download exact 58mm x 39mm Item Stickers PDF with QR code"
              >
                <Tag className="h-4 w-4" />
                <span>Item Stickers (.pdf)</span>
              </button>

              {/* 7. MTC Certificates Package */}
              <div className="inline-flex rounded-lg shadow-sm overflow-hidden border border-indigo-800">
                <button
                  onClick={() => handleOpenCreateCertificate()}
                  className="bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-xs px-3.5 py-2 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Open MTC Hub to preview, attach and download stamped certificates"
                >
                  <FileCheck2 className="h-4 w-4" />
                  <span>MTC Package</span>
                </button>
                <button
                  onClick={async () => {
                    setIsExporting(true)
                    try {
                      const { PDFDocument } = await import('pdf-lib')
                      const { stampMTCDocument, downloadPDFBlob } = await import('../../services/pdfEngine')
                      const { getAuthenticCertificateBytes, resolveBackendMtcBytes, isValidPdfBytes } = await import('../../services/zipExtractor')
                      const mergedPdf = await PDFDocument.create()
                      let count = 0
                      for (const it of currentWorksheetData.items) {
                        const heat = (it.heat_number || '').trim()
                        if (!heat || heat === '-' || heat.toUpperCase() === 'N/A') continue
                        const auth = await getAuthenticCertificateBytes(it.certificate_number, heat)
                        const bytes = auth?.bytes || await resolveBackendMtcBytes(it.certificate_number, heat)
                        if (!bytes || !isValidPdfBytes(bytes)) continue

                        try {
                          const stamped = await stampMTCDocument(bytes, {
                            poNo: currentWorksheetData.po_number || 'PO-MSG',
                            itemNo: it.client_po_item_no || String(it.sl_no),
                            qty: `${it.qty} ${it.uom}`,
                            sign: 'Alex Turner / MSG QA-04',
                            dateStr: new Date().toISOString().substring(0, 10),
                          }, true)
                          const docToMerge = await PDFDocument.load(stamped)
                          const pages = await mergedPdf.copyPages(docToMerge, docToMerge.getPageIndices())
                          pages.forEach(p => mergedPdf.addPage(p))
                          count++
                        } catch (itemErr) {
                          console.warn('Skipping unreadable MTC in package export:', it.heat_number || it.certificate_number, itemErr)
                        }
                      }

                      if (count === 0) {
                        alert('No authentic certificates attached to items. Please upload or link authentic MTCs from the bulk ZIP vault.')
                        return
                      }

                      const mergedBytes = await mergedPdf.save()
                      const pkgName = `${(currentWorksheetData.po_number || 'PO').replace(/[^a-zA-Z0-9_-]/g, '_')}_Complete_MTC_Package.pdf`
                      downloadPDFBlob(mergedBytes, pkgName)
                      setStatusNotice(`Downloaded complete authentic MTC Certificates Package (${count} items) into ${pkgName}!`)
                    } catch (err: any) {
                      alert('Error downloading MTC package: ' + err.message)
                    } finally {
                      setIsExporting(false)
                    }
                  }}
                  disabled={isExporting || availableMtcCount === 0}
                  className="bg-indigo-800 hover:bg-indigo-900 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-indigo-100 hover:text-white px-2.5 py-2 border-l border-indigo-600/70 transition-colors cursor-pointer"
                  title={availableMtcCount === 0 ? 'Select a Heat Number with an available MTC first' : '1-Click Direct Download Complete Stamped MTC Package (.pdf)'}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Interactive Line Items Grid */}
          <div className={isSheetFullscreen ? 'fixed inset-0 z-[45] bg-white flex flex-col overflow-hidden' : 'bg-white rounded-lg shadow-xs border border-slate-200 overflow-hidden'}>
                <div className={`px-4 py-3 bg-white border-b border-slate-200 flex flex-col justify-between items-start sm:items-center gap-2 shrink-0 ${toolbarFlipSide ? 'sm:flex-row-reverse' : 'sm:flex-row'}`}>
                  <div className="flex items-center space-x-2">
                    <h2 className="font-semibold text-sm text-slate-900">
                      Sourcing &amp; Allocation Worksheet
                    </h2>
                    <span className="text-[11px] bg-slate-100 border border-slate-200 text-slate-700 font-mono px-2 py-0.5 rounded-full tabular-nums">
                      {items.length} lines
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 text-xs flex-wrap gap-y-2">
                    <span className="text-slate-600 tabular-nums">
                      Total: <strong className="text-slate-900">{currency} {totalAmount.toLocaleString()}</strong>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-600 tabular-nums">
                      Net Wt: <strong className="text-slate-900">{Math.round(totalNetWt * 100) / 100} kg</strong>
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 pl-2 border-l border-slate-200">
                      <button
                        type="button"
                        onClick={handleApplyBulkStockItems}
                        disabled={applicableStockWithHeat.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                        title={
                          applicableStockWithHeat.length === 0
                            ? 'Select a Heat Number on one or more stock items first'
                            : 'Deduct selected stock item quantities from backend heat inventory'
                        }
                        aria-label="Apply Stock Items"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>
                          Apply Stock Items{pendingApplyStockCount > 0 ? ` (${pendingApplyStockCount})` : ''}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleConvertToPO}
                        className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                        title="Create Purchase Order for L-Code and non-stock items"
                      >
                        <ShoppingCart className="h-3 w-3 text-slate-500" />
                        <span>Create Purchase Order</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenCreateCertificate()}
                        className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                        title="Create EN 10204 3.1 Mill Certificate"
                      >
                        <FileCheck2 className="h-3 w-3 text-slate-500" />
                        <span>Create Cert</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const val = prompt('Enter Supplier PO Number to apply to all items:', '')
                          if (val && val.trim()) {
                            const trimmed = val.trim()
                            setItems(prev => prev.map(item => ({ ...item, supplier_po_number: trimmed })))
                            setStatusNotice(`Applied Supplier PO #${trimmed} to all items!`)
                          }
                        }}
                        className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                        title="Bulk apply Supplier PO to all items outside"
                      >
                        <Plus className="h-3 w-3 text-slate-500" />
                        <span>Supplier PO</span>
                      </button>
                      <button
                        type="button"
                        disabled={nonStockCount === 0}
                        onClick={() => setIsLocalPurchaseModalOpen(true)}
                        className="bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed border border-slate-300 text-slate-700 font-medium text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                        title={nonStockCount === 0 ? 'All items are available in stock — Local Purchase disabled' : 'Select Local Supplier, non-stock items, and L-Codes'}
                      >
                        <Wrench className="h-3 w-3 text-slate-500" />
                        <span>Local Purchase</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePortalTab('create_cipl')}
                        className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                        title="Open Create CIPL & Packing Labels Workbench in a dedicated tab"
                      >
                        <Truck className="h-3 w-3 text-slate-500" />
                        <span>Create CIPL</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setItems(prev => prev.map(item => ({ ...item, package_type: 'Pallet' })))
                          setStatusNotice('Set packaging to Pallet for all items!')
                        }}
                        className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
                        title="Set All Pallet"
                      >
                        All Pallet
                      </button>
                    </div>
                    <button
                      onClick={handleAddItem}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Item</span>
                    </button>

                    {/* Columns & Layout Customization Popover */}
                    <div ref={columnsMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setIsColumnsMenuOpen(o => !o)}
                        className={`font-semibold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer border ${hiddenColumns.length > 0
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                          }`}
                        title="Hide, show, or reorder table columns & panels"
                        aria-label="Customize columns and panels"
                      >
                        <Columns3 className="h-3.5 w-3.5" />
                        <span>{hiddenColumns.length > 0 ? `Columns (${hiddenColumns.length} hidden)` : 'Columns'}</span>
                      </button>

                      {isColumnsMenuOpen && (
                        <div className={`absolute ${toolbarFlipSide ? 'left-0' : 'right-0'} mt-1.5 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 text-xs overflow-hidden`}>
                          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <span className="font-semibold text-slate-800">Customize Columns &amp; Panels</span>
                            <button
                              type="button"
                              onClick={resetWorkspaceLayout}
                              className="text-[11px] font-medium text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Reset</span>
                            </button>
                          </div>

                          <div className="p-2.5 border-b border-slate-100 space-y-1.5">
                            <div className="text-[10px] font-bold uppercase text-slate-400">Custom Panels</div>
                            <label className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer">
                              <span className="text-slate-700 font-medium">Order Details Panel</span>
                              <input
                                type="checkbox"
                                checked={showMetadataPanel}
                                onChange={e => setShowMetadataPanel(e.target.checked)}
                                className="rounded text-blue-600"
                              />
                            </label>
                            <label className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer">
                              <span className="text-slate-700 font-medium">Deliverables &amp; Export Panel</span>
                              <input
                                type="checkbox"
                                checked={showExportsPanel}
                                onChange={e => setShowExportsPanel(e.target.checked)}
                                className="rounded text-blue-600"
                              />
                            </label>
                          </div>

                          <div className="p-2.5 max-h-64 overflow-y-auto space-y-1">
                            <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                              Worksheet Columns (Show/Hide &amp; Move L/R)
                            </div>
                            {columnOrder.map((colKey, colIdx) => {
                              const def = COLUMN_DEF_MAP.get(colKey)
                              if (!def) return null
                              const isVisible = !hiddenColumns.includes(colKey)
                              return (
                                <div key={colKey} className="flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-slate-50">
                                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isVisible}
                                      onChange={() => toggleColumnVisibility(colKey)}
                                      className="rounded text-blue-600 shrink-0"
                                    />
                                    <span className="truncate font-medium text-slate-700">
                                      {def.key === 'price' ? `Price (${currency})` : def.label}
                                    </span>
                                  </label>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      type="button"
                                      disabled={colIdx === 0}
                                      onClick={() => moveColumn(colKey, -1)}
                                      title={`Move ${def.label} left`}
                                      aria-label={`Move ${def.label} left`}
                                      className="p-1 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                                    >
                                      <ArrowLeft className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={colIdx === columnOrder.length - 1}
                                      onClick={() => moveColumn(colKey, 1)}
                                      title={`Move ${def.label} right`}
                                      aria-label={`Move ${def.label} right`}
                                      className="p-1 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                                    >
                                      <ArrowRight className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setToolbarFlipSide(f => !f)}
                      title="Reposition toolbar & panels Left <-> Right"
                      aria-label="Flip toolbar side"
                      className={`font-semibold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer border ${toolbarFlipSide
                        ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-300'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                        }`}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      <span>{toolbarFlipSide ? 'Toolbar: Left' : 'Flip L/R'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsSheetFullscreen(f => !f)}
                      title={isSheetFullscreen ? 'Exit Full-Screen Sheet Mode (Esc)' : 'Expand Worksheet to Full Screen'}
                      aria-label={isSheetFullscreen ? 'Exit sheet full screen' : 'Full screen worksheet'}
                      className={`font-semibold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer border ${isSheetFullscreen
                        ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                        }`}
                    >
                      {isSheetFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                      <span>{isSheetFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                    </button>
                  </div>
                </div>

                <div className={isSheetFullscreen ? 'flex-1 overflow-auto pb-16' : 'overflow-x-auto max-h-[600px] overflow-y-auto pb-16'}>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={items.length > 0 && items.every(it => selectedItemIds.has(it.id))}
                            onChange={e => toggleSelectAll(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                            title="Select all items"
                          />
                        </th>
                        <th className="p-2.5 w-12 text-center">SL</th>
                        {visibleColumns.map(colKey => {
                          const def = COLUMN_DEF_MAP.get(colKey)
                          if (!def) return null
                          const headerLabel = def.key === 'price' ? `Price (${currency})` : def.label
                          return (
                            <th key={colKey} className={`p-2.5 ${def.thClass} group`}>
                              <div className="flex items-start justify-between gap-1">
                                <div className="flex-1">
                                  <span>{headerLabel}</span>
                                  {def.subLabel && (
                                    <span className="block text-[9px] text-slate-400 font-normal normal-case">
                                      {def.subLabel}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleColumnVisibility(colKey)}
                                  title={`Hide ${headerLabel} column`}
                                  aria-label={`Hide ${headerLabel} column`}
                                  className="opacity-40 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-opacity cursor-pointer shrink-0"
                                >
                                  <EyeOff className="h-3 w-3" />
                                </button>
                              </div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((it, idx) => {
                        const rowHasHeat = hasSelectedHeatNumber(it.heat_number)
                        const rowHasMtc = hasItemMtc(it)
                        const rowInStock = isItemInStock(it)
                        const disabledMtcReason = !rowHasHeat
                          ? 'Select a Heat Number first'
                          : 'No MTC certificate available for this item'

                        const renderCell = (colKey: WorksheetColumnKey) => {
                          switch (colKey) {
                            case 'po_item':
                              return (
                                <td key={colKey} className="p-2.5">
                                  <input
                                    type="text"
                                    value={it.client_po_item_no}
                                    onChange={e => handleUpdateItem(it.id, 'client_po_item_no', e.target.value)}
                                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-center font-mono text-xs"
                                  />
                                </td>
                              )
                            case 'description':
                              return (
                                <td key={colKey} className="p-2.5">
                                  <textarea
                                    rows={2}
                                    value={it.description}
                                    onChange={e => handleUpdateItem(it.id, 'description', e.target.value)}
                                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 leading-snug resize-y"
                                  />
                                  {it.is_machined && (
                                    <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                      ⚙️ Machining Required
                                    </span>
                                  )}
                                </td>
                              )
                            case 'qty':
                              return (
                                <td key={colKey} className="p-2.5 text-center">
                                  <div className="flex items-center space-x-1">
                                    <input
                                      type="number"
                                      min="1"
                                      value={it.qty}
                                      onChange={e => handleUpdateItem(it.id, 'qty', Number(e.target.value))}
                                      className="w-14 border border-slate-200 rounded px-1 py-1 text-center font-bold text-xs"
                                    />
                                    <input
                                      type="text"
                                      value={it.uom}
                                      onChange={e => handleUpdateItem(it.id, 'uom', e.target.value)}
                                      className="w-10 border border-slate-200 rounded px-1 py-1 text-center text-[10px] uppercase font-mono"
                                    />
                                  </div>
                                </td>
                              )
                            case 'packaging':
                              return (
                                <td key={colKey} className="p-2.5 bg-sky-50/20">
                                  <div className="flex items-center space-x-1">
                                    <select
                                      value={it.package_type || 'Pallet'}
                                      onChange={e => handleUpdateItem(it.id, 'package_type', e.target.value)}
                                      className="border border-sky-200 rounded px-1 py-1 text-xs bg-white text-slate-800"
                                    >
                                      <option value="Pallet">Pallet</option>
                                      <option value="Box">Box</option>
                                      <option value="Crate">Crate</option>
                                      <option value="Wooden Box">W.Box</option>
                                    </select>
                                    <input
                                      type="text"
                                      value={it.package_no ? it.package_no.replace(/\D/g, '') || '1' : '1'}
                                      onChange={e => handleUpdateItem(it.id, 'package_no', `PKG # ${e.target.value || '1'}`)}
                                      className="w-9 border border-sky-200 rounded px-1 py-1 text-center font-mono text-xs bg-white"
                                      placeholder="1"
                                      title="Package number"
                                    />
                                  </div>
                                </td>
                              )
                            case 'heat_number': {
                              const stockApplicable = isRowStockApplicable(it)
                              const { isAppliedExact, remainingAvail } = getLineAppliedState(it)
                              return (
                                <td key={colKey} className="p-2.5 min-w-[175px]">
                                  <div className="space-y-1">
                                    <HeatNumberCombobox
                                      value={it.heat_number}
                                      description={it.description}
                                      extraLots={masterStock}
                                      onChange={(heat, meta) => {
                                        handleApplyHeatSelection(it.id, heat, meta)
                                      }}
                                    />
                                    {stockApplicable && (
                                      <div className="flex items-center justify-between gap-1">
                                        <button
                                          type="button"
                                          disabled={!rowHasHeat || isAppliedExact}
                                          onClick={() => handleApplySingleStockItem(it.id)}
                                          aria-label={`Apply stock item ${it.sl_no}`}
                                          title={
                                            !rowHasHeat
                                              ? 'Select a Heat Number first'
                                              : isAppliedExact
                                                ? `Applied (${it.qty} PCS deducted from Heat ${it.heat_number})`
                                                : `Apply ${extractQtyNumber(it.qty)} PCS from Heat ${it.heat_number}`
                                          }
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-colors border ${isAppliedExact
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default'
                                            : !rowHasHeat
                                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                              : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 cursor-pointer'
                                            }`}
                                        >
                                          <Check className="h-2.5 w-2.5" />
                                          <span>{isAppliedExact ? 'Applied' : 'Apply'}</span>
                                        </button>
                                        {rowHasHeat && (
                                          <span className={`text-[10px] font-mono tabular-nums ${remainingAvail > 0 ? 'text-slate-600' : 'text-amber-700 font-semibold'}`}>
                                            Avail: {remainingAvail}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              )
                            }
                            case 'certificate_number':
                              return (
                                <td key={colKey} className="p-2.5">
                                  <div className="flex items-center space-x-1">
                                    <input
                                      type="text"
                                      placeholder="MTC-REF"
                                      value={it.certificate_number}
                                      onChange={e => handleUpdateItem(it.id, 'certificate_number', e.target.value)}
                                      className="w-full border border-slate-200 rounded px-1.5 py-1 font-mono text-[11px] text-slate-600"
                                    />
                                    <button
                                      type="button"
                                      disabled={!rowHasMtc}
                                      onClick={() => handleOpenCreateCertificate(it.id)}
                                      className="p-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 disabled:bg-slate-100 disabled:text-slate-300 disabled:border-slate-200 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                                      title={rowHasMtc ? 'View, Preview & Download MTC Certificate' : disabledMtcReason}
                                    >
                                      <Eye className="h-3 w-3" />
                                    </button>
                                  </div>
                                </td>
                              )
                            case 'make':
                              return (
                                <td key={colKey} className="p-2.5">
                                  <input
                                    type="text"
                                    value={it.make}
                                    onChange={e => handleUpdateItem(it.id, 'make', e.target.value)}
                                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs font-semibold text-slate-800"
                                  />
                                </td>
                              )
                            case 'supplier_name':
                              return (
                                <td key={colKey} className="p-2.5">
                                  <input
                                    type="text"
                                    value={it.supplier_name}
                                    onChange={e => handleUpdateItem(it.id, 'supplier_name', e.target.value)}
                                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs text-blue-900 font-medium"
                                  />
                                </td>
                              )
                            case 'supplier_po_number':
                              return (
                                <td key={colKey} className="p-2.5 bg-amber-50/20">
                                  <input
                                    type="text"
                                    value={it.supplier_po_number || ''}
                                    onChange={e => handleUpdateItem(it.id, 'supplier_po_number', e.target.value)}
                                    placeholder="PO #"
                                    className="w-full border border-amber-300 rounded px-1.5 py-1 text-center font-mono text-xs font-bold text-amber-950 bg-white"
                                  />
                                </td>
                              )
                            case 'hs_code':
                              return (
                                <td key={colKey} className="p-2.5">
                                  <input
                                    type="text"
                                    value={it.hs_code}
                                    onChange={e => handleUpdateItem(it.id, 'hs_code', e.target.value)}
                                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-center font-mono text-[11px] text-slate-700"
                                  />
                                </td>
                              )
                            case 'coo':
                              return (
                                <td key={colKey} className="p-2.5">
                                  <input
                                    type="text"
                                    value={it.country_of_origin}
                                    onChange={e => handleUpdateItem(it.id, 'country_of_origin', e.target.value)}
                                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-700"
                                  />
                                </td>
                              )
                            case 'price':
                              return (
                                <td key={colKey} className="p-2.5 text-right font-mono">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={it.unit_price}
                                    onChange={e => handleUpdateItem(it.id, 'unit_price', Number(e.target.value))}
                                    className="w-16 border border-slate-200 rounded px-1 py-1 text-right text-xs font-bold"
                                  />
                                  <span className="block text-[10px] text-slate-400 mt-0.5">
                                    Tot: {it.total_price}
                                  </span>
                                </td>
                              )
                            case 'actions':
                              return (
                                <td key={colKey} className="p-2.5 text-center">
                                  <div className="flex items-center justify-center space-x-1">
                                    <button
                                      type="button"
                                      disabled={!rowHasMtc}
                                      onClick={() => handleOpenCreateCertificate(it.id)}
                                      className="p-1 rounded text-indigo-600 hover:bg-indigo-50 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
                                      title={rowHasMtc ? 'Create & customize EN 10204 3.1 Certificate for this item' : disabledMtcReason}
                                    >
                                      <FileCheck2 className="h-4 w-4" />
                                    </button>

                                    <button
                                      onClick={() => handleSplitItem(idx)}
                                      className="p-1 rounded text-orange-600 hover:bg-orange-50"
                                      title="Split Item (Multi-Heat / Partial Quantity)"
                                    >
                                      <Split className="h-4 w-4" />
                                    </button>

                                    <button
                                      onClick={() => handleDeleteItem(it.id)}
                                      className="p-1 rounded text-red-500 hover:bg-red-50"
                                      title="Delete line"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              )
                          }
                        }

                        return (
                        <tr
                          key={it.id}
                          className={`hover:bg-slate-50/70 transition-colors ${selectedItemIds.has(it.id) ? 'bg-amber-50/30' : ''
                            } ${it.is_machined ? 'bg-amber-50/40' : ''
                            }`}
                        >
                          {/* Select Checkbox & Local PO Button */}
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={selectedItemIds.has(it.id)}
                              onChange={() => toggleSelectItem(it.id)}
                              className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                              title="Select item"
                            />
                            <button
                              type="button"
                              disabled={rowInStock}
                              onClick={() => {
                                const newSet = new Set(selectedItemIds)
                                newSet.add(it.id)
                                setSelectedItemIds(newSet)
                                setActivePortalTab('purchase_order')
                              }}
                              className="mt-1 block mx-auto text-[9px] font-bold text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed px-1 py-0.5 rounded cursor-pointer transition-colors"
                              title={rowInStock ? 'Available in stock — Local Purchase disabled' : 'Select this non-stock item and open Local PO tab'}
                            >
                              PO
                            </button>
                          </td>

                          {/* SL NO */}
                          <td className="p-2.5 text-center font-bold text-slate-700">
                            {it.sl_no}
                          </td>

                          {visibleColumns.map(colKey => renderCell(colKey))}
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
      )}

            {/* Drafts Modal */}
            {isDraftsModalOpen && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col p-6 shadow-xl border border-slate-200 overflow-hidden">
                  <div className="flex justify-between items-center gap-2 pb-3 border-b border-slate-200 mb-4 shrink-0">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span>Saved Sourcing Drafts &amp; Worksheets</span>
                    </h3>
                    <button
                      onClick={() => setIsDraftsModalOpen(false)}
                      className="text-slate-400 hover:text-slate-600 text-base"
                    >
                      ✕
                    </button>
                  </div>

                  {draftsList.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No saved drafts found. Click &quot;Save Draft&quot; on any worksheet to preserve your progress.
                    </div>
                  ) : (
                    <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                      {draftsList.map(draft => (
                        <div
                          key={draft.id}
                          className="p-3 border border-slate-200 rounded-md hover:bg-slate-50 flex items-center justify-between"
                        >
                          <div>
                            <h4 className="font-semibold text-xs text-slate-800">
                              {draft.msg_ref} — {draft.client}
                            </h4>
                            <p className="text-[11px] text-slate-500 font-mono">
                              PO: {draft.po_number} | {draft.items.length} items | Saved: {new Date(draft.saved_at || '').toLocaleString()}
                            </p>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleRestoreDraft(draft)}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => {
                                if (draft.id) deleteSourcingDraft(draft.id)
                                setDraftsList(getSourcingDrafts())
                              }}
                              className="text-red-500 hover:text-red-700 p-1.5"
                              title="Delete draft"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Excel Deliverables Preview Modal */}
            <ExcelDeliverablesPreviewModal
              isOpen={isPreviewModalOpen}
              onClose={() => setIsPreviewModalOpen(false)}
              initialTab={previewTab}
              data={currentWorksheetData}
              filterMachinedOnly={filterMachinedOnly}
            />

            {/* Local Purchase & Supplier Allocation Modal */}
            <LocalPurchaseAllocationModal
              isOpen={isLocalPurchaseModalOpen}
              onClose={() => setIsLocalPurchaseModalOpen(false)}
              data={currentWorksheetData}
              onApplyLocalPurchase={updatedItems => {
                setItems(updatedItems)
                syncItemsToOrder(updatedItems)
              }}
              showToast={msg => setStatusNotice(msg)}
            />
          </div>
          )
}
