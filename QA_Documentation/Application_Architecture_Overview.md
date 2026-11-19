# MSG Oilfield Equipment Trading LLC
# Application Architecture & System Engineering Overview
**Document Reference**: QA-ARCH-2026-V1.0  
**Project**: MSG Oilfield ERP & MTC Vault System  
**Lead Auditor**: Senior QA Architect & Principal Systems Auditor  
**Execution Date**: November 19, 2026  

---

## 1. System Architecture Overview

The **MSG Oilfield ERP & MTC Vault** is designed as a high-reliability, dual-engine enterprise application combining:
1. A **High-Performance Client-Side React SPA** that executes heavy document generation (ExcelJS, XLSX, PDF-Lib, QR rendering) directly inside the client browser, ensuring zero operational downtime even during complete internet/server disconnections.
2. A **Reactive Data Engine (`db.ts`)** with dual persistence: In-Browser Local Storage with live pub-sub listeners + Cloud Supabase PostgreSQL with S3-compatible MTC document storage.
3. An **Auxiliary Microservices Backend (Python Flask)** used for cloud document backups, Cloudinary media storage, and serverless document transformations.

```mermaid
graph TB
    subgraph ClientLayer ["CLIENT BROWSER (React 19 + TypeScript)"]
        UI["Modern UI / Tailwind CSS 4"]
        AuthCtx["Auth Context & RBAC / VIP Matrix"]
        
        subgraph ClientEngines ["In-Browser Processing Engines"]
            SourcingEng["Sourcing Engine (Dual Excel, CIPL, ZIP)"]
            PDFEng["PDF Engine (MTC Watermark & Stamping)"]
            ExcelEng["Excel Engine (Zoho Books Import/Export)"]
            StickerEng["Sticker Engine (Thermal QR Labels)"]
            LOCEng["LOC Engine (Compliance Seals)"]
        end
        
        LocalDB["Reactive In-Memory DB (db.ts)"]
    end

    subgraph StorageLayer ["PERSISTENCE & CLOUD LAYER"]
        LocalStorage[("Browser LocalStorage (msg_erp_*)")]
        SupabaseDB[("Supabase PostgreSQL Cloud DB")]
        MTCBucket[("Supabase Storage: mtc-vault")]
    end

    subgraph AuxBackend ["AUXILIARY BACKEND (Python Flask :5000)"]
        FlaskAPI["Flask REST API (app.py)"]
        Cloudinary["Cloudinary Storage (Optional Backup)"]
    end

    UI --> AuthCtx
    AuthCtx --> ClientEngines
    ClientEngines --> LocalDB
    LocalDB <--> LocalStorage
    LocalDB <--> SupabaseDB
    PDFEng --> MTCBucket
    ClientEngines -.-> FlaskAPI
    FlaskAPI -.-> Cloudinary
```

---

## 2. Technology Stack & Dependency Inventory

### 2.1 Frontend Framework & Core Libraries
| Component | Package / Technology | Version | Purpose |
|:---|:---|:---|:---|
| **Core Framework** | `react` | `^19.3.1` | Core declarative UI component framework. |
| **DOM Renderer** | `react-dom` | `^19.3.1` | Virtual DOM rendering and event hydration. |
| **Language & Compiler** | `typescript` | `~7.0.2` | Static typing, interface contracts, and compilation. |
| **Build Engine** | `vite` | `^8.3.5` | Next-generation bundler with native ESM and HMR. |
| **Styling Framework** | `tailwindcss` | `^4.3.3` | Utility-first styling with `@tailwindcss/vite` plugin. |
| **Iconography** | `lucide-react` | `^1.63.0` | Comprehensive enterprise SVG icon set. |
| **Spreadsheet Engine** | `exceljs` | `^4.4.0` | Formatted multi-tab XLSX generation with styles. |
| **Spreadsheet Ingestion** | `xlsx` (SheetJS) | `^0.18.5` | High-speed tabular parsing for large order files. |
| **PDF Manipulation** | `pdf-lib` | `^1.17.1` | Client-side PDF stamping, merging, and signing. |
| **Archive Bundler** | `jszip` | `^3.10.2` | In-memory ZIP packaging for supplier POs. |
| **QR Code Engine** | `qrcode` | `^1.5.4` | Vector & PNG QR generation for warehouse scanning. |
| **Cloud Client** | `@supabase/supabase-js` | `^2.118.0` | PostgreSQL REST client and storage bucket driver. |
| **Linter / Static QA** | `oxlint` | `^1.89.0` | High-performance Rust-based JavaScript/TypeScript linter. |

