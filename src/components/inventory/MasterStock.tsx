import React, { useState } from 'react'
import { db } from '../../services/db'
import { useAuth } from '../../context/AuthContext'
import { exportMasterStock } from '../../services/excelEngine'
import {
  Search,
  Filter,
  Download,
  Upload,
  Plus,
  FileCheck2,
  AlertTriangle,
  Flame,
  Calendar,
  Building,
  CheckCircle,
  ExternalLink,
  FolderArchive,
  RefreshCw,
  X,
  UploadCloud,
} from 'lucide-react'
import {
  mergeSelectedCertificates,
  downloadCertificatesAsZip,
  createSampleMillCertificate,
  downloadPDFBlob,
} from '../../services/pdfEngine'
import { getUploadedCertificateBytes } from '../../services/zipExtractor'
import { pushAllTablesToSupabase, isSupabaseConfigured } from '../../services/supabase'

interface MasterStockProps {
  onSelectHeat: (heat: string) => void
  onOpenImport: () => void
  onPreviewMTC: (docName: string, itemCode: string, heat: string) => void
}

export const MasterStock: React.FC<MasterStockProps> = ({ onSelectHeat, onOpenImport, onPreviewMTC }) => {
  const { hasPermission, currentUser } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'regular' | 'local_purchase'>('all')
  const [missingMTCOnly, setMissingMTCOnly] = useState(false)
  const [isAddLotModalOpen, setIsAddLotModalOpen] = useState(false)

  // Persistent Client Review MTC Selection Basket (persists across searches/filters)
  const [selectedLotIds, setSelectedLotIds] = useState<Set<string>>(new Set())
  const [sampleWatermark, setSampleWatermark] = useState<boolean>(true)
  const [isExportingSelection, setIsExportingSelection] = useState<boolean>(false)

  // New lot form state
  const [newItemId, setNewItemId] = useState('')
  const [newHeatNumber, setNewHeatNumber] = useState('')
  const [newYom, setNewYom] = useState<number>(2025)
  const [newQty, setNewQty] = useState<number>(10)
  const [newPurchaseType, setNewPurchaseType] = useState<'regular' | 'local_purchase'>('regular')
  const [newSupplier, setNewSupplier] = useState('')
  const [newLocation, setNewLocation] = useState('LN-EB1')
  const [newLCode, setNewLCode] = useState('')

  const stockView = db.getMasterStockView()
  const items = db.getItems()

  // Filtered Stock List
  const filteredStock = stockView.filter(s => {
    const matchesSearch =
      s.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.item_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.heat_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.l_code && s.l_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
      s.warehouse_location.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = typeFilter === 'all' || s.purchase_type === typeFilter
    const matchesMTC = !missingMTCOnly || s.mtc_status === 'Missing MTC'

    return matchesSearch && matchesType && matchesMTC
  })

  const canAddStock = hasPermission(['super_admin', 'admin_inventory'])

  const handleUploadMissingMTC = (
    e: React.ChangeEvent<HTMLInputElement>,
    heatNumber: string,
    itemCode: string,
    supplierName?: string
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const res = db.uploadMTCForHeat(
        heatNumber,
        {
          fileName: file.name,
          fileDataUrl: dataUrl,
          itemCode,
          supplierName,
          pages: 2
        },
        currentUser?.email || 'operations@msgoilfield.ae'
      )

      if (isSupabaseConfigured()) {
        pushAllTablesToSupabase(db).catch(err => console.warn('Supabase MTC sync note:', err))
      }

      alert(`MTC Certificate "${file.name}" linked successfully to Heat ${heatNumber}! Affected Lots: ${res.affectedLots}, Orders: ${res.affectedOrders}`)
    }
    reader.readAsDataURL(file)
  }

  const handleAddLotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemId || !newHeatNumber || newQty <= 0) {
      alert('Please fill all mandatory fields.')
      return
    }

    const res = db.addStockLot({
      item_id: newItemId,
      heat_number: newHeatNumber.trim(),
      yom: Number(newYom) || 2025,
      quantity: Number(newQty),
      purchase_type: newPurchaseType,
      supplier_name: newSupplier || (newPurchaseType === 'local_purchase' ? 'Local Supplier UAE' : 'International Mill'),
      warehouse_location: newLocation,
      l_code: newLCode.trim() || undefined,
      userEmail: currentUser?.email || 'admin@msgoilfield.ae'
    })

    if (res.success) {
      if (isSupabaseConfigured()) {
        await pushAllTablesToSupabase(db).catch(err => console.warn('Supabase stock push note:', err))
      }
      alert(`Stock Lot with Heat ${newHeatNumber} successfully added and synced to Supabase Cloud!`)
      setIsAddLotModalOpen(false)
      setNewHeatNumber('')
      setNewLCode('')
    } else {
      alert(res.message || 'Failed to add stock lot')
    }
  }

  // Persistent selection basket helpers
  const handleToggleSelectLot = (lotId: string) => {
    setSelectedLotIds(prev => {
      const next = new Set(prev)
      if (next.has(lotId)) next.delete(lotId)
      else next.add(lotId)
      return next
    })
  }

  const handleToggleSelectAllVisible = () => {
    const allVisibleIds = filteredStock.map(s => s.id)
    const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedLotIds.has(id))
    setSelectedLotIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        allVisibleIds.forEach(id => next.delete(id))
      } else {
        allVisibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const handleClearSelectedBasket = () => {
    setSelectedLotIds(new Set())
  }

  // Export selected certificates combined into a single merged PDF with optional SAMPLE watermark
  const handleExportSelectedMerged = async () => {
    if (selectedLotIds.size === 0) return
    setIsExportingSelection(true)
    try {
      const allLots = stockView.filter(s => selectedLotIds.has(s.id))
      const mtcs = db.getMTCs()
      const certList: { fileName: string; heatNumber: string; itemCode: string; bytes: Uint8Array }[] = []

      for (const lot of allLots) {
        let bytes: Uint8Array | null = null
        const matchedMtc = mtcs.find(m => m.stock_lot_id === lot.id || m.heat_number.toUpperCase() === lot.heat_number.toUpperCase())
        if (matchedMtc) {
          bytes = getUploadedCertificateBytes(matchedMtc.certificate_reference) || getUploadedCertificateBytes(matchedMtc.heat_number)
        }
        if (!bytes) {
          bytes = getUploadedCertificateBytes(lot.heat_number)
        }
        if (!bytes) {
          bytes = await createSampleMillCertificate(
            lot.item_code,
            lot.heat_number,
            lot.yom || 2026,
            2
          )
        }
        const fileName = matchedMtc?.certificate_reference || `MTC-${lot.heat_number}.pdf`
        certList.push({
          fileName: fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`,
          heatNumber: lot.heat_number,
          itemCode: lot.item_code,
          bytes
        })
      }

      const watermarkStr = sampleWatermark ? 'SAMPLE - FOR CLIENT REVIEW ONLY' : undefined
      const mergedBytes = await mergeSelectedCertificates(certList, { watermarkText: watermarkStr })
      const docName = `MSG_MTC_Review_Dossier_${certList.length}_Certs${sampleWatermark ? '_SAMPLE' : ''}.pdf`
      downloadPDFBlob(mergedBytes, docName)
    } catch (err: any) {
      alert('Error compiling certificates: ' + err.message)
    } finally {
      setIsExportingSelection(false)
    }
  }

  // Export selected certificates as a bundled ZIP archive with optional SAMPLE watermark
  const handleExportSelectedZip = async () => {
    if (selectedLotIds.size === 0) return
    setIsExportingSelection(true)
    try {
      const allLots = stockView.filter(s => selectedLotIds.has(s.id))
      const mtcs = db.getMTCs()
      const certList: { fileName: string; bytes: Uint8Array }[] = []

      for (const lot of allLots) {
        let bytes: Uint8Array | null = null
        const matchedMtc = mtcs.find(m => m.stock_lot_id === lot.id || m.heat_number.toUpperCase() === lot.heat_number.toUpperCase())
        if (matchedMtc) {
          bytes = getUploadedCertificateBytes(matchedMtc.certificate_reference) || getUploadedCertificateBytes(matchedMtc.heat_number)
        }
        if (!bytes) {
          bytes = getUploadedCertificateBytes(lot.heat_number)
        }
        if (!bytes) {
          bytes = await createSampleMillCertificate(
            lot.item_code,
            lot.heat_number,
            lot.yom || 2026,
            2
          )
        }
        const fileName = matchedMtc?.certificate_reference || `MTC-${lot.heat_number}.pdf`
        certList.push({
          fileName: fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`,
          bytes
        })
      }

      const watermarkStr = sampleWatermark ? 'SAMPLE - FOR CLIENT REVIEW ONLY' : undefined
      const zipName = `MSG_MTC_Certificates_${certList.length}_Items${sampleWatermark ? '_SAMPLE' : ''}.zip`
      await downloadCertificatesAsZip(certList, zipName, { watermarkText: watermarkStr })
    } catch (err: any) {
      alert('Error creating ZIP archive: ' + err.message)
    } finally {
      setIsExportingSelection(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Zoho Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-4 rounded-lg border border-slate-200">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Master Stock Inventory</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Heat-traceable physical inventory, YOM, L-Codes, and live warehouse balances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenImport}
            className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs px-3 py-2 rounded-md border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            <span>Import Excel</span>
          </button>

          <button
            onClick={() => exportMasterStock()}
            className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs px-3 py-2 rounded-md border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export (.xlsx)</span>
          </button>

          {canAddStock && (
            <button
              onClick={() => setIsAddLotModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>New Stock Lot</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Item Code, Heat#, L-Code, Warehouse..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-medium text-slate-600">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-800 font-medium"
            >
              <option value="all">All Types</option>
              <option value="regular">Regular Mill Stock</option>
              <option value="local_purchase">Local Purchase (L-Codes)</option>
            </select>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
            <input
              type="checkbox"
              checked={missingMTCOnly}
              onChange={(e) => setMissingMTCOnly(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Missing MTC Only</span>
          </label>
        </div>
      </div>

      {/* Master Stock Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[11px] font-semibold tracking-wider">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredStock.length > 0 && filteredStock.every(s => selectedLotIds.has(s.id))}
                    onChange={handleToggleSelectAllVisible}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    title="Select/Deselect All Visible Lots"
                  />
                </th>
                <th className="py-3 px-3">Item Code &amp; Description</th>
                <th className="py-3 px-3">Heat Number</th>
                <th className="py-3 px-3">YOM</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">L-Code</th>
                <th className="py-3 px-3 text-right">Physical</th>
                <th className="py-3 px-3 text-right">Reserved</th>
                <th className="py-3 px-3 text-right">Available</th>
                <th className="py-3 px-3 text-right">Dispatched</th>
                <th className="py-3 px-3">Warehouse</th>
                <th className="py-3 px-3">MTC</th>
                <th className="py-3 px-3 text-center">Trace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStock.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="bg-slate-100 h-11 w-11 rounded-full flex items-center justify-center mx-auto text-slate-400">
                        <FolderArchive className="h-5 w-5" />
                      </div>
                      <div className="text-sm font-semibold text-slate-800">
                        {stockView.length === 0 ? 'No Stock Lots Registered' : 'No stock lots match the filter criteria'}
                      </div>
                      <p className="text-xs text-slate-500">
                        {stockView.length === 0
                          ? 'Upload your 6-column inventory spreadsheet or add a stock lot to get started.'
                          : 'Try clearing your search terms or filters.'}
                      </p>
                      {stockView.length === 0 && (
                        <div className="flex justify-center items-center gap-2 pt-1">
                          <button
                            onClick={onOpenImport}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 cursor-pointer"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            <span>Import Excel</span>
                          </button>
                          <button
                            onClick={() => db.resetToDemoData()}
                            className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium px-3.5 py-2 rounded-md border border-slate-300 flex items-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Restore Sample</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStock.map((s) => {
                  const isLowStock = s.available_qty <= 10
                  const isMissingMTC = s.mtc_status === 'Missing MTC'
                  const isMissingYOM = !s.yom

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        selectedLotIds.has(s.id) ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedLotIds.has(s.id)}
                          onChange={() => handleToggleSelectLot(s.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-2.5 px-3 max-w-xs">
                        <div className="font-mono font-semibold text-slate-900">{s.item_code}</div>
                        <div className="text-[11px] text-slate-500 line-clamp-1">{s.item_description}</div>
                        <div className="text-[10px] text-slate-400">{s.material_grade} &bull; {s.size}</div>
                      </td>

                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => onSelectHeat(s.heat_number)}
                          className="font-mono font-semibold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{s.heat_number}</span>
                        </button>
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{s.supplier_name}</div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {isMissingYOM ? (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200 font-medium px-2 py-0.5 rounded text-[10px]">
                            Missing
                          </span>
                        ) : (
                          <span className="font-mono text-slate-700 text-[11px]">{s.yom}</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="bg-slate-100 text-slate-700 border border-slate-200 font-medium px-2 py-0.5 rounded text-[10px]">
                          {s.purchase_type === 'local_purchase' ? 'Local' : 'Mill Stock'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {s.l_code ? (
                          <span className="font-mono text-slate-800 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                            {s.l_code}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{s.physical_qty}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={s.reserved_qty > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'}>
                          {s.reserved_qty}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`font-semibold text-xs px-2 py-0.5 rounded border ${
                            s.available_qty === 0
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : isLowStock
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {s.available_qty} {s.uom}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600">{s.dispatched_qty}</td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-mono text-slate-600 text-[11px]">{s.warehouse_location}</span>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {isMissingMTC ? (
                          <div className="flex items-center gap-1.5">
                            <span className="bg-rose-50 text-rose-700 border border-rose-200 font-medium px-1.5 py-0.5 rounded text-[10px]">
                              Missing
                            </span>
                            <label className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium px-2 py-0.5 rounded text-[10px] cursor-pointer flex items-center gap-1">
                              <UploadCloud className="h-2.5 w-2.5" />
                              <span>Upload</span>
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => handleUploadMissingMTC(e, s.heat_number, s.item_code, s.supplier_name)}
                              />
                            </label>
                          </div>
                        ) : (
                          <button
                            onClick={() => onPreviewMTC(s.mtc_ref || 'sample-mtc.pdf', s.item_code, s.heat_number)}
                            className="text-emerald-700 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                          >
                            <FileCheck2 className="h-3.5 w-3.5" />
                            <span>{s.mtc_status}</span>
                          </button>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => onSelectHeat(s.heat_number)}
                          className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-100 cursor-pointer"
                          title="View 360 Traceability"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="bg-slate-50 p-3 border-t border-slate-200 flex flex-wrap justify-between items-center text-xs text-slate-500">
          <div>
            Showing <span className="font-bold text-slate-700">{filteredStock.length}</span> of{' '}
            <span className="font-bold text-slate-700">{stockView.length}</span> stock lots
          </div>
          <div className="flex space-x-4">
            <span>Physical Total: <strong className="text-slate-800">{stockView.reduce((a, b) => a + b.physical_qty, 0)} PCS</strong></span>
            <span>Available Total: <strong className="text-emerald-700">{stockView.reduce((a, b) => a + b.available_qty, 0)} PCS</strong></span>
            <span>Reserved Total: <strong className="text-amber-700">{stockView.reduce((a, b) => a + b.reserved_qty, 0)} PCS</strong></span>
          </div>
        </div>
      </div>

      {/* Register Stock Lot Modal */}
      {isAddLotModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] flex flex-col shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex justify-between items-center gap-2 shrink-0">
              <h3 className="font-semibold text-sm text-slate-900">Register New Stock Lot</h3>
              <button onClick={() => setIsAddLotModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            <form onSubmit={handleAddLotSubmit} className="p-5 space-y-3.5 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Item Code *</label>
                <select
                  required
                  value={newItemId}
                  onChange={(e) => setNewItemId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                >
                  <option value="">-- Choose Item from Item Master --</option>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.item_code} - {it.item_description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Heat Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HEAT-9941A"
                    value={newHeatNumber}
                    onChange={(e) => setNewHeatNumber(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Year of Mfg (YOM) *</label>
                  <input
                    type="number"
                    min="2010"
                    max="2030"
                    required
                    value={newYom}
                    onChange={(e) => setNewYom(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Received Quantity (PCS) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newQty}
                    onChange={(e) => setNewQty(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Purchase Type *</label>
                  <select
                    value={newPurchaseType}
                    onChange={(e) => setNewPurchaseType(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="regular">Regular Stock (Mill Certificate)</option>
                    <option value="local_purchase">Local Purchase (Requires L-Code & Stamp)</option>
                  </select>
                </div>
              </div>

              {newPurchaseType === 'local_purchase' && (
                <div>
                  <label className="block font-semibold text-amber-800 mb-1">L-Code (Local Purchase Identifier)</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if blank (e.g. L-WSO80150-10)"
                    value={newLCode}
                    onChange={(e) => setNewLCode(e.target.value)}
                    className="w-full border border-amber-300 bg-amber-50/50 rounded-lg p-2 font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supplier / Mill Name</label>
                  <input
                    type="text"
                    placeholder="e.g. WMASS Germany"
                    value={newSupplier}
                    onChange={(e) => setNewSupplier(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Warehouse Location</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddLotModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-md text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
                >
                  Save Stock Lot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Client Review MTC Basket Toolbar */}
      {selectedLotIds.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-white text-slate-900 px-5 py-3.5 rounded-lg shadow-xl border border-slate-200 max-w-4xl w-[calc(100vw-2rem)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <span className="bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-xs px-2.5 py-1 rounded-full tabular-nums">
              {selectedLotIds.size} Selected
            </span>
            <div>
              <div className="text-xs font-semibold text-slate-900 flex items-center space-x-1.5">
                <FileCheck2 className="h-4 w-4 text-blue-600" />
                <span>Client Review MTC Dossier Basket</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Persistent across searches &bull; Select items, review heats, and export together
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Watermark checkbox */}
            <label className="flex items-center space-x-2 text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-md cursor-pointer hover:bg-slate-100 select-none">
              <input
                type="checkbox"
                checked={sampleWatermark}
                onChange={(e) => setSampleWatermark(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="font-medium text-slate-700">
                Stamp <strong className="text-slate-900 font-mono">'SAMPLE'</strong> Watermark
              </span>
            </label>

            {/* Combine & Download Merged PDF */}
            <button
              type="button"
              onClick={handleExportSelectedMerged}
              disabled={isExportingSelection}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold px-3.5 py-1.5 rounded-md shadow-sm flex items-center space-x-1.5 transition-colors"
              title="Combine all selected MTC certificates into one PDF document with cover sheet"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isExportingSelection ? 'Generating...' : 'Combine & Download (.pdf)'}</span>
            </button>

            {/* Download Selected as ZIP */}
            <button
              type="button"
              onClick={handleExportSelectedZip}
              disabled={isExportingSelection}
              className="bg-white hover:bg-slate-50 disabled:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold px-3.5 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors"
              title="Download all selected MTC certificates as a bundled ZIP file"
            >
              <FolderArchive className="h-3.5 w-3.5 text-slate-500" />
              <span>Download ZIP</span>
            </button>

            {/* Clear Basket */}
            <button
              type="button"
              onClick={handleClearSelectedBasket}
              className="text-slate-500 hover:text-slate-800 text-xs font-medium px-2 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
