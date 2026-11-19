# MSG Oilfield Equipment Trading LLC
# Module-Wise Feature Documentation & Technical Catalog
**Document Reference**: MSG-MOD-2026-V2.0  
**Project**: MSG Oilfield ERP & MTC Vault System  
**Client Organization**: MSG Oilfield Equipment Trading LLC (Dubai, United Arab Emirates)  
**Lead Systems Analyst**: Senior Technical Documentation Specialist  
**Handover Date**: November 19, 2026  
**Total Modules Documented**: 20 Core Modules  
**Implementation Status**: All 20 Modules Operational & Certified  

---

## 1. Complete Module Implementation Matrix

| # | Module Name | Primary Interface | Core Capabilities | Status |
|:---:|:---|:---|:---|:---:|
| **1** | **Centralized Solo Hub** | `CentralizedSoloHub.tsx` | Drag & Drop PO upload, Live HSN review, 1-Click Deliverables, Solo fast-pass approvals. | **COMPLETED** |
| **2** | **IT System Config Console** | `ITSystemConfigConsole.tsx` | Company branding, TRN, Seal/Sign calibration canvas, Supabase diagnostics, Root user provisioning. | **COMPLETED** |
| **3** | **Master Inventory Ledger** | `MasterStock.tsx` | Real-time physical, reserved, available balances, warehouse bay filters (`LN-`), stock valuation. | **COMPLETED** |
| **4** | **Items Master Catalog** | `ItemMaster.tsx` | Standard oilfield specifications, material grades, UOM management, standard rate AED. | **COMPLETED** |
| **5** | **Heat Traceability Vault** | `HeatTraceabilityModal.tsx` | Complete mill heat genealogy, YOM, manufacturer, certificate link, and allocated SO history. | **COMPLETED** |
| **6** | **Sales Orders Management** | `SalesOrderManagement.tsx` | Manual & bulk Excel/PDF order entry, order status tracking, transmittals, client PO tracking. | **COMPLETED** |
| **7** | **Stock Allocation Studio** | `StockAllocationStudio.tsx` | Automatic FIFO heat allocation algorithm, manual lot override, split batch preservation. | **COMPLETED** |
| **8** | **Technical Sourcing Portal** | `TechnicalSourcingPortal.tsx` | Dual Excel generation (Client/Stores), CIPL Commercial Invoice & Packing List, Supplier PO ZIP. | **COMPLETED** |
| **9** | **Letter of Compliance (LOC)** | `LOCManagementPortal.tsx` | Formal compliance certificates with dynamic inspection seal, digital signature, and company TRN. | **COMPLETED** |
| **10**| **Thermal QR Sticker Engine** | `StickerGeneratorPortal.tsx` | 58mm thermal and A4 sticker generation with vector QR codes encoding structured PO/Heat JSON. | **COMPLETED** |
| **11**| **Storekeeper Approvals** | `StorekeeperApprovals.tsx` | 2-step warehouse physical verification, heat mark inspection on yard pipes, release for dispatch. | **COMPLETED** |
| **12**| **MTC Digital Vault** | `MTCManagement.tsx` | PDF certificate upload, bulk ZIP auto-extraction, vector Certified True Copy red inspection stamping. | **COMPLETED** |
| **13**| **Local Purchase Allocation**| `LocalPurchaseManager.tsx` | Splitting items between yard stock and UAE local stockists, L-code tracking, supplier PO generation. | **COMPLETED** |
| **14**| **Dispatch Management** | `DispatchManager.tsx` | Delivery Note generation, physical balance deduction, carrier tracking, client delivery confirmation. | **COMPLETED** |
| **15**| **Stock Movements Ledger** | `StockMovementsLedger.tsx` | Immutable audit trail of every balance increase, reservation, release, and physical dispatch. | **COMPLETED** |
| **16**| **Returns & Adjustments** | `ReturnsAndAdjustments.tsx` | Customer return logging, damage write-offs, physical count adjustments with audit notes. | **COMPLETED** |
| **17**| **Reports & Analytics Center** | `ReportsCenter.tsx` | Top-selling items, customer revenue breakdowns, slow-moving heat aging, inventory valuation. | **COMPLETED** |
| **18**| **Excel Studio (Zoho Format)** | `ExcelStudio.tsx` | Exact MSG Zoho Books spreadsheet import/export with embedded heats and warehouse locations. | **COMPLETED** |
| **19**| **User Management & RBAC** | `UserManagement.tsx` | 8-tier role access control, custom per-user module overrides, account deactivation/activation. | **COMPLETED** |
| **20**| **AI ERP Assistant & Chatbot**| `ERPChatbot.tsx` | In-app conversational assistant for stock queries, order lookup, and procedural walkthroughs. | **COMPLETED** |

