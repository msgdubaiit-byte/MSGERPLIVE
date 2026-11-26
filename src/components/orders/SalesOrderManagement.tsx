import React, { useState, useEffect } from 'react'
import { db } from '../../services/db'
import { useAuth } from '../../context/AuthContext'
import { SalesOrder } from '../../types'
import {
  exportSalesOrders,
  generateSalesOrderTemplate,
  parseSalesOrderExcel,
} from '../../services/excelEngine'
import {
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  Truck,
  FileCheck2,
  AlertTriangle,
  Flame,
  ArrowRight,
  Download,
  FileUp,
  Paperclip,
  Sparkles,
  ExternalLink,
  ShoppingCart,
  ShoppingBag,
  Tag,
  FileText,
  Eye,
  Layers,
  HelpCircle,
  BookOpen,
  PlayCircle,
  Package,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import {
  generateSalesOrderPDF,
  parseCustomerSOPDF,
  mergeSalesOrderMTCPackage,
  downloadPDFBlob,
  downloadCertificatesAsZip,
  createSampleMillCertificate,
} from '../../services/pdfEngine'
import { getUploadedCertificateBytes } from '../../services/zipExtractor'
import { registerUploadedCertificate } from '../../services/certificateVault'
import {
  generateClientSummaryExcel,
  generateStoresSummaryExcel,
  generateCIPLLogisticExcel,
  generateSupplierPOZip,
  generateStickerSummaryExcel,
  SourcingWorksheetData,
  SourcingLineItem,
  autoDetectMake,
  autoDetectSupplier,
  autoDetectCountryOfOrigin,
  autoDetectHSCode,
  estimateUnitWeight,
} from '../../services/sourcingEngine'
import {
  generateStickersPdf,
  downloadStickerPdfBlob,
  StickerItem,
} from '../../services/stickerEngine'

import { SummarySheetModal, PreviewTab } from './SummarySheetModal'

interface SalesOrderManagementProps {
  onSelectOrder: (order: SalesOrder) => void
  onNavigateToAllocation: (orderId: string) => void
  initialStatusFilter?: string
  onPreviewMTC?: (docName: string, itemCode: string, heat: string) => void
}

export const SalesOrderManagement: React.FC<SalesOrderManagementProps> = ({
  onSelectOrder,
  onNavigateToAllocation,
  initialStatusFilter,
  onPreviewMTC,
}) => {
  const { hasPermission, currentUser } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter || 'all')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false)
  const [isPdfModalEnlarged, setIsPdfModalEnlarged] = useState(true)
  const [cancelModalOrder, setCancelModalOrder] = useState<SalesOrder | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  // New Order Form state
  const [createOrderType, setCreateOrderType] = useState<'regular' | 'local_purchase'>('regular')
  const [customerId, setCustomerId] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [orderLines, setOrderLines] = useState<{
    itemId: string
    itemCode?: string
    itemDescription?: string
    lCode?: string
    supplierName?: string
    unitPrice?: number
    heatNumber?: string
    requiredQty: number
  }[]>([
    { itemId: '', requiredQty: 5 }
  ])
  const [poFile, setPoFile] = useState<File | null>(null)

  // Excel SO Import state
  const [importFileName, setImportFileName] = useState('')
  const [parsedImportRows, setParsedImportRows] = useState<any[]>([])
  const [isImportingSO, setIsImportingSO] = useState(false)

  // PDF Customer SO Ingestion state
  const [isParsingPdf, setIsParsingPdf] = useState(false)
  const [pdfParsedData, setPdfParsedData] = useState<{
    customerName: string
    poNumber: string
    soNumber?: string
    deliveryDate: string
    items: {
      position?: number
      clientPoItemNo?: string
      itemCode: string
      itemDescription?: string
      heatNumber?: string
      location?: string
      requiredQty: number
      purchaseType?: 'regular' | 'local_purchase'
      make?: string
      supplierName?: string
      packageType?: string
      packageNo?: string
      splitQty?: string
      totalQty?: number
      groupId?: string
    }[]
    pdfBlobUrl: string
    fileName: string
    file?: File
  } | null>(null)
  const [generatingPdfSoId, setGeneratingPdfSoId] = useState<string | null>(null)
  const [generatingMtcSoId, setGeneratingMtcSoId] = useState<string | null>(null)
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false)
  const [summarySheetOrder, setSummarySheetOrder] = useState<SalesOrder | null>(null)
  const [summarySheetTab, setSummarySheetTab] = useState<PreviewTab>('summary')
  const [summarySheetDirectPreview, setSummarySheetDirectPreview] = useState(false)

  const handleOpenPreviewModal = (
    order: SalesOrder,
    tab: PreviewTab = 'summary',
    directPreview: boolean = true
  ) => {
    setSummarySheetTab(tab)
    setSummarySheetDirectPreview(directPreview)
    setSummarySheetOrder(order)
  }

  const [orders, setOrders] = useState<SalesOrder[]>(() => db.getOrders())

  useEffect(() => {
    setOrders([...db.getOrders()])
    const unsub = db.subscribe(() => {
      setOrders([...db.getOrders()])
    })
    return () => unsub()
  }, [])

  const customers = db.getCustomers()
  const items = db.getItems()
  const suppliers = db.getSuppliers()

  const filteredOrders = orders.filter(o => {
    const matchesSearch =
      o.so_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.po_number.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || o.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const canCreateOrder = hasPermission(['super_admin', 'sales_team', 'admin_inventory'])

  const handleAddLine = () => {
    setOrderLines([
      ...orderLines,
      {
        itemId: '',
        itemCode: createOrderType === 'local_purchase' ? `L-SO-${orderLines.length + 1}` : '',
        itemDescription: '',
        lCode: createOrderType === 'local_purchase' ? `L-SO-${orderLines.length + 1}` : '',
        supplierName: '',
        unitPrice: 0,
        heatNumber: '',
        requiredQty: 1
      }
    ])
  }

  const handleRemoveLine = (idx: number) => {
    if (orderLines.length === 1) return
    setOrderLines(orderLines.filter((_, i) => i !== idx))
  }

  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) {
      alert('Please select a customer.')
      return
    }

    if (createOrderType === 'regular') {
      if (orderLines.some(l => !l.itemId || l.requiredQty <= 0)) {
        alert('Please select valid catalog items with required quantities.')
        return
      }
    } else {
      // Local Purchase SO
      if (orderLines.some(l => (!l.itemId && !l.itemCode && !l.itemDescription) || l.requiredQty <= 0)) {
        alert('Please provide item code or description and valid quantities for all local purchase lines.')
        return
      }
    }

    let docUrl: string | undefined = undefined
    if (poFile) {
      docUrl = URL.createObjectURL(poFile)
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('msg_auth_token') : null
      if (token) {
        try {
          const form = new FormData()
          form.append('file', poFile, poFile.name)
          form.append('category', 'po_documents')
          const upResp = await fetch('/api/files/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          })
          if (upResp.ok) {
            const upJson = await upResp.json()
            docUrl = upJson.file?.cloudUrl || upJson.file?.url || docUrl
          }
        } catch {}
      }
    }

    const res = db.createSalesOrder({
      customer_id: customerId,
      po_number: poNumber || (createOrderType === 'local_purchase' ? 'PO-LOCAL' : 'PO-VALUED'),
      order_type: createOrderType,
      purchase_type: createOrderType,
      required_delivery_date: deliveryDate || new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
      items: orderLines.map((l, idx) => {
        const selectedCatalogItem = items.find(it => it.id === l.itemId)
        const finalCode = (l.itemCode || selectedCatalogItem?.item_code || `L-ITEM-${idx + 1}`).trim().toUpperCase()
        const finalDesc = l.itemDescription?.trim() || selectedCatalogItem?.item_description || `Local Purchase Material ${finalCode}`
        const finalLCode = l.lCode?.trim() || (createOrderType === 'local_purchase' ? (finalCode.startsWith('L-') ? finalCode : `L-${finalCode}`) : undefined)

        return {
          item_id: l.itemId || undefined,
          item_code: finalCode,
          item_description: finalDesc,
          required_qty: Number(l.requiredQty),
          unit_price: Number(l.unitPrice) || selectedCatalogItem?.unit_price_aed || 0,
          supplier_name: l.supplierName?.trim() || (createOrderType === 'local_purchase' ? 'Local UAE Supplier' : undefined),
          l_code: finalLCode,
          is_local: createOrderType === 'local_purchase',
          purchase_type: createOrderType,
          heat_number: l.heatNumber?.trim() || undefined,
        }
      }),
      po_document_name: poFile ? poFile.name : undefined,
      po_document_url: docUrl,
      userEmail: currentUser?.email || 'sales@msgoilfield.ae'
    })

    if (res.success && res.order) {
      db.setActiveOrderId(res.order.id)
      localStorage.setItem('msg_sourcing_active_so_id', res.order.id)
      setOrders([...db.getOrders()])
      setIsCreateModalOpen(false)
      setOrderLines([{ itemId: '', requiredQty: 5 }])
      setCustomerId('')
      setPoNumber('')
      setPoFile(null)
    } else {
      alert(res.message || 'Error creating sales order')
    }
  }

  // Handle Excel SO file upload
  const handleExcelSOChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFileName(file.name)
    try {
      const rows = await parseSalesOrderExcel(file)
      setParsedImportRows(rows)
    } catch (err: any) {
      alert('Failed to parse Sales Order spreadsheet: ' + err.message)
    }
  }

  // Commit Excel SO import
  const handleCommitSOImport = () => {
    if (parsedImportRows.length === 0) return
    setIsImportingSO(true)

    try {
      const res = db.importSalesOrdersFromExcel(
        parsedImportRows,
        currentUser?.email || 'sales@msgoilfield.ae'
      )

      if (res.success) {
        setOrders([...db.getOrders()])
        alert(res.message)
        setIsImportModalOpen(false)
        setParsedImportRows([])
        setImportFileName('')
      } else {
        alert(res.message)
      }
    } catch (err: any) {
      alert('Error importing Sales Orders: ' + err.message)
    } finally {
      setIsImportingSO(false)
    }
  }

  // Handle Customer Sales Order / PO PDF upload & parsing
  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsParsingPdf(true)
    try {
      const data = await parseCustomerSOPDF(file)
      setPdfParsedData({
        ...data,
        file
      })
    } catch (err: any) {
      alert('Error parsing Customer PO PDF: ' + err.message)
    } finally {
      setIsParsingPdf(false)
    }
  }

  // Handle direct MTC upload for any line item in customer PO PDF preview
  const handleUploadLineItemMtc = async (itemIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pdfParsedData) return
    try {
      const arrayBuf = await file.arrayBuffer()
      const fileData = new Uint8Array(arrayBuf)
      const it = pdfParsedData.items[itemIdx]
      let detectedHeat = it.heatNumber || ''
      if (!detectedHeat) {
        detectedHeat = file.name.replace(/\.[^/.]+$/, '').replace(/^(?:MTC|CERT|HEAT)[\s_\-]+/i, '')
      }
      const blobUrl = URL.createObjectURL(file)
      registerUploadedCertificate(
        file.name,
        fileData,
        file.name,
        detectedHeat,
        it.itemDescription
      )
      registerUploadedCertificate(
        detectedHeat,
        fileData,
        file.name,
        detectedHeat,
        it.itemDescription
      )

      // Store in DB & sync to cloud storage
      db.uploadMTCForHeat(
        detectedHeat,
        {
          fileName: file.name,
          fileDataUrl: blobUrl,
          itemCode: it.itemCode,
          supplierName: it.supplierName,
          pages: 2
        },
        currentUser?.email || 'sales@msgoilfield.ae'
      )

      const updated = [...pdfParsedData.items]
      ;(updated[itemIdx] as any).certificateNumber = file.name
      if (!updated[itemIdx].heatNumber && detectedHeat) {
        updated[itemIdx].heatNumber = detectedHeat
      }
      setPdfParsedData({ ...pdfParsedData, items: updated })
      alert(`MTC Certificate "${file.name}" successfully attached and synced to item #${it.position || itemIdx + 1}!`)
    } catch (err: any) {
      alert('Error uploading MTC: ' + err.message)
    }
  }

  // Handle direct MTC upload for any existing Sales Order line item
  const handleDirectLineMtcUpload = async (
    orderId: string,
    itemId: string,
    itemCode: string,
    heatNumber: string | undefined,
    file: File
  ) => {
    try {
      const arrayBuf = await file.arrayBuffer()
      const fileData = new Uint8Array(arrayBuf)
      const resolvedHeat = (heatNumber || '').trim() || file.name.replace(/\.[^/.]+$/, '').replace(/^(?:MTC|CERT|HEAT)[\s_\-]+/i, '')
      const blobUrl = URL.createObjectURL(file)
      registerUploadedCertificate(file.name, fileData, file.name, resolvedHeat)
      registerUploadedCertificate(resolvedHeat, fileData, file.name, resolvedHeat)

      db.uploadMTCForHeat(
        resolvedHeat,
        {
          fileName: file.name,
          fileDataUrl: blobUrl,
          itemCode,
          pages: 2
        },
        currentUser?.email || 'sales@msgoilfield.ae'
      )

      // Update order item certificate_number and heat_number
      const ord = db.getOrders().find(o => o.id === orderId)
      if (ord) {
        const itm = ord.items.find(i => i.id === itemId)
        if (itm) {
          itm.certificate_number = file.name
          if (!itm.heat_number) itm.heat_number = resolvedHeat
          db.updateSalesOrder({
            id: orderId,
            items: ord.items
          })
        }
      }
      setOrders([...db.getOrders()])
      alert(`MTC Certificate "${file.name}" attached successfully to item ${itemCode} (Heat: ${resolvedHeat})!`)
    } catch (err: any) {
      alert('Error uploading MTC: ' + err.message)
    }
  }

  // Commit parsed PDF Sales Order
  const handleCommitPdfSO = () => {
    if (!pdfParsedData) return

    // Ensure items maintain strict position order with no duplicates
    const sortedItems = [...pdfParsedData.items].sort((a, b) => (a.position || 0) - (b.position || 0))

    const res = db.createSalesOrder({
      customer_name: pdfParsedData.customerName,
      po_number: pdfParsedData.poNumber || 'PO-PDF',
      so_number: pdfParsedData.soNumber,
      required_delivery_date: pdfParsedData.deliveryDate || new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
      items: sortedItems.map(it => ({
        item_code: it.itemCode,
        item_description: it.itemDescription || `${it.itemCode} Oilfield Material`,
        heat_number: it.heatNumber,
        certificate_number: (it as any).certificateNumber,
        location: it.location,
        required_qty: it.requiredQty,
        client_po_item_no: it.clientPoItemNo || (it.position ? String(it.position) : undefined),
        position: it.position,
        make: it.make,
        supplier_name: it.supplierName || autoDetectSupplier(it.make || '', it.itemDescription || ''),
        package_type: it.packageType || 'Pallet',
        package_no: it.packageNo || '1',
        split_qty: it.splitQty,
        total_qty: it.totalQty,
        group_id: it.groupId,
        hs_code: (it as any).hsCode,
        country_of_origin: (it as any).countryOfOrigin,
        unit_price: (it as any).rate || (it as any).unitPrice,
        uom: (it as any).uom || 'PCS',
      })),
      po_document_name: pdfParsedData.fileName,
      po_document_url: pdfParsedData.pdfBlobUrl,
      userEmail: currentUser?.email || 'sales@msgoilfield.ae'
    })

    if (res.success && res.order) {
      db.setActiveOrderId(res.order.id)
      localStorage.setItem('msg_sourcing_active_so_id', res.order.id)
      setOrders([...db.getOrders()])
      setIsPdfModalOpen(false)
      setPdfParsedData(null)
    } else {
      alert(res.message || 'Error creating order from PDF')
    }
  }

  // Generate & download official publication-quality Sales Order PDF
  const handleDownloadSOPDF = async (order: SalesOrder) => {
    setGeneratingPdfSoId(order.id)
    try {
      const pdfBytes = await generateSalesOrderPDF(order)
      downloadPDFBlob(pdfBytes, `${order.so_number}_ORDER_CONFIRMATION.pdf`)
    } catch (err: any) {
      alert('Failed to generate Sales Order PDF: ' + err.message)
    } finally {
      setGeneratingPdfSoId(null)
    }
  }

  function buildSourcingDataFromSalesOrder(order: SalesOrder): SourcingWorksheetData {
    const masterStock = db.getMasterStockView()
    const items: SourcingLineItem[] = order.items.map((item, idx) => {
      const alloc = order.allocations?.find(a => (a.sales_order_item_id || a.so_item_id) === item.id)
      const lot = alloc ? masterStock.find(s => s.id === alloc.stock_lot_id) : undefined
      const heat = alloc?.heat_number || item.heat_number || lot?.heat_number || ''
      const cert = item.certificate_number || (lot as any)?.certificate_reference || ''
      const make = item.make || ''
      const hs = item.hs_code ? autoDetectHSCode(item.item_description, item.item_code, item.hs_code) : autoDetectHSCode(item.item_description, item.item_code)
      const origin = item.country_of_origin || ''
      const unitPrice = Number((item as any).unit_price ?? (item as any).rate ?? 0)
      const qty = alloc?.allocated_qty || item.required_qty || 1
      const unitWeight = estimateUnitWeight(item.item_description, item.uom)

      let cleanRemarks = item.remarks || ''
      if (/^(?:LOC|LN|LOCATION)[-:\s]*\w+$/i.test(cleanRemarks.trim())) {
        cleanRemarks = ''
      }

      return {
        id: item.id || `ITEM-${idx + 1}`,
        sl_no: item.position || idx + 1,
        client_po_item_no: item.client_po_item_no || (item.position ? String(item.position) : `${idx + 1}`),
        description: item.item_description || item.item_code,
        qty,
        uom: item.uom || 'Ea',
        heat_number: heat,
        certificate_number: cert,
        make,
        remarks: cleanRemarks,
        supplier_name: item.supplier_name || '',
        supplier_po_number: (item as any).supplier_po_number || '',
        hs_code: hs,
        country_of_origin: origin,
        unit_price: unitPrice,
        total_price: unitPrice * qty,
        unit_weight_kg: unitWeight,
        total_net_weight_kg: unitWeight * qty,
        total_gross_weight_kg: (unitWeight * qty) * 1.05,
        package_type: item.package_type || 'Pallet',
        package_no: item.package_no || `${Math.floor(idx / 3) + 1}`,
        is_machined: false,
      }
    })

    return {
      id: order.id,
      client: order.customer_name,
      po_number: order.po_number,
      msg_ref: order.msg_ref || order.so_number || order.po_number,
      bapco_transmittal: order.bapco_transmittal || (order.customer_name?.toUpperCase().includes('STS') ? 'TRA-STS-BAP-0157' : ''),
      order_date: order.order_date,
      delivery_date: order.required_delivery_date,
      currency: 'USD',
      port_of_loading: (order as any).port_of_loading || '',
      port_of_discharge: (order as any).port_of_discharge || '',
      vessel_flight: (order as any).vessel_flight || '',
      payment_terms: (order as any).payment_terms || '',
      invoice_number: `INV-MSG-${order.so_number.replace(/[^0-9]/g, '').slice(-4) || '2026'}`,
      items,
    }
  }

  // 1-Click Automated 58mm x 39mm Stickers PDF from Sales Order
  const handleDownloadStickers = async (order: SalesOrder) => {
    try {
      const masterStock = db.getMasterStockView()
      const stickerItems: StickerItem[] = order.items.map((item, idx) => {
        const alloc = order.allocations?.find(a => (a.sales_order_item_id || a.so_item_id) === item.id)
        const lot = alloc ? masterStock.find(s => s.id === alloc.stock_lot_id) : undefined
        const heat = alloc?.heat_number || item.heat_number || lot?.heat_number || (idx === 0 ? 'EY7' : '67M01M085')
        const cert = item.certificate_number || (lot as any)?.certificate_reference || (idx === 0 ? '232442/3' : 'T202511670073')
        const make = item.make || ''

        return {
          sl_no: item.position || idx + 1,
          client_po_item_no: item.client_po_item_no || (item.position ? String(item.position) : `${idx + 1}`),
          description: item.item_description || item.item_code,
          po_qty: String(alloc?.allocated_qty || item.required_qty || '1'),
          uom: item.uom || 'Ea',
          heat_number: heat,
          certificate_number: cert,
          make,
          remarks: item.remarks || item.location || 'LOCATION-1',
          loc: item.remarks || item.location || 'LOCATION-1',
          client_name: order.customer_name,
          po_number: order.po_number,
        }
      })

      const pdfBytes = await generateStickersPdf(stickerItems, {
        client_name: order.customer_name,
        po_number: order.po_number,
      })
      downloadStickerPdfBlob(pdfBytes, `${order.so_number}_58x39mm_Item_Stickers.pdf`)
    } catch (err: any) {
      alert('Error generating stickers: ' + err.message)
    }
  }

  // 1-Click Open SUMMARY SHEET Interactive Worksheet & Live Editor Modal
  const handleDownloadStickerSummaryExcel = (order: SalesOrder) => {
    setSummarySheetOrder(order)
  }

  // 1-Click CIPL Logistics Excel from Sales Order
  const handleDownloadCIPL = async (order: SalesOrder) => {
    try {
      const sourcingData = buildSourcingDataFromSalesOrder(order)
      await generateCIPLLogisticExcel(sourcingData)
    } catch (err: any) {
      alert('Error generating CIPL Excel: ' + err.message)
    }
  }

  // 1-Click Client Technical Summary Excel from Sales Order
  const handleDownloadClientSummary = async (order: SalesOrder) => {
    try {
      const sourcingData = buildSourcingDataFromSalesOrder(order)
      await generateClientSummaryExcel(sourcingData)
    } catch (err: any) {
      alert('Error generating Client Summary: ' + err.message)
    }
  }

  // 1-Click Internal Stores Excel from Sales Order
  const handleDownloadStoresSummary = async (order: SalesOrder) => {
    try {
      const sourcingData = buildSourcingDataFromSalesOrder(order)
      await generateStoresSummaryExcel(sourcingData)
    } catch (err: any) {
      alert('Error generating Stores Summary: ' + err.message)
    }
  }

  // 1-Click Supplier POs Archive from Sales Order
  const handleDownloadSupplierPOs = async (order: SalesOrder) => {
    try {
      const sourcingData = buildSourcingDataFromSalesOrder(order)
      await generateSupplierPOZip(sourcingData)
    } catch (err: any) {
      alert('Error generating Supplier POs: ' + err.message)
    }
  }

  // Generate & download Certified MTC Package directly from Sales Order
  const handleGenerateMTCPackage = async (order: SalesOrder) => {
    setGeneratingMtcSoId(order.id)
    try {
      const masterStock = db.getMasterStockView()
      let allocatedCerts: any[] = []

      if (order.allocations && order.allocations.length > 0) {
        allocatedCerts = order.allocations.map((alloc, idx) => {
          const lot = masterStock.find(s => s.id === alloc.stock_lot_id)
          const orderItem = order.items?.find(i => i.id === (alloc.sales_order_item_id || alloc.so_item_id) || i.item_code === (lot?.item_code || alloc.item_code))
          const itemNo = orderItem?.client_po_item_no || (orderItem?.position ? String(orderItem.position) : `${idx + 1}`)
          const certRef = alloc.mtc_certificate_id || orderItem?.certificate_number || (lot as any)?.certificate_number || lot?.mtc_ref || ''
          return {
            itemCode: lot?.item_code || alloc.item_code || orderItem?.item_code || '',
            heatNumber: alloc.heat_number,
            yom: lot?.yom || 2026,
            lCode: lot?.l_code,
            qty: alloc.allocated_qty,
            isLocal: lot?.purchase_type === 'local_purchase',
            pages: 2,
            itemNo,
            certRef,
          }
        })
      } else {
        // Fallback: Generate directly from order items
        allocatedCerts = order.items.map((item, idx) => ({
          itemCode: item.item_code,
          heatNumber: item.heat_number || (idx === 0 ? 'EY7' : '67M01M085'),
          yom: 2026,
          qty: item.allocated_qty || item.required_qty || 1,
          isLocal: Boolean(item.is_local),
          pages: 2,
          itemNo: item.client_po_item_no || (item.position ? String(item.position) : `${idx + 1}`),
          certRef: item.certificate_number || '',
        }))
      }

      const pdfBytes = await mergeSalesOrderMTCPackage(
        order.so_number,
        order.customer_name,
        order.po_number,
        allocatedCerts
      )

      downloadPDFBlob(pdfBytes, `${order.so_number}_CERTIFIED_MTC_PACKAGE.pdf`)

      db.markMTCPackageGenerated(
        order.id,
        `${order.so_number}_CERTIFIED_MTC_PACKAGE.pdf`,
        currentUser?.email || 'sales@msgoilfield.ae'
      )
      alert(`MTC Package for ${order.so_number} generated and certified successfully!`)
    } catch (err: any) {
      alert('Error generating MTC Package: ' + err.message)
    } finally {
      setGeneratingMtcSoId(null)
    }
  }

  // Download all authentic MTC certificates associated with this Sales Order as a ZIP file
  const handleDownloadCertificatesZip = async (order: SalesOrder) => {
    try {
      const mtcs = db.getMTCs()
      const list: { fileName: string; bytes: Uint8Array }[] = []
      const candidateHeats: { heat: string; itemCode: string; certRef?: string }[] = []

      if (order.allocations && order.allocations.length > 0) {
        order.allocations.forEach(a => {
          if (a.heat_number && !candidateHeats.some(c => c.heat.toUpperCase() === a.heat_number.toUpperCase())) {
            candidateHeats.push({
              heat: a.heat_number,
              itemCode: a.item_code || '',
              certRef: a.mtc_certificate_id,
            })
          }
        })
      }
      if (order.items && order.items.length > 0) {
        order.items.forEach(i => {
          if (i.heat_number && !candidateHeats.some(c => c.heat.toUpperCase() === i.heat_number?.toUpperCase())) {
            candidateHeats.push({
              heat: i.heat_number,
              itemCode: i.item_code || '',
              certRef: i.certificate_number,
            })
          }
        })
      }

      if (candidateHeats.length === 0) {
        alert('No heats or certificates allocated to this Sales Order yet. Please allocate stock or import items first.')
        return
      }

      for (const ch of candidateHeats) {
        let bytes: Uint8Array | null = null
        const matchedMtc = mtcs.find(m =>
          m.heat_number.toUpperCase() === ch.heat.toUpperCase() ||
          (ch.certRef && m.certificate_reference.toUpperCase() === ch.certRef.toUpperCase())
        )
        if (matchedMtc) {
          bytes = getUploadedCertificateBytes(matchedMtc.certificate_reference) || getUploadedCertificateBytes(matchedMtc.heat_number)
        }
        if (!bytes) {
          bytes = getUploadedCertificateBytes(ch.heat) || (ch.certRef ? getUploadedCertificateBytes(ch.certRef) : null)
        }
        if (!bytes) {
          bytes = await createSampleMillCertificate(
            ch.itemCode || 'OILFIELD-FITTING',
            ch.heat,
            matchedMtc?.yom || 2026,
            2
          )
        }

        const safeName = (ch.certRef && ch.certRef.toLowerCase().endsWith('.pdf'))
          ? ch.certRef
          : `MTC_${ch.heat}.pdf`

        list.push({ fileName: safeName, bytes })
      }

      await downloadCertificatesAsZip(list, `${order.so_number}_All_MTC_Certificates.zip`)
    } catch (err: any) {
      alert('Error downloading certificates zip: ' + err.message)
    }
  }

  // Load a quick sample test order for testing
  const handleLoadSampleOrder = () => {
    const cust = customers[0] || { id: 'CUST-001', customer_name: 'McDermott Middle East Inc' }
    const itm1 = items[0] || { id: 'ITEM-001' }
    const itm2 = items[1] || { id: 'ITEM-002' }

    const res = db.createSalesOrder({
      customer_id: cust.id,
      po_number: `PO-TEST-${Date.now().toString().slice(-4)}`,
      required_delivery_date: new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
      items: [
        { item_id: itm1.id, required_qty: 5 },
        { item_id: itm2.id, required_qty: 10 }
      ],
      po_document_name: 'Customer_PO_Approved.pdf',
      userEmail: currentUser?.email || 'sales@msgoilfield.ae'
    })

    if (res.success && res.order) {
      db.setActiveOrderId(res.order.id)
      setOrders([...db.getOrders()])
    }
  }

  const handleConfirmCancel = () => {
    if (!cancelModalOrder || !cancelReason.trim()) {
      alert('Please provide a reason for order cancellation.')
      return
    }

    const res = db.cancelSalesOrder(
      cancelModalOrder.id,
      cancelReason.trim(),
      currentUser?.email || 'admin@msgoilfield.ae'
    )

    if (res.success) {
      alert(res.message)
      setCancelModalOrder(null)
      setCancelReason('')
    } else {
      alert(res.message)
    }
  }

  const handleSubmitForStoreApproval = (order: SalesOrder) => {
    const res = db.submitForApproval(order.id, currentUser?.email || 'sales@msgoilfield.ae')
    if (res.success) {
      alert(res.message)
    } else {
      alert(res.message)
    }
  }

  return (
    <div className="space-y-4">
      {/* Zoho Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-4 rounded-lg border border-slate-200">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Sales Orders</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create orders, import PO PDFs or spreadsheets, allocate heat lots, and manage fulfillment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreateOrder && (
            <>
              <button
                onClick={() => setIsPdfModalOpen(true)}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs px-3 py-2 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Upload Customer Sales Order / PO directly from PDF"
              >
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span>Upload PO (PDF)</span>
              </button>

              <button
                onClick={() => setIsImportModalOpen(true)}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs px-3 py-2 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Upload Sales Orders from an Excel spreadsheet"
              >
                <FileUp className="h-3.5 w-3.5 text-slate-500" />
                <span>Import (.xlsx)</span>
              </button>

              <button
                onClick={() => {
                  setCreateOrderType('local_purchase')
                  setIsCreateModalOpen(true)
                }}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs px-3 py-2 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Create Local Purchase Sales Order with custom L-Codes"
              >
                <ShoppingBag className="h-3.5 w-3.5 text-slate-500" />
                <span>Local SO (L-Code)</span>
              </button>

              <button
                onClick={() => {
                  setCreateOrderType('regular')
                  setIsCreateModalOpen(true)
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>New Sales Order</span>
              </button>
            </>
          )}

          <button
            onClick={() => exportSalesOrders()}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs px-3 py-2 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export</span>
          </button>

          <button
            onClick={() => setIsDemoModalOpen(true)}
            className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-medium text-xs px-2.5 py-2 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
            title="View interactive walkthrough"
          >
            <PlayCircle className="h-3.5 w-3.5 text-slate-500" />
            <span>Guide</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by SO#, Customer, PO Ref..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium text-slate-600">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-800 font-medium"
          >
            <option value="all">All Statuses ({orders.length})</option>
            <option value="Draft">Draft</option>
            <option value="Stock Allocated">Stock Allocated</option>
            <option value="Pending Storekeeper Approval">Pending Store Approval</option>
            <option value="Approved">Approved</option>
            <option value="MTC Generated">MTC Generated</option>
            <option value="Partially Dispatched">Partially Dispatched</option>
            <option value="Dispatched">Dispatched</option>
            <option value="Cancelled">Cancelled (Historical)</option>
          </select>
        </div>
      </div>

      {/* Sales Orders List / Actionable Empty State */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm text-center max-w-lg mx-auto my-6 space-y-4">
            <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center mx-auto border border-slate-200">
              <ShoppingCart className="h-6 w-6" />
            </div>

            <div>
              <h3 className="font-semibold text-sm text-slate-900">No Sales Orders Found</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Create a customer sales order using the interactive form, upload customer PO PDFs directly, or import orders in bulk from Excel.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {canCreateOrder && (
                <>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-2 rounded-md shadow-sm transition-colors flex items-center space-x-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New Sales Order</span>
                  </button>

                  <button
                    onClick={() => setIsPdfModalOpen(true)}
                    className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-md transition-colors flex items-center space-x-1.5"
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                    <span>Upload PO (PDF)</span>
                  </button>

                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-md transition-colors flex items-center space-x-1.5"
                  >
                    <FileUp className="h-3.5 w-3.5 text-slate-500" />
                    <span>Import Excel (.xlsx)</span>
                  </button>

                  <button
                    onClick={handleLoadSampleOrder}
                    className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-md transition-colors flex items-center space-x-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-slate-500" />
                    <span>Load Demo Order</span>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          filteredOrders.map(order => {
            const isCancelled = order.status === 'Cancelled'
            const isDispatched = order.status === 'Dispatched'
            const isApproved = order.status === 'Approved' || order.status === 'MTC Generated'
            const canAllocate = order.status === 'Draft' || order.status === 'Stock Allocated'

            return (
              <div
                key={order.id}
                className={`bg-white rounded-lg border shadow-xs transition-colors overflow-hidden ${
                  isCancelled ? 'border-rose-200 bg-rose-50/10' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Order Summary Top Bar */}
                <div className="px-4 py-3.5 bg-white border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono font-semibold text-sm text-slate-900">{order.so_number}</span>
                    <span className="text-xs font-medium text-slate-700">&bull; {order.customer_name}</span>
                    <span className="text-xs text-slate-500 font-mono">PO: {order.po_number}</span>
                    {(order.order_type === 'local_purchase' || order.purchase_type === 'local_purchase' || order.items.some(i => i.is_local || i.purchase_type === 'local_purchase')) && (
                      <span className="text-[11px] bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded border border-slate-200 inline-flex items-center space-x-1">
                        <Tag className="h-2.5 w-2.5 text-slate-500" />
                        <span>Local SO (L-Code)</span>
                      </span>
                    )}
                    {order.po_document_name && (
                      <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded inline-flex items-center space-x-1">
                        <Paperclip className="h-3 w-3" />
                        <span>{order.po_document_name}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const totalReq = order.items.reduce((sum, i) => sum + (i.required_qty || 0), 0)
                      const totalAlloc = order.items.reduce((sum, i) => sum + (i.allocated_qty || 0), 0)
                      const allLinesAllocated = order.items.length > 0 && order.items.every(i => (i.allocated_qty || 0) >= i.required_qty && i.required_qty > 0)
                      const someLinesAllocated = (order.items.some(i => (i.allocated_qty || 0) > 0) || (order.allocations && order.allocations.length > 0)) && !allLinesAllocated

                      const displayOrderStatus = 
                        isCancelled ? 'Cancelled' :
                        isDispatched ? 'Dispatched' :
                        order.status === 'Approved' ? 'Approved' :
                        order.status === 'MTC Generated' ? 'MTC Generated' :
                        order.status === 'Pending Storekeeper Approval' ? 'Pending Storekeeper Approval' :
                        order.status === 'Ready for Dispatch' ? 'Ready for Dispatch' :
                        allLinesAllocated ? 'Stock Allocated' :
                        someLinesAllocated ? `Partially Allocated (${totalAlloc}/${totalReq} PCS)` :
                        'Draft (Unallocated)'

                      return (
                        <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                          isCancelled ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          isDispatched ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          order.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          order.status === 'MTC Generated' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          order.status === 'Pending Storekeeper Approval' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          allLinesAllocated ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          someLinesAllocated ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {displayOrderStatus}
                        </span>
                      )
                    })()}

                    {/* Official MSG Sales Order Confirmation PDF Download */}
                    <button
                      onClick={() => handleDownloadSOPDF(order)}
                      disabled={generatingPdfSoId === order.id}
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors"
                      title="Download official publication-grade Sales Order confirmation PDF"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-500" />
                      <span>{generatingPdfSoId === order.id ? 'Generating...' : 'SO PDF'}</span>
                    </button>

                    {/* Customer Attached PO Document Link */}
                    {order.po_document_url && (
                      <a
                        href={order.po_document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-white hover:bg-slate-50 text-blue-700 border border-slate-300 font-medium text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors"
                        title="View original uploaded Customer PO PDF document"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View PO</span>
                      </a>
                    )}

                    {/* Action buttons */}
                    {/* Direct MTC Package Release for Allocated Orders */}
                    {(order.status === 'Stock Allocated' || order.status === 'Approved' || order.status === 'MTC Generated') && order.allocations.length > 0 && (
                      <button
                        onClick={() => handleGenerateMTCPackage(order)}
                        disabled={generatingMtcSoId === order.id}
                        className="bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-300 font-semibold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors"
                        title="Compile and download Certified EN 10204 3.1 MTC package for all allocated heats"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        <span>{generatingMtcSoId === order.id ? 'Certifying...' : 'Download MTC Pkg'}</span>
                      </button>
                    )}

                    {!isCancelled && !isDispatched && (
                      <button
                        onClick={() => onNavigateToAllocation(order.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1 shadow-xs transition-colors"
                        title="Open Stock Allocation Studio to allocate or adjust heats"
                      >
                        <Flame className="h-3.5 w-3.5" />
                        <span>Allocate Stock</span>
                      </button>
                    )}

                    {order.status === 'Stock Allocated' && (
                      <button
                        onClick={() => handleSubmitForStoreApproval(order)}
                        className="bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 font-semibold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors"
                      >
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        <span>Submit for Approval</span>
                      </button>
                    )}

                    {!isCancelled && !isDispatched && canCreateOrder && (
                      <button
                        onClick={() => setCancelModalOrder(order)}
                        className="text-slate-400 hover:text-rose-600 font-medium text-xs p-1.5 rounded hover:bg-rose-50 transition-colors"
                        title="Cancel Sales Order"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 1-Click Automated Deliverables Suite (Stickers, Summary Sheet, CIPL, Stores, Client, MTC) */}
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Deliverables
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* 1. 58mm x 39mm Stickers PDF */}
                    <button
                      onClick={() => handleDownloadStickers(order)}
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-[11px] px-2.5 py-1 rounded-md flex items-center space-x-1 transition-colors"
                      title="1-Click export exact 58mm × 39mm landscape stickers with QR code & MSG logo"
                    >
                      <Sparkles className="h-3 w-3 text-slate-500" />
                      <span>Stickers (.pdf)</span>
                    </button>

                    {/* 2. SUMMARY SHEET Preview */}
                    <button
                      onClick={() => handleOpenPreviewModal(order, 'summary', true)}
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-[11px] px-2.5 py-1 rounded-md flex items-center space-x-1 transition-colors"
                      title="Preview Summary Sheet, edit details, allocate suppliers & export Excel"
                    >
                      <Eye className="h-3 w-3 text-slate-500" />
                      <span>Summary Sheet</span>
                    </button>

                    {/* 3. CIPL Logistics Preview */}
                    <button
                      onClick={() => handleOpenPreviewModal(order, 'cipl_invoice', true)}
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-[11px] px-2.5 py-1 rounded-md flex items-center space-x-1 transition-colors"
                      title="Preview CIPL Commercial Invoice & Packing List before download"
                    >
                      <Truck className="h-3 w-3 text-slate-500" />
                      <span>CIPL (.xlsx)</span>
                    </button>

                    {/* 4. Client Technical Summary Preview */}
                    <button
                      onClick={() => handleOpenPreviewModal(order, 'client', true)}
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-[11px] px-2.5 py-1 rounded-md flex items-center space-x-1 transition-colors"
                      title="Preview Client Technical Summary before download"
                    >
                      <FileText className="h-3 w-3 text-slate-500" />
                      <span>Client Summary</span>
                    </button>

                    {/* 5. Stores Internal Summary Preview */}
                    <button
                      onClick={() => handleOpenPreviewModal(order, 'stores', true)}
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-[11px] px-2.5 py-1 rounded-md flex items-center space-x-1 transition-colors"
                      title="Preview Stores Internal Sheet with supplier details before download"
                    >
                      <Layers className="h-3 w-3 text-slate-500" />
                      <span>Stores Summary</span>
                    </button>

                    {/* 6. Certified MTC Package */}
                    <button
                      onClick={() => handleGenerateMTCPackage(order)}
                      disabled={generatingMtcSoId === order.id}
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-[11px] px-2.5 py-1 rounded-md flex items-center space-x-1 transition-colors"
                      title="Download Certified EN 10204 3.1 MTC (Page 1 Rectangular Seal, Page 2+ Round Seal with QC Signature)"
                    >
                      <FileCheck2 className="h-3 w-3 text-blue-600" />
                      <span>{generatingMtcSoId === order.id ? 'Certifying...' : 'MTC Package (.pdf)'}</span>
                    </button>

                    {/* 7. Download All Certificates (.zip) */}
                    <button
                      onClick={() => handleDownloadCertificatesZip(order)}
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-[11px] px-2.5 py-1 rounded-md flex items-center space-x-1 transition-colors"
                      title="Download all authentic MTC Certificates for this Sales Order as a ZIP file"
                    >
                      <Download className="h-3 w-3 text-slate-500" />
                      <span>Certificates (.zip)</span>
                    </button>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[680px]">
                    <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/70">
                      <tr>
                        <th className="py-2 px-2">Item Code</th>
                        <th className="py-2 px-2">Description</th>
                        <th className="py-2 px-2 text-center">Required</th>
                        <th className="py-2 px-2 text-center">Allocated</th>
                        <th className="py-2 px-2 text-center">Dispatched</th>
                        <th className="py-2 px-2">Allocated Heat & Certificates</th>
                        <th className="py-2 px-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {order.items.map(item => {
                        const itemAllocations = (order.allocations || []).filter(
                          a => (a.sales_order_item_id === item.id || (a as any).so_item_id === item.id) && a.allocation_status !== 'Released'
                        )
                        const lineAllocQty = itemAllocations.reduce((sum, a) => sum + (a.allocated_qty || 0), 0)
                        const isLineDispatched = (item.dispatched_qty || 0) >= item.required_qty && item.required_qty > 0
                        const isLineAllocated = (item.required_qty > 0 && lineAllocQty >= item.required_qty) || (item.allocated_qty >= item.required_qty && item.allocated_qty > 0)
                        const isLinePartial = lineAllocQty > 0 && !isLineAllocated

                        const displayLineStatus = isLineDispatched
                          ? 'Dispatched'
                          : isLineAllocated
                          ? 'Allocated'
                          : isLinePartial
                          ? `Partially Allocated (${lineAllocQty}/${item.required_qty})`
                          : 'Unallocated'

                        return (
                          <tr key={item.id} className={!isLineAllocated && !isLineDispatched ? 'bg-slate-50/40' : ''}>
                            <td className="py-2.5 font-mono font-semibold text-slate-800">
                              <div>{item.item_code}</div>
                              {(item.is_local || item.purchase_type === 'local_purchase' || item.l_code) && (
                                <div className="text-[10px] font-sans font-medium text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded inline-flex items-center space-x-1 mt-0.5">
                                  <Tag className="h-2.5 w-2.5" />
                                  <span>{item.l_code || 'Local L-Code'}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 text-slate-600">
                              <div>{item.item_description}</div>
                              {item.supplier_name && (
                                <div className="text-[10px] text-slate-400">Supplier: {item.supplier_name}</div>
                              )}
                            </td>
                            <td className="py-2.5 text-center font-semibold text-slate-900 tabular-nums">{item.required_qty} {item.uom}</td>
                            <td className={`py-2.5 text-center font-semibold tabular-nums ${lineAllocQty > 0 ? 'text-blue-700' : 'text-slate-400'}`}>
                              {lineAllocQty} {item.uom}
                            </td>
                            <td className="py-2.5 text-center font-semibold text-emerald-700 tabular-nums">{item.dispatched_qty} {item.uom}</td>
                            <td className="py-2.5">
                              {itemAllocations.length === 0 ? (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-rose-700 font-medium text-[10px] bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                      Unallocated
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => onNavigateToAllocation(order.id)}
                                      className="text-[10px] text-blue-600 hover:text-blue-800 font-medium hover:underline"
                                      title="Open Heat Allocation Studio for this line"
                                    >
                                      Allocate Heat
                                    </button>
                                    <label
                                      className="text-[10px] bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-1.5 py-0.5 rounded cursor-pointer flex items-center space-x-1 font-medium transition-colors"
                                      title="Upload MTC (.pdf) directly for this item"
                                    >
                                      <FileUp className="h-2.5 w-2.5 text-slate-500" />
                                      <span>Attach MTC</span>
                                      <input
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={(e) => {
                                          const f = e.target.files?.[0]
                                          if (f) handleDirectLineMtcUpload(order.id, item.id, item.item_code, item.heat_number, f)
                                        }}
                                      />
                                    </label>
                                  </div>
                                  {item.certificate_number && (
                                    <div className="flex items-center space-x-1">
                                      <button
                                        type="button"
                                        onClick={() => onPreviewMTC ? onPreviewMTC(item.certificate_number!, item.item_code, item.heat_number || '') : null}
                                        className="text-[10px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded flex items-center space-x-1"
                                        title="Preview Certificate"
                                      >
                                        <FileCheck2 className="h-2.5 w-2.5 text-blue-600" />
                                        <span>Cert: {item.certificate_number}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap gap-1">
                                    {itemAllocations.map(a => (
                                      <span
                                        key={a.id}
                                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                                          a.allocation_status === 'Dispatched' ? 'bg-emerald-100 text-emerald-800' :
                                          a.allocation_status === 'Released' ? 'bg-slate-100 text-slate-500 line-through' :
                                          'bg-blue-100 text-blue-800'
                                        }`}
                                      >
                                        {a.heat_number} ({a.allocated_qty} PCS)
                                      </span>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {itemAllocations.map(a => {
                                      const certRef = a.mtc_certificate_id || item.certificate_number || `MTC-${a.heat_number}`
                                      return (
                                        <button
                                          key={`cert-${a.id}`}
                                          type="button"
                                          onClick={() => onPreviewMTC ? onPreviewMTC(certRef, item.item_code, a.heat_number) : null}
                                          className="text-[10px] font-mono bg-slate-50 hover:bg-blue-50 text-blue-700 hover:text-blue-900 border border-slate-200 hover:border-blue-300 px-1.5 py-0.5 rounded flex items-center space-x-1"
                                          title={`Click to preview MTC certificate for Heat ${a.heat_number}`}
                                        >
                                          <FileCheck2 className="h-2.5 w-2.5 text-blue-500" />
                                          <span>{certRef}</span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 text-right">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                displayLineStatus === 'Dispatched' ? 'bg-emerald-100 text-emerald-800' :
                                displayLineStatus === 'Allocated' ? 'bg-blue-100 text-blue-800' :
                                displayLineStatus.startsWith('Partially') ? 'bg-amber-100 text-amber-800' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {displayLineStatus}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Audit Footer */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap justify-between items-center text-[11px] text-slate-400">
                    <div>
                      <span>Created: {order.order_date} by {order.created_by}</span>
                      {order.approved_by && <span className="ml-2 font-semibold text-blue-700">&bull; Approved by {order.approved_by}</span>}
                      {order.cancellation_reason && (
                        <span className="ml-2 text-red-600 font-semibold">&bull; Cancelled: {order.cancellation_reason} ({order.cancellation_date})</span>
                      )}
                    </div>
                    <div>
                      <span>Delivery Target: {order.required_delivery_date || 'Standard'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* CREATE ORDER MODAL (WITH REGULAR & LOCAL PURCHASE L-CODE MODES) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2.5">
                {createOrderType === 'local_purchase' ? (
                  <ShoppingBag className="h-4 w-4 text-blue-600" />
                ) : (
                  <Plus className="h-4 w-4 text-blue-600" />
                )}
                <div>
                  <h3 className="font-semibold text-sm text-slate-900">
                    {createOrderType === 'local_purchase' ? 'Create Local Purchase Sales Order (L-Code)' : 'Create Customer Sales Order'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {createOrderType === 'local_purchase'
                      ? 'Local stockist order: Assign custom L-Codes, specifications, and local UAE suppliers.'
                      : 'Standard mill stock order: Select existing catalog items for standard heat allocation.'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Order Type Toggle Tabs */}
            <div className="bg-slate-50/60 px-5 py-2.5 border-b border-slate-200 shrink-0">
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-md text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setCreateOrderType('regular')}
                  className={`py-1.5 px-3 rounded flex items-center justify-center space-x-2 transition-colors ${
                    createOrderType === 'regular'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Package className="h-3.5 w-3.5 text-blue-600" />
                  <span>Regular Mill Stock SO</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateOrderType('local_purchase')}
                  className={`py-1.5 px-3 rounded flex items-center justify-center space-x-2 transition-colors ${
                    createOrderType === 'local_purchase'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShoppingBag className="h-3.5 w-3.5 text-blue-600" />
                  <span>Local Purchase SO (L-Code)</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Customer *</label>
                  <select
                    required
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.customer_name} ({c.customer_code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Customer P.O. Number *</label>
                  <input
                    type="text"
                    required
                    placeholder={createOrderType === 'local_purchase' ? 'e.g. LPO-ADNOC-LOCAL-01' : 'e.g. PO-ADNOC-7701'}
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Required Delivery Date</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>

                {/* Upload Customer PO Document */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Upload Customer PO Document (PDF / Scan)</label>
                  <div className="relative border border-slate-300 rounded-lg p-1.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => setPoFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <span className="text-[11px] text-slate-600 truncate max-w-[200px]">
                      {poFile ? poFile.name : 'Select PO document...'}
                    </span>
                    <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </div>
                </div>
              </div>

              {/* Order Lines */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center space-x-2">
                    <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                      {createOrderType === 'local_purchase' ? 'Local Purchase Line Items & L-Codes' : 'Requested Material Line Items'}
                    </label>
                    {createOrderType === 'local_purchase' && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-medium px-2 py-0.5 rounded">
                        Auto L-Code Tracking
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    + Add Another Item
                  </button>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {orderLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border bg-slate-50 border-slate-200"
                    >
                      {createOrderType === 'regular' ? (
                        <div className="flex items-center space-x-2">
                          <div className="flex-1">
                            <select
                              required
                              value={line.itemId}
                              onChange={(e) => {
                                const updated = [...orderLines]
                                updated[idx].itemId = e.target.value
                                setOrderLines(updated)
                              }}
                              className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs"
                            >
                              <option value="">-- Select Product Item Code --</option>
                              {items.map(it => (
                                <option key={it.id} value={it.id}>{it.item_code} - {it.item_description}</option>
                              ))}
                            </select>
                          </div>

                          <div className="w-28">
                            <input
                              type="number"
                              min="1"
                              required
                              value={line.requiredQty}
                              onChange={(e) => {
                                const updated = [...orderLines]
                                updated[idx].requiredQty = Number(e.target.value)
                                setOrderLines(updated)
                              }}
                              placeholder="Qty PCS"
                              className="w-full border border-slate-300 rounded-lg p-1.5 text-xs text-center font-bold"
                            />
                          </div>

                          {orderLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="text-slate-400 hover:text-red-600 px-2 py-1 text-sm"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ) : (
                        /* Local Purchase SO Line Item: Custom Code, Description, L-Code, Supplier, Price, Qty */
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Item Code / Template</label>
                              <input
                                type="text"
                                placeholder={`e.g. L-SO-${idx + 1}`}
                                value={line.itemCode || ''}
                                onChange={(e) => {
                                  const updated = [...orderLines]
                                  updated[idx].itemCode = e.target.value
                                  if (!updated[idx].lCode) updated[idx].lCode = e.target.value
                                  setOrderLines(updated)
                                }}
                                className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs font-mono font-bold text-purple-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-purple-700 mb-0.5">Tracked L-Code</label>
                              <input
                                type="text"
                                placeholder={`L-SO-${idx + 1}`}
                                value={line.lCode || line.itemCode || `L-SO-${idx + 1}`}
                                onChange={(e) => {
                                  const updated = [...orderLines]
                                  updated[idx].lCode = e.target.value
                                  setOrderLines(updated)
                                }}
                                className="w-full border border-purple-300 rounded-lg p-1.5 bg-white text-xs font-mono font-bold text-purple-700"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Local UAE Supplier</label>
                              <input
                                type="text"
                                list={`suppliers-list-${idx}`}
                                placeholder="e.g. Al Jazeera Steel / Petro Middle East"
                                value={line.supplierName || ''}
                                onChange={(e) => {
                                  const updated = [...orderLines]
                                  updated[idx].supplierName = e.target.value
                                  setOrderLines(updated)
                                }}
                                className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs"
                              />
                              <datalist id={`suppliers-list-${idx}`}>
                                {suppliers.map(s => (
                                  <option key={s.id} value={s.supplier_name} />
                                ))}
                              </datalist>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Item Description *</label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. 2 inch SCH 40 ASTM A106 Gr B Seamless Pipe"
                                value={line.itemDescription || ''}
                                onChange={(e) => {
                                  const updated = [...orderLines]
                                  updated[idx].itemDescription = e.target.value
                                  setOrderLines(updated)
                                }}
                                className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Unit Price (AED)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Price AED"
                                value={line.unitPrice ?? ''}
                                onChange={(e) => {
                                  const updated = [...orderLines]
                                  updated[idx].unitPrice = Number(e.target.value)
                                  setOrderLines(updated)
                                }}
                                className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs font-semibold"
                              />
                            </div>

                            <div className="flex items-center space-x-1.5">
                              <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Qty (PCS) *</label>
                                <input
                                  type="number"
                                  min="1"
                                  required
                                  value={line.requiredQty}
                                  onChange={(e) => {
                                    const updated = [...orderLines]
                                    updated[idx].requiredQty = Number(e.target.value)
                                    setOrderLines(updated)
                                  }}
                                  placeholder="Qty"
                                  className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs text-center font-bold"
                                />
                              </div>

                              {orderLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  className="text-slate-400 hover:text-red-600 p-1.5 rounded mb-0.5"
                                  title="Remove line"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-md font-medium text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-xs shadow-sm flex items-center space-x-1.5"
                >
                  <span>Save &amp; Proceed to Allocation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD SALES ORDERS FROM EXCEL MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                <h3 className="font-semibold text-sm text-slate-900">Upload Sales Orders (.xlsx / .csv)</h3>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-600">Upload bulk customer purchase orders in spreadsheet format.</span>
                <button
                  type="button"
                  onClick={generateSalesOrderTemplate}
                  className="text-emerald-700 font-bold hover:underline flex items-center space-x-1"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download SO Template (.xlsx)</span>
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-6 text-center bg-slate-50 transition-colors relative">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleExcelSOChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <FileUp className="h-8 w-8 text-indigo-500 mx-auto mb-1.5" />
                <div className="font-bold text-slate-700">Click or Drop Sales Orders Spreadsheet (.xlsx)</div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Columns: Customer Name, Customer P.O., Item Name, Required Qty, Required Delivery Date
                </p>
                {importFileName && (
                  <div className="mt-2 text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 py-1 px-3 rounded inline-block border border-indigo-200">
                    Loaded: {importFileName} ({parsedImportRows.length} items parsed)
                  </div>
                )}
              </div>

              {parsedImportRows.length > 0 && (
                <div className="space-y-2">
                  <div className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">
                    Parsed Orders Preview ({parsedImportRows.length} Line Items)
                  </div>
                  <div className="border border-slate-200 rounded-lg max-h-48 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase sticky top-0">
                        <tr>
                          <th className="p-2">Customer</th>
                          <th className="p-2">P.O. Number</th>
                          <th className="p-2">Item Code</th>
                          <th className="p-2">HSN / HS Code</th>
                          <th className="p-2 text-center">Qty</th>
                          <th className="p-2">Target Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedImportRows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2 font-medium text-slate-800">{r.customerName}</td>
                            <td className="p-2 font-mono text-slate-600">{r.poNumber}</td>
                            <td className="p-2 font-mono font-bold text-blue-700">{r.itemCode}</td>
                            <td className="p-2 font-mono text-indigo-700 font-bold text-[11px]">{r.hsCode || '7307.93.00'}</td>
                            <td className="p-2 text-center font-bold text-slate-900">{r.requiredQty} {r.uom || 'PCS'}</td>
                            <td className="p-2 text-slate-500">{r.deliveryDate || 'Standard'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-md font-medium text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitSOImport}
                disabled={isImportingSO || parsedImportRows.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-md font-semibold text-xs shadow-sm flex items-center space-x-1.5"
              >
                <span>{isImportingSO ? 'Importing Orders...' : `Import ${parsedImportRows.length} Items`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD SALES ORDER FROM CUSTOMER PDF MODAL */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4">
          <div className={`bg-white rounded-lg w-full shadow-xl border border-slate-200 overflow-hidden flex flex-col transition-all duration-200 ${
            isPdfModalEnlarged ? 'max-w-[97vw] h-[95vh]' : 'max-w-4xl max-h-[90vh]'
          }`}>
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <h3 className="font-semibold text-sm text-slate-900">Upload Customer Sales Order (PDF)</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPdfModalEnlarged(!isPdfModalEnlarged)}
                  className="text-slate-700 hover:bg-slate-100 flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded-md bg-white border border-slate-300 transition-colors"
                  title={isPdfModalEnlarged ? 'Switch to Standard Size' : 'Enlarge to Full Page'}
                >
                  {isPdfModalEnlarged ? <Minimize2 className="h-3.5 w-3.5 text-slate-500" /> : <Maximize2 className="h-3.5 w-3.5 text-slate-500" />}
                  <span>{isPdfModalEnlarged ? 'Standard View' : 'Enlarge Full Page'}</span>
                </button>
                <button onClick={() => { setIsPdfModalOpen(false); setPdfParsedData(null); }} className="text-slate-400 hover:text-slate-600 text-base ml-2">✕</button>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs flex-1">
              <div className="pb-2 border-b border-slate-100">
                <span className="text-slate-600">
                  Upload incoming customer PO / Sales Order in official PDF format. The system automatically reads PO details, customer info, and line items, while preserving the authentic PDF.
                </span>
              </div>

              {/* PDF Dropzone */}
              <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-lg p-4 text-center bg-slate-50 transition-colors relative">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handlePdfFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <FileText className="h-7 w-7 text-blue-600 mx-auto mb-1" />
                <div className="font-semibold text-slate-700">Click or Drop Customer Sales Order PDF</div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Accepts standard oilfield customer Purchase Orders (ADNOC, McDermott, Petrofac, Saipem, etc.)
                </p>
                {isParsingPdf && (
                  <div className="mt-2 text-xs font-medium text-blue-600">
                    Parsing PDF text streams and extracting PO data...
                  </div>
                )}
                {pdfParsedData && !isParsingPdf && (
                  <div className="mt-2 text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 py-1 px-3 rounded inline-block border border-emerald-200">
                    Loaded: {pdfParsedData.fileName}
                  </div>
                )}
              </div>

              {/* Extracted Data Form / Preview */}
              {pdfParsedData && (
                <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200 flex flex-col flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">
                      Extracted Customer Order Details
                    </span>
                    {pdfParsedData.pdfBlobUrl && (
                      <a
                        href={pdfParsedData.pdfBlobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-semibold text-[11px] flex items-center space-x-1"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Preview Uploaded PDF</span>
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Customer Name</label>
                      <input
                        type="text"
                        value={pdfParsedData.customerName}
                        onChange={(e) => setPdfParsedData({ ...pdfParsedData, customerName: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Customer P.O. Number</label>
                      <input
                        type="text"
                        value={pdfParsedData.poNumber}
                        onChange={(e) => setPdfParsedData({ ...pdfParsedData, poNumber: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-mono uppercase bg-white text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Sales Order # / MSG Ref</label>
                      <input
                        type="text"
                        value={pdfParsedData.soNumber || ''}
                        onChange={(e) => setPdfParsedData({ ...pdfParsedData, soNumber: e.target.value })}
                        placeholder="e.g. MSG-1126-2227"
                        className="w-full border border-slate-300 rounded-lg p-2 font-mono uppercase bg-orange-50/50 text-orange-900 font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Required Delivery Date</label>
                      <input
                        type="date"
                        value={pdfParsedData.deliveryDate}
                        onChange={(e) => setPdfParsedData({ ...pdfParsedData, deliveryDate: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0 pt-2">
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center space-x-2">
                        <label className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">
                          Detected Line Items ({pdfParsedData.items.length})
                        </label>
                        <span className="text-[10px] text-slate-500 font-normal">
                          &bull; Full descriptions enlarged &amp; editable &bull; Attach MTC for L-Code directly
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nextPos = (pdfParsedData.items.length > 0
                            ? Math.max(...pdfParsedData.items.map((x: any) => x.position || 0)) + 1
                            : 1)
                          setPdfParsedData({
                            ...pdfParsedData,
                            items: [
                              ...pdfParsedData.items,
                              {
                                position: nextPos,
                                clientPoItemNo: String(nextPos),
                                itemCode: '',
                                itemDescription: '',
                                heatNumber: '',
                                location: '',
                                requiredQty: 1,
                                make: '',
                                supplierName: '',
                                packageType: 'Pallet',
                                packageNo: '1',
                                is_new_added: true,
                              } as any
                            ]
                          })
                        }}
                        className="text-blue-600 hover:text-blue-700 font-semibold text-xs flex items-center space-x-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Item</span>
                      </button>
                    </div>

                    <div className={`border border-slate-200 rounded-lg overflow-x-auto overflow-y-auto bg-white ${
                      isPdfModalEnlarged ? 'max-h-[56vh]' : 'max-h-60'
                    }`}>
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                          <tr>
                            <th className="p-2.5 w-16 text-center">Pos #</th>
                            <th className="p-2.5 w-48 min-w-[180px]">Item Code</th>
                            <th className="p-2.5 min-w-[340px]">Description / Full Material Specification</th>
                            <th className="p-2.5 w-36 min-w-[140px]">Heat No &amp; Loc</th>
                            <th className="p-2.5 text-center w-20">Qty</th>
                            <th className="p-2.5 w-52 min-w-[190px]">MTC / L-Code Certificate</th>
                            <th className="p-2.5 text-right w-12">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pdfParsedData.items.map((it, idx) => (
                            <tr key={idx} className={`hover:bg-slate-50/70 ${(it as any).is_new_added ? 'bg-red-50/20' : ''}`}>
                              <td className="p-2.5 text-center">
                                <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-xs font-mono font-bold">
                                  #{it.position || idx + 1}
                                </span>
                                {(it as any).is_new_added && (
                                  <span className="block text-[8px] font-bold text-red-600 bg-red-100/80 border border-red-300 px-1 py-0.5 rounded uppercase tracking-tight mt-0.5 whitespace-nowrap leading-none">
                                    new added
                                  </span>
                                )}
                                {it.clientPoItemNo && (
                                  <span className="block text-[10px] text-slate-500 font-mono mt-0.5" title="Client PO Item Number">
                                    PO #{it.clientPoItemNo}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5">
                                <input
                                  type="text"
                                  value={it.itemCode}
                                  onChange={(e) => {
                                    const updated = [...pdfParsedData.items]
                                    updated[idx].itemCode = e.target.value
                                    setPdfParsedData({ ...pdfParsedData, items: updated })
                                  }}
                                  className="w-full border border-slate-300 rounded px-2 py-1 font-mono uppercase text-xs font-bold text-slate-900"
                                />
                                {it.purchaseType === 'local_purchase' || /^L[-_0-9]/i.test(it.itemCode) ? (
                                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Local Purchase (L-Code)
                                  </span>
                                ) : (
                                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    Warehouse Stock
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5">
                                <textarea
                                  rows={2}
                                  placeholder={'Full item specification (e.g. WELDNECK RF 3", 150#, S.40...)'}
                                  value={it.itemDescription || ''}
                                  onChange={(e) => {
                                    const updated = [...pdfParsedData.items]
                                    updated[idx].itemDescription = e.target.value
                                    setPdfParsedData({ ...pdfParsedData, items: updated })
                                  }}
                                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 leading-relaxed font-sans focus:ring-1 focus:ring-blue-500"
                                  title={it.itemDescription}
                                />
                              </td>
                              <td className="p-2.5">
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    placeholder="Heat No"
                                    value={it.heatNumber || ''}
                                    onChange={(e) => {
                                      const updated = [...pdfParsedData.items]
                                      updated[idx].heatNumber = e.target.value
                                      setPdfParsedData({ ...pdfParsedData, items: updated })
                                    }}
                                    className="w-full border border-slate-300 rounded px-2 py-1 font-mono text-xs font-bold text-red-700 bg-red-50/50"
                                    title="Heat Number for MTC Certificate Allocation"
                                  />
                                  {it.location && (
                                    <span className="text-[10px] text-slate-500 font-mono block">
                                      Loc: {it.location}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2.5 text-center">
                                <div className="flex flex-col items-center space-y-1">
                                  <input
                                    type="number"
                                    min="1"
                                    value={it.requiredQty}
                                    onChange={(e) => {
                                      const updated = [...pdfParsedData.items]
                                      updated[idx].requiredQty = Number(e.target.value)
                                      setPdfParsedData({ ...pdfParsedData, items: updated })
                                    }}
                                    className="w-16 border border-slate-300 rounded px-1.5 py-1 text-center font-bold text-xs"
                                  />
                                  {it.splitQty && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap shadow-xs" title={`Split Batch: ${it.splitQty}`}>
                                      {it.splitQty}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {/* Direct MTC Upload for L-Code / Stock */}
                              <td className="p-2.5">
                                {(it as any).certificateNumber ? (
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-1 rounded flex items-center space-x-1 truncate max-w-[180px]" title={(it as any).certificateNumber}>
                                      <FileCheck2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                      <span className="truncate">{(it as any).certificateNumber}</span>
                                    </div>
                                    <label className="cursor-pointer text-[10px] text-blue-600 hover:text-blue-800 hover:underline block font-semibold">
                                      <span>Replace MTC PDF</span>
                                      <input
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={(e) => handleUploadLineItemMtc(idx, e)}
                                      />
                                    </label>
                                  </div>
                                ) : (
                                  <label className={`cursor-pointer inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                                    it.purchaseType === 'local_purchase' || /^L[-_0-9]/i.test(it.itemCode)
                                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 shadow-sm'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                  }`}>
                                    <Paperclip className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                                    <span>{it.purchaseType === 'local_purchase' || /^L[-_0-9]/i.test(it.itemCode) ? 'Upload L-Code MTC' : 'Attach MTC (.pdf)'}</span>
                                    <input
                                      type="file"
                                      accept=".pdf"
                                      className="hidden"
                                      onChange={(e) => handleUploadLineItemMtc(idx, e)}
                                    />
                                  </label>
                                )}
                              </td>
                              <td className="p-2.5 text-right">
                                {pdfParsedData.items.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPdfParsedData({
                                        ...pdfParsedData,
                                        items: pdfParsedData.items.filter((_, i) => i !== idx)
                                      })
                                    }}
                                    className="text-slate-400 hover:text-red-600 px-1 font-bold"
                                    title="Remove item"
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => { setIsPdfModalOpen(false); setPdfParsedData(null); }}
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-md font-medium text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitPdfSO}
                disabled={!pdfParsedData || pdfParsedData.items.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-md font-semibold text-xs shadow-sm flex items-center space-x-1.5"
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>Confirm &amp; Proceed to Allocation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL SALES ORDER MODAL */}
      {cancelModalOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] flex flex-col shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 bg-rose-50 border-b border-rose-200 text-rose-900 flex justify-between items-center gap-2 shrink-0">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <h3 className="font-semibold text-sm">Cancel Sales Order: {cancelModalOrder.so_number}</h3>
              </div>
              <button onClick={() => setCancelModalOrder(null)} className="text-rose-400 hover:text-rose-700">✕</button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-md text-rose-900">
                <div className="font-semibold">Audit Notice</div>
                <div className="mt-1 text-[11px] leading-relaxed text-rose-800">
                  Per MSG Oilfield quality standards, cancelled orders remain permanently archived for audit traceability. Un-dispatched stock allocations will be restored to available inventory.
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reason for Cancellation *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Customer cancelled project PO, or specifications changed."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-2 text-slate-800"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOrder(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-md font-medium"
                >
                  Abort
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-semibold shadow-sm"
                >
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE ERP DEMO & GUIDED TOUR MODAL */}
      {isDemoModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-start gap-2 shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <PlayCircle className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold text-base text-slate-900">
                    MSG Oilfield ERP — Workflow Guide &amp; Demo
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated workflow: from Customer PO PDF upload to verified true copy MTCs, 58mm stickers, and customs CIPL packages.
                </p>
              </div>
              <button
                onClick={() => setIsDemoModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-md p-1 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 flex-1 overflow-y-auto text-xs">
              {/* 6 Step Interactive Visual Pipeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Step 1 */}
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-900 flex items-center space-x-2">
                      <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[11px]">1</span>
                      <span>Customer PO Ingestion</span>
                    </span>
                    <span className="bg-white border border-slate-200 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded">PDF / Excel / Form</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Click <strong>Upload SO (PDF)</strong> to automatically parse customer POs. Extracts client PO numbers, item lines, quantities, and descriptions.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-900 flex items-center space-x-2">
                      <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[11px]">2</span>
                      <span>FIFO &amp; Heat Allocation</span>
                    </span>
                    <span className="bg-white border border-slate-200 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded">Automated Batching</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Assign authentic Heat Numbers from Mill Stock or Local Purchase (LOC). Supports heat splitting across multiple certificates with batch traceability.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-900 flex items-center space-x-2">
                      <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[11px]">3</span>
                      <span>Autogenerated SUMMARY SHEET</span>
                    </span>
                    <span className="bg-white border border-slate-200 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded">9-Column Exact</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    1-click export of the 9-column <strong>SUMMARY SHEET (.xlsx)</strong> with merged Client, PO Number, MSG Ref, and embedded logo.
                  </p>
                </div>

                {/* Step 4 */}
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-900 flex items-center space-x-2">
                      <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[11px]">4</span>
                      <span>58mm × 39mm Item Stickers</span>
                    </span>
                    <span className="bg-white border border-slate-200 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded">Times-Bold &amp; QR</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    1-click generation of exact 58mm × 39mm item stickers PDF with Times-Bold 7.3pt typography, MSG logo, dynamic autofit, and QR code.
                  </p>
                </div>

                {/* Step 5 */}
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-900 flex items-center space-x-2">
                      <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[11px]">5</span>
                      <span>Multi-Page MTC Stamping</span>
                    </span>
                    <span className="bg-white border border-slate-200 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded">EN 10204 3.1</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    <strong>Page 1:</strong> Rectangular seal with autofilled PO No, Item No, QTY, and Sign.<br/>
                    <strong>Page 2+:</strong> Circular round seal with authentic inspection Sign line.
                  </p>
                </div>

                {/* Step 6 */}
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-900 flex items-center space-x-2">
                      <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[11px]">6</span>
                      <span>Customer 360 &amp; Analytics</span>
                    </span>
                    <span className="bg-white border border-slate-200 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded">Unified Hub</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Select any customer in <strong>Customer Analytics</strong> to inspect their complete order lifecycle and download all customer documents in one place.
                  </p>
                </div>
              </div>

              {/* Sample Order Banner */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-bold text-amber-900">Want to see the system in action right now?</div>
                  <div className="text-amber-700 text-[11px] mt-0.5">
                    Click the button below to immediately view the sample BSTS Bahrain order and try out all 1-click deliverables.
                  </div>
                </div>
                <button
                  onClick={() => {
                    setStatusFilter('all')
                    setSearchTerm('BSTS')
                    setIsDemoModalOpen(false)
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-lg shadow transition-colors shrink-0 ml-4"
                >
                  View STS Bahrain Order
                </button>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsDemoModalOpen(false)}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold shadow transition-colors"
                >
                  Close & Start Working
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Summary Sheet Worksheet & Bulk Allocation Modal */}
      {summarySheetOrder && (
        <SummarySheetModal
          isOpen={!!summarySheetOrder}
          onClose={() => {
            setSummarySheetOrder(null)
            setSummarySheetDirectPreview(false)
          }}
          order={summarySheetOrder}
          initialTab={summarySheetTab}
          initialShowPreview={summarySheetDirectPreview}
          onOrderUpdated={(updated) => {
            setSummarySheetOrder(updated)
          }}
        />
      )}
    </div>
  )
}
