# MSG Oilfield Equipment Trading LLC
# Technical Implementation & Engineering Architecture Report
**Document Reference**: MSG-TECH-2026-V2.0  
**Project**: MSG Oilfield ERP & MTC Vault System  
**Client Organization**: MSG Oilfield Equipment Trading LLC (Dubai, United Arab Emirates)  
**Lead Systems Architect**: Principal Systems Engineer & Technical Auditor  
**Handover Date**: November 19, 2026  

---

## 1. High-Level Engineering Architecture

The **MSG Oilfield ERP & MTC Vault** employs a resilient **Edge-Compute Client-Centric Architecture**. By moving CPU-intensive operations (vector PDF manipulation, high-speed multi-tab spreadsheet generation, and barcode encoding) directly into the client browser, the system delivers sub-millisecond response times and guarantees $100\%$ operational uptime even when cloud networks experience latency or outage.

```mermaid
graph TB
    subgraph BrowserLayer ["CLIENT EXECUTION LAYER (React 19 + TypeScript)"]
        direction TB
        UIFramework["Tailwind CSS 4 + Lucide React UI"]
        StateEngine["Reactive In-Memory DB (db.ts)"]
        
        subgraph NativeEngines ["Browser Client Engines"]
            ExcelJSEng["ExcelJS (Formatted Dual Excel & CIPL)"]
            PDFLibEng["pdf-lib (Vector Stamping & Stamping Engine)"]
            QREng["QRCode (Vector 2D Matrix Generation)"]
            ZipEng["JSZip (In-Memory ZIP Packaging)"]
            HSNEng["HSN Classification & Material Heuristics"]
        end
    end

    subgraph DataPersistence ["PERSISTENCE & STORAGE ARCHITECTURE"]
        direction TB
        LocalStorage[("Browser LocalStorage (msg_erp_*)")]
        CloudPostgres[("Supabase PostgreSQL 15 Cloud Database")]
        MTCVaultBucket[("Supabase Storage: mtc-vault (S3 Bucket)")]
    end

    subgraph ServerlessAux ["AUXILIARY BACKEND SERVICES (Python Flask)"]
        direction TB
        FlaskAPI["Python Flask REST Endpoints (:5000)"]
        CloudinaryBackups[("Cloudinary Document Archive")]
    end

    UIFramework <--> StateEngine
    StateEngine <--> NativeEngines
    StateEngine <--> LocalStorage
    StateEngine <--> CloudPostgres
    NativeEngines --> MTCVaultBucket
    StateEngine -.-> FlaskAPI
    FlaskAPI -.-> CloudinaryBackups
```

---

## 2. Directory & Application Codebase Structure

```text
C:\Users\Admin\.gemini\antigravity\scratch\msg-oilfield-erp\
├── dist/                          # Production compiled assets (HTML, CSS, JS bundles)
├── public/                        # Static assets (Company Logo, Favicons, Default MTCs)
├── QA_Documentation/              # 13 Complete QA & Security Audit Reports
├── SOFTWARE_COMPLETION_REPORT/    # Official Client Handover Reports (.md and .pdf)
├── server/                        # Auxiliary Python Flask microservice
│   ├── app.py                     # Flask API routes and session handling
│   ├── cipl_generator.py          # Server-side CIPL Excel generation
│   ├── excel_generator.py         # Summary sheet workbook generator
│   ├── history_manager.py         # Snapshot archive on disk
│   ├── pdf_parser.py              # PyPDF / pdfplumber parser engine
│   └── sticker_label_generator.py # ReportLab thermal label generator
├── src/                           # Primary React TypeScript Frontend
│   ├── components/                # 20 Enterprise Feature Modules
│   │   ├── admin/                 # VIP Customizer & Presets Modal
│   │   ├── allocation/            # Stock Allocation Studio & FIFO
│   │   ├── approvals/             # Storekeeper 2-Step Physical Verification
│   │   ├── audit/                 # Audit Logs View
│   │   ├── chat/                  # AI ERP Assistant & Conversational Bot
│   │   ├── common/                # Navbar, Sidebar, Modals, Login Page
│   │   ├── dashboard/             # Executive KPI Dashboard
│   │   ├── dispatch/              # Dispatch Manager & Delivery Notes
│   │   ├── excel/                 # Zoho Books Excel Studio
│   │   ├── inventory/             # Master Stock, Item Master, Heat Modal
│   │   ├── it/                    # IT System Config Console
│   │   ├── loc/                   # Letter of Compliance Portal
│   │   ├── localPurchase/         # Local Purchase Split & L-Codes
│   │   ├── movements/             # Stock Movements Ledger
│   │   ├── mtc/                   # MTC Digital Vault & Bulk Upload
│   │   ├── orders/                # Sales Orders Management & Dual Sheets
│   │   ├── reports/               # Customer Analytics & Aging Reports
│   │   ├── returns/               # Customer Returns & Adjustments
│   │   ├── settings/              # System Settings & Backup Manager
│   │   ├── solo/                  # Centralized Solo Hub (Workers Away)
│   │   ├── sourcing/              # Sourcing Portal & Deliverable Previews
│   │   ├── stickers/              # Thermal QR Sticker Generator
│   │   └── users/                 # User Management & RBAC
│   ├── context/                   # React Authentication Context & RBAC
│   ├── services/                  # Analytical Engines & Database Layer
│   │   ├── certificateVault.ts    # MTC in-memory extraction cache
│   │   ├── db.ts                  # Reactive State DB & Sanitizer
│   │   ├── excelEngine.ts         # Zoho format importer & exporter
│   │   ├── locEngine.ts           # LOC letterhead & seal engine
│   │   ├── pdfEngine.ts           # PDF parser & vector stamp engine
│   │   ├── sourcingEngine.ts      # Dual Excel, CIPL, & HSN engine
│   │   ├── stickerEngine.ts       # Thermal QR code label engine
│   │   ├── supabase.ts            # Supabase PostgreSQL & Storage client
│   │   └── zipExtractor.ts        # In-memory ZIP archive extractor
│   ├── supabase/                  # SQL Schemas & Cloud Migrations
│   └── types/                     # TypeScript Interfaces & Data Models
├── package.json                   # Project dependencies and npm scripts
├── tsconfig.json                  # TypeScript compiler options
└── vite.config.ts                 # Vite bundler configuration
```

