-- ========================================================================
-- MSG OILFIELD EQUIPMENT TRADING LLC - SUPABASE FULL CLOUD BACKEND SCHEMA
-- Includes: All Tables, MTC Vault Storage Bucket, RLS Privacy Masking, & Seed Data
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- ========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------
-- 1. SYSTEM CONFIGURATION TABLE (IT Branding, Custom Seal & Signature)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_config (
    id TEXT PRIMARY KEY DEFAULT 'SYSTEM_CONFIG_MAIN',
    company_name TEXT NOT NULL DEFAULT 'MSG OILFIELD EQUIPMENT TRADING LLC',
    trn_number TEXT DEFAULT '100293847500003',
    default_currency TEXT DEFAULT 'AED',
    company_address TEXT DEFAULT 'Industrial Area 2, Al Qusais, P.O. Box 92831, Dubai, United Arab Emirates',
    contact_email TEXT DEFAULT 'sales@msgoilfield.ae',
    contact_phone TEXT DEFAULT '+971 4 288 1234',
    theme_primary_color TEXT DEFAULT '#0B2545',
    mtc_stamp_text TEXT DEFAULT 'CERTIFIED TRUE COPY OF ORIGINAL / MSG QA/QC APPROVED',
    mtc_stamp_color TEXT DEFAULT '#D32F2F',
    mtc_stamp_scale INTEGER DEFAULT 100,
    mtc_stamp_offset_x INTEGER DEFAULT 0,
    mtc_stamp_offset_y INTEGER DEFAULT 0,
    mtc_inspector_name TEXT DEFAULT 'QA/QC Lead Inspector',
    inspector_designation TEXT DEFAULT 'Senior QA/QC Materials Inspector',
    inspector_sign_name TEXT DEFAULT 'MSG/QC-04',
    custom_seal_data_url TEXT,
    custom_signature_data_url TEXT,
    seal_shape TEXT DEFAULT 'rectangular',
    seal_border_width INTEGER DEFAULT 2,
    show_machined_tag BOOLEAN DEFAULT TRUE,
    default_weight_safety_buffer INTEGER DEFAULT 15,
    cipl_invoice_prefix TEXT DEFAULT 'CIPL-INV-',
    qr_sticker_format TEXT DEFAULT 'thermal_4x6',
    data_privacy_masking_for_it BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------
-- 2. APPROVED SUPPLIERS CATALOG
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
    id TEXT PRIMARY KEY,
    supplier_code TEXT UNIQUE NOT NULL,
    supplier_name TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'United Arab Emirates',
    make TEXT NOT NULL,
    supplier_type TEXT NOT NULL CHECK (supplier_type IN ('local_stockist', 'mill_manufacturer')),
    approved_status TEXT NOT NULL DEFAULT 'Approved',
    contact_person TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------
-- 3. CUSTOMERS
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    customer_code TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    address TEXT,
    contact_details TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------
-- 4. ITEMS (Item Master)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.items (
    id TEXT PRIMARY KEY,
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

-- ------------------------------------------------------------------------
-- 5. STOCK LOTS (Heat Traceability Lots)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_lots (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    item_code TEXT NOT NULL,
    item_description TEXT,
    heat_number TEXT NOT NULL,
    yom INTEGER,
    original_qty INTEGER NOT NULL CHECK (original_qty >= 0),
    received_qty INTEGER NOT NULL CHECK (received_qty >= 0),
    purchase_type TEXT NOT NULL CHECK (purchase_type IN ('regular', 'local_purchase')),
    supplier_name TEXT NOT NULL,
    l_code TEXT,
    stock_receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    warehouse_location TEXT NOT NULL,
    mtc_ref TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------
-- 6. STOCK BALANCES
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_balances (
    id TEXT PRIMARY KEY,
    stock_lot_id TEXT UNIQUE NOT NULL REFERENCES public.stock_lots(id) ON DELETE CASCADE,
    physical_qty INTEGER NOT NULL DEFAULT 0 CHECK (physical_qty >= 0),
    reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
    available_qty INTEGER NOT NULL DEFAULT 0 CHECK (available_qty >= 0),
    dispatched_qty INTEGER NOT NULL DEFAULT 0 CHECK (dispatched_qty >= 0),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------
-- 7. SALES ORDERS
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_orders (
    id TEXT PRIMARY KEY,
    so_number TEXT UNIQUE NOT NULL,
    po_number TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    required_delivery_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'Draft',
        'Stock Allocated',
        'Pending Storekeeper Approval',
        'Approved',
        'Ready for Dispatch',
        'Partially Dispatched',
        'Dispatched',
        'Cancelled'
    )),
    created_by TEXT NOT NULL,
    approved_by TEXT,
    store_remarks TEXT,
    mtc_package_generated BOOLEAN DEFAULT FALSE,
    mtc_package_url TEXT,
    po_document_name TEXT,
    po_document_url TEXT,
    cancellation_date TEXT,
    cancellation_reason TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    allocations JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------
-- 8. MTC CERTIFICATES
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mtc_certificates (
    id TEXT PRIMARY KEY,
    item_id TEXT,
    item_code TEXT NOT NULL,
    stock_lot_id TEXT,
    heat_number TEXT NOT NULL,
    l_code TEXT,
    yom INTEGER,
    certificate_reference TEXT NOT NULL,
    original_file_path TEXT NOT NULL,
    stamped_file_path TEXT,
    purchase_type TEXT NOT NULL CHECK (purchase_type IN ('regular', 'local_purchase')),
    supplier_name TEXT NOT NULL,
    upload_date TEXT,
    uploaded_by TEXT,
    verification_status TEXT NOT NULL DEFAULT 'Verified' CHECK (verification_status IN ('Pending', 'Verified', 'Rejected')),
    approval_status TEXT NOT NULL DEFAULT 'Approved' CHECK (approval_status IN ('Pending', 'Approved', 'Rejected')),
    pages INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------
-- 9. LOCAL PURCHASES (L-Codes)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.local_purchases (
    id TEXT PRIMARY KEY,
    l_code TEXT UNIQUE NOT NULL,
    item_id TEXT,
    item_code TEXT NOT NULL,
    stock_lot_id TEXT,
    supplier_name TEXT NOT NULL,
    purchase_reference TEXT NOT NULL,
    purchase_date DATE NOT NULL,
    received_qty INTEGER NOT NULL CHECK (received_qty > 0),
    yom INTEGER,
    supplier_mtc_uploaded BOOLEAN DEFAULT FALSE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------
-- 10. STOCK MOVEMENTS (Audit Ledger)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id TEXT PRIMARY KEY,
    stock_lot_id TEXT NOT NULL,
    item_code TEXT NOT NULL,
    heat_number TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    previous_balance INTEGER,
    new_balance INTEGER,
    performed_by TEXT,
    timestamp TEXT,
    remarks TEXT
);

-- ------------------------------------------------------------------------
-- 11. DISPATCH RECORDS
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_records (
    id TEXT PRIMARY KEY,
    sales_order_id TEXT NOT NULL,
    so_number TEXT NOT NULL,
    dispatch_reference TEXT NOT NULL,
    delivery_note_number TEXT NOT NULL,
    customer_name TEXT,
    dispatch_date DATE NOT NULL,
    items_summary JSONB DEFAULT '[]'::jsonb,
    dispatched_by TEXT,
    delivery_remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================================
-- 12. SUPABASE STORAGE BUCKET FOR MTC CERTIFICATES & SALES ORDERS
-- ========================================================================
-- Create public storage bucket 'mtc-vault'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'mtc-vault',
    'mtc-vault',
    true,
    52428800, -- 50 MB limit
    ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Storage policies: Allow public/authenticated read and write access
CREATE POLICY "Public MTC Vault Read Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'mtc-vault');

CREATE POLICY "Authenticated MTC Vault Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mtc-vault');

CREATE POLICY "Authenticated MTC Vault Update & Upsert"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'mtc-vault');

-- ========================================================================
-- 13. SEED INITIAL APPROVED SUPPLIERS
-- ========================================================================
INSERT INTO public.suppliers (id, supplier_code, supplier_name, country, make, supplier_type, approved_status, contact_person, contact_email, contact_phone)
VALUES
('SUPP-001', 'WMASS-DE', 'WILHELM MAASS GMBH', 'Germany', 'WMASS GERMANY', 'mill_manufacturer', 'Approved', 'Klaus Weber', 'sales@maass-flanges.de', '+49 201 89120'),
('SUPP-002', 'BENKAN-TH', 'BENKAN CORRIDOR CO. LTD', 'Thailand', 'BENKAN THAILAND', 'mill_manufacturer', 'Approved', 'Somchai Prasert', 'export@benkan.co.th', '+66 2 709 3211'),
('SUPP-003', 'MEGA-IT', 'MEGA S.P.A.', 'Italy', 'MEGA ITALY', 'mill_manufacturer', 'Approved', 'Marco Rossi', 'info@mega-spa.it', '+39 030 998 1234'),
('SUPP-004', 'ULMA-ES', 'ULMA PIPING S. COOP.', 'Spain', 'ULMA SPAIN', 'mill_manufacturer', 'Approved', 'Inaki Lopez', 'piping@ulma.es', '+34 943 780 500'),
('SUPP-005', 'DELCORTE-FR', 'DELCORTE S.A.S.', 'France', 'DELCORTE FRANCE', 'mill_manufacturer', 'Approved', 'Jean Dupont', 'contact@delcorte.fr', '+33 3 27 69 12 00'),
('SUPP-006', 'SRI-IT', 'SRI S.R.L. FLANGES', 'Italy', 'SRI ITALY', 'mill_manufacturer', 'Approved', 'Luigi Bianchi', 'orders@sriflanges.it', '+39 02 984 5671'),
('SUPP-007', 'SHREE-IN', 'SHREE EXTRUSIONS LTD', 'India', 'SHREE INDIA', 'mill_manufacturer', 'Approved', 'Rajesh Sharma', 'sales@shree-extrusions.com', '+91 22 2387 4590'),
('SUPP-008', 'PROMAT-LP', 'PROMAT BD MIDDLE EAST FZE', 'United Arab Emirates', 'PROMAT STOCK', 'local_stockist', 'Approved', 'David Clark', 'sales@promatme.ae', '+971 4 883 4511'),
('SUPP-009', 'ALJEBA-LP', 'AL JEBA OILFIELD TRADING LLC', 'United Arab Emirates', 'UAE PIPING', 'local_stockist', 'Approved', 'Ahmed Al-Kindi', 'orders@aljeba.ae', '+971 4 332 1100'),
('SUPP-010', 'APEX-LP', 'APEX PIPING & TUBULARS FZE', 'United Arab Emirates', 'APEX STOCK', 'local_stockist', 'Approved', 'Khurram Khan', 'info@apexpiping.ae', '+971 6 526 8899')
ON CONFLICT (id) DO NOTHING;

-- Seed Default System Configuration
INSERT INTO public.system_config (id, company_name, trn_number, default_currency, mtc_inspector_name, inspector_designation, inspector_sign_name)
VALUES ('SYSTEM_CONFIG_MAIN', 'MSG OILFIELD EQUIPMENT TRADING LLC', '100293847500003', 'AED', 'QA/QC Lead Inspector', 'Senior QA/QC Materials Inspector', 'MSG/QC-04')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------
-- 14. USER PROFILES & EMPLOYEE ACCOUNTS (Provisioned by IT Systems Engineer)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id TEXT PRIMARY KEY,
    employee_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    department TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (
        'super_admin',
        'admin_inventory',
        'sales_team',
        'storekeeper',
        'mtc_controller',
        'dispatch_team',
        'management_viewer',
        'it_engineer'
    )),
    account_status TEXT NOT NULL DEFAULT 'Active' CHECK (account_status IN ('Active', 'Inactive', 'Suspended')),
    password TEXT NOT NULL DEFAULT 'Pass@123',
    allowed_modules JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TEXT
);

-- Seed Root Production Administrators (IT Engineer & Super Admin)
INSERT INTO public.user_profiles (id, employee_name, email, department, role, account_status, password)
VALUES 
('USR-001', 'Alex Turner (IT Systems Engineer)', 'it.engineer@msgoilfield.ae', 'IT Systems & Architecture', 'it_engineer', 'Active', 'Admin@123'),
('USR-002', 'Zaid Al-Mansoor (Super Administrator)', 'admin@msgoilfield.ae', 'Executive Management', 'super_admin', 'Active', 'Admin@123')
ON CONFLICT (id) DO NOTHING;