### 2.2 Backend & Auxiliary Microservice Stack
| Component | Technology | Version | Purpose |
|:---|:---|:---|:---|
| **Web Server** | Python Flask | `3.0+` | Microservice for document conversion and history. |
| **PDF Generation** | `reportlab` | `3.6+` | Server-side thermal label & compliance PDF rendering. |
| **Media Cloud Storage** | `cloudinary` | `1.36+` | Redundant cloud backup for client & stores sheets. |
| **Cloud Database** | PostgreSQL (Supabase) | `15.x` | Relational cloud database for MTC audit trails. |

---

## 3. Database Architecture & Data Relationships

### 3.1 Entity-Relationship Model

```mermaid
erDiagram
    CUSTOMERS ||--o{ SALES_ORDERS : places
    SALES_ORDERS ||--|{ SALES_ORDER_ITEMS : contains
    ITEMS ||--o{ STOCK_LOTS : categorizes
    STOCK_LOTS ||--|| STOCK_BALANCES : tracks
    STOCK_LOTS ||--o{ MTC_CERTIFICATES : verifies
    STOCK_LOTS ||--o{ STOCK_ALLOCATIONS : reserves
    SALES_ORDER_ITEMS ||--o{ STOCK_ALLOCATIONS : assigned_to
    STOCK_LOTS ||--o{ STOCK_MOVEMENTS : logs
    SALES_ORDERS ||--o{ DISPATCH_RECORDS : dispatches
    SUPPLIERS ||--o{ STOCK_LOTS : supplies

    CUSTOMERS {
        string id PK
        string customer_code UK
        string customer_name
        string contact_details
        string status
    }

    ITEMS {
        string id PK
        string item_code UK
        string item_description
        string material_grade
        string uom
        numeric unit_price_aed
    }

    STOCK_LOTS {
        string id PK
        string item_id FK
        string item_code
        string heat_number
        int original_qty
        int received_qty
        int yom
        string warehouse_location
        string supplier_name
    }

    STOCK_BALANCES {
        string id PK
        string stock_lot_id FK
        int physical_qty
        int reserved_qty
        int available_qty
    }

    SALES_ORDERS {
        string id PK
        string so_number UK
        string po_number
        string customer_name
        string status
        date required_delivery_date
    }

    SALES_ORDER_ITEMS {
        string id PK
        string sales_order_id FK
        string item_code
        string item_description
        int required_qty
        int allocated_qty
        string heat_number
        string hs_code
        string make
        string country_of_origin
        numeric unit_price
    }

    MTC_CERTIFICATES {
        string id PK
        string heat_number
        string certificate_reference
        string verification_status
        string original_file_path
        int pages
    }
```

### 3.2 Key Data Integrity Constraints
1. **Balance Invariant**:
   $$\text{Physical Qty} = \text{Reserved Qty} + \text{Available Qty}$$
   Every allocation increases $\text{Reserved Qty}$ and reduces $\text{Available Qty}$ without touching $\text{Physical Qty}$.
2. **Dispatch Deduction**:
   $$\text{Physical Qty}_{\text{new}} = \text{Physical Qty}_{\text{old}} - \text{Dispatched Qty}$$
   $$\text{Reserved Qty}_{\text{new}} = \text{Reserved Qty}_{\text{old}} - \text{Dispatched Qty}$$
3. **Traceability Hard Link**:
   Every allocated item is permanently stamped with its mill Heat Number, Mill Test Certificate reference, and Warehouse Bay Location (`LN-`).

---

## 4. Authentication & Authorization Framework

### 4.1 System Roles Matrix
The application implements an 8-tier Role-Based Access Control (RBAC) model:

