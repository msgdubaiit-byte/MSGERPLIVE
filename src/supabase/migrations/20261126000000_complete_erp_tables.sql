-- ========================================================================
-- MSG OILFIELD ERP - COMPLETE PRODUCTION BACKEND TABLES MIGRATION
-- Adds all missing persistence tables so 100% of frontend modules sync to PostgreSQL
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.approval_records (
    id TEXT PRIMARY KEY,
    sales_order_id TEXT NOT NULL,
    so_number TEXT NOT NULL,
    approval_type TEXT NOT NULL,
    approval_status TEXT NOT NULL CHECK (approval_status IN ('Approved', 'Rejected', 'Correction Requested')),
    approved_by TEXT NOT NULL,
    approval_date TEXT NOT NULL,
    rejection_reason TEXT,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_returns (
    id TEXT PRIMARY KEY,
    sales_order_id TEXT NOT NULL,
    so_number TEXT NOT NULL,
    stock_lot_id TEXT NOT NULL,
    item_code TEXT NOT NULL,
    heat_number TEXT NOT NULL,
    returned_qty INTEGER NOT NULL CHECK (returned_qty > 0),
    return_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    authorized_by TEXT NOT NULL,
    acceptance_status TEXT NOT NULL DEFAULT 'Accepted',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
    id TEXT PRIMARY KEY,
    stock_lot_id TEXT NOT NULL,
    item_code TEXT NOT NULL,
    heat_number TEXT NOT NULL,
    original_balance INTEGER NOT NULL,
    adjusted_balance INTEGER NOT NULL,
    difference_qty INTEGER NOT NULL,
    reason TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    approved_by TEXT,
    status TEXT NOT NULL DEFAULT 'Approved',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    record_id TEXT NOT NULL,
    previous_values TEXT,
    new_values TEXT,
    timestamp TEXT NOT NULL,
    reason TEXT
);

CREATE TABLE IF NOT EXISTS public.excel_import_jobs (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    upload_date TEXT NOT NULL,
    import_type TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    successful_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    validation_report TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.sourcing_drafts (
    id TEXT PRIMARY KEY,
    client TEXT DEFAULT '',
    po_number TEXT DEFAULT '',
    msg_ref TEXT DEFAULT '',
    payload_json JSONB NOT NULL,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    editor_username TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.loc_drafts (
    id TEXT PRIMARY KEY,
    po_number TEXT DEFAULT '',
    msg_ref TEXT DEFAULT '',
    to_client TEXT DEFAULT '',
    payload_json JSONB NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.custom_permissions (
    target_key TEXT PRIMARY KEY,
    allowed_modules_json JSONB DEFAULT '[]'::jsonb,
    granular_features_json JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id TEXT NOT NULL,
    pref_key TEXT NOT NULL,
    pref_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, pref_key)
);

CREATE TABLE IF NOT EXISTS public.stored_files (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/pdf',
    byte_size INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL,
    local_path TEXT NOT NULL,
    cloud_url TEXT DEFAULT '',
    heat_number TEXT DEFAULT '',
    category TEXT DEFAULT 'mtc',
    uploaded_by TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'approval_records', 'stock_returns', 'stock_adjustments',
        'audit_logs', 'excel_import_jobs', 'sourcing_drafts',
        'loc_drafts', 'custom_permissions', 'user_preferences', 'stored_files'
    ]
    LOOP
        EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all access to %I" ON public.%I', tbl, tbl);
        EXECUTE format('CREATE POLICY "Allow all access to %I" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    END LOOP;
END $$;