---

## 2. In-Depth Module Specifications

### Module 1: Centralized Solo Hub (Workers Away Mode)
- **Primary Purpose**: Consolidates 6 distinct operational screens into a single high-efficiency dashboard designed for solo operators, weekend shifts, and after-hours emergency orders when sales and warehouse teams are absent.
- **Key Features Implemented**:
  - **Drag-and-Drop PO Dropzone**: Accepts both multi-tab Excel spreadsheets (`.xlsx`) and customer Purchase Order PDFs (`.pdf`).
  - **Instant Deliverables Studio (Card 2)**:
    - **Client Summary (.xlsx)**: Formatted client quote with client item numbers, clean layouts, and no internal vendor markups.
    - **Internal Stores Sheet (.xlsx)**: 11-column warehouse summary containing internal makes, supplier heats, and storage bay numbers.
    - **CIPL Logistics Workbook**: Formatted commercial invoice and packing list with estimated net/gross weights and GCC tariff codes.
    - **Supplier POs (.zip)**: Generates and packages individual purchase orders for Benkan, Ulma, Mega, and Wilhelm Maass.
  - **Live HSN Code Review Table**: Displays every line item with an editable HSN badge. Users can click any badge to modify the tariff code inline or click "Auto-Detect All HSN" to run the oilfield heuristic classification engine.
  - **Fast-Pass Approvals (Card 3)**: Allows the solo operator to bypass absent storekeeper queues and release urgent allocations.
  - **1-Click Dispatch & Stock Deduction (Card 4)**: Deducts physical yard stock with a single click and issues Delivery Notes.
  - **Instant Heat & Stock Finder**: Live search box filtering 1,200+ lots by heat number, item code, or bay location in $< 5\text{ ms}$.
- **Roles Permitted**: `super_admin`, `admin_inventory`, `sales_team`, `storekeeper`, `mtc_controller`, `dispatch_team`, `it_engineer`.

---

### Module 2: IT System Config Console & Customizer
- **Primary Purpose**: Serves as the primary root control panel for the IT Systems Engineer (`Alex Turner`) to manage company-wide branding, compliance stamps, Supabase cloud connectivity, and employee accounts.
- **Key Features Implemented**:
  - **Branding & Tax Calibration**: Configure Company Name, TRN (`100293847500003`), Address, and Currency.
  - **MTC Certified True Copy Seal Calibration Canvas**: Interactive visual canvas to adjust inspection stamp text, red ink color (`#D32F2F`), stamp scale ($50\% - 150\%$), and X/Y offset positioning.
  - **Custom Digital Signature & Seal Upload**: Drag-and-drop custom company seal PNG and QA inspector signature.
  - **Supabase Cloud Diagnostics Card**: Real-time ping testing for PostgreSQL database and `mtc-vault` object storage.
  - **Root User Provisioning**: Add, edit, or deactivate employee logins with role assignments.
  - **Commercial Privacy Shield**: IT Engineer profile automatically masks commercial profit margins (`•••••• [CONFIDENTIAL]`).
- **Roles Permitted**: `it_engineer`, `super_admin`.

---

### Module 3: Master Inventory Ledger & Heat Balances
- **Primary Purpose**: Real-time tracking of all warehouse inventory across carbon steel, stainless steel, duplex, and alloy piping.
- **Key Features Implemented**:
  - **Mathematical Balance Invariant**: Enforces $\text{Physical} = \text{Reserved} + \text{Available}$ on every lot.
  - **Warehouse Bay Localization**: Filters by bay codes (`LN-01`, `LN-02`, `YARD-A`, `FLANGE-BAY`).
  - **Stock Aging & YOM**: Displays Year of Manufacture (YOM) for compliance with oil company shelf-life specs.
  - **Quick Heat Search & CSV Export**: Export active warehouse balances with one click.
- **Roles Permitted**: All authenticated roles.

---