| Role ID | Role Title | Key Responsibilities & Module Permissions |
|:---|:---|:---|
| `super_admin` | Managing Director / CEO | Full unrestricted system access across all 20 modules. |
| `it_engineer` | Lead IT Systems Engineer | IT System Config Console, Users, Audit Logs, Excel, System Diagnostics. |
| `admin_inventory` | Inventory Operations Manager | Master Stock, Items Master, Heat Traceability, Allocation, Sourcing, Approvals. |
| `sales_team` | Senior Sales Engineer | Sales Orders, Technical Sourcing, QR Stickers, Letter of Compliance, Dashboard. |
| `storekeeper` | Warehouse Yard Supervisor | Storekeeper Approvals, Master Stock, Physical Dispatch, LOC & Bin Tags. |
| `mtc_controller` | QA/QC & MTC Controller | MTC Digital Vault, Certificate Verification, Heat Traceability, Sales Orders. |
| `dispatch_team` | Logistics & Dispatch Officer | Dispatch Manager, Delivery Notes, QR Stickers, Master Stock View. |
| `management_viewer` | Executive Board / Auditor | Read-only analytics, Dashboard KPIs, Stock Valuation, Customer Reports. |

### 4.2 VIP Workspaces & Presets
To prevent screen clutter during specialized operating modes, the system provides 7 VIP UI Presets:
1. **Centralized Solo Hub (Workers Away Mode)**: Unified single-screen workspace for after-hours or when staff is away.
2. **Simplified Sales Team (4 Tabs)**: Focused exclusively on Sales Orders, Sourcing, Stickers, and Dashboard.
3. **Storekeeper Yard View (4 Tabs)**: Approvals, Master Stock, Traceability, and Bin Tags.
4. **QA/QC & MTC Fast-Track (3 Tabs)**: MTC Vault, Traceability, and Sales Orders.
5. **Logistics & Dispatch (3 Tabs)**: Dispatch Manager, Orders, and Thermal Stickers.
6. **Ultra Minimalist (2 Tabs)**: Dashboard + Orders.
7. **Full VIP Access (All 20 Tabs)**: Complete master ERP view.

---

## 5. End-to-End Application Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Client as Customer
    actor Sales as Sales Engineer
    actor Solo as Solo Operator
    actor Store as Storekeeper
    actor QA as QA/QC Inspector
    actor Dispatch as Logistics Officer

    Client->>Sales: Sends Purchase Order (PDF/Excel)
    Sales->>Solo: Uploads PO into Centralized Solo Hub
    Solo->>Solo: Auto-detects HSN codes, Makes, Origins, Weights
    Solo->>Solo: System auto-allocates matching stock via FIFO
    Solo->>Store: Submits for Storekeeper Physical Verification
    Store->>Store: Verifies physical heat markings on yard pipe/fittings
    Store->>QA: Approves allocation & marks verified
    QA->>QA: Watermarks official MSG inspection stamp on Mill MTC
    Solo->>Client: Generates 1-Click Client Summary & CIPL Workbook
    Store->>Dispatch: Releases goods to staging bay
    Dispatch->>Dispatch: Scans thermal QR sticker & confirms dispatch
    Dispatch-->>Client: Generates signed Delivery Note & deducts physical stock
```

---

## 6. API Endpoint Inventory (Auxiliary Backend)

| HTTP Method | Route | Auth Required | Description |
|:---|:---|:---|:---|
| `POST` | `/login` | Public | Form login for server session authentication. |
| `GET` | `/logout` | Authenticated | Clears user session and redirects to login. |
| `GET` | `/api/suppliers` | Authenticated | Fetches list of approved mill manufacturers and stockists. |
| `POST` | `/api/parse` | Authenticated | Extracts structured tabular data from uploaded customer PO PDF. |
| `GET` | `/api/history` | Authenticated | Lists saved worksheet snapshots and exported history. |
| `GET` | `/api/history/<id>` | Authenticated | Retrieves detailed snapshot data by ID. |
| `DELETE` | `/api/history/<id>` | Authenticated | Deletes an archived worksheet record. |
| `POST` | `/api/save-worksheet` | Authenticated | Saves updated worksheet and syncs files to Cloudinary. |
| `POST` | `/api/download` | Authenticated | Streams generated Client Summary or Stores Sheet XLSX. |
| `POST` | `/api/download-cipl` | Authenticated | Streams generated Commercial Invoice & Packing List XLSX. |
| `POST` | `/api/export-supplier-pdfs` | Authenticated | Generates and streams ZIP package of individual Supplier POs. |
| `POST` | `/api/loc/upload` | Authenticated | Parses Letter of Compliance summary spreadsheet. |
| `POST` | `/api/loc/generate-pdf` | Authenticated | Generates compliance PDF with official seal & signature. |
| `POST` | `/generate-sticker` | **None (Vulnerability)** | Converts spreadsheet to 58mm / A4 thermal sticker PDF. |
