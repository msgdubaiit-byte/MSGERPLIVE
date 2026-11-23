import React, { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { ExcelDeliverablesPreviewModal, SourcingPreviewTab } from './ExcelDeliverablesPreviewModal'
import { LocalPurchaseAllocationModal } from './LocalPurchaseAllocationModal'
import { InPagePurchaseOrderTab } from './InPagePurchaseOrderTab'
import { InPageCertificateTab } from './InPageCertificateTab'
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
} from '../../services/zipExtractor'
import { db } from '../../services/db'
import { SalesOrder } from '../../types'

export type PortalActiveTab = 'worksheet' | 'purchase_order' | 'create_certificate'

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
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isLocalPurchaseModalOpen, setIsLocalPurchaseModalOpen] = useState(false)
  const [previewTab, setPreviewTab] = useState<SourcingPreviewTab>('client')
  const [draftsList, setDraftsList] = useState<SourcingWorksheetData[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => uniqueOrders[0]?.id || '')

  const handleOpenPreview = (tab: SourcingPreviewTab) => {
    setPreviewTab(tab)
    setIsPreviewModalOpen(true)
  }

  useEffect(() => {
    setDraftsList(getSourcingDrafts())
    const initialOrders = db.getOrders()
    if (initialOrders.length > 0) {
      handleLoadFromOrder(initialOrders[0].id)
    }
  }, [])

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
      setSelectedItemIds(new Set(items.map(it => it.id)))
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
        const detectedMake = autoDetectMake(desc) || autoDetectMake(it.itemCode) || ''
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
      setStatusNotice(`Extracted ${newItems.length} line items from ${file.name} successfully!`)
    } catch (err: any) {
      alert('Error parsing PDF: ' + err.message)
    } finally {
      setIsUploading(false)
    }
  }

  // Load from existing Sales Order
  const handleLoadFromOrder = (orderId: string) => {
    const order = orders.find(o => o.id === orderId) || uniqueOrders.find(o => o.id === orderId)
    if (!order) return

    setSelectedOrderId(orderId)
    setClientName(order.customer_name || '')
    setPoNumber(order.po_number || '')
    setMsgRef(order.so_number || order.msg_ref || '')
    setPortOfLoading((order as any).port_of_loading || '')
    setPortOfDischarge((order as any).port_of_discharge || '')
    setPaymentTerms((order as any).payment_terms || '')

    const newItems: SourcingLineItem[] = (order.items || []).map((it, idx) => {
      const desc = it.item_description || `Item ${it.item_code}`
      const detectedMake = it.make || autoDetectMake(desc) || ''
      const detectedCOO = (it as any).country_of_origin || (it as any).countryOfOrigin || ''
      const detectedHS = it.hs_code || autoDetectHSCode(desc, it.item_code)
      const unitWt = estimateUnitWeight(desc, it.uom)
      const lineNet = Math.round(it.required_qty * unitWt * 100) / 100
      const lineGross = Math.round(lineNet * 1.15 * 100) / 100
      const isMachined = isMeaningfulItem({ description: desc })
      const orderUnitPrice = Number((it as any).unit_price ?? (it as any).rate ?? (it as any).price ?? 0)

      return {
        id: `ITM-ORD-${idx + 1}`,
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
      }
    })

    setItems(newItems)
    setStatusNotice(`Loaded ${newItems.length} line items from order ${order.so_number}!`)
  }

  // Update item field
  const handleUpdateItem = (id: string, field: keyof SourcingLineItem, value: any) => {
    setItems(prev =>
      prev.map(it => {
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
          if (heatVal) {
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
            // Auto-detect Make if empty or 'MAKE'
            if (!updated.make || updated.make.toUpperCase() === 'MAKE') {
              const detectedMake = autoDetectMake(combined)
              if (detectedMake) updated.make = detectedMake
            }
          }
        }
        return updated
      })
    )
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
          ;(s as any).total_qty = fmtTotal
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
      // Preserve existing make and country of origin if already set
      const existingMake = (it.make || '').trim()
      const make = existingMake && existingMake.toUpperCase() !== 'MAKE'
        ? existingMake
        : (autoDetectMake(it.description) || '')

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
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-2xl shadow-xl border border-slate-700">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center space-x-1.5 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
                <span>Fully Automated Sync</span>
              </span>
              <span className="text-slate-400 text-xs font-mono">Dual Excel &amp; CIPL Engine</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Technical Sourcing, PO Split &amp; CIPL Portal
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-3xl">
              Line items are automatically populated from the uploaded Sales Order in exact position order without repeats.
              Manage multi-heat splits, auto-detect HS codes &amp; weights, and export publication-quality Client Summary, Internal Stores Excel, CIPL Logistics, and Supplier PO packages.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Unified Active Sales Order Selector */}
            <div className="bg-slate-800/90 border border-slate-600 rounded-lg px-3 py-1.5 flex items-center space-x-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">Active SO:</span>
              <select
                value={selectedOrderId}
                onChange={e => {
                  setSelectedOrderId(e.target.value)
                  handleLoadFromOrder(e.target.value)
                }}
                className="bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer max-w-[220px] truncate"
              >
                {uniqueOrders.map(o => (
                  <option key={o.id} value={o.id} className="bg-slate-900 text-white">
                    {o.so_number} - {o.po_number} ({o.customer_name})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSaveDraft}
              className="bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors"
              title="Save worksheet draft"
            >
              <Save className="h-4 w-4" />
              <span>Save Draft</span>
            </button>

            <button
              onClick={() => setIsDraftsModalOpen(true)}
              className="bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors"
            >
              <Clock className="h-4 w-4" />
              <span>Drafts ({draftsList.length})</span>
            </button>
          </div>
        </div>

        {statusNotice && (
          <div className="mt-4 p-3 bg-emerald-900/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs flex items-center space-x-2 animate-fade-in">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
            <span>{statusNotice}</span>
          </div>
        )}
      </div>

      {/* Header Metadata Controls */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            value={selectedOrderId}
            onChange={e => {
              if (e.target.value) handleLoadFromOrder(e.target.value)
            }}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 bg-emerald-50/50 border-emerald-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
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

      {/* Portal In-Page Tab Navigation Bar */}
      <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setActivePortalTab('worksheet')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer ${
              activePortalTab === 'worksheet'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            <span>Sourcing Worksheet</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${activePortalTab === 'worksheet' ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700 font-mono'}`}>
              {items.length} lines
            </span>
          </button>

          <button
            type="button"
            onClick={handleConvertToPO}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer ${
              activePortalTab === 'purchase_order'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
            }`}
          >
            <ShoppingCart className="h-4 w-4" />
            <span>Purchase Order / Local PO</span>
            {selectedItemIds.size > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-mono px-2 py-0.5 rounded-full">
                {selectedItemIds.size} selected
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateCertificate()}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer ${
              activePortalTab === 'create_certificate'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200'
            }`}
          >
            <FileCheck2 className="h-4 w-4" />
            <span>MTC Certificates (Upload &amp; Download)</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenPreview('client')}
            className="px-4 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 transition-all cursor-pointer"
          >
            <Eye className="h-4 w-4" />
            <span>Preview Deliverables</span>
          </button>
        </div>

        {/* Quick Context Action Buttons */}
        {activePortalTab === 'worksheet' && (
          <div className="flex items-center space-x-2">
            {selectedItemIds.size > 0 ? (
              <div className="flex items-center space-x-2 animate-fade-in bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                <span className="text-xs font-bold text-amber-900">
                  {selectedItemIds.size} item(s) selected
                </span>
                <button
                  type="button"
                  onClick={handleConvertToPO}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-2.5 py-1 rounded-lg flex items-center space-x-1 shadow-xs transition-colors cursor-pointer"
                >
                  <ShoppingCart className="h-3 w-3" />
                  <span>Convert to PO</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenCreateCertificate()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-2.5 py-1 rounded-lg flex items-center space-x-1 shadow-xs transition-colors cursor-pointer"
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
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center space-x-1 shadow-sm transition-colors cursor-pointer"
                  title="Create Purchase Order for lines"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span>Purchase Order</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenCreateCertificate()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center space-x-1 shadow-sm transition-colors cursor-pointer"
                  title="Upload, Preview & Download MTC Certificates"
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
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
          onApply={updatedItems => {
            setItems(updatedItems)
            setActivePortalTab('worksheet')
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
            setItems(prev =>
              prev.map(it => {
                if (it.id !== itemId) return it
                return {
                  ...it,
                  heat_number: certDetails.heat_number,
                  certificate_number: certDetails.certificate_number,
                  make: certDetails.make || it.make,
                  country_of_origin: certDetails.country_of_origin || it.country_of_origin,
                }
              })
            )
            setActivePortalTab('worksheet')
          }}
          onBack={() => setActivePortalTab('worksheet')}
          showToast={msg => setStatusNotice(msg)}
        />
      )}

      {/* Worksheet Tab Content */}
      {activePortalTab === 'worksheet' && (
        <>

      {/* 4 Action Export Buttons Banner */}
      <div className="bg-slate-100 p-4 rounded-2xl border border-slate-300 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleAutoDetectAll}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <Sparkles className="h-4 w-4 text-amber-300" />
            <span>Auto-Detect All (COO, HS, Wt)</span>
          </button>

          <label className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer ml-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={filterMachinedOnly}
              onChange={e => setFilterMachinedOnly(e.target.checked)}
              className="rounded text-orange-600 focus:ring-orange-500 h-4 w-4"
            />
            <span>Filter Machined / Fab Items Only</span>
          </label>
        </div>

        {/* 4 Preview & Download Deliverable Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Client Summary: Opens Preview & Download Modal */}
          <div className="inline-flex rounded-lg shadow-sm overflow-hidden border border-emerald-800">
            <button
              onClick={() => handleOpenPreview('client')}
              className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs px-3.5 py-2 flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Open Client Summary Preview & Download Modal"
            >
              <Eye className="h-4 w-4" />
              <span>Download Client Summary</span>
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
              className="bg-emerald-800 hover:bg-emerald-900 text-emerald-100 hover:text-white px-2.5 py-2 border-l border-emerald-600/70 transition-colors cursor-pointer"
              title="Direct 1-Click Instant Download (.xlsx)"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 2. Stores Internal Excel: Opens Preview & Download Modal */}
          <div className="inline-flex rounded-lg shadow-sm overflow-hidden border border-blue-800">
            <button
              onClick={() => handleOpenPreview('stores')}
              className="bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs px-3.5 py-2 flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Open Stores Sheet Preview & Download Modal"
            >
              <Eye className="h-4 w-4" />
              <span>Download Stores Sheet</span>
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
              className="bg-blue-800 hover:bg-blue-900 text-blue-100 hover:text-white px-2.5 py-2 border-l border-blue-600/70 transition-colors cursor-pointer"
              title="Direct 1-Click Instant Download (.xlsx)"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Local Purchase Sheet: Opens Dedicated Allocation Modal */}
          <div className="inline-flex rounded-lg shadow-sm overflow-hidden border border-amber-800">
            <button
              onClick={() => setIsLocalPurchaseModalOpen(true)}
              className="bg-amber-700 hover:bg-amber-600 text-white font-bold text-xs px-3.5 py-2 flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Open Local Purchase Modal (Select Local Supplier, Items & PCS)"
            >
              <Wrench className="h-4 w-4" />
              <span>Download Local Purchase</span>
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
              className="bg-amber-800 hover:bg-amber-900 text-amber-100 hover:text-white px-2.5 py-2 border-l border-amber-600/70 transition-colors cursor-pointer"
              title="Direct 1-Click Instant Download (.xlsx)"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 3. Sticker Summary Sheet: Opens Preview & Download Modal */}
          <div className="inline-flex rounded-lg shadow-sm overflow-hidden border border-teal-800">
            <button
              onClick={() => handleOpenPreview('summary')}
              className="bg-teal-700 hover:bg-teal-600 text-white font-bold text-xs px-3.5 py-2 flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Open Sticker Summary Preview & Download Modal"
            >
              <Eye className="h-4 w-4" />
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
              className="bg-teal-800 hover:bg-teal-900 text-teal-100 hover:text-white px-2.5 py-2 border-l border-teal-600/70 transition-colors cursor-pointer"
              title="Direct 1-Click Instant Download (.xlsx)"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 4. CIPL Logistics: Opens Modal Popup Directly */}
          <div className="inline-flex rounded-lg shadow-sm overflow-hidden border border-purple-800">
            <button
              onClick={() => handleOpenPreview('cipl_invoice')}
              className="bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs px-3.5 py-2 flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Open CIPL Logistics Builder & Preview Modal"
            >
              <Eye className="h-4 w-4" />
              <span>Download CIPL (.xlsx)</span>
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
              className="bg-purple-800 hover:bg-purple-900 text-purple-100 hover:text-white px-2.5 py-2 border-l border-purple-600/70 transition-colors cursor-pointer"
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
            className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm transition-colors"
            title="Generate & download official Supplier PO PDFs in ZIP bundle"
          >
            <Archive className="h-4 w-4" />
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
                  const { stampMTCDocument, createSampleMillCertificate, downloadPDFBlob } = await import('../../services/pdfEngine')
                  const { getAuthenticCertificateBytes } = await import('../../services/zipExtractor')
                  const mergedPdf = await PDFDocument.create()
                  let count = 0
                  for (const it of currentWorksheetData.items) {
                    const auth = await getAuthenticCertificateBytes(it.certificate_number, it.heat_number, it.description)
                    if (!auth) continue
                    const bytes = auth.bytes

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
              disabled={isExporting}
              className="bg-indigo-800 hover:bg-indigo-900 text-indigo-100 hover:text-white px-2.5 py-2 border-l border-indigo-600/70 transition-colors cursor-pointer"
              title="1-Click Direct Download Complete Stamped MTC Package (.pdf)"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Line Items Grid */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center space-x-2">
            <h2 className="font-bold text-sm text-slate-800">
              Live Sourcing &amp; Allocation Worksheet
            </h2>
            <span className="text-xs bg-slate-200 text-slate-700 font-mono px-2 py-0.5 rounded-full">
              {items.length} lines
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs flex-wrap gap-y-2">
            <span className="text-slate-600">
              Total Value: <strong className="text-slate-900">{currency} {totalAmount.toLocaleString()}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">
              Net Wt: <strong className="text-slate-900">{Math.round(totalNetWt * 100) / 100} kg</strong>
            </span>
            <div className="flex items-center space-x-1.5 pl-2 border-l border-slate-300">
              <button
                type="button"
                onClick={handleConvertToPO}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer shadow-xs"
                title="Convert selected items into a Purchase Order"
              >
                <ShoppingCart className="h-3 w-3" />
                <span>Purchase Order</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenCreateCertificate()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer shadow-xs"
                title="Create EN 10204 3.1 Mill Certificate"
              >
                <FileCheck2 className="h-3 w-3" />
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
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                title="Bulk apply Supplier PO to all items outside"
              >
                <Plus className="h-3 w-3 text-amber-700" />
                <span>Supplier PO</span>
              </button>
              <button
                type="button"
                onClick={() => setIsLocalPurchaseModalOpen(true)}
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                title="Select Local Supplier, which items and how many PCS"
              >
                <Wrench className="h-3 w-3 text-amber-700" />
                <span>Local Purchase</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenPreview('cipl_invoice')}
                className="bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 font-bold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1 transition-colors cursor-pointer"
                title="Open CIPL Builder & Preview"
              >
                <Eye className="h-3 w-3 text-purple-700" />
                <span>CIPL Builder</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setItems(prev => prev.map(item => ({ ...item, package_type: 'Pallet' })))
                  setStatusNotice('Set packaging to Pallet for all items!')
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs px-2 py-1.5 rounded-md transition-colors cursor-pointer"
                title="Set All Pallet"
              >
                All Pallet
              </button>
            </div>
            <button
              onClick={handleAddItem}
              className="bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-2.5 py-1.5 rounded-md flex items-center space-x-1"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Item</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="p-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && items.every(it => selectedItemIds.has(it.id))}
                    onChange={e => toggleSelectAll(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                    title="Select all items"
                  />
                </th>
                <th className="p-2.5 w-12 text-center">SL</th>
                <th className="p-2.5 w-20">PO Item</th>
                <th className="p-2.5 min-w-[260px]">Description &amp; Machining Spec</th>
                <th className="p-2.5 w-24 text-center">Qty / UOM</th>
                <th className="p-2.5 w-32 bg-sky-50 text-sky-900 border-b-2 border-sky-400 text-center">
                  Packaging (CIPL)
                  <span className="block text-[9px] text-sky-600 font-normal">Pallet / Box / #</span>
                </th>
                <th className="p-2.5 w-32">Heat Number</th>
                <th className="p-2.5 w-32">MTC Cert Ref</th>
                <th className="p-2.5 w-36">MAKE / Mfr</th>
                <th className="p-2.5 w-36">Supplier Name</th>
                <th className="p-2.5 w-36 bg-amber-50 text-amber-900 border-b-2 border-amber-400">
                  Supplier PO #
                  <span className="block text-[9px] text-amber-700 font-normal">Stores / CIPL</span>
                </th>
                <th className="p-2.5 w-28">HS Tariff</th>
                <th className="p-2.5 w-24">COO</th>
                <th className="p-2.5 w-24 text-right">Price ({currency})</th>
                <th className="p-2.5 w-20 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it, idx) => (
                <tr
                  key={it.id}
                  className={`hover:bg-slate-50/70 transition-colors ${
                    selectedItemIds.has(it.id) ? 'bg-amber-50/30' : ''
                  } ${
                    it.is_machined ? 'bg-amber-50/40' : ''
                  }`}
                >
                  {/* Select Checkbox & Local PO Button */}
                  <td className="p-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.has(it.id)}
                      onChange={() => toggleSelectItem(it.id)}
                      className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                      title="Select for Purchase Order / Local PO"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newSet = new Set(selectedItemIds)
                        newSet.add(it.id)
                        setSelectedItemIds(newSet)
                        setActivePortalTab('purchase_order')
                      }}
                      className="mt-1 block mx-auto text-[9px] font-bold text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-1 py-0.5 rounded cursor-pointer transition-colors"
                      title="Select this item and open Purchase Order tab"
                    >
                      PO
                    </button>
                  </td>

                  {/* SL NO */}
                  <td className="p-2.5 text-center font-bold text-slate-700">
                    {it.sl_no}
                  </td>

                  {/* Client PO Item No */}
                  <td className="p-2.5">
                    <input
                      type="text"
                      value={it.client_po_item_no}
                      onChange={e => handleUpdateItem(it.id, 'client_po_item_no', e.target.value)}
                      className="w-full border border-slate-200 rounded px-1.5 py-1 text-center font-mono text-xs"
                    />
                  </td>

                  {/* Description */}
                  <td className="p-2.5">
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

                  {/* Qty & UOM */}
                  <td className="p-2.5 text-center">
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

                  {/* Packaging (CIPL) */}
                  <td className="p-2.5 bg-sky-50/20">
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

                  {/* Heat Number */}
                  <td className="p-2.5 min-w-[150px]">
                    <HeatNumberCombobox
                      value={it.heat_number}
                      description={it.description}
                      extraLots={db.getLots()}
                      onChange={(heat, meta) => {
                        handleUpdateItem(it.id, 'heat_number', heat)
                        if (meta?.fileName) {
                          handleUpdateItem(it.id, 'certificate_number', meta.fileName)
                        }
                        if (meta?.isBenkan) {
                          if (!it.make || it.make.toUpperCase().includes('BENKAN') || it.make === 'MSG STOCK') {
                            handleUpdateItem(it.id, 'make', 'BENKAN THAILAND CORP')
                          }
                          if (!it.country_of_origin || it.country_of_origin === 'UAE') {
                            handleUpdateItem(it.id, 'country_of_origin', 'Thailand')
                          }
                        }
                      }}
                    />
                  </td>

                  {/* Certificate Number */}
                  <td className="p-2.5">
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
                        onClick={() => handleOpenCreateCertificate(it.id)}
                        className="p-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 transition-colors cursor-pointer shrink-0"
                        title="View, Preview & Download MTC Certificate"
                      >
                        <Eye className="h-3 w-3" />
                      </button>
                    </div>
                  </td>

                  {/* MAKE */}
                  <td className="p-2.5">
                    <input
                      type="text"
                      value={it.make}
                      onChange={e => handleUpdateItem(it.id, 'make', e.target.value)}
                      className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs font-semibold text-slate-800"
                    />
                  </td>

                  {/* Supplier Name */}
                  <td className="p-2.5">
                    <input
                      type="text"
                      value={it.supplier_name}
                      onChange={e => handleUpdateItem(it.id, 'supplier_name', e.target.value)}
                      className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs text-blue-900 font-medium"
                    />
                  </td>

                  {/* Supplier PO # */}
                  <td className="p-2.5 bg-amber-50/20">
                    <input
                      type="text"
                      value={it.supplier_po_number || ''}
                      onChange={e => handleUpdateItem(it.id, 'supplier_po_number', e.target.value)}
                      placeholder="PO #"
                      className="w-full border border-amber-300 rounded px-1.5 py-1 text-center font-mono text-xs font-bold text-amber-950 bg-white"
                    />
                  </td>

                  {/* HS Code */}
                  <td className="p-2.5">
                    <input
                      type="text"
                      value={it.hs_code}
                      onChange={e => handleUpdateItem(it.id, 'hs_code', e.target.value)}
                      className="w-full border border-slate-200 rounded px-1.5 py-1 text-center font-mono text-[11px] text-slate-700"
                    />
                  </td>

                  {/* COO */}
                  <td className="p-2.5">
                    <input
                      type="text"
                      value={it.country_of_origin}
                      onChange={e => handleUpdateItem(it.id, 'country_of_origin', e.target.value)}
                      className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-700"
                    />
                  </td>

                  {/* Price */}
                  <td className="p-2.5 text-right font-mono">
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

                  {/* Actions (Cert, Split, Delete) */}
                  <td className="p-2.5 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => handleOpenCreateCertificate(it.id)}
                        className="p-1 rounded text-indigo-600 hover:bg-indigo-50"
                        title="Create & customize EN 10204 3.1 Certificate for this item"
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Drafts Modal */}
      {isDraftsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Clock className="h-5 w-5 text-indigo-600" />
                <span>Saved Sourcing Drafts &amp; Worksheets</span>
              </h3>
              <button
                onClick={() => setIsDraftsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {draftsList.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No saved drafts found. Click &quot;Save Draft&quot; on any worksheet to preserve your progress.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {draftsList.map(draft => (
                  <div
                    key={draft.id}
                    className="p-3 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">
                        {draft.msg_ref} — {draft.client}
                      </h4>
                      <p className="text-xs text-slate-500 font-mono">
                        PO: {draft.po_number} | {draft.items.length} items | Saved: {new Date(draft.saved_at || '').toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleRestoreDraft(draft)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
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
        }}
        showToast={msg => setStatusNotice(msg)}
      />
    </div>
  )
}