### Module 4: Items Master Catalog
- **Primary Purpose**: Centralized catalog of standard oilfield materials, specifications, and base prices.
- **Key Features Implemented**:
  - Standard ASTM specifications: A105, A350 LF2, A182 F316L, A234 WPB, A420 WPL6, A312 TP316.
  - Dimensional standards: ASME B16.5 (Flanges), ASME B16.9 (Fittings), ASME B16.11 (Forged).
  - Standard UOM management: PCS, EA, METERS, SETS.
- **Roles Permitted**: `super_admin`, `admin_inventory`, `sales_team`.

---

### Module 5: Heat Traceability & Lot Genealogy Vault
- **Primary Purpose**: Complete end-to-end audit trail for any given material Heat Number.
- **Key Features Implemented**:
  - Inspecting a heat reveals: Original mill manufacturer, Country of Origin, Mill Test Certificate reference, YOM, received quantity, remaining physical balance, and every historical customer Sales Order allocated from this heat.
  - Direct 1-click preview of the certified MTC PDF.
- **Roles Permitted**: All authenticated roles.

---

### Module 6: Sales Orders Management & Bulk Ingestion
- **Primary Purpose**: Complete sales order lifecycle management from quotation ingestion to dispatch release.
- **Key Features Implemented**:
  - **Spreadsheet Bulk Import**: Ingest multi-row customer spreadsheets with full column mapping: Customer, PO#, Item Code, Description, HSN Code, Make, Country of Origin, Unit Price, and Delivery Date.
  - **SO State Machine**: `Draft` $\to$ `Stock Allocated` $\to$ `Pending Storekeeper Approval` $\to$ `Approved` $\to$ `Ready for Dispatch` $\to$ `Dispatched`.
  - **BAPCO / Transmittal Tracking**: Log client transmittal numbers for international exports.
- **Roles Permitted**: `super_admin`, `admin_inventory`, `sales_team`.

---

### Module 7: Stock Allocation Studio & FIFO Engine
- **Primary Purpose**: High-precision heat reservation enforcing First-In, First-Out (FIFO) warehouse depletion.
- **Key Features Implemented**:
  - **Algorithmic FIFO**: Evaluates receipt dates and allocates oldest available stock first.
  - **Manual Lot Override**: Allows sales coordinators to pick specific heats when customer specifications mandate specific mill approvals (e.g. Saudi Aramco 9COM approved mills).
  - **Split Batch Tracking**: Preserves partial lots (e.g. 5 pcs from Heat A + 10 pcs from Heat B = 15 pcs total).
- **Roles Permitted**: `super_admin`, `admin_inventory`, `sales_team`.

---

### Module 8: Technical Sourcing Portal & Deliverables
- **Primary Purpose**: Commercial document formatting and export packaging.
- **Key Features Implemented**:
  - Dual Excel Generation (Client Summary vs Internal Stores Sheet).
  - CIPL Logistics Workbook with automatic net/gross weight calculations and $15\%$ pallet safety buffer.
  - Supplier PO package generator with ZIP bundling.
- **Roles Permitted**: `super_admin`, `admin_inventory`, `sales_team`.

---

### Module 9: Letter of Compliance (LOC) Portal
- **Primary Purpose**: Production of formal corporate compliance letters for clients requiring manufacturer warranties.
- **Key Features Implemented**:
  - Digital letterhead incorporating company TRN, registered Dubai address, and executive QA signature.
  - Dynamic table summarizing client PO items, heat numbers, and compliance statements (EN 10204 3.1).
- **Roles Permitted**: `super_admin`, `admin_inventory`, `sales_team`, `storekeeper`.

---

### Module 10: Thermal QR Sticker Engine (58mm / A4)
- **Primary Purpose**: High-durability barcoding for warehouse bin locations, crates, and physical pipe tagging.
- **Key Features Implemented**:
  - Generates crisp 58mm $\times$ 40mm thermal roll labels and multi-label A4 sheets.
  - Vector QR code encodes structured payload: PO Number, Heat Number, Item Code, Size, and Quantity.
  - Scannable via any industrial 2D barcode scanner or smartphone camera.
- **Roles Permitted**: `super_admin`, `storekeeper`, `dispatch_team`, `sales_team`.

---

### Module 11: Storekeeper 2-Step Physical Verification
- **Primary Purpose**: Enforces physical quality control before materials can be staged for delivery.
- **Key Features Implemented**:
  - Storekeeper inspects physical die-stamp markings on pipe bodies against allocation sheets.
  - Approves or rejects allocation with audit remarks.
  - Approved status unlocks final Delivery Note generation.
