import React, { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  Package,
  Plus,
  Trash2,
  Split,
  FileSpreadsheet,
  FileText,
  Printer,
  Upload,
  Eye,
  Tag,
  CheckCircle2,
  Database,
  Scale,
  Edit3,
} from 'lucide-react'
import {
  SourcingWorksheetData,
  SourcingLineItem,
  extractQtyNumber,
  extractTotalQtyNumber,
  estimateUnitWeight,
} from '../../services/sourcingEngine'
import { db } from '../../services/db'
import {
  CIPLTemplateId,
  PackingLabelTemplateId,
  CIPLPackageConfig,
  CIPLPackageType,
  CIPLDocumentPayload,
  CIPL_TEMPLATES,
  PACKING_LABEL_TEMPLATES,
  computeCIPLPackageSummaries,
  normalizePkgNumber,
  mapPackageType,
  downloadCustomCIPLExcel,
  downloadCIPLPdf,
  downloadPackingLabelsPdf,
  downloadPackingLabelsExcel,
} from '../../services/ciplDocuments'

interface InPageCIPLTabProps {
  worksheetData: SourcingWorksheetData
  onApply: (updatedItems: SourcingLineItem[], stayInTab?: boolean) => void
  onBack: () => void
  showToast: (msg: string) => void
}

type CIPLViewMode = 'configure' | 'cipl_preview' | 'packing_labels'

const PACKAGE_TYPES: CIPLPackageType[] = ['PALLET', 'WOODEN BOX', 'CARTON BOX', 'WOODEN CRATE', 'BUNDLE']

