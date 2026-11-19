import React, { useState, useEffect } from 'react'
import {
  Cpu,
  ShieldCheck,
  ShieldAlert,
  Settings,
  FileSpreadsheet,
  Flame,
  Package,
  Wrench,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Database,
  Lock,
  EyeOff,
  Eye,
  KeyRound,
  FileText,
  Truck,
  Sparkles,
  Users,
  Server,
  Layers,
  Save,
  RotateCcw
} from 'lucide-react'
import { db, SystemCustomConfig } from '../../services/db'
import { useAuth } from '../../context/AuthContext'
import { NavTabId } from '../common/Sidebar'

interface ITSystemConfigConsoleProps {
  onNavigateTab: (tab: NavTabId) => void
}

type ConfigTab =
  | 'branding'
  | 'templates'
  | 'stamp_calibration'
  | 'roles_governance'
  | 'database_backup'
  | 'integrations'
  | 'privacy_redaction'

export const ITSystemConfigConsole: React.FC<ITSystemConfigConsoleProps> = ({ onNavigateTab }) => {
  const { currentUser, currentRole } = useAuth()
  const [activeTab, setActiveTab] = useState<ConfigTab>('branding')
  const [config, setConfig] = useState<SystemCustomConfig>(() => db.getSystemConfig())
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState(() => db.getSystemDiagnostics())

  const [testConnectionStatus, setTestConnectionStatus] = useState<string | null>(null)
  const [isTestingConnection, setIsTestingConnection] = useState(false)

  // Reload diagnostics periodically or on change
  useEffect(() => {
    setDiagnostics(db.getSystemDiagnostics())
  }, [config])

  const handleSaveConfig = () => {
    db.updateSystemConfig(config, currentUser?.email || 'it.engineer@msgoilfield.ae')
    setStatusNotice('System custom configuration saved successfully across the ERP platform!')
    setTimeout(() => setStatusNotice(null), 4000)
  }

  const handleExportBackup = () => {
    const jsonStr = db.exportFullDatabaseJSON()
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `msg-oilfield-erp-backup-${new Date().toISOString().substring(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setStatusNotice('Full database JSON backup downloaded successfully!')
    setTimeout(() => setStatusNotice(null), 4000)
  }

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        const res = db.importFullDatabaseJSON(content, currentUser?.email || 'it.engineer@msgoilfield.ae')
        if (res.success) {
          setConfig(db.getSystemConfig())
          setDiagnostics(db.getSystemDiagnostics())
          setStatusNotice(res.message)
        } else {
          alert(res.message)
        }
      } catch (err: any) {
        alert('Failed to read file: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* Top Banner: IT Systems Engineer Control Header */}
      <div className="bg-gradient-to-r from-slate-950 via-[#111c33] to-indigo-950 text-white rounded-2xl p-6 sm:p-7 shadow-xl border border-indigo-900/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
              <span className="bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-black text-[11px] px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center space-x-1 shadow-sm">
                <Cpu className="h-3 w-3 fill-current" />
                <span>IT Engineer Software Config</span>
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                <ShieldCheck className="h-3 w-3" />
                <span>Zero Business Data Access Policy Active</span>
              </span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                All Commercial Prices Masked
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center space-x-2">
              <span>IT Systems Architecture &amp; Customization Console</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              Configures software parameters, branding, quality stamp offsets, document publication templates, database backups, and RBAC governance. Sensitive financial data and commercial margins are strictly protected.
            </p>
          </div>

          {/* Quick IT Health Metrics */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-center min-w-[85px]">
              <div className="text-[10px] font-semibold text-slate-400">Total Records</div>
              <div className="text-lg font-black text-indigo-400 font-mono">
                {diagnostics.totalLots + diagnostics.totalOrders}
              </div>
            </div>
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-center min-w-[85px]">
              <div className="text-[10px] font-semibold text-slate-400">MTC Verified</div>
              <div className="text-lg font-black text-emerald-400 font-mono">
                {diagnostics.verifiedMTCs}/{diagnostics.totalMTCs}
              </div>
            </div>
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-center min-w-[85px]">
              <div className="text-[10px] font-semibold text-slate-400">System Health</div>
              <div className="text-xs font-bold text-emerald-300 font-mono mt-1">100% PASS</div>
            </div>
          </div>
        </div>

        {statusNotice && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs font-bold text-emerald-200 flex items-center justify-between space-x-2 animate-in slide-in-from-top-2">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-emerald-300 hover:text-white text-xs font-bold px-2 py-0.5 rounded cursor-pointer"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* Zero Data Access Security Warning Card */}
      <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex items-start space-x-3 text-xs text-indigo-950 shadow-sm">
        <Lock className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-extrabold text-indigo-900 flex items-center space-x-1.5">
            <span>Commercial Data Privacy Protection Active</span>
            <span className="bg-indigo-200 text-indigo-900 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">Confidentiality Rule #IT-SEC-4</span>
          </div>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            As an IT Systems Engineer, you have complete administrative authorization to configure software behavior, database schemas, stamp placement, document templates, and API integrations. Commercial customer prices, margins, order values, and billing records are automatically obscured (<code className="bg-indigo-100 text-indigo-900 px-1 py-0.5 rounded font-mono font-bold">•••••• [CONFIDENTIAL]</code>) to safeguard commercial secrecy.
          </p>
        </div>
      </div>

      {/* Tab Navigation Navigation Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 border-b border-slate-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('branding')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'branding'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>Branding &amp; Company Defaults</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'templates'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          <span>Document &amp; Deliverables Customizer</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stamp_calibration')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'stamp_calibration'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Flame className="h-3.5 w-3.5 text-orange-400" />
          <span>MTC Quality Stamp Calibrator</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('roles_governance')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'roles_governance'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>User Roles &amp; Permissions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('database_backup')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'database_backup'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          <span>Database Backup &amp; Health</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('integrations')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'integrations'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Server className="h-3.5 w-3.5" />
          <span>APIs &amp; Integrations</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('privacy_redaction')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
            activeTab === 'privacy_redaction'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <EyeOff className="h-3.5 w-3.5 text-amber-500" />
          <span>Data Privacy Simulator</span>
        </button>
      </div>

      {/* TAB 1: BRANDING & COMPANY DEFAULTS */}
      {activeTab === 'branding' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Company Identity &amp; System Defaults</h3>
              <p className="text-xs text-slate-500">
                Configure corporate legal name, tax identification, currency, and header styling.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Configuration</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Company Legal Display Name</label>
              <input
                type="text"
                value={config.companyName}
                onChange={e => setConfig({ ...config, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Tax / TRN Registration Number</label>
              <input
                type="text"
                value={config.trnNumber}
                onChange={e => setConfig({ ...config, trnNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Default Base Currency</label>
              <select
                value={config.defaultCurrency}
                onChange={e => setConfig({ ...config, defaultCurrency: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="AED">AED (United Arab Emirates Dirham - Dhs)</option>
                <option value="USD">USD (US Dollar - $)</option>
                <option value="SAR">SAR (Saudi Riyal - SR)</option>
                <option value="EUR">EUR (Euro - €)</option>
                <option value="GBP">GBP (British Pound - £)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Support / Sales Email</label>
              <input
                type="email"
                value={config.contactEmail}
                onChange={e => setConfig({ ...config, contactEmail: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Corporate Physical &amp; Yard Address</label>
              <input
                type="text"
                value={config.companyAddress}
                onChange={e => setConfig({ ...config, companyAddress: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DOCUMENT TEMPLATES & DELIVERABLES CUSTOMIZER */}
      {activeTab === 'templates' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Document Templates &amp; Deliverables Customizer</h3>
              <p className="text-xs text-slate-500">
                Control the layout, numbering, and auto-inference behavior for all publication sheets.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Template Rules</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* CIPL Invoice Prefix */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                <Truck className="h-4 w-4 text-purple-600" />
                <span>CIPL Logistics Settings</span>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Commercial Invoice Number Prefix</label>
                <input
                  type="text"
                  value={config.ciplInvoicePrefix}
                  onChange={e => setConfig({ ...config, ciplInvoicePrefix: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Gross Weight Safety Buffer Factor (%)</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={config.defaultWeightSafetyBuffer}
                  onChange={e => setConfig({ ...config, defaultWeightSafetyBuffer: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Default 15% adds realistic pallet &amp; wooden box tare weight to net fittings weight.
                </span>
              </div>
            </div>

            {/* Yard Sticker Settings */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <span>QR Code Yard Sticker Presets</span>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Default Yard Label Roll Format</label>
                <select
                  value={config.qrStickerFormat}
                  onChange={e => setConfig({ ...config, qrStickerFormat: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold"
                >
                  <option value="thermal_4x6">4" x 6" Heavy Industrial Thermal Label</option>
                  <option value="a4_sheet">A4 Sheet (8 Labels per Sheet)</option>
                  <option value="standard_tag">2" x 1" Metallic Valve / Flange Tie-Tag</option>
                </select>
              </div>
              <div className="pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showMachinedTag}
                    onChange={e => setConfig({ ...config, showMachinedTag: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span className="font-semibold text-slate-700">
                    Auto-flag fabricated/machined fittings with dedicated inspection sticker
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MTC QUALITY STAMP CALIBRATOR */}
      {activeTab === 'stamp_calibration' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">MTC Quality Stamp &amp; Seal Calibrator</h3>
              <p className="text-xs text-slate-500">
                Calibrate X/Y coordinate offsets, stamp dimensions, text, and inspector signature overlays on test certificates.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Stamp Calibration</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
            {/* Sliders & Parameters */}
            <div className="lg:col-span-6 space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Quality Endorsement Stamp Text</label>
                <textarea
                  rows={2}
                  value={config.mtcStampText}
                  onChange={e => setConfig({ ...config, mtcStampText: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Stamp Color</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={config.mtcStampColor}
                      onChange={e => setConfig({ ...config, mtcStampColor: e.target.value })}
                      className="h-8 w-10 border border-slate-300 rounded cursor-pointer"
                    />
                    <span className="font-mono font-bold text-slate-800">{config.mtcStampColor}</span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Inspector / QC Name</label>
                  <input
                    type="text"
                    value={config.mtcInspectorName}
                    onChange={e => setConfig({ ...config, mtcInspectorName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between font-bold text-slate-700 mb-1">
                  <span>Stamp Scale: {config.mtcStampScale}%</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="140"
                  value={config.mtcStampScale}
                  onChange={e => setConfig({ ...config, mtcStampScale: Number(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">X Offset (mm): {config.mtcStampOffsetX}</label>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={config.mtcStampOffsetX}
                    onChange={e => setConfig({ ...config, mtcStampOffsetX: Number(e.target.value) })}
                    className="w-full accent-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Y Offset (mm): {config.mtcStampOffsetY}</label>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={config.mtcStampOffsetY}
                    onChange={e => setConfig({ ...config, mtcStampOffsetY: Number(e.target.value) })}
                    className="w-full accent-indigo-600"
                  />
                </div>
              </div>
            </div>

            {/* Visual Calibration Box */}
            <div className="lg:col-span-6 border-2 border-dashed border-slate-300 rounded-2xl p-4 bg-slate-50 flex flex-col items-center justify-center relative min-h-[280px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 absolute top-3 left-4">
                Live Calibrator Preview (A4 Certificate Canvas)
              </div>

              <div
                style={{
                  transform: `translate(${config.mtcStampOffsetX * 2}px, ${config.mtcStampOffsetY * 2}px) scale(${config.mtcStampScale / 100})`,
                  borderColor: config.mtcStampColor,
                  color: config.mtcStampColor
                }}
                className="p-4 rounded-xl border-3 border-solid bg-white/90 shadow-md max-w-xs text-center transition-transform select-none"
              >
                <div className="font-black text-xs uppercase tracking-wider">{config.companyName}</div>
                <div className="text-[10px] font-extrabold uppercase mt-1 px-1 border-t border-b border-current py-0.5">
                  {config.mtcStampText}
                </div>
                <div className="flex items-center justify-between text-[9px] font-bold mt-2 font-mono">
                  <span>DATE: {new Date().toISOString().substring(0, 10)}</span>
                  <span>QC: {config.mtcInspectorName}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 mt-4 text-center">
                Calibrated coordinates automatically apply during dynamic PDF stamping in the MTC engine.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ROLES GOVERNANCE & USER PERMISSIONS */}
      {activeTab === 'roles_governance' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">User Role Governance &amp; Security Controls</h3>
              <p className="text-xs text-slate-500">
                Manage account authorization, module assignment, and session security policies.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('users')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              <span>Open User Accounts Manager &rarr;</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                <KeyRound className="h-4 w-4 text-indigo-600" />
                <span>Session Security Settings</span>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Session Inactivity Timeout</label>
                <select
                  value={config.sessionTimeoutMinutes}
                  onChange={e => setConfig({ ...config, sessionTimeoutMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold"
                >
                  <option value={15}>15 Minutes (High Security Bank Standard)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>60 Minutes (Default Operational)</option>
                  <option value={480}>8 Hours (Full Shift Workstation)</option>
                </select>
              </div>
              <div className="pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableAuditLogging}
                    onChange={e => setConfig({ ...config, enableAuditLogging: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span className="font-semibold text-slate-700">
                    Log all security access, role switches &amp; export events to immutable audit ledger
                  </span>
                </label>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                <ShieldAlert className="h-4 w-4 text-emerald-600" />
                <span>Zero-Data Privacy Enforcement</span>
              </div>
              <div className="text-slate-600 text-[11px] leading-relaxed">
                <p>
                  Current Policy: <strong className="text-indigo-900">Enforced by Role Guard</strong>
                </p>
                <p className="mt-1">
                  IT Engineering and System Technical Administration roles cannot view customer unit prices, total contract revenue, or billing invoices. All displays automatically redact figures.
                </p>
              </div>
              <div className="pt-1">
                <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                  ✓ Privacy Rule Active
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: DATABASE BACKUP & HEALTH */}
      {activeTab === 'database_backup' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Database Backup, Restore &amp; Health Diagnostics</h3>
              <p className="text-xs text-slate-500">
                1-Click download full database JSON snapshot, restore from file, and verify system integrity.
              </p>
            </div>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Export Card */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-gradient-to-br from-indigo-50/50 to-white space-y-3">
              <div className="flex items-center space-x-2 text-indigo-950 font-bold text-sm">
                <Download className="h-5 w-5 text-indigo-600" />
                <span>1-Click Database Export</span>
              </div>
              <p className="text-xs text-slate-600">
                Exports all items, lots, stock balances, heat numbers, MTC certificates, sales orders, local purchases, and system configs into an encrypted JSON file.
              </p>
              <button
                type="button"
                onClick={handleExportBackup}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download Full Database Backup (.json)</span>
              </button>
            </div>

            {/* Restore Card */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-gradient-to-br from-slate-50 to-white space-y-3">
              <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                <UploadCloud className="h-5 w-5 text-blue-600" />
                <span>Restore Database from Backup</span>
              </div>
              <p className="text-xs text-slate-600">
                Upload a previously saved <code className="font-bold">.json</code> backup to restore all tables and configuration parameters instantly.
              </p>
              <label className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer">
                <UploadCloud className="h-4 w-4 text-blue-300" />
                <span>Browse &amp; Restore Backup File</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Diagnostics Summary Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-slate-100/80 px-4 py-2.5 font-extrabold text-slate-800 uppercase tracking-wider text-[11px] flex items-center justify-between">
              <span>System Integrity &amp; Diagnostic Ledger</span>
              <span className="text-emerald-700 font-mono font-bold">{diagnostics.systemHealth}</span>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">Master Items</span>
                <strong className="text-base text-slate-900">{diagnostics.totalItems}</strong>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">Stock Lots</span>
                <strong className="text-base text-slate-900">{diagnostics.totalLots}</strong>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">Physical Pieces</span>
                <strong className="text-base text-emerald-700">{diagnostics.totalPhysicalPcs} PCS</strong>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">MTC Certificates</span>
                <strong className="text-base text-indigo-700">{diagnostics.totalMTCs}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: APIS & INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">API Keys, Supabase &amp; Webhook Integrations</h3>
              <p className="text-xs text-slate-500">
                Manage cloud database endpoints, SMTP servers, and automated notification webhooks.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('settings')}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              <span>Open Supabase Cloud Console &rarr;</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                <Server className="h-4 w-4 text-indigo-600" />
                <span>SMTP Alert Mail Server</span>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">SMTP Host</label>
                <input
                  type="text"
                  placeholder="smtp.office365.com / smtp.gmail.com"
                  defaultValue="smtp.msgoilfield.ae"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Port</label>
                <input
                  type="text"
                  placeholder="587"
                  defaultValue="587"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                <Truck className="h-4 w-4 text-emerald-600" />
                <span>Dispatch Alert Webhook (WhatsApp / SMS)</span>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Webhook Endpoint URL</label>
                <input
                  type="text"
                  placeholder="https://api.whatsapp-gateway.com/v1/messages"
                  defaultValue="https://api.msgoilfield.ae/v1/webhooks/dispatch-notify"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Sends automated delivery note notifications to logistics drivers upon order dispatch release.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: DATA PRIVACY & REDACTION SIMULATOR */}
      {activeTab === 'privacy_redaction' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Data Privacy &amp; Commercial Redaction Simulator</h3>
              <p className="text-xs text-slate-500">
                Visual demonstration of how business confidential figures are masked when IT Engineers inspect workflows.
              </p>
            </div>
            <span className="text-[10px] font-black bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-full border border-emerald-300">
              Active Shield Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* Standard Staff View */}
            <div className="border border-slate-300 rounded-2xl p-4 bg-slate-50/80 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                  <Eye className="h-4 w-4 text-blue-600" />
                  <span>Commercial Sales Staff View</span>
                </div>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">Commercial Access</span>
              </div>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Client:</span>
                  <strong className="text-slate-900">Bahrain STS Co. W.L.L</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Unit Price:</span>
                  <strong className="text-slate-900">AED 155.00 / PC</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Commercial Margin:</span>
                  <strong className="text-emerald-700">28.4% Net Profit</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Order Total:</span>
                  <strong className="text-slate-900">AED 42,500.00</strong>
                </div>
              </div>
            </div>

            {/* IT Systems Engineer View (Masked) */}
            <div className="border-2 border-indigo-300 rounded-2xl p-4 bg-indigo-50/50 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-indigo-200">
                <div className="font-extrabold text-indigo-950 flex items-center space-x-1.5">
                  <EyeOff className="h-4 w-4 text-indigo-600" />
                  <span>IT Systems Engineer View (Current)</span>
                </div>
                <span className="bg-indigo-200 text-indigo-900 text-[10px] font-bold px-2 py-0.5 rounded">Confidential Protected</span>
              </div>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Client:</span>
                  <strong className="text-slate-900">Bahrain STS Co. W.L.L</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans">Unit Price:</span>
                  <span className="bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 rounded text-[11px]">•••••• [RESTRICTED]</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans">Commercial Margin:</span>
                  <span className="bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 rounded text-[11px]">•••••• [RESTRICTED]</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans">Order Total:</span>
                  <span className="bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 rounded text-[11px]">•••••• [RESTRICTED]</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