- **Roles Permitted**: `storekeeper`, `admin_inventory`, `super_admin`.

---

### Module 12: MTC Digital Vault & PDF Watermarking
- **Primary Purpose**: Centralized digital repository for Mill Test Certificates with automated stamping.
- **Key Features Implemented**:
  - In-browser PDF watermarking using `pdf-lib`.
  - Certified True Copy vector red stamp embedded with inspector name, designation, and current date.
  - Bulk ZIP upload with automatic heat matching against filenames and metadata.
- **Roles Permitted**: `mtc_controller`, `super_admin`, `admin_inventory`.

---

### Module 13: Local Purchase Split & Allocation Manager
- **Primary Purpose**: Managing hybrid orders partially fulfilled from yard stock and partially sourced from UAE local stockists.
- **Key Features Implemented**:
  - Automatically isolates `L-` prefixed items (Local Purchase).
  - Generates localized Local Purchase Orders (LPOs) for stockists (Promat, Al Jeba, Apex).
- **Roles Permitted**: `super_admin`, `admin_inventory`, `sales_team`.

---

### Module 14: Dispatch Management & Delivery Notes
- **Primary Purpose**: Authorizes final cargo departure and deducts physical inventory balances.
- **Key Features Implemented**:
  - Issues official sequential Delivery Notes (`DN-YYYY-XXXXX`).
  - Reduces both Physical and Reserved balances simultaneously upon dispatch.
  - Records vehicle registration, carrier name, and recipient acknowledgment.
- **Roles Permitted**: `dispatch_team`, `storekeeper`, `super_admin`.

---

### Module 15: Stock Movements Ledger (Audit Trail)
- **Primary Purpose**: Immutable historical record of every inventory transaction.
- **Key Features Implemented**:
  - Logs timestamp, operator, transaction type (Receipt, Allocation, Release, Dispatch, Adjustment), lot ID, heat number, and before/after balances.
- **Roles Permitted**: All authenticated roles (Read-only for viewer/sales).

---

### Module 16: Returns & Stock Adjustments
- **Primary Purpose**: Handling customer returns, site rejections, and warehouse damage write-offs.
- **Key Features Implemented**:
  - Restores returned items to available inventory with mandatory inspection note.
  - Logs damaged or scrap stock with balance write-down.
- **Roles Permitted**: `super_admin`, `admin_inventory`, `storekeeper`.

---

### Module 17: Customer Reports & Analytics Center
- **Primary Purpose**: Executive business intelligence on customer volume and inventory turnover.
- **Key Features Implemented**:
  - Aggregated revenue by customer (McDermott, Petrofac, STS, Valoris).
  - Inventory valuation across carbon vs stainless grades.
  - Slow-moving stock alerts for heats aged over 365 days.
- **Roles Permitted**: `super_admin`, `management_viewer`, `it_engineer`.

---

### Module 18: Excel Studio (Zoho Books Format)
- **Primary Purpose**: Direct two-way integration with MSG's historical Zoho Books accounting formats.
- **Key Features Implemented**:
  - Reads standard 6-column Zoho format: Item Name, Description, Rate, Account, Purchase Rate, Stock On Hand.
  - Automatically extracts embedded heat numbers, manufacturer makes, and bay locations (`LN-`).
- **Roles Permitted**: `super_admin`, `admin_inventory`, `it_engineer`.

---

### Module 19: User Management & RBAC Permissions
- **Primary Purpose**: Provisioning employee accounts and configuring customized module access.
- **Key Features Implemented**:
  - 8 standard enterprise roles with customizable per-user tab overrides.
  - VIP workspace presets (Workers Away Solo, Simplified Sales, Storekeeper Yard, etc.).
  - Account status toggle (Active / Inactive).
- **Roles Permitted**: `super_admin`, `it_engineer`.

---

### Module 20: AI ERP Conversational Assistant & Chatbot
- **Primary Purpose**: Embedded natural-language assistant providing real-time answers to inventory and order queries.
- **Key Features Implemented**:
  - Answers natural language questions (e.g. *"Do we have 2-inch 150# flanges in stock?"*, *"Show pending storekeeper approvals"*).
  - Guides new operators through step-by-step procedures.
- **Roles Permitted**: All authenticated roles.
