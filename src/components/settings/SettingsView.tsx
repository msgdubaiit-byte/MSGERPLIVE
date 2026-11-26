import React, { useState } from 'react'
import {
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
} from '../../services/supabase'
import {
  getStoredCloudinaryConfig,
  saveCloudinaryConfig,
  testCloudinaryConnection,
} from '../../services/cloudinary'
import { db } from '../../services/db'
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  RefreshCw,
  Shield,
  KeyRound,
  FileCode,
  Cloud,
  UploadCloud,
  ExternalLink,
} from 'lucide-react'

export const SettingsView: React.FC = () => {
  const currentConfig = getStoredSupabaseConfig()
  const [supabaseUrl, setSupabaseUrl] = useState(currentConfig.url)
  const [supabaseKey, setSupabaseKey] = useState(currentConfig.key)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [copiedSQL, setCopiedSQL] = useState(false)

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault()
    saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim())
    alert('Supabase configuration saved! The application client has been re-initialized.')
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    const res = await testSupabaseConnection(supabaseUrl.trim(), supabaseKey.trim())
    setTestResult(res)
    setIsTesting(false)
  }

  const currentCloudinary = getStoredCloudinaryConfig()
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState(currentCloudinary.cloudName)
  const [cloudinaryPreset, setCloudinaryPreset] = useState(currentCloudinary.uploadPreset)
  const [cloudinaryFolder, setCloudinaryFolder] = useState(currentCloudinary.folder)
  const [cloudinaryTestResult, setCloudinaryTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isTestingCloudinary, setIsTestingCloudinary] = useState(false)

  const handleSaveCloudinary = (e: React.FormEvent) => {
    e.preventDefault()
    saveCloudinaryConfig({
      cloudName: cloudinaryCloudName.trim(),
      uploadPreset: (cloudinaryPreset || '').trim(),
      folder: cloudinaryFolder.trim() || 'msg-oilfield-erp'
    })
    alert('Cloudinary CDN storage configuration saved! Universal file upload is active.')
  }

  const handleTestCloudinary = async () => {
    setIsTestingCloudinary(true)
    setCloudinaryTestResult(null)
    const res = await testCloudinaryConnection(cloudinaryCloudName.trim(), (cloudinaryPreset || '').trim())
    setCloudinaryTestResult(res)
    setIsTestingCloudinary(false)
  }

  const handleResetFactoryData = async () => {
    if (confirm('Are you sure you want to reset the database to the clean factory dataset? All test records will be restored to original MSG Oilfield baseline.')) {
      await db.resetToDefault()
      alert('Database reset to official MSG Oilfield baseline dataset.')
      window.location.reload()
    }
  }

  const handleCopySQLMigration = () => {
    const sqlText = `-- ========================================================================
-- MSG OILFIELD EQUIPMENT TRADING LLC
-- AUTOMATED STOCK MANAGEMENT, HEAT TRACEABILITY & MTC SYSTEM
-- Run this script in Supabase SQL Editor to initialize full schema & RLS
-- ========================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    department TEXT NOT NULL,
    account_status TEXT NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_code TEXT UNIQUE NOT NULL,
    item_description TEXT NOT NULL,
    material_grade TEXT,
    specification TEXT,
    size TEXT,
    uom TEXT NOT NULL DEFAULT 'PCS',
    unit_price_aed NUMERIC(12, 2) DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_lots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.items(id),
    heat_number TEXT NOT NULL,
    yom INTEGER,
    original_qty INTEGER NOT NULL,
    received_qty INTEGER NOT NULL,
    purchase_type TEXT NOT NULL CHECK (purchase_type IN ('regular', 'local_purchase')),
    supplier_name TEXT NOT NULL,
    l_code TEXT,
    stock_receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    warehouse_location TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_lot_id UUID UNIQUE NOT NULL REFERENCES public.stock_lots(id) ON DELETE CASCADE,
    physical_qty INTEGER NOT NULL DEFAULT 0,
    reserved_qty INTEGER NOT NULL DEFAULT 0,
    available_qty INTEGER NOT NULL DEFAULT 0,
    dispatched_qty INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    so_number TEXT UNIQUE NOT NULL,
    po_number TEXT,
    customer_id UUID NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    required_delivery_date DATE,
    status TEXT NOT NULL DEFAULT 'Draft',
    created_by UUID REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    cancellation_date TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id),
    stock_lot_id UUID NOT NULL REFERENCES public.stock_lots(id),
    heat_number TEXT NOT NULL,
    allocated_qty INTEGER NOT NULL,
    released_qty INTEGER NOT NULL DEFAULT 0,
    dispatched_qty INTEGER NOT NULL DEFAULT 0,
    allocation_status TEXT NOT NULL DEFAULT 'Allocated',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_lot_id UUID NOT NULL REFERENCES public.stock_lots(id),
    item_code TEXT NOT NULL,
    heat_number TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    previous_balance INTEGER NOT NULL,
    new_balance INTEGER NOT NULL,
    performed_by TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    remarks TEXT
);

-- Full migration file available in src/supabase/migrations/20261029000000_initial_schema.sql`

    navigator.clipboard.writeText(sqlText)
    setCopiedSQL(true)
    setTimeout(() => setCopiedSQL(false), 2000)
  }

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <Database className="h-5 w-5 text-blue-600" />
            <h1 className="text-lg font-semibold text-slate-900">Supabase PostgreSQL &amp; Cloud Configuration</h1>
            <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium px-2 py-0.5 rounded-full">
              Production Database Layer
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Connect your live Supabase cloud project, verify PostgreSQL Row Level Security (RLS) policies, and deploy database migrations.
          </p>
        </div>

        <button
          onClick={handleResetFactoryData}
          className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-md border border-slate-300 transition-colors flex items-center space-x-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          <span>Reset Factory Demo Data</span>
        </button>
      </div>

      {/* Supabase Connection Setup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-4 text-xs">
          <h2 className="font-semibold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100 flex items-center space-x-2">
            <KeyRound className="h-4 w-4 text-blue-600" />
            <span>Supabase Connection Settings</span>
          </h2>

          <form onSubmit={handleSaveConfig} className="space-y-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supabase Project URL *</label>
              <input
                type="text"
                required
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="w-full border border-slate-300 rounded-md p-2 font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supabase Public Anon Key *</label>
              <textarea
                rows={3}
                required
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
                className="w-full border border-slate-300 rounded-md p-2 font-mono text-slate-900"
              />
              <p className="text-[11px] text-slate-500 mt-0.5">
                Never expose your service_role key. Use only the public anon key for frontend clients.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-xs transition-colors"
              >
                Save Configuration
              </button>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-md flex items-center space-x-1.5 transition-colors"
              >
                <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
              </button>
            </div>
          </form>

          {testResult && (
            <div className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
              testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Cloudinary Universal Storage Configuration */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h2 className="font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
              <Cloud className="h-4 w-4 text-sky-600" />
              <span>Cloudinary Universal Storage (Bulk Excels & MTC Certificates)</span>
            </h2>
            <span className="bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
              High-Speed CDN
            </span>
          </div>

          <p className="text-slate-600 text-[11px] leading-relaxed">
            Direct CDN storage for bulk Excel files, MTC PDFs, and ZIP archives. Automatically provides permanent, high-speed public CDN URLs without database storage limits or SQL bucket permission hurdles.
          </p>

          <form onSubmit={handleSaveCloudinary} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cloudinary Cloud Name *</label>
                <input
                  type="text"
                  required
                  value={cloudinaryCloudName}
                  onChange={(e) => setCloudinaryCloudName(e.target.value)}
                  placeholder="e.g. dxyz12345 or msg-oilfield"
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Unsigned Upload Preset *</label>
                <input
                  type="text"
                  required
                  value={cloudinaryPreset}
                  onChange={(e) => setCloudinaryPreset(e.target.value)}
                  placeholder="e.g. msg_erp_preset or ml_default"
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Storage Folder</label>
              <input
                type="text"
                value={cloudinaryFolder}
                onChange={(e) => setCloudinaryFolder(e.target.value)}
                placeholder="msg-oilfield-erp"
                className="w-full border border-slate-300 rounded-lg p-2 font-mono text-slate-900"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Subfolders <code className="bg-slate-100 px-1 rounded">/mtcs</code> and <code className="bg-slate-100 px-1 rounded">/excels</code> are created automatically.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="submit"
                className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg shadow"
              >
                Save Cloudinary Settings
              </button>
              <button
                type="button"
                onClick={handleTestCloudinary}
                disabled={isTestingCloudinary}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center space-x-1.5"
              >
                <UploadCloud className="h-4 w-4" />
                <span>{isTestingCloudinary ? 'Pinging CDN...' : 'Test CDN Connection'}</span>
              </button>
            </div>
          </form>

          {cloudinaryTestResult && (
            <div className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
              cloudinaryTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {cloudinaryTestResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />}
              <span>{cloudinaryTestResult.message}</span>
            </div>
          )}

          <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-sky-950 text-[11px] space-y-1">
            <strong>How to get your Cloudinary details (1 minute):</strong>
            <ol className="list-decimal list-inside space-y-0.5 text-slate-700 mt-1">
              <li>Sign in to your free account at <a href="https://cloudinary.com" target="_blank" rel="noreferrer" className="text-sky-700 font-bold underline inline-flex items-center">cloudinary.com <ExternalLink className="h-3 w-3 ml-0.5" /></a>.</li>
              <li>Your <strong>Cloud Name</strong> is shown on the top-left of the Dashboard.</li>
              <li>Go to <strong>Settings</strong> (Gear Icon) &rarr; <strong>Upload</strong> &rarr; scroll down to <strong>Upload presets</strong>.</li>
              <li>Click <strong>Add upload preset</strong>, change <strong>Signing Mode</strong> to <strong>Unsigned</strong>, and click <strong>Save</strong>.</li>
              <li>Paste the Cloud Name and Preset Name above!</li>
            </ol>
          </div>
        </div>

        {/* Database Migration & SQL Deployment */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h2 className="font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
              <FileCode className="h-4 w-4 text-emerald-600" />
              <span>PostgreSQL SQL Schema & RLS Migrations</span>
            </h2>

            <button
              onClick={handleCopySQLMigration}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-2.5 py-1 rounded border border-slate-300 flex items-center space-x-1"
            >
              <Copy className="h-3 w-3" />
              <span>{copiedSQL ? 'Copied!' : 'Copy SQL'}</span>
            </button>
          </div>

          <p className="text-slate-600 text-[11px] leading-relaxed">
            The database migration creates all 16 tables, constraints, foreign keys, stored procedures (`fn_allocate_stock_fifo`, `fn_allocate_stock_manual`, `fn_cancel_sales_order`), and Row Level Security policies.
          </p>

          <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[10px] max-h-56 overflow-y-auto space-y-1">
            <div className="text-slate-400">-- Migration File: src/supabase/migrations/20261029000000_initial_schema.sql</div>
            <div className="text-emerald-400">CREATE EXTENSION IF NOT EXISTS "uuid-ossp";</div>
            <div className="text-blue-300">CREATE TABLE public.profiles (...);</div>
            <div className="text-blue-300">CREATE TABLE public.stock_lots (...);</div>
            <div className="text-blue-300">CREATE TABLE public.stock_balances (...);</div>
            <div className="text-blue-300">CREATE TABLE public.sales_orders (...);</div>
            <div className="text-blue-300">CREATE TABLE public.stock_allocations (...);</div>
            <div className="text-blue-300">CREATE TABLE public.mtc_certificates (...);</div>
            <div className="text-blue-300">CREATE TABLE public.stock_movements (...);</div>
            <div className="text-amber-300">CREATE FUNCTION public.fn_allocate_stock_fifo (...);</div>
            <div className="text-amber-300">CREATE FUNCTION public.fn_cancel_sales_order (...);</div>
            <div className="text-purple-300">ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;</div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-[11px]">
            <strong>Migration Deployment Instructions:</strong><br />
            1. Open your Supabase Dashboard &rarr; SQL Editor.<br />
            2. Click "Copy SQL" above or paste from <code className="font-mono bg-blue-100 px-1 rounded">src/supabase/migrations/</code>.<br />
            3. Click "Run" in Supabase to execute schema setup, stored procedures, and RLS policies.
          </div>
        </div>
      </div>
    </div>
  )
}
