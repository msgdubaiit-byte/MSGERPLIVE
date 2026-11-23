import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  FileCheck2,
  Download,
  Save,
  Eye,
  RefreshCw,
  Sparkles,
  Building,
  Flame,
  CheckCircle2,
  ShieldCheck,
  FileText,
  Sliders,
} from 'lucide-react'
import { SourcingWorksheetData, SourcingLineItem } from '../../services/sourcingEngine'
import {
  generateEN10204Certificate,
  downloadPdfBlob,
  EN10204CertData,
} from '../../services/pdfEngine'

interface InPageCertificateTabProps {
  worksheetData: SourcingWorksheetData
  activeItemId?: string
  onApply: (itemId: string, certDetails: { heat_number: string; certificate_number: string; make?: string; country_of_origin?: string }) => void
  onBack: () => void
  showToast: (msg: string) => void
}

const PRESETS = {
  ss316: {
    name: 'SS316 / 316L Dual Grade',
    grade: 'ASTM A182 F316 / F316L DUAL CERTIFIED',
    spec: 'ASME B16.5 CLASS 150 RF / NACE MR0175',
    deliv: 'Solution Annealed @ 1050°C & Water Quenched',
    coo: 'Germany (EU)',
    c: '0.018',
    si: '0.42',
    mn: '1.45',
    p: '0.028',
    s: '0.002',
    cr: '16.85',
    ni: '10.20',
    mo: '2.08',
    n: '0.045',
    cu: '0.18',
    tensile: '585',
    yieldVal: '275',
    elong: '52',
    redArea: '64',
    hardness: '165',
    charpy: '120',
    charpyTemp: '-46',
  },
  a105: {
    name: 'ASTM A105 Carbon Steel',
    grade: 'ASTM A105N NORMALIZED CARBON STEEL',
    spec: 'ASME B16.5 CLASS 150/300 RF',
    deliv: 'Normalized @ 910°C & Air Cooled',
    coo: 'Italy',
    c: '0.21',
    si: '0.24',
    mn: '0.95',
    p: '0.012',
    s: '0.008',
    cr: '0.12',
    ni: '0.08',
    mo: '0.02',
    n: '0.008',
    cu: '0.15',
    tensile: '535',
    yieldVal: '310',
    elong: '32',
    redArea: '56',
    hardness: '156',
    charpy: '85',
    charpyTemp: '-29',
  },
  a234: {
    name: 'ASTM A234 WPB Wrought Fitting',
    grade: 'ASTM A234 WPB SEAMLESS',
    spec: 'ASME B16.9 BUTT-WELD FITTING SCH 40/80',
    deliv: 'Normalized & Stress Relieved',
    coo: 'Thailand',
    c: '0.19',
    si: '0.26',
    mn: '1.05',
    p: '0.014',
    s: '0.009',
    cr: '0.08',
    ni: '0.06',
    mo: '0.02',
    n: '0.006',
    cu: '0.12',
    tensile: '510',
    yieldVal: '295',
    elong: '34',
    redArea: '58',
    hardness: '148',
    charpy: '92',
    charpyTemp: '-20',
  },
  duplex2205: {
    name: 'Duplex 2205 (UNS S31803 / S32205)',
    grade: 'ASTM A182 F51 / F60 DUPLEX 2205',
    spec: 'ASME B16.5 / NACE MR0175 / ISO 15156',
    deliv: 'Solution Annealed @ 1060°C & Water Quenched',
    coo: 'France',
    c: '0.022',
    si: '0.45',
    mn: '1.35',
    p: '0.024',
    s: '0.001',
    cr: '22.40',
    ni: '5.60',
    mo: '3.15',
    n: '0.170',
    cu: '0.22',
    tensile: '760',
    yieldVal: '530',
    elong: '31',
    redArea: '55',
    hardness: '240',
    charpy: '135',
    charpyTemp: '-46',
  },
}