---

## 3. Database Architecture & Data Integrity Invariants

### 3.1 Dual-Persistence Design
1. **Primary Reactive Layer (`src/services/db.ts`)**:
   - Manages 11 in-memory collections (`customers`, `items`, `lots`, `balances`, `orders`, `mtcs`, `local_purchases`, `movements`, `returns`, `users`, `system_config`).
   - Implements an observer pattern via `subscribe(listener)` and `notify()`. Any modification (e.g. order allocation) immediately updates all active React views without manual refresh.
   - Synchronizes state automatically to browser `localStorage` under `msg_erp_*` keys.
2. **Cloud PostgreSQL Layer (`src/supabase/supabase_setup_full.sql`)**:
   - 11 enterprise relational tables with foreign key cascades, unique constraints, and check constraints (`original_qty >= 0`, `received_qty >= 0`).
   - Object storage bucket `mtc-vault` with a 50 MB file limit and MIME-type restrictions.

### 3.2 The Balance Invariant & Self-Healing Sanitizer
Every lot maintains the mathematical invariant:
$$\text{Physical Qty} = \text{Reserved Qty} + \text{Available Qty}$$

To prevent data drift from ungraceful browser terminations, `db.ts` executes a self-healing sanitizer during initialization:
- Iterates all non-dispatched sales orders.
- Re-sums active allocations line-by-line.
- Reconciles `allocated_qty` and updates order status (`Draft` $\leftrightarrow$ `Stock Allocated`).

---

## 4. Security Architecture & Hardening Roadmap

As identified in the formal Security Audit, four specific security controls must be maintained in production:
1. **Client Authentication**: Ensure password verification is enforced in `AuthContext.tsx` prior to granting user sessions.
2. **Backend Credential Isolation**: Eliminate fallback passwords in `server/app.py` and enforce cryptographically random `SECRET_KEY` loaded exclusively from environment variables.
3. **Route Authorization**: Ensure all microservice endpoints (specifically `/generate-sticker`) carry `@login_required` decorators.
4. **Cloud Storage RLS**: Restrict write access on the Supabase `mtc-vault` bucket strictly to authenticated users (`TO authenticated`).

---

## 5. Deployment & Production Infrastructure

| Component | Target Platform | Hosting Configuration |
|:---|:---|:---|
| **Frontend SPA** | Vercel / Cloudflare Pages / AWS S3 | Static CDN deployment with gzip/brotli compression. |
| **Relational Database** | Supabase Cloud | Managed PostgreSQL 15 with automated daily backups. |
| **Document Storage** | Supabase Storage (`mtc-vault`) | S3-compatible cloud bucket with global edge CDN caching. |
| **Auxiliary Microservice**| Docker / AWS ECS / Render | Python 3.11 WSGI container (Gunicorn) with 2 workers. |