export const InPageCIPLTab: React.FC<InPageCIPLTabProps> = ({
  worksheetData,
  onApply,
  onBack,
  showToast,
}) => {
  const [viewMode, setViewMode] = useState<CIPLViewMode>('configure')
  const [template, setTemplate] = useState<CIPLTemplateId>('standard')
  const [labelTemplate, setLabelTemplate] = useState<PackingLabelTemplateId>('warehouse_standard')

  const [invoiceNumber, setInvoiceNumber] = useState(() => {
    const ref = worksheetData.msg_ref || 'MSG-2026'
    return worksheetData.invoice_number || (ref.endsWith('-CI') ? ref : `${ref}-CI`)
  })
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().substring(0, 10))
  const [consigneeAddress, setConsigneeAddress] = useState('Industrial Logistics Zone, UAE / KSA')
  const [portOfLoading, setPortOfLoading] = useState(worksheetData.port_of_loading || 'Jebel Ali Port, Dubai, UAE')
  const [portOfDischarge, setPortOfDischarge] = useState(worksheetData.port_of_discharge || 'Dammam / Jubail')
  const [paymentTerms, setPaymentTerms] = useState(worksheetData.payment_terms || '30 Days Credit')

  const [ciplItems, setCiplItems] = useState<SourcingLineItem[]>([])
  const [weightSources, setWeightSources] = useState<Record<string, 'database' | 'certificate_excel' | 'estimated' | 'manual'>>({})
  const [packages, setPackages] = useState<CIPLPackageConfig[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const excelWeightInputRef = useRef<HTMLInputElement>(null)

  // Hydrate items + retrieve previously recorded DB / certificate Excel weights automatically
  useEffect(() => {
    const nextSources: Record<string, 'database' | 'certificate_excel' | 'estimated' | 'manual'> = {}
    const hydrated: SourcingLineItem[] = (worksheetData.items || []).map(it => {
      const qNum = extractQtyNumber(it.qty)
      const recorded = db.getRecordedItemWeight(it.description, (it as any).item_code, it.heat_number)
      let unitWt = it.unit_weight_kg || 0
      if (recorded) {
        unitWt = it.unit_weight_kg && it.unit_weight_kg > 0 ? it.unit_weight_kg : recorded.unit_weight_kg
        nextSources[it.id] = recorded.source === 'certificate_excel' ? 'certificate_excel' : 'database'
      } else if (unitWt > 0) {
        nextSources[it.id] = 'manual'
      } else {
        unitWt = estimateUnitWeight(it.description, it.uom)
        nextSources[it.id] = 'estimated'
      }
      const netWt = it.total_net_weight_kg && it.total_net_weight_kg > 0
        ? it.total_net_weight_kg
        : Math.round(qNum * unitWt * 100) / 100
      const grossWt = it.total_gross_weight_kg && it.total_gross_weight_kg > 0
        ? it.total_gross_weight_kg
        : Math.round(netWt * 1.1 * 100) / 100

      return {
        ...it,
        package_no: `PKG # ${normalizePkgNumber(it.package_no, it.package_type)}`,
        package_type: it.package_type || 'Pallet',
        unit_weight_kg: Math.round(unitWt * 1000) / 1000,
        total_net_weight_kg: Math.round(netWt * 100) / 100,
        total_gross_weight_kg: Math.round(grossWt * 100) / 100,
      }
    })

    setCiplItems(hydrated)
    setWeightSources(nextSources)

    // Ensure package definitions exist for every package number referenced
    setPackages(prev => {
      const existingMap = new Map(prev.map(p => [normalizePkgNumber(p.packageNo), p]))
      hydrated.forEach(it => {
        const pNo = normalizePkgNumber(it.package_no, it.package_type)
        if (!existingMap.has(pNo)) {
          existingMap.set(pNo, {
            id: `PKG-${pNo}`,
            packageNo: pNo,
            packageType: mapPackageType(it.package_type),
            dimensions: pNo === '1' ? '120 X 80 X 100 CM' : '100 X 80 X 80 CM',
            tareWeightKg: 15,
            shippingMark: `${worksheetData.client || 'CLIENT'} | PO ${worksheetData.po_number || ''}`,
          })
        }
      })
      if (existingMap.size === 0) {
        existingMap.set('1', {
          id: 'PKG-1',
          packageNo: '1',
          packageType: 'PALLET',
          dimensions: '120 X 80 X 100 CM',
          tareWeightKg: 15,
        })
      }
      return Array.from(existingMap.values()).sort((a, b) => (Number(a.packageNo) || 0) - (Number(b.packageNo) || 0))
    })
  }, [worksheetData])

  const payload: CIPLDocumentPayload = {
    client: worksheetData.client || 'Valued Client',
    consigneeAddress,
    poNumber: worksheetData.po_number || 'PO-MSG',
    msgRef: worksheetData.msg_ref || 'MSG-2026',
    invoiceNumber,
    invoiceDate,
    currency: worksheetData.currency === 'USD' ? 'USD' : 'AED',
    portOfLoading,
    portOfDischarge,
    paymentTerms,
    template,
    labelTemplate,
    items: ciplItems,
    packages,
  }

  const summary = computeCIPLPackageSummaries(payload)

  const persistToWorksheet = (nextItems: SourcingLineItem[], stayInTab = true) => {
    setCiplItems(nextItems)
    onApply(nextItems, stayInTab)
  }

  const handleAddPackage = () => {
    const maxNo = packages.reduce((m, p) => Math.max(m, Number(p.packageNo) || 0), 0)
    const nextNo = String(maxNo + 1)
    setPackages(prev => [
      ...prev,
      {
        id: `PKG-${nextNo}-${Date.now()}`,
        packageNo: nextNo,
        packageType: 'WOODEN BOX',
        dimensions: '100 X 80 X 80 CM',
        tareWeightKg: 15,
        shippingMark: `${worksheetData.client || 'CLIENT'} | PO ${worksheetData.po_number || ''}`,
      },
    ])
    showToast(`Added Package #${nextNo} (Wooden Box). You can now assign or split items into it.`)
  }

  const handleRemovePackage = (pkgNo: string) => {
    if (packages.length <= 1) {
      alert('At least 1 package is required.')
      return
    }
    const remaining = packages.filter(p => normalizePkgNumber(p.packageNo) !== normalizePkgNumber(pkgNo))
    const fallbackPkg = remaining[0]
    setPackages(remaining)
    const updatedItems = ciplItems.map(it =>
      normalizePkgNumber(it.package_no) === normalizePkgNumber(pkgNo)
        ? { ...it, package_no: `PKG # ${fallbackPkg.packageNo}`, package_type: fallbackPkg.packageType }
        : it
    )
    persistToWorksheet(updatedItems, true)
  }

  const handleUpdatePackage = (pkgNo: string, patch: Partial<CIPLPackageConfig>) => {
    setPackages(prev =>
      prev.map(p => (normalizePkgNumber(p.packageNo) === normalizePkgNumber(pkgNo) ? { ...p, ...patch } : p))
    )
    if (patch.packageType) {
      const updated = ciplItems.map(it =>
        normalizePkgNumber(it.package_no) === normalizePkgNumber(pkgNo)
          ? { ...it, package_type: patch.packageType }
          : it
      )
      setCiplItems(updated)
    }
  }

  const handleAssignItemPackage = (itemId: string, targetPkgNo: string) => {
    const targetPkg = packages.find(p => normalizePkgNumber(p.packageNo) === normalizePkgNumber(targetPkgNo))
    const updated = ciplItems.map(it =>
      it.id === itemId
        ? {
            ...it,
            package_no: `PKG # ${normalizePkgNumber(targetPkgNo)}`,
            package_type: targetPkg?.packageType || it.package_type || 'Pallet',
          }
        : it
    )
    persistToWorksheet(updated, true)
  }

  const handleSplitItemAcrossPackages = (itemId: string) => {
    const idx = ciplItems.findIndex(it => it.id === itemId)
    if (idx === -1) return
    const target = ciplItems[idx]
    const currentQty = extractQtyNumber(target.qty)
    if (currentQty <= 1) {
      alert('Quantity must be greater than 1 to split across packages.')
      return
    }

    // Ensure a second package exists automatically when splitting
    let targetPkgNo = packages.find(p => normalizePkgNumber(p.packageNo) !== normalizePkgNumber(target.package_no))?.packageNo
    let nextPackages = packages
    if (!targetPkgNo) {
      const nextNo = String(packages.reduce((m, p) => Math.max(m, Number(p.packageNo) || 0), 0) + 1)
      targetPkgNo = nextNo
      nextPackages = [
        ...packages,
        {
          id: `PKG-${nextNo}-${Date.now()}`,
          packageNo: nextNo,
          packageType: 'WOODEN BOX',
          dimensions: '100 X 80 X 80 CM',
          tareWeightKg: 15,
        },
      ]
      setPackages(nextPackages)
    }

    const splitFirst = Math.floor(currentQty / 2) || 1
    const splitSecond = Math.round((currentQty - splitFirst) * 100) / 100
    const origTotal = extractTotalQtyNumber(target.qty) || currentQty
    const unitWt = target.unit_weight_kg || 0
    const targetPkgObj = nextPackages.find(p => normalizePkgNumber(p.packageNo) === normalizePkgNumber(targetPkgNo))

    const firstPart: SourcingLineItem = {
      ...target,
      qty: `${splitFirst} OF ${origTotal}`,
      split_qty: `${splitFirst} OF ${origTotal}`,
      total_qty: origTotal,
      total_price: Math.round(splitFirst * (target.unit_price || 0) * 100) / 100,
      total_net_weight_kg: Math.round(splitFirst * unitWt * 100) / 100,
      total_gross_weight_kg: Math.round(splitFirst * unitWt * 1.1 * 100) / 100,
    }
    const secondPart: SourcingLineItem = {
      ...target,
      id: `${target.id}-PKGSPLIT-${Date.now()}`,
      qty: `${splitSecond} OF ${origTotal}`,
      split_qty: `${splitSecond} OF ${origTotal}`,
      total_qty: origTotal,
      package_no: `PKG # ${targetPkgNo}`,
      package_type: targetPkgObj?.packageType || 'WOODEN BOX',
      total_price: Math.round(splitSecond * (target.unit_price || 0) * 100) / 100,
      total_net_weight_kg: Math.round(splitSecond * unitWt * 100) / 100,
      total_gross_weight_kg: Math.round(splitSecond * unitWt * 1.1 * 100) / 100,
    }

    const updated = [...ciplItems]
    updated.splice(idx, 1, firstPart, secondPart)
    const renumbered = updated.map((it, i) => ({ ...it, sl_no: i + 1 }))
    persistToWorksheet(renumbered, true)
    showToast(`Split Item #${target.client_po_item_no || target.sl_no}: ${splitFirst} in Pkg #${normalizePkgNumber(target.package_no)} and ${splitSecond} in Pkg #${targetPkgNo}.`)
  }

  const handleUpdateItemWeight = (itemId: string, unitWt: number, netWtOverride?: number) => {
    const cleanUnit = Math.max(0, Number(unitWt) || 0)
    const updated = ciplItems.map(it => {
      if (it.id !== itemId) return it
      const q = extractQtyNumber(it.qty)
      const net = netWtOverride !== undefined ? Math.max(0, netWtOverride) : Math.round(q * cleanUnit * 100) / 100
      const derivedUnit = netWtOverride !== undefined && q > 0 ? Math.round((net / q) * 1000) / 1000 : cleanUnit
      if (derivedUnit > 0) {
        db.saveRecordedItemWeight(it.description, derivedUnit, {
          itemCode: (it as any).item_code,
          heatNumber: it.heat_number,
          uom: it.uom,
          source: 'manual',
        })
      }
      setWeightSources(prev => ({ ...prev, [itemId]: 'manual' }))
      return {
        ...it,
        unit_weight_kg: derivedUnit,
        total_net_weight_kg: net,
        total_gross_weight_kg: Math.round(net * 1.1 * 100) / 100,
      }
    })
    persistToWorksheet(updated, true)
  }

  const handleImportCertificateExcelWeights = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const res = db.importWeightsFromExcelBuffer(buf, 'sales@msgoilfield.ae')
      if (res.count === 0) {
        alert('No valid weight columns (Weight / Unit Weight / Net Weight) were found in the uploaded sheet.')
        return
      }
      let matched = 0
      const updated = ciplItems.map(it => {
        const rec = db.getRecordedItemWeight(it.description, (it as any).item_code, it.heat_number)
        if (!rec) return it
        matched++
        setWeightSources(prev => ({ ...prev, [it.id]: rec.source === 'certificate_excel' ? 'certificate_excel' : 'database' }))
        const q = extractQtyNumber(it.qty)
        const net = Math.round(q * rec.unit_weight_kg * 100) / 100
        return {
          ...it,
          unit_weight_kg: rec.unit_weight_kg,
          total_net_weight_kg: net,
          total_gross_weight_kg: Math.round(net * 1.1 * 100) / 100,
        }
      })
      persistToWorksheet(updated, true)
      showToast(`Imported ${res.count} weights from ${file.name} (${matched} matching item(s) updated in CIPL & saved to DB).`)
    } catch (err: any) {
      alert('Failed to import Certificate Excel sheet: ' + err.message)
    } finally {
      if (excelWeightInputRef.current) excelWeightInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <input
        ref={excelWeightInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleImportCertificateExcelWeights}
        className="hidden"
      />

      {/* Top Navigation & Deliverable Actions Header */}
      <div className="bg-white p-4 rounded-lg shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" />
              <span>Create CIPL &amp; Packing Labels Workbench</span>
            </h1>
            <p className="text-xs text-slate-500">
              {summary.totalPackages} Package(s) &bull; {summary.totalPieces} PCS &bull; Net: <strong>{summary.totalNetWeightKg.toFixed(2)} kg</strong> &bull; Gross: <strong>{summary.totalGrossWeightKg.toFixed(2)} kg</strong> &bull; Value: <strong>{payload.currency} {summary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => excelWeightInputRef.current?.click()}
            className="px-3 py-1.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold flex items-center gap-1.5 cursor-pointer"
            title="Import item/heat unit weights from Certificate Excel sheet"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import Cert Excel Weights</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            <span>Print</span>
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={async () => {
              setIsExporting(true)
              try {
                await downloadCIPLPdf(payload)
                showToast('Downloaded CIPL PDF successfully!')
              } finally {
                setIsExporting(false)
              }
            }}
            className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>CIPL (.pdf)</span>
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={async () => {
              setIsExporting(true)
              try {
                await downloadCustomCIPLExcel(payload)
                showToast('Downloaded CIPL Excel (.xlsx) successfully!')
              } finally {
                setIsExporting(false)
              }
            }}
            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>CIPL (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="bg-slate-100 p-1.5 rounded-lg border border-slate-200 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setViewMode('configure')}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${viewMode === 'configure' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200'}`}
        >
          <Scale className="h-3.5 w-3.5" />
          <span>1. Packages &amp; Weights ({packages.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('cipl_preview')}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${viewMode === 'cipl_preview' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200'}`}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>2. Preview &amp; Edit CIPL</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('packing_labels')}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${viewMode === 'packing_labels' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200'}`}
        >
          <Tag className="h-3.5 w-3.5" />
          <span>3. Create Packing Labels ({summary.totalPackages})</span>
        </button>
      </div>

      {/* VIEW 1: CONFIGURE PACKAGES & ITEM WEIGHTS */}
      {viewMode === 'configure' && (
        <div className="space-y-5">
          {/* Package Cards & Dimensions / Net / Gross Editor */}
          <div className="bg-white rounded-lg shadow-xs border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                <span>Shipment Packages (Pallets, Wooden Boxes, Crates)</span>
              </h2>
              <button
                type="button"
                onClick={handleAddPackage}
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Package</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {summary.packages.map(pkg => (
                <div key={pkg.config.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Package #{pkg.config.packageNo}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                        {pkg.items.length} line(s) | {pkg.totalPieces} PCS
                      </span>
                      {packages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePackage(pkg.config.packageNo)}
                          aria-label={`Remove Package ${pkg.config.packageNo}`}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Type</label>
                      <select
                        aria-label={`Package ${pkg.config.packageNo} Type`}
                        value={pkg.config.packageType}
                        onChange={e => handleUpdatePackage(pkg.config.packageNo, { packageType: e.target.value as CIPLPackageType })}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs bg-white font-medium"
                      >
                        {PACKAGE_TYPES.map(pt => (
                          <option key={pt} value={pt}>{pt}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Dimensions</label>
                      <input
                        type="text"
                        aria-label={`Package ${pkg.config.packageNo} Dimensions`}
                        value={pkg.config.dimensions}
                        onChange={e => handleUpdatePackage(pkg.config.packageNo, { dimensions: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Net Wt (kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`Package ${pkg.config.packageNo} Net Weight`}
                        value={pkg.config.manualNetWeightKg !== undefined ? pkg.config.manualNetWeightKg : pkg.netWeightKg}
                        onChange={e => handleUpdatePackage(pkg.config.packageNo, { manualNetWeightKg: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Gross Wt (kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`Package ${pkg.config.packageNo} Gross Weight`}
                        value={pkg.config.manualGrossWeightKg !== undefined ? pkg.config.manualGrossWeightKg : pkg.grossWeightKg}
                        onChange={e => handleUpdatePackage(pkg.config.packageNo, { manualGrossWeightKg: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Item Weights & Package Allocation Table */}
          <div className="bg-white rounded-lg shadow-xs border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-900">
                Item Weight Persistence (DB + Certificate Excel) &amp; Package Allocation
              </div>
              <button
                type="button"
                onClick={() => setViewMode('packing_labels')}
                className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Tag className="h-3.5 w-3.5" />
                <span>Generate Packing Labels</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 w-12 text-center">SL</th>
                    <th className="p-2.5 min-w-[240px]">Description</th>
                    <th className="p-2.5 w-24 text-center">Qty</th>
                    <th className="p-2.5 w-44">Assign Package</th>
                    <th className="p-2.5 w-32 text-right">Item Wt (kg)</th>
                    <th className="p-2.5 w-28 text-right">Net Wt (kg)</th>
                    <th className="p-2.5 w-36 text-center">Weight Source / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ciplItems.map(it => {
                    const src = weightSources[it.id] || 'estimated'
                    const pkgNum = normalizePkgNumber(it.package_no, it.package_type)
                    return (
                      <tr key={it.id} className="hover:bg-slate-50/70">
                        <td className="p-2.5 text-center font-bold">{it.sl_no}</td>
                        <td className="p-2.5 text-slate-800">{it.description}</td>
                        <td className="p-2.5 text-center font-mono font-bold">
                          {it.qty} {it.uom}
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-1">
                            <select
                              aria-label={`Assign package for item ${it.sl_no}`}
                              value={pkgNum}
                              onChange={e => handleAssignItemPackage(it.id, e.target.value)}
                              className="w-full border border-slate-300 rounded px-2 py-1 text-xs bg-white font-semibold"
                            >
                              {packages.map(p => (
                                <option key={p.id} value={normalizePkgNumber(p.packageNo)}>
                                  Pkg #{p.packageNo} ({p.packageType})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleSplitItemAcrossPackages(it.id)}
                              title="Split item quantity across packages"
                              aria-label={`Split item ${it.sl_no} across packages`}
                              className="p-1.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer shrink-0"
                            >
                              <Split className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="p-2.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={`Unit weight kg for item ${it.sl_no}`}
                            value={it.unit_weight_kg || 0}
                            onChange={e => handleUpdateItemWeight(it.id, Number(e.target.value))}
                            className="w-24 border border-slate-300 rounded px-2 py-1 text-right font-mono font-bold text-xs bg-white"
                          />
                        </td>
                        <td className="p-2.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={`Net weight kg for item ${it.sl_no}`}
                            value={it.total_net_weight_kg || 0}
                            onChange={e => handleUpdateItemWeight(it.id, it.unit_weight_kg || 0, Number(e.target.value))}
                            className="w-24 border border-slate-200 rounded px-2 py-1 text-right font-mono text-xs bg-slate-50"
                          />
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${src === 'database'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : src === 'certificate_excel'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : src === 'manual'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                          >
                            <Database className="h-2.5 w-2.5" />
                            <span>
                              {src === 'database'
                                ? 'From DB'
                                : src === 'certificate_excel'
                                  ? 'Cert Excel'
                                  : src === 'manual'
                                    ? 'Saved in DB'
                                    : 'Auto-Est'}
                            </span>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: PREVIEW & EDIT CIPL (WITH MULTIPLE TEMPLATES) */}
      {viewMode === 'cipl_preview' && (
        <div className="bg-white rounded-lg shadow-xs border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-semibold text-slate-900">CIPL Template &amp; Live Editable Header</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label className="font-semibold text-slate-600">CIPL Template:</label>
              <select
                aria-label="CIPL Template Selector"
                value={template}
                onChange={e => setTemplate(e.target.value as CIPLTemplateId)}
                className="border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold bg-white"
              >
                {CIPL_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Invoice Number</label>
              <input
                type="text"
                aria-label="CIPL Invoice Number"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 font-mono font-bold bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Consignee Address</label>
              <input
                type="text"
                value={consigneeAddress}
                onChange={e => setConsigneeAddress(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Port of Loading</label>
              <input
                type="text"
                value={portOfLoading}
                onChange={e => setPortOfLoading(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Port of Discharge</label>
              <input
                type="text"
                value={portOfDischarge}
                onChange={e => setPortOfDischarge(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
              />
            </div>
          </div>

          {/* Live Package-by-Package Preview */}
          <div className="border border-slate-300 rounded-lg p-4 space-y-4 text-xs">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <div className="font-bold text-sm text-slate-900">MSG OILFIELD EQUIPMENT TRADING LLC</div>
                <div className="text-[11px] text-slate-500">Commercial Invoice &amp; Packing List ({CIPL_TEMPLATES.find(t => t.id === template)?.name})</div>
              </div>
              <div className="text-right font-mono text-[11px]">
                <div>Inv #: <strong>{invoiceNumber}</strong></div>
                <div>PO #: <strong>{payload.poNumber}</strong> | Date: {invoiceDate}</div>
              </div>
            </div>

            {summary.packages.map(pkg => (
              <div key={pkg.config.id} className="border border-slate-200 rounded overflow-hidden">
                <div className="px-3 py-2 bg-slate-100 font-semibold flex flex-wrap justify-between text-[11px]">
                  <span>Package #{pkg.config.packageNo} ({pkg.config.packageType}) — Dims: {pkg.config.dimensions}</span>
                  <span>Net: {pkg.netWeightKg.toFixed(2)} kg | Gross: {pkg.grossWeightKg.toFixed(2)} kg</span>
                </div>
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-2">Description</th>
                      <th className="p-2 text-center">Qty</th>
                      {template === 'oilfield_detailed' && <th className="p-2">Heat # / Make</th>}
                      <th className="p-2 text-right">Unit Wt (kg)</th>
                      <th className="p-2 text-right">Net Wt (kg)</th>
                      <th className="p-2 text-right">Value ({payload.currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pkg.items.map(entry => (
                      <tr key={entry.item.id}>
                        <td className="p-2">{entry.item.description}</td>
                        <td className="p-2 text-center font-mono">{entry.qty} {entry.item.uom}</td>
                        {template === 'oilfield_detailed' && (
                          <td className="p-2 font-mono">{entry.item.heat_number || '-'} / {entry.item.make || '-'}</td>
                        )}
                        <td className="p-2 text-right font-mono">{entry.unitWeightKg.toFixed(2)}</td>
                        <td className="p-2 text-right font-mono">{entry.netWeightKg.toFixed(2)}</td>
                        <td className="p-2 text-right font-mono font-semibold">{entry.lineTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 3: INDIVIDUAL PACKING LABELS PER PACKAGE (PDF & EXCEL + PRINT) */}
      {viewMode === 'packing_labels' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Tag className="h-4 w-4 text-indigo-600" />
              <span className="font-semibold text-slate-900">Packing Label Template:</span>
              <select
                aria-label="Packing Label Template Selector"
                value={labelTemplate}
                onChange={e => setLabelTemplate(e.target.value as PackingLabelTemplateId)}
                className="border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold bg-white"
              >
                {PACKING_LABEL_TEMPLATES.map(lt => (
                  <option key={lt.id} value={lt.id}>{lt.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print All Labels</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await downloadPackingLabelsPdf(payload)
                  showToast('Downloaded Packing Labels PDF for all packages!')
                }}
                className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Download Labels (.pdf)</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await downloadPackingLabelsExcel(payload)
                  showToast('Downloaded Packing Labels Excel (.xlsx) for all packages!')
                }}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Download Labels (.xlsx)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {summary.packages.map(pkg => (
              <div
                key={pkg.config.id}
                data-packing-label={pkg.config.packageNo}
                className="bg-white rounded-lg border-2 border-slate-800 shadow-sm overflow-hidden flex flex-col"
              >
                <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-300">MSG Oilfield Dispatch Label ({PACKING_LABEL_TEMPLATES.find(t => t.id === labelTemplate)?.name})</div>
                    <div className="text-sm font-bold">
                      PACKAGE #{pkg.config.packageNo} OF {summary.totalPackages} &mdash; {pkg.config.packageType}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => downloadPackingLabelsPdf(payload, pkg.config.packageNo)}
                      aria-label={`Download Label PDF for Package ${pkg.config.packageNo}`}
                      className="px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-white text-[10px] font-semibold cursor-pointer"
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadPackingLabelsExcel(payload, pkg.config.packageNo)}
                      aria-label={`Download Label Excel for Package ${pkg.config.packageNo}`}
                      className="px-2 py-1 rounded bg-emerald-500/80 hover:bg-emerald-500 text-white text-[10px] font-semibold cursor-pointer"
                    >
                      Excel
                    </button>
                  </div>
                </div>

                <div className="p-4 space-y-3 text-xs flex-1">
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px]">
                    <div><strong>Consignee:</strong> {payload.client}</div>
                    <div><strong>PO #:</strong> <span className="font-mono">{payload.poNumber}</span></div>
                    <div><strong>Dims:</strong> <span className="font-mono">{pkg.config.dimensions}</span></div>
                    <div><strong>Net / Gross:</strong> <span className="font-mono font-bold">{pkg.netWeightKg.toFixed(2)} / {pkg.grossWeightKg.toFixed(2)} kg</span></div>
                  </div>

                  <table className="w-full text-left text-[11px] border border-slate-200">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="p-1.5 w-8 text-center">#</th>
                        <th className="p-1.5">Material Description</th>
                        <th className="p-1.5 w-20 text-center">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pkg.items.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-3 text-center text-slate-400">Empty package</td>
                        </tr>
                      ) : pkg.items.map((entry, idx) => (
                        <tr key={entry.item.id}>
                          <td className="p-1.5 text-center font-mono">{idx + 1}</td>
                          <td className="p-1.5">
                            <div>{entry.item.description}</div>
                            {entry.item.heat_number && (
                              <span className="text-[10px] font-mono text-slate-500">Heat: {entry.item.heat_number}</span>
                            )}
                          </td>
                          <td className="p-1.5 text-center font-mono font-bold">
                            {entry.qty} {entry.item.uom}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Total Items: {pkg.totalPieces} PCS</span>
                  </span>
                  <span className="font-mono">Inv: {invoiceNumber}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