export const InPageCertificateTab: React.FC<InPageCertificateTabProps> = ({
  worksheetData,
  activeItemId,
  onApply,
  onBack,
  showToast,
}) => {
  const items = worksheetData.items
  const [selectedId, setSelectedId] = useState<string>(() => activeItemId || items[0]?.id || '')

  const currentItem = items.find(it => it.id === selectedId) || items[0]

  // Form State
  const [certNumber, setCertNumber] = useState('')
  const [manufacturer, setManufacturer] = useState('WMASS FLANGES & FITTINGS GMBH')
  const [manufacturerAddress, setManufacturerAddress] = useState('Industriestrasse 18, 45141 Essen, Germany')
  const [clientName, setClientName] = useState(worksheetData.client || 'MSG OILFIELD SUPPLIES LLC')
  const [poNumber, setPoNumber] = useState(worksheetData.po_number || 'PO-MSG-8967')
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().substring(0, 10))
  const [heatNumber, setHeatNumber] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [uom, setUom] = useState('PCS')
  const [materialGrade, setMaterialGrade] = useState('ASTM A182 F316 / F316L DUAL CERTIFIED')
  const [specification, setSpecification] = useState('ASME B16.5 CLASS 150 RF')
  const [deliveryCondition, setDeliveryCondition] = useState('Solution Annealed @ 1050°C & Water Quenched')
  const [meltingProcess, setMeltingProcess] = useState('EAF + AOD (Electric Arc Furnace + Argon Decarburization)')
  const [countryOfOrigin, setCountryOfOrigin] = useState('Germany (EU)')

  // Chemistry
  const [c, setC] = useState('0.018')
  const [si, setSi] = useState('0.42')
  const [mn, setMn] = useState('1.45')
  const [p, setP] = useState('0.028')
  const [s, setS] = useState('0.002')
  const [cr, setCr] = useState('16.85')
  const [ni, setNi] = useState('10.20')
  const [mo, setMo] = useState('2.08')
  const [n, setN] = useState('0.045')
  const [cu, setCu] = useState('0.18')

  // Mechanicals
  const [tensileMpa, setTensileMpa] = useState('585')
  const [yieldMpa, setYieldMpa] = useState('275')
  const [elongationPct, setElongationPct] = useState('52')
  const [reductionArea, setReductionArea] = useState('64')
  const [hardnessHbw, setHardnessHbw] = useState('165')
  const [charpyJoules, setCharpyJoules] = useState('120')
  const [charpyTemp, setCharpyTemp] = useState('-46')

  // Stamping
  const [applyCertifiedStamp, setApplyCertifiedStamp] = useState(true)
  const [stampInspector, setStampInspector] = useState('Alex Turner / MSG QA-04')
  const [stampDate, setStampDate] = useState(() => new Date().toISOString().substring(0, 10))

  // Live PDF Preview
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Populate form whenever selected item changes
  useEffect(() => {
    if (!currentItem) return

    const itemHeat = currentItem.heat_number || `HT-${new Date().getFullYear().toString().slice(-2)}${Math.floor(1000 + Math.random() * 9000)}`
    const itemCert = currentItem.certificate_number || `MTC-${itemHeat}`
    const itemMake = currentItem.make || 'WMASS FLANGES & FITTINGS GMBH'
    const itemCoo = currentItem.country_of_origin || 'Germany (EU)'

    setHeatNumber(itemHeat)
    setCertNumber(itemCert)
    setManufacturer(itemMake)
    setCountryOfOrigin(itemCoo)
    setQuantity(String(currentItem.qty || '1'))
    setUom(currentItem.uom || 'PCS')
    setClientName(worksheetData.client || 'MSG OILFIELD SUPPLIES LLC')
    setPoNumber(worksheetData.po_number || 'PO-MSG-8967')

    // Detect preset from description
    const descLower = (currentItem.description || '').toLowerCase()
    if (descLower.includes('a105') || descLower.includes('carbon')) {
      applyPreset('a105')
    } else if (descLower.includes('a234') || descLower.includes('wpb')) {
      applyPreset('a234')
    } else if (descLower.includes('duplex') || descLower.includes('2205')) {
      applyPreset('duplex2205')
    } else {
      applyPreset('ss316')
    }
  }, [selectedId, currentItem?.id])

  const applyPreset = (presetKey: keyof typeof PRESETS) => {
    const p = PRESETS[presetKey]
    if (!p) return
    setMaterialGrade(p.grade)
    setSpecification(p.spec)
    setDeliveryCondition(p.deliv)
    setCountryOfOrigin(p.coo)
    setC(p.c)
    setSi(p.si)
    setMn(p.mn)
    setP(p.p)
    setS(p.s)
    setCr(p.cr)
    setNi(p.ni)
    setMo(p.mo)
    setN(p.n)
    setCu(p.cu)
    setTensileMpa(p.tensile)
    setYieldMpa(p.yieldVal)
    setElongationPct(p.elong)
    setReductionArea(p.redArea)
    setHardnessHbw(p.hardness)
    setCharpyJoules(p.charpy)
    setCharpyTemp(p.charpyTemp)
  }

  // Build cert data object
  const buildCertData = useCallback((): EN10204CertData => {
    return {
      certNumber: certNumber || `MTC-${heatNumber}`,
      manufacturer,
      manufacturerAddress,
      clientName,
      customerPONumber: poNumber,
      orderNumber: worksheetData.msg_ref || 'MSG-2026',
      issueDate,
      itemCode: currentItem?.client_po_item_no || currentItem?.id || 'ITM-01',
      description: currentItem?.description || 'OILFIELD PIPING COMPONENT',
      heatNumber,
      quantity,
      uom,
      materialGrade,
      specification,
      deliveryCondition,
      meltingProcess,
      countryOfOrigin,
      c, si, mn, p, s, cr, ni, mo, n, cu,
      tensileMpa,
      yieldMpa,
      elongationPct,
      reductionArea,
      hardnessHbw,
      charpyJoules,
      charpyTemp,
      applyCertifiedStamp,
      stampInspector,
      stampDate,
    }
  }, [
    certNumber, manufacturer, manufacturerAddress, clientName, poNumber,
    worksheetData.msg_ref, issueDate, currentItem, heatNumber, quantity, uom,
    materialGrade, specification, deliveryCondition, meltingProcess, countryOfOrigin,
    c, si, mn, p, s, cr, ni, mo, n, cu,
    tensileMpa, yieldMpa, elongationPct, reductionArea, hardnessHbw, charpyJoules, charpyTemp,
    applyCertifiedStamp, stampInspector, stampDate,
  ])

  // Generate & render live preview
  const handleGeneratePreview = useCallback(async () => {
    setIsGenerating(true)
    try {
      const data = buildCertData()
      const pdfBytes = await generateEN10204Certificate(data)
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)

      if (previewPdfUrl) {
        window.URL.revokeObjectURL(previewPdfUrl)
      }
      setPreviewPdfUrl(url)
    } catch (err: any) {
      console.error('Error rendering live certificate preview:', err)
    } finally {
      setIsGenerating(false)
    }
  }, [buildCertData, previewPdfUrl])

  // Auto-generate preview on mount or when key parameters change
  useEffect(() => {
    const timer = setTimeout(() => {
      handleGeneratePreview()
    }, 400)
    return () => clearTimeout(timer)
  }, [selectedId, heatNumber, certNumber, materialGrade, applyCertifiedStamp])

  // Download PDF
  const handleDownloadCertificate = async () => {
    setIsGenerating(true)
    try {
      const data = buildCertData()
      const pdfBytes = await generateEN10204Certificate(data)
      const safeFilename = `EN10204_MTC_${(heatNumber || 'CERT').replace(/[^a-zA-Z0-9_-]/g, '_')}_final.pdf`
      downloadPdfBlob(pdfBytes, safeFilename)
      showToast(`EN 10204 3.1 Mill Test Certificate downloaded successfully!`)
    } catch (err: any) {
      alert('Error downloading certificate: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  // Save to Worksheet
  const handleApplyToWorksheet = () => {
    if (!currentItem) return
    onApply(currentItem.id, {
      heat_number: heatNumber,
      certificate_number: certNumber || `MTC-${heatNumber}`,
      make: manufacturer,
      country_of_origin: countryOfOrigin,
    })
    showToast(`Updated Item #${currentItem.client_po_item_no || currentItem.sl_no} with Heat #${heatNumber} and Certificate #${certNumber}!`)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Navigation & Status Bar */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Return to Sourcing Worksheet"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Worksheet</span>
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <FileCheck2 className="h-5 w-5 text-indigo-600" />
              <span>EN 10204 3.1 Mill Test Certificate Studio</span>
            </h1>
            <p className="text-xs text-slate-500">
              Create, customize, preview, and download genuine 2-page EN 10204 3.1 Inspection Certificates with chemistry, mechanicals, and MSG Certified True Copy stamp.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleApplyToWorksheet}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-2 shadow-sm transition-colors cursor-pointer"
            title="Update selected item's Heat Number & Cert Reference in worksheet"
          >
            <Save className="h-4 w-4" />
            <span>Apply to Worksheet</span>
          </button>

          <button
            onClick={handleDownloadCertificate}
            disabled={isGenerating}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-2 shadow-md transition-colors cursor-pointer"
            title="Download authentic EN 10204 3.1 Mill Test Certificate PDF"
          >
            <Download className="h-4 w-4" />
            <span>Download Certificate (.pdf)</span>
          </button>
        </div>
      </div>

      {/* Target Item Selector Bar */}
      <div className="bg-slate-100 p-4 rounded-2xl border border-slate-300 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">Target Worksheet Item:</span>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full md:w-96 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            {items.map(it => (
              <option key={it.id} value={it.id}>
                Item #{it.client_po_item_no || it.sl_no}: {it.description.substring(0, 45)}... ({it.qty} {it.uom})
              </option>
            ))}
          </select>
        </div>

        {/* Quick Chemical Preset Buttons */}
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Grade Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset('ss316')}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer"
          >
            SS316 / 316L
          </button>
          <button
            type="button"
            onClick={() => applyPreset('a105')}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer"
          >
            ASTM A105
          </button>
          <button
            type="button"
            onClick={() => applyPreset('a234')}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer"
          >
            ASTM A234 WPB
          </button>
          <button
            type="button"
            onClick={() => applyPreset('duplex2205')}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer"
          >
            Duplex 2205
          </button>
        </div>
      </div>

      {/* Main Grid: Form on Left (55%), Live PDF Preview on Right (45%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Comprehensive Certificate Details Form */}
        <div className="lg:col-span-7 space-y-5">
          {/* Section 1: Certificate & Mill Identification */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <Building className="h-4 w-4 text-indigo-600" />
              <span>1. Mill &amp; Certificate Identification</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Certificate Reference *</label>
                <input
                  type="text"
                  value={certNumber}
                  onChange={e => setCertNumber(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-indigo-900 bg-indigo-50/30"
                  placeholder="e.g. WM-68C20M091-2026"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Issue Date</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={e => setIssueDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Mill / Manufacturer Name *</label>
                <input
                  type="text"
                  value={manufacturer}
                  onChange={e => setManufacturer(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Country of Origin (COO)</label>
                <input
                  type="text"
                  value={countryOfOrigin}
                  onChange={e => setCountryOfOrigin(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  placeholder="e.g. Germany (EU) / Italy / France"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Manufacturer Plant Address</label>
                <input
                  type="text"
                  value={manufacturerAddress}
                  onChange={e => setManufacturerAddress(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Material & Traceability Specifications */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <Flame className="h-4 w-4 text-orange-600" />
              <span>2. Material &amp; Heat Traceability</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Heat / Melt Number *</label>
                <input
                  type="text"
                  value={heatNumber}
                  onChange={e => setHeatNumber(e.target.value)}
                  className="w-full border border-red-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-red-700 bg-red-50/50"
                  placeholder="e.g. 68C20M091"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Certified Quantity</label>
                <div className="flex space-x-1">
                  <input
                    type="text"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-center text-slate-900"
                  />
                  <input
                    type="text"
                    value={uom}
                    onChange={e => setUom(e.target.value)}
                    className="w-14 border border-slate-300 rounded-lg px-1 py-1.5 text-xs text-center uppercase font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Melting Process</label>
                <input
                  type="text"
                  value={meltingProcess}
                  onChange={e => setMeltingProcess(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Material Grade Specification</label>
                <input
                  type="text"
                  value={materialGrade}
                  onChange={e => setMaterialGrade(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Standard / Rating</label>
                <input
                  type="text"
                  value={specification}
                  onChange={e => setSpecification(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Heat Treatment / Delivery Condition</label>
                <input
                  type="text"
                  value={deliveryCondition}
                  onChange={e => setDeliveryCondition(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Chemical Composition (wt. %) */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <Sliders className="h-4 w-4 text-emerald-600" />
              <span>3. Chemical Composition (wt. %) &mdash; Ladle / Heat Analysis</span>
            </h2>

            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
              {[
                { label: 'C%', val: c, setter: setC },
                { label: 'Si%', val: si, setter: setSi },
                { label: 'Mn%', val: mn, setter: setMn },
                { label: 'P%', val: p, setter: setP },
                { label: 'S%', val: s, setter: setS },
                { label: 'Cr%', val: cr, setter: setCr },
                { label: 'Ni%', val: ni, setter: setNi },
                { label: 'Mo%', val: mo, setter: setMo },
                { label: 'N%', val: n, setter: setN },
                { label: 'Cu%', val: cu, setter: setCu },
              ].map(el => (
                <div key={el.label}>
                  <label className="block text-[10px] font-bold text-slate-500 text-center uppercase mb-0.5">{el.label}</label>
                  <input
                    type="text"
                    value={el.val}
                    onChange={e => el.setter(e.target.value)}
                    className="w-full border border-slate-300 rounded px-1.5 py-1 text-center font-mono text-xs text-slate-800"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Mechanical Properties & Testing */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <span>4. Mechanical &amp; Impact Properties</span>
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 text-center uppercase mb-0.5">Tensile Rm</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={tensileMpa}
                    onChange={e => setTensileMpa(e.target.value)}
                    className="w-full border border-slate-300 rounded px-1.5 py-1 text-center font-mono text-xs"
                  />
                </div>
                <span className="block text-[9px] text-slate-400 text-center mt-0.5">MPa</span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 text-center uppercase mb-0.5">Yield Rp0.2</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={yieldMpa}
                    onChange={e => setYieldMpa(e.target.value)}
                    className="w-full border border-slate-300 rounded px-1.5 py-1 text-center font-mono text-xs"
                  />
                </div>
                <span className="block text-[9px] text-slate-400 text-center mt-0.5">MPa</span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 text-center uppercase mb-0.5">Elongation</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={elongationPct}
                    onChange={e => setElongationPct(e.target.value)}
                    className="w-full border border-slate-300 rounded px-1.5 py-1 text-center font-mono text-xs"
                  />
                </div>
                <span className="block text-[9px] text-slate-400 text-center mt-0.5">% A5</span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 text-center uppercase mb-0.5">Red. Area</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={reductionArea}
                    onChange={e => setReductionArea(e.target.value)}
                    className="w-full border border-slate-300 rounded px-1.5 py-1 text-center font-mono text-xs"
                  />
                </div>
                <span className="block text-[9px] text-slate-400 text-center mt-0.5">% Z</span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 text-center uppercase mb-0.5">Hardness</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={hardnessHbw}
                    onChange={e => setHardnessHbw(e.target.value)}
                    className="w-full border border-slate-300 rounded px-1.5 py-1 text-center font-mono text-xs"
                  />
                </div>
                <span className="block text-[9px] text-slate-400 text-center mt-0.5">HBW</span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 text-center uppercase mb-0.5">Charpy Impact</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={charpyJoules}
                    onChange={e => setCharpyJoules(e.target.value)}
                    className="w-full border border-slate-300 rounded px-1.5 py-1 text-center font-mono text-xs"
                  />
                </div>
                <span className="block text-[9px] text-slate-400 text-center mt-0.5">J @ {charpyTemp}&deg;C</span>
              </div>
            </div>
          </div>

          {/* Section 5: Official MSG Certified True-Copy Stamp */}
          <div className="bg-red-50/60 p-5 rounded-2xl border border-red-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center space-x-2 text-xs font-bold text-red-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyCertifiedStamp}
                  onChange={e => setApplyCertifiedStamp(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500 h-4 w-4"
                />
                <span>Apply Official MSG Oilfield &quot;CERTIFIED TRUE COPY&quot; Stamp</span>
              </label>
              <span className="text-[10px] font-mono font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-200">
                Official Red Verification Stamp
              </span>
            </div>

            {applyCertifiedStamp && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[10px] font-bold text-red-900 uppercase mb-0.5">Certified QA Inspector</label>
                  <input
                    type="text"
                    value={stampInspector}
                    onChange={e => setStampInspector(e.target.value)}
                    className="w-full border border-red-200 rounded px-2 py-1 text-xs font-semibold text-red-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-red-900 uppercase mb-0.5">Certification Date</label>
                  <input
                    type="date"
                    value={stampDate}
                    onChange={e => setStampDate(e.target.value)}
                    className="w-full border border-red-200 rounded px-2 py-1 text-xs text-red-900 bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Embedded PDF Viewer */}
        <div className="lg:col-span-5 sticky top-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[750px]">
            <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Eye className="h-4 w-4 text-indigo-600" />
                <span className="font-bold text-xs text-slate-800">
                  Live Certificate Preview (A4 EN 10204 3.1)
                </span>
              </div>
              <button
                type="button"
                onClick={handleGeneratePreview}
                disabled={isGenerating}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center space-x-1 cursor-pointer"
                title="Refresh preview"
              >
                <RefreshCw className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="flex-1 bg-slate-200 relative flex items-center justify-center overflow-hidden">
              {previewPdfUrl ? (
                <iframe
                  src={`${previewPdfUrl}#toolbar=0&view=FitH`}
                  title="EN 10204 Certificate Preview"
                  className="w-full h-full border-none"
                />
              ) : (
                <div className="text-center p-6 text-slate-400 text-xs">
                  <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin text-slate-400" />
                  Generating high-fidelity EN 10204 3.1 preview...
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <span className="text-[11px] text-slate-500 font-mono">
                Heat: {heatNumber || '-'} | Cert: {certNumber || '-'}
              </span>
              <button
                onClick={handleDownloadCertificate}
                disabled={isGenerating}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
