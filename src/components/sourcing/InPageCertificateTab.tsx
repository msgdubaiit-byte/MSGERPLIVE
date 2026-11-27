import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeft,
  FileCheck2,
  Download,
  Upload,
  Eye,
  RefreshCw,
  Building,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Archive,
  Search,
  Check,
  Trash2,
  ShieldCheck,
  Package,
  Sparkles,
  X,
} from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { SourcingWorksheetData, SourcingLineItem } from '../../services/sourcingEngine'
import {
  stampMTCDocument,
  downloadPDFBlob,
  downloadCertificatesAsZip,
} from '../../services/pdfEngine'
import {
  registerUploadedCertificate,
  getUploadedCertificateBytes,
  getAuthenticCertificateBytes,
  getVaultManifest,
  detectHeatNumberFromFilename,
  extractCertificatesFromZip,
  safeFetchPdfBytes,
  resolveBackendMtcBytes,
  hasSelectedHeatNumber,
  hasAvailableMtcForItem,
  ManifestCertificate
} from '../../services/zipExtractor'
import { db } from '../../services/db'
import { HeatNumberCombobox } from './HeatNumberCombobox'

interface InPageCertificateTabProps {
  worksheetData: SourcingWorksheetData
  activeItemId?: string
  onApply: (itemId: string, certDetails: { heat_number: string; certificate_number: string; make?: string; country_of_origin?: string }) => void
  onBack: () => void
  showToast: (msg: string) => void
}

