import React, { useEffect, useState } from 'react'
import {
  getSupabaseEnvConfig,
  isSupabaseConfigured,
  testSupabaseConnection,
} from '../../services/supabase'
import {
  getCloudinaryEnvConfig,
  isCloudinaryConfigured,
  testCloudinaryConnection,
} from '../../services/cloudinary'
import { apiGet } from '../../services/api'
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
} from 'lucide-react'

interface EnvHealthStatus {
  databaseConfigured?: boolean
  supabaseConfigured?: boolean
  cloudinaryConfigured?: boolean
  cloudinaryCloudName?: string
  cloudinaryFolder?: string
}

export const SettingsView: React.FC = () => {
  const supabaseEnv = getSupabaseEnvConfig()
  const cloudinaryEnv = getCloudinaryEnvConfig()
  const [healthStatus, setHealthStatus] = useState<EnvHealthStatus | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [copiedSQL, setCopiedSQL] = useState(false)

  useEffect(() => {
    let active = true
    apiGet<EnvHealthStatus>('/api/health')
      .then((res) => {
        if (active) setHealthStatus(res)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    const res = await testSupabaseConnection()
    setTestResult(res)
    setIsTesting(false)
  }

  const [cloudinaryTestResult, setCloudinaryTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isTestingCloudinary, setIsTestingCloudinary] = useState(false)

  const handleTestCloudinary = async () => {
    setIsTestingCloudinary(true)
    setCloudinaryTestResult(null)
    const res = await testCloudinaryConnection()
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

      {/* Environment-Managed Database & Cloud Storage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-4 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h2 className="font-semibold uppercase tracking-wider text-slate-700 flex items-center space-x-2">
              <KeyRound className="h-4 w-4 text-blue-600" />
              <span>PostgreSQL &amp; Supabase Environment</span>
            </h2>
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold px-2 py-0.5 rounded text-[10px] uppercase flex items-center gap-1">
              <Shield className="h-3 w-3" />
              <span>Managed via .env</span>
            </span>
          </div>

          <p className="text-slate-600 text-[11px] leading-relaxed">
            Database and Supabase credentials are loaded directly from server &amp; build environment variables (<code className="bg-slate-100 px-1 rounded font-mono">DATABASE_URL</code>, <code className="bg-slate-100 px-1 rounded font-mono">VITE_SUPABASE_URL</code>, <code className="bg-slate-100 px-1 rounded font-mono">VITE_SUPABASE_ANON_KEY</code>) and cannot be edited or stored in browser storage.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2 font-mono text-[11px]">
            <div className="flex justify-between items-center gap-2">
              <span className="font-sans text-slate-600 font-medium">Backend PostgreSQL (`DATABASE_URL`):</span>
              <span className={healthStatus?.databaseConfigured ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                {healthStatus ? (healthStatus.databaseConfigured ? 'Configured (.env)' : 'Not configured') : 'Checking...'}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="font-sans text-slate-600 font-medium">Supabase Realtime (`VITE_SUPABASE_URL`):</span>
              <span className="text-slate-900 truncate max-w-[230px]" title={supabaseEnv.url || 'Not set'}>
                {isSupabaseConfigured() ? supabaseEnv.url : 'Not set in .env'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <span>{isTesting ? 'Testing...' : 'Test Supabase Connection'}</span>
            </button>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
              testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Cloudinary Universal Storage Status */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h2 className="font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
              <Cloud className="h-4 w-4 text-sky-600" />
              <span>Cloudinary Universal Storage (.env)</span>
            </h2>
            <span className="bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
              Server-Signed CDN
            </span>
          </div>

          <p className="text-slate-600 text-[11px] leading-relaxed">
            Uploads are signed on the backend using server environment variables (<code className="bg-slate-100 px-1 rounded font-mono">CLOUDINARY_CLOUD_NAME</code>, <code className="bg-slate-100 px-1 rounded font-mono">CLOUDINARY_API_KEY</code>, <code className="bg-slate-100 px-1 rounded font-mono">CLOUDINARY_API_SECRET</code>). API secrets are never editable or stored in the browser.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2 font-mono text-[11px]">
            <div className="flex justify-between items-center gap-2">
              <span className="font-sans text-slate-600 font-medium">Backend Signing Status:</span>
              <span className={healthStatus?.cloudinaryConfigured || isCloudinaryConfigured() ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                {healthStatus ? (healthStatus.cloudinaryConfigured ? 'Configured (.env)' : 'Not configured') : (isCloudinaryConfigured() ? 'Env detected' : 'Checking...')}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="font-sans text-slate-600 font-medium">Cloud Name:</span>
              <span className="text-slate-900">
                {healthStatus?.cloudinaryCloudName || cloudinaryEnv.cloudName || 'Not set'}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="font-sans text-slate-600 font-medium">Storage Folder:</span>
              <span className="text-slate-900">
                {healthStatus?.cloudinaryFolder || cloudinaryEnv.folder}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <button
              type="button"
              onClick={handleTestCloudinary}
              disabled={isTestingCloudinary}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center space-x-1.5 cursor-pointer"
            >
              <UploadCloud className="h-4 w-4" />
              <span>{isTestingCloudinary ? 'Pinging CDN...' : 'Test CDN Connection'}</span>
            </button>
          </div>

          {cloudinaryTestResult && (
            <div className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
              cloudinaryTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {cloudinaryTestResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />}
              <span>{cloudinaryTestResult.message}</span>
            </div>
          )}
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