export const InPageCertificateTab: React.FC<InPageCertificateTabProps> = ({
  worksheetData,
  activeItemId,
  onApply,
  onBack,
  showToast,
}) => {
  const items = worksheetData.items

  // Distinct POs in worksheet
  const distinctPOs = Array.from(
    new Set(items.map(it => it.supplier_po_number || 'Main Stock').filter(Boolean))
  ) as string[]

  const [selectedPOFilter, setSelectedPOFilter] = useState<string>('ALL')

  const displayItems = selectedPOFilter === 'ALL'
    ? items
    : items.filter(it => (it.supplier_po_number || 'Main Stock') === selectedPOFilter)

  const [selectedId, setSelectedId] = useState<string>(() => activeItemId || items[0]?.id || '')
  const currentItem = items.find(it => it.id === selectedId) || displayItems[0] || items[0]

  // Stamping Options
  const [applyStamp, setApplyStamp] = useState(true)
  const [inspectorName, setInspectorName] = useState('Alex Turner / MSG QA-04')
  const [stampDate, setStampDate] = useState(() => new Date().toISOString().substring(0, 10))

  // Vault manifest for synchronous MTC availability checks
  const [vaultManifest, setVaultManifest] = useState<ManifestCertificate[]>([])
  useEffect(() => {
    getVaultManifest()
      .then(list => {
        if (Array.isArray(list)) setVaultManifest(list)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (activeItemId) setSelectedId(activeItemId)
  }, [activeItemId])

  // Live PDF Preview (pop-up modal triggered by Preview button)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const previewReqIdRef = useRef(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isProcessingUpload, setIsProcessingUpload] = useState(false)
  const [isPackaging, setIsPackaging] = useState(false)

  // Hidden inputs for file uploads
  const bulkFileInputRef = useRef<HTMLInputElement>(null)
  const itemFileInputRef = useRef<HTMLInputElement>(null)
  const [targetUploadItemId, setTargetUploadItemId] = useState<string | null>(null)

  const hasHeatNumber = useCallback((it?: SourcingLineItem | null): boolean => {
    return hasSelectedHeatNumber(it?.heat_number)
  }, [])

  // Check if an item has a selected heat number AND an authentic MTC available in cache, vault manifest, stored_files, or db
  const hasCertificate = useCallback((it?: SourcingLineItem | null): boolean => {
    return hasAvailableMtcForItem(it, vaultManifest, db.getStoredFiles(), db.getMTCs())
  }, [vaultManifest])

  // Retrieve raw PDF bytes for an item (strictly tied to the item's heat/certificate ref)
  const getItemCertBytes = useCallback(async (it: SourcingLineItem): Promise<Uint8Array | null> => {
    if (!hasHeatNumber(it)) return null

    const certRef = it.certificate_number
    const heat = it.heat_number

    // 1. Authentic Certificate from Cache or Bulk Zip Vault (matched by certRef or heat only)
    const authCert = await getAuthenticCertificateBytes(certRef, heat)
    if (authCert) {
      return authCert.bytes
    }

    // 2. Backend / Database MTC check
    const dbMtc = db.getMTCs().find(m =>
      (heat && m.heat_number.toUpperCase() === heat.toUpperCase()) ||
      (certRef && m.certificate_reference.toUpperCase() === certRef.toUpperCase())
    )
    if (dbMtc) {
      const directUrl = (dbMtc as any).file_data_url || dbMtc.original_file_path
      if (directUrl) {
        const fetched = await safeFetchPdfBytes(directUrl)
        if (fetched) return fetched
      }
    }

    // 3. Backend stored_files fallback (/api/mtc/resolve)
    const backendBytes = await resolveBackendMtcBytes(
      (certRef && certRef !== 'MTC-REF') ? certRef : dbMtc?.original_file_path || dbMtc?.certificate_reference,
      heat || dbMtc?.heat_number
    )
    if (backendBytes) {
      const fileName = (certRef && certRef !== 'MTC-REF') ? certRef : `MTC-${heat}.pdf`
      registerUploadedCertificate(fileName, backendBytes, fileName, heat)
      return backendBytes
    }

    // Never generate fake certificates: return null if authentic document is not yet attached
    return null
  }, [hasHeatNumber])

  // Render Live Preview for the currently selected item
  const handleRenderPreview = useCallback(async () => {
    const reqId = ++previewReqIdRef.current
    if (!currentItem || !hasCertificate(currentItem)) {
      if (previewUrlRef.current) {
        window.URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      setPreviewPdfUrl(null)
      setIsGenerating(false)
      return
    }

    setIsGenerating(true)
    try {
      const rawBytes = await getItemCertBytes(currentItem)
      if (reqId !== previewReqIdRef.current) return

      if (!rawBytes) {
        if (previewUrlRef.current) {
          window.URL.revokeObjectURL(previewUrlRef.current)
          previewUrlRef.current = null
        }
        setPreviewPdfUrl(null)
        return
      }

      let finalBytes = rawBytes
      if (applyStamp) {
        finalBytes = await stampMTCDocument(
          rawBytes,
          {
            poNo: worksheetData.po_number || 'PO-MSG',
            itemNo: currentItem.client_po_item_no || String(currentItem.sl_no),
            qty: `${currentItem.qty} ${currentItem.uom}`,
            sign: inspectorName,
            dateStr: stampDate,
            make: currentItem.make,
            heatNo: currentItem.heat_number,
            certificateRef: currentItem.certificate_number,
            description: currentItem.description,
          },
          true
        )
      }
      if (reqId !== previewReqIdRef.current) return

      const blob = new Blob([finalBytes as any], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      if (previewUrlRef.current) {
        window.URL.revokeObjectURL(previewUrlRef.current)
      }
      previewUrlRef.current = url
      setPreviewPdfUrl(url)
    } catch (err: any) {
      if (reqId === previewReqIdRef.current) {
        console.error('Error rendering live certificate preview:', err)
        setPreviewPdfUrl(null)
      }
    } finally {
      if (reqId === previewReqIdRef.current) {
        setIsGenerating(false)
      }
    }
  }, [currentItem, hasCertificate, getItemCertBytes, applyStamp, inspectorName, stampDate, worksheetData.po_number])

  useEffect(() => {
    if (!isPreviewOpen) return
    handleRenderPreview()
  }, [isPreviewOpen, handleRenderPreview])

  useEffect(() => {
    if (!isPreviewOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPreviewOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isPreviewOpen])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        window.URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  // Single Item Upload Handler
  const handleItemFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !targetUploadItemId) return

    setIsProcessingUpload(true)
    try {
      const arrayBuf = await file.arrayBuffer()
      const fileBytes = new Uint8Array(arrayBuf)
      const detectedHeat = detectHeatNumberFromFilename(file.name)
      const certRef = file.name

      // Register into Vault
      registerUploadedCertificate(certRef, fileBytes, file.name, detectedHeat)
      if (detectedHeat) {
        registerUploadedCertificate(detectedHeat, fileBytes, file.name, detectedHeat)
      }

      // Update worksheet item state
      onApply(targetUploadItemId, {
        heat_number: detectedHeat || currentItem.heat_number || `HT-${Math.floor(100000 + Math.random() * 900000)}`,
        certificate_number: certRef,
      })

      showToast(`Supplier MTC "${file.name}" uploaded and attached to item successfully!`)
      setSelectedId(targetUploadItemId)
      setTimeout(() => handleRenderPreview(), 100)
    } catch (err: any) {
      alert('Error reading uploaded certificate: ' + err.message)
    } finally {
      setIsProcessingUpload(false)
      setTargetUploadItemId(null)
      if (itemFileInputRef.current) itemFileInputRef.current.value = ''
    }
  }

  // Bulk Upload Handler (PDFs or ZIP)
  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setIsProcessingUpload(true)
    try {
      let attachedCount = 0

      for (const file of files) {
        // If file is a ZIP archive
        if (file.name.toLowerCase().endsWith('.zip')) {
          const candidateHeats = items.map(it => it.heat_number).filter(Boolean)
          const extracted = await extractCertificatesFromZip(file, candidateHeats)

          extracted.forEach(ext => {
            const cleanHeat = ext.heatNumber.toUpperCase()
            // Match against worksheet items
            const matchedItem = items.find(it =>
              (it.heat_number && it.heat_number.toUpperCase() === cleanHeat) ||
              (it.certificate_number && it.certificate_number.toUpperCase() === ext.fileName.toUpperCase())
            )

            if (matchedItem) {
              onApply(matchedItem.id, {
                heat_number: cleanHeat,
                certificate_number: ext.fileName,
              })
              attachedCount++
            }
          })
        }
        // If file is a PDF
        else if (file.name.toLowerCase().endsWith('.pdf')) {
          const arrayBuf = await file.arrayBuffer()
          const fileBytes = new Uint8Array(arrayBuf)
          const detectedHeat = detectHeatNumberFromFilename(file.name)
          const certRef = file.name

          registerUploadedCertificate(certRef, fileBytes, file.name, detectedHeat)
          if (detectedHeat) {
            registerUploadedCertificate(detectedHeat, fileBytes, file.name, detectedHeat)
          }

          // Match by heat number or match sequentially
          const matchedItem = items.find(it =>
            detectedHeat && it.heat_number && it.heat_number.toUpperCase() === detectedHeat.toUpperCase()
          )

          if (matchedItem) {
            onApply(matchedItem.id, {
              heat_number: detectedHeat,
              certificate_number: certRef,
            })
            attachedCount++
          } else {
            // Find first item without an attached certificate
            const firstUnattached = items.find(it => !hasCertificate(it))
            if (firstUnattached) {
              onApply(firstUnattached.id, {
                heat_number: detectedHeat || firstUnattached.heat_number || 'HT-NEW',
                certificate_number: certRef,
              })
              attachedCount++
            }
          }
        }
      }

      showToast(`Bulk upload complete! Processed ${files.length} file(s) and attached ${attachedCount} certificate(s) to order lines.`)
      setTimeout(() => handleRenderPreview(), 200)
    } catch (err: any) {
      alert('Error during bulk MTC upload: ' + err.message)
    } finally {
      setIsProcessingUpload(false)
      if (bulkFileInputRef.current) bulkFileInputRef.current.value = ''
    }
  }

  // Single Item Download Stamped MTC
  const handleDownloadSingle = async (it: SourcingLineItem) => {
    if (!hasCertificate(it)) {
      alert(
        !hasHeatNumber(it)
          ? 'Please select a Heat Number for this item before downloading its MTC.'
          : 'No authentic MTC certificate is available for this item.'
      )
      return
    }
    try {
      const rawBytes = await getItemCertBytes(it)
      if (!rawBytes) {
        alert('Could not retrieve certificate document for this item.')
        return
      }

      let finalBytes = rawBytes
      if (applyStamp) {
        finalBytes = await stampMTCDocument(
          rawBytes,
          {
            poNo: worksheetData.po_number || 'PO-MSG',
            itemNo: it.client_po_item_no || String(it.sl_no),
            qty: `${it.qty} ${it.uom}`,
            sign: inspectorName,
            dateStr: stampDate,
            make: it.make,
            heatNo: it.heat_number,
            certificateRef: it.certificate_number,
            description: it.description,
          },
          true
        )
      }

      const safeName = (it.certificate_number && it.certificate_number.toLowerCase().endsWith('.pdf'))
        ? it.certificate_number
        : `MTC_${it.heat_number || it.client_po_item_no || 'CERT'}_Certified.pdf`

      downloadPDFBlob(finalBytes, safeName)
      showToast(`Downloaded stamped certificate: ${safeName}`)
    } catch (err: any) {
      alert('Error downloading certificate: ' + err.message)
    }
  }

  // Download All Attached MTCs as a Unified Merged PDF Package
  const handleDownloadAllMerged = async () => {
    setIsPackaging(true)
    try {
      const mergedPdf = await PDFDocument.create()
      let includedCount = 0

      for (const it of displayItems) {
        const rawBytes = await getItemCertBytes(it)
        if (rawBytes) {
          try {
            let stampedBytes = rawBytes
            if (applyStamp) {
              stampedBytes = await stampMTCDocument(
                rawBytes,
                {
                  poNo: it.supplier_po_number || worksheetData.po_number || 'PO-MSG',
                  itemNo: it.client_po_item_no || String(it.sl_no),
                  qty: `${it.qty} ${it.uom}`,
                  sign: inspectorName,
                  dateStr: stampDate,
                  make: it.make,
                  heatNo: it.heat_number,
                  certificateRef: it.certificate_number,
                  description: it.description,
                },
                true
              )
            }

            const docToMerge = await PDFDocument.load(stampedBytes)
            const pages = await mergedPdf.copyPages(docToMerge, docToMerge.getPageIndices())
            pages.forEach(p => mergedPdf.addPage(p))
            includedCount++
          } catch (itemErr) {
            console.warn('Skipping unreadable MTC PDF during merge:', it.heat_number || it.certificate_number, itemErr)
          }
        }
      }

      if (includedCount === 0) {
        alert('No certificates found to merge.')
        return
      }

      const mergedBytes = await mergedPdf.save()
      const poLabel = selectedPOFilter === 'ALL' ? (worksheetData.po_number || 'PO') : selectedPOFilter
      const pkgName = `${poLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}_Complete_MTC_Package.pdf`
      downloadPDFBlob(mergedBytes, pkgName)
      showToast(`Merged & downloaded complete MTC package (${includedCount} certificates) into ${pkgName}!`)
    } catch (err: any) {
      alert('Error packaging merged MTCs: ' + err.message)
    } finally {
      setIsPackaging(false)
    }
  }

  // Download All MTCs as a ZIP Archive
  const handleDownloadAllZip = async () => {
    setIsPackaging(true)
    try {
      const certList: { fileName: string; bytes: Uint8Array }[] = []

      for (const it of displayItems) {
        const rawBytes = await getItemCertBytes(it)
        if (rawBytes) {
          let stampedBytes = rawBytes
          if (applyStamp) {
            stampedBytes = await stampMTCDocument(
              rawBytes,
              {
                poNo: it.supplier_po_number || worksheetData.po_number || 'PO-MSG',
                itemNo: it.client_po_item_no || String(it.sl_no),
                qty: `${it.qty} ${it.uom}`,
                sign: inspectorName,
                dateStr: stampDate,
                make: it.make,
                heatNo: it.heat_number,
                certificateRef: it.certificate_number,
                description: it.description,
              },
              true
            )
          }

          const certName = (it.certificate_number && it.certificate_number.toLowerCase().endsWith('.pdf'))
            ? it.certificate_number
            : `MTC_Item_${it.client_po_item_no || it.sl_no}_Heat_${it.heat_number || 'Cert'}.pdf`

          certList.push({ fileName: certName, bytes: stampedBytes })
        }
      }

      if (certList.length === 0) {
        alert('No certificates found to bundle.')
        return
      }

      const poLabel = selectedPOFilter === 'ALL' ? (worksheetData.po_number || 'PO') : selectedPOFilter
      const zipName = `${poLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}_All_MTC_Certificates.zip`
      await downloadCertificatesAsZip(certList, zipName)
      showToast(`Bundled & downloaded ${certList.length} certificates into ${zipName}!`)
    } catch (err: any) {
      alert('Error bundling certificates to ZIP: ' + err.message)
    } finally {
      setIsPackaging(false)
    }
  }

  const attachedCount = displayItems.filter(it => hasCertificate(it)).length
  const currentHasHeat = hasHeatNumber(currentItem)
  const currentHasMtc = hasCertificate(currentItem)

  return (
    <div className="space-y-5">
      {/* Hidden File Upload Inputs */}
      <input
        ref={bulkFileInputRef}
        type="file"
        multiple
        accept=".pdf,.zip"
        onChange={handleBulkUpload}
        className="hidden"
      />
      <input
        ref={itemFileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleItemFileUpload}
        className="hidden"
      />

      {/* Top Navigation & Status Bar */}
      <div className="bg-white p-5 rounded-lg shadow-xs border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Return to Sourcing Worksheet"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="text-base font-semibold text-slate-900 flex items-center space-x-2">
              <FileCheck2 className="h-4 w-4 text-blue-600" />
              <span>MTC Certificates Hub</span>
            </h1>
            <p className="text-xs text-slate-500">
              Attach supplier mill certificates, preview with MSG Certified True Copy stamp, and download individual or PO packages.
            </p>
          </div>
        </div>

        {/* Bulk Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-Link from 338 authentic certificates Bulk ZIP Vault */}
          <button
            onClick={async () => {
              setIsProcessingUpload(true)
              try {
                let count = 0
                for (const it of items) {
                  const auth = await getAuthenticCertificateBytes(it.certificate_number, it.heat_number, it.description)
                  if (auth && (!it.certificate_number || it.certificate_number === 'MTC-REF')) {
                    onApply(it.id, {
                      heat_number: auth.heatNumber || it.heat_number,
                      certificate_number: auth.fileName,
                    })
                    count++
                  }
                }
                showToast(`Auto-linked ${count} item(s) to authentic certificates from bulk ZIP vault!`)
                handleRenderPreview()
              } catch (err: any) {
                alert('Error linking vault certificates: ' + err.message)
              } finally {
                setIsProcessingUpload(false)
              }
            }}
            disabled={isProcessingUpload}
            className="bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Auto-match and link authentic Mill Test Certificates from the 338-certificate bulk ZIP vault"
          >
            <Sparkles className="h-3.5 w-3.5 text-slate-500" />
            <span>Auto-Link Vault</span>
          </button>

          <button
            onClick={() => bulkFileInputRef.current?.click()}
            disabled={isProcessingUpload}
            className="bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Upload multiple supplier MTC PDFs or a ZIP archive containing all certificates"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            <span>{isProcessingUpload ? 'Processing...' : 'Bulk Upload (PDF/ZIP)'}</span>
          </button>

          <button
            onClick={handleDownloadAllZip}
            disabled={isPackaging || attachedCount === 0}
            className="bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
            title={attachedCount === 0 ? 'Attach or select Heat Numbers with available MTCs first' : 'Download all attached certificates for this PO bundled in a .zip archive'}
          >
            <Archive className="h-3.5 w-3.5 text-slate-500" />
            <span>Download All (.zip)</span>
          </button>

          <button
            onClick={handleDownloadAllMerged}
            disabled={isPackaging || attachedCount === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-md flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            title={attachedCount === 0 ? 'Attach or select Heat Numbers with available MTCs first' : 'Download all attached certificates for this PO merged into a single PDF document'}
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isPackaging ? 'Packaging...' : 'Download Complete MTC (.pdf)'}</span>
          </button>
        </div>
      </div>

      {/* PO Overview Banner */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-4 flex-wrap gap-y-1">
          <span className="text-slate-600">
            Customer: <strong className="text-slate-900">{worksheetData.client || 'N/A'}</strong>
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">
            Customer PO #: <strong className="text-slate-900 font-mono">{worksheetData.po_number || 'N/A'}</strong>
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">
            Order Ref: <strong className="text-slate-900 font-mono">{worksheetData.msg_ref || 'N/A'}</strong>
          </span>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-y-1">
          {/* PO Selector Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="font-medium text-slate-600">Select PO:</span>
            <select
              value={selectedPOFilter}
              onChange={e => {
                const val = e.target.value
                setSelectedPOFilter(val)
                const firstIt = (val === 'ALL' ? items : items.filter(it => (it.supplier_po_number || 'Main Stock') === val))[0]
                if (firstIt) setSelectedId(firstIt.id)
              }}
              className="border border-slate-300 rounded-md px-2.5 py-1 text-xs font-mono font-medium bg-white text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              <option value="ALL">All POs / Full Order ({items.length} lines)</option>
              {distinctPOs.map(po => {
                const count = items.filter(it => (it.supplier_po_number || 'Main Stock') === po).length
                return (
                  <option key={po} value={po}>PO: {po} ({count} lines)</option>
                )
              })}
            </select>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500">Status:</span>
            <span className={`px-2.5 py-0.5 rounded-full font-medium text-[11px] border tabular-nums ${attachedCount === displayItems.length
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
              {attachedCount} of {displayItems.length} Attached
            </span>
          </div>
        </div>
      </div>

      {/* Main Full-Width Line Items Table */}
      <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-xs border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-white border-b border-slate-200 flex justify-between items-center">
              <h2 className="font-semibold text-xs uppercase tracking-wider text-slate-700 flex items-center space-x-2">
                <Package className="h-4 w-4 text-blue-600" />
                <span>PO Line Items &amp; Attached MTC Certificates</span>
              </h2>
              <span className="text-xs text-slate-500">
                Click the Preview icon on any line to inspect stamped MTC
              </span>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 w-12 text-center">SL</th>
                    <th className="p-2.5 w-16">Item #</th>
                    <th className="p-2.5 min-w-[200px]">Description</th>
                    <th className="p-2.5 w-20 text-center">Qty</th>
                    <th className="p-2.5 w-28">Heat Number</th>
                    <th className="p-2.5 w-32">Certificate Ref</th>
                    <th className="p-2.5 w-28 text-center">Status</th>
                    <th className="p-2.5 w-32 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayItems.map(it => {
                    const isSelected = it.id === selectedId
                    const rowHasHeat = hasHeatNumber(it)
                    const isAttached = hasCertificate(it)
                    const disabledActionReason = !rowHasHeat
                      ? 'Select a Heat Number first'
                      : 'No MTC certificate available for this item'

                    return (
                      <tr
                        key={it.id}
                        onClick={() => setSelectedId(it.id)}
                        className={`transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/60 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                          }`}
                      >
                        {/* SL */}
                        <td className="p-2.5 text-center font-bold text-slate-700">
                          {it.sl_no}
                        </td>

                        {/* PO Item No */}
                        <td className="p-2.5 font-mono text-slate-600">
                          {it.client_po_item_no || `${it.sl_no}`}
                        </td>

                        {/* Description */}
                        <td className="p-2.5 text-slate-800 leading-snug">
                          <span className="font-medium">{it.description}</span>
                          {it.make && (
                            <span className="block text-[10px] text-slate-500 mt-0.5">
                              Make: {it.make}
                            </span>
                          )}
                        </td>

                        {/* Qty */}
                        <td className="p-2.5 text-center font-bold text-slate-700 font-mono">
                          {it.qty} {it.uom}
                        </td>

                        {/* Heat Number (Dropdown / Editable) */}
                        <td className="p-2.5 min-w-[140px]" onClick={e => e.stopPropagation()}>
                          <HeatNumberCombobox
                            value={it.heat_number || ''}
                            description={it.description}
                            extraLots={db.getMasterStockView()}
                            placeholder="Heat #"
                            onChange={(heat, meta) => {
                              const trimmedHeat = heat.trim()
                              setSelectedId(it.id)
                              onApply(it.id, {
                                heat_number: heat,
                                certificate_number: !trimmedHeat ? '' : (meta?.fileName || ''),
                                ...(meta?.make ? { make: meta.make } : meta?.isBenkan ? { make: 'BENKAN THAILAND CORP' } : {}),
                                ...(meta?.countryOfOrigin ? { country_of_origin: meta.countryOfOrigin } : meta?.isBenkan ? { country_of_origin: 'Thailand' } : {}),
                              })
                            }}
                          />
                        </td>

                        {/* Certificate Reference */}
                        <td className="p-2.5 font-mono text-[11px] text-slate-600 truncate max-w-[120px]" title={it.certificate_number}>
                          {it.certificate_number || '-'}
                        </td>

                        {/* Status */}
                        <td className="p-2.5 text-center">
                          {isAttached ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <Check className="h-3 w-3" />
                              <span>Attached</span>
                            </span>
                          ) : !rowHasHeat ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                              <span>No Heat #</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              <span>Missing PDF</span>
                            </span>
                          )}
                        </td>

                        {/* Row Actions */}
                        <td className="p-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center space-x-1">
                            {/* Upload / Replace PDF */}
                            <button
                              type="button"
                              onClick={() => {
                                setTargetUploadItemId(it.id)
                                itemFileInputRef.current?.click()
                              }}
                              className="p-1 rounded text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                              title={isAttached ? 'Replace uploaded PDF certificate' : 'Upload supplier MTC PDF for this line'}
                            >
                              <Upload className="h-3.5 w-3.5" />
                            </button>

                            {/* Preview */}
                            <button
                              type="button"
                              disabled={!isAttached}
                              onClick={() => {
                                setSelectedId(it.id)
                                setIsPreviewOpen(true)
                              }}
                              className="p-1 rounded text-blue-600 hover:bg-blue-50 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
                              title={isAttached ? 'Preview certificate with MSG True-Copy stamp' : disabledActionReason}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>

                            {/* Download Stamped */}
                            <button
                              type="button"
                              disabled={!isAttached}
                              onClick={() => handleDownloadSingle(it)}
                              className="p-1 rounded text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
                              title={isAttached ? 'Download stamped certificate (.pdf)' : disabledActionReason}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stamping Settings Card */}
          <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyStamp}
                  onChange={e => setApplyStamp(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                <span>Apply Official MSG Oilfield &quot;CERTIFIED TRUE COPY&quot; Stamp</span>
              </label>
              <span className="text-[10px] font-mono font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                Verification Stamp
              </span>
            </div>

            {applyStamp && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">QA Inspector Name</label>
                  <input
                    type="text"
                    value={inspectorName}
                    onChange={e => setInspectorName(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Verification Date</label>
                  <input
                    type="date"
                    value={stampDate}
                    onChange={e => setStampDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                  />
                </div>
              </div>
            )}
          </div>
      </div>

      {/* Live Stamped Certificate Preview Popup Modal (opens only on Preview button click) */}
      {isPreviewOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Live Stamped Certificate Preview"
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col w-full max-w-4xl h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Eye className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-xs text-slate-800">
                  Live Stamped Certificate Preview
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={handleRenderPreview}
                  disabled={isGenerating || !currentItem || !currentHasMtc}
                  className="text-xs text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed font-medium flex items-center space-x-1 cursor-pointer"
                  title={!currentHasHeat ? 'Select a Heat Number first' : !currentHasMtc ? 'No MTC certificate available' : 'Refresh preview'}
                >
                  <RefreshCw className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 flex items-center space-x-1 transition-colors cursor-pointer"
                  aria-label="Close preview"
                  title="Close preview"
                >
                  <X className="h-4 w-4" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Selected item metadata bar */}
            {currentItem && (
              <div className="px-3.5 py-2 bg-white border-b border-slate-200 text-xs flex justify-between items-center">
                <div>
                  <span className="font-semibold text-slate-800">
                    Item #{currentItem.client_po_item_no || currentItem.sl_no}:
                  </span>
                  <span className="text-slate-600 ml-1.5 font-mono">
                    Heat: <strong className="text-slate-900">{currentItem.heat_number || 'N/A'}</strong>
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetUploadItemId(currentItem.id)
                      itemFileInputRef.current?.click()
                    }}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-[11px] font-medium px-2 py-0.5 rounded cursor-pointer"
                  >
                    Upload PDF
                  </button>
                </div>
              </div>
            )}

            {/* Embedded Iframe */}
            <div className="flex-1 bg-slate-100 relative flex items-center justify-center overflow-hidden">
              {isGenerating ? (
                <div className="text-center p-6 text-slate-500 text-xs">
                  <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin text-slate-400" />
                  Loading authentic certificate...
                </div>
              ) : previewPdfUrl ? (
                <iframe
                  src={`${previewPdfUrl}#toolbar=0&view=FitH`}
                  title="MTC Certificate Preview"
                  className="w-full h-full border-none"
                />
              ) : (
                <div className="text-center p-6 text-slate-500 text-xs flex flex-col items-center">
                  <FileCheck2 className="h-10 w-10 text-slate-400 mb-2" />
                  <p className="font-semibold text-slate-700">
                    {!currentHasHeat ? 'No Heat Number Selected' : 'No Authentic Certificate Attached'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                    {!currentHasHeat
                      ? 'Select a Heat Number for this line item or upload a supplier PDF to preview and download its MTC.'
                      : `No certificate found for Heat "${currentItem?.heat_number}" in the vault. Upload the authentic supplier PDF or select another Heat Number.`}
                  </p>
                  <button
                    type="button"
                    disabled={!currentItem}
                    onClick={() => {
                      setTargetUploadItemId(currentItem?.id || null)
                      itemFileInputRef.current?.click()
                    }}
                    className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-md flex items-center space-x-1 cursor-pointer"
                  >
                    <Upload className="h-3 w-3" />
                    <span>Upload Authentic PDF</span>
                  </button>
                </div>
              )}
            </div>

            {/* Footer with Direct Download */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <span className="text-[11px] text-slate-500 font-mono truncate max-w-[320px]" title={currentItem?.certificate_number}>
                {currentHasMtc ? (currentItem?.certificate_number || `MTC-${currentItem?.heat_number}.pdf`) : 'No MTC available'}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => currentItem && handleDownloadSingle(currentItem)}
                  disabled={isGenerating || !currentItem || !currentHasMtc}
                  title={!currentHasHeat ? 'Select a Heat Number first' : !currentHasMtc ? 'No MTC certificate available for this item' : 'Download stamped MTC (.pdf)'}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-md flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Stamped MTC</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
