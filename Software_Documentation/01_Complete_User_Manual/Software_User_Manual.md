# MSG OILFIELD EQUIPMENT TRADING LLC
# COMPLETE SOFTWARE USER MANUAL & OPERATING GUIDE
**Document Reference**: MSG-SOP-USER-MANUAL-2026  
**Software Name**: MSG Oilfield ERP & MTC Vault System  
**Release Version**: Version 2.0 (Build 2026.11)  
**Effective Date**: November 20, 2026  
**Target Audience**: Commercial Sales Coordinators, Warehouse Storekeepers, Yard Foremen, QA/QC Inspectors, Logistics Officers & System Administrators  
**Classification**: CONFIDENTIAL / INTERNAL ENTERPRISE SOP  

---

## 1. System Overview & Technology Stack

The **MSG Oilfield ERP & MTC Vault System** is a purpose-built enterprise trading, inventory, and traceability platform tailored specifically to the oilfield supplies industry (ASTM piping, ANSI/ASME flanges, forged fittings, seamless pipes, and stud bolts).

### Key Architectural Dimensions:
- **Zero-Latency In-Browser Processing**: Operations that traditionally require heavy backend processing (generating 11-column Excel workbooks, dynamic CIPL weight calculations, applying red inspection stamps to multi-page PDFs, packaging ZIP files) are executed entirely client-side using WebAssembly and optimized JavaScript engines.
- **Workers Away / Solo Hub Resilience**: Eliminates warehouse bottlenecks when staff members are off-duty. A single duty coordinator can complete order intake, HSN classification, dual Excel generation, MTC stamping, and thermal labeling in under 60 seconds.
- **360° Metallurgical Traceability**: Full pedigree tracking connecting raw steel mill heats to EN 10204 3.1 test certificates, sales order line reservations, storekeeper physical verification, and outbound customer delivery notes.
- **Strict Stock Conservation**: Automated mathematical enforcement of the inventory balance equation:
  $$\text{Physical Stock} = \text{Reserved Quantity} + \text{Immediately Available Balance}$$

---

## 2. System Requirements & Hardware Guidelines

| Hardware / Environment | Minimum Requirement | Recommended Specification |
|:---|:---|:---|
| **Web Browser** | Chrome 110+, Edge 110+, Firefox 115+ | Google Chrome 120+ or Microsoft Edge Latest (Chromium) |
| **Display Resolution** | 1280 × 720 (HD) | 1920 × 1080 (Full HD) for multi-column data density |
| **System Memory (RAM)** | 4 GB | 8 GB+ RAM for high-speed multi-page PDF watermarking |
| **Network Bandwidth** | 1 Mbps Broadband / 4G | 10 Mbps+ High-Speed Fiber for Supabase cloud sync |
| **Supported Devices** | PC Desktop, Laptop | Industrial Yard Tablet, Desktop PC, Thermal Barcode Terminal |

---

## 3. Login, Authentication & Role Access (Module 01)

### Purpose
Provides secure authenticated access to the ERP while enforcing granular role-based permissions and commercial price masking.

### How to Access
Navigate to your local or hosted application URL (e.g. `http://localhost:5173`). If not logged in, the application automatically presents the secure login gateway.

![Figure 1.1: Secure Login Interface](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/01_Login/Fig_1_1_Login_Screen.png)
*Figure 1.1: Secure Login Interface with Corporate Credentials and Role-Based Presets*

### Step-by-Step Instructions
1. In the **Corporate Email** input field, type your authorized corporate email (e.g., `sales.lead@msgoilfield.ae`).
2. In the **Password** field, type your account password.
3. Click **Sign In to ERP Portal**.
4. The system validates credentials. Upon success, your role is verified, and you are directed to your role's primary workspace.
5. **Quick Role Switcher (Training & Evaluation Mode)**: Click any pre-configured role button (e.g. *Super Administrator*, *Senior Sales Coordinator*, *Chief Storekeeper*, *IT Systems Engineer*) to immediately preview the system under that persona.

> [!NOTE]
> Passwords must be at least 8 characters long. Three consecutive failed login attempts trigger an authentication warning.

---

## 4. Executive KPI Dashboard (Module 02)

### Purpose
Offers executive management and department leads immediate visibility into inventory valuation, open purchase orders, urgent approvals, and operational metrics.

![Figure 2.1: Executive KPI Dashboard](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/02_Dashboard/Fig_2_1_Executive_Dashboard.png)
*Figure 2.1: Executive KPI Dashboard & Real-Time Operational Overview*

### Dashboard Components
- **Physical vs Reserved Metric Cards**: Real-time counter of total physical pieces in yard, reserved pieces committed to orders, and available stock.
- **Active Orders Queue**: Summarizes open customer contracts, split shipments, and pending dispatches.
- **Pending Approvals Alert**: Visual prompt indicating unconfirmed storekeeper heat assignments requiring yard sign-off.
- **Quick Jump Action Buttons**: Instant access to Solo Hub, Sales Order Intake, or Delivery Note creation.

---

## 5. Centralized Solo Hub (Module 03 - Workers Away Mode)

### Purpose
The Centralized Solo Hub is the primary operational workspace of the system. Designed specifically for after-hours duty coordinators, weekend shifts, and emergency turnarounds when yard workers are away.

![Figure 3.1: Centralized Solo Hub](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/03_Solo_Hub/Fig_3_1_Centralized_Solo_Hub.png)
*Figure 3.1: Centralized Solo Hub Command Center & 1-Click Deliverables Suite*

### The 1-Click Deliverables Suite
Clicking the amber **Generate Complete Deliverables Package (ZIP)** button automatically initiates the full trade fulfillment cycle:
1. Generates **Client Order Summary (.xlsx)** isolating client prices and descriptions.
2. Generates **Internal Stores Preparation Sheet (.xlsx)** with bin rack coordinates and heat numbers.
3. Builds **CIPL Commercial Invoice & Packing List (.xlsx)** calculating net/gross weights with a 15% safety buffer.
4. Watermarks and bundles all associated **MTC Mill Certificates (.pdf)** with red certified true copy seals.
5. Packages all four assets into an organized **ZIP archive** downloaded immediately to your browser.

### Live HSN Tariff Review & Editing
Oilfield commodities require exact 8-digit tariff codes for customs and FTA compliance. The Solo Hub features a live, editable review table:

![Figure 3.2: Live Editable HSN Tariff Table](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/03_Solo_Hub/Fig_3_2_HSN_Tariff_Review_Table.png)
*Figure 3.2: Live Editable HSN Tariff Classification & Material Grade Table*

- **Stainless Steel / Duplex**: Automatically detected and classified under HSN `7307.2100` / `7307.2900`.
- **Carbon Steel (A105 / WPB)**: Automatically classified under HSN `7307.9100` / `7307.9300`.
- **Inline Editing**: Users can click any HSN cell to adjust codes before generating export documents.

---

## 6. Sales Order Management (Module 04)

### Purpose
Manages customer purchase orders, auto-extracts line items from customer PDF files, and coordinates order status from intake to dispatch.

![Figure 4.1: Sales Order Management](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/04_Sales_Orders/Fig_4_1_Sales_Order_Management.png)
*Figure 4.1: Sales Order Management Register & Order Tracking*

### How to Create an Order
1. Click the green **+ New Sales Order** button.
2. Select the Customer entity from the dropdown list.
3. Drag and drop the customer's PDF PO into the parsing box.
4. Review extracted items, ratings (150#, 300#, 600#), sizes, and wall thicknesses.
5. Click **Save Sales Order**. The order enters `Pending Allocation` status.

---

## 7. Master Stock & 360° Heat Traceability (Module 05)

### Purpose
Maintains the master inventory ledger, item dimensions catalog, and full metallurgical genealogy.

![Figure 5.1: Master Stock Inventory](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/05_Stock_Inventory/Fig_5_1_Master_Stock_Inventory.png)
*Figure 5.1: Master Stock Inventory Ledger with Physical, Reserved, and Available Counts*

![Figure 5.2: Item Master Catalog](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/05_Stock_Inventory/Fig_5_2_Item_Master_Catalog.png)
*Figure 5.2: Item Master Materials Catalog with Dimensional Specifications*

![Figure 5.3: 360° Heat Traceability](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/05_Stock_Inventory/Fig_5_3_Heat_Traceability_360.png)
*Figure 5.3: 360° Heat Traceability & Metallurgical Pedigree Portal*

---

## 8. Stock Allocation Studio & Storekeeper Approvals (Modules 06 & 07)

### Purpose
Assigns physical warehouse heat lots to order lines and enforces physical yard verification prior to release.

![Figure 6.1: Stock Allocation Studio](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/06_Allocation_Studio/Fig_6_1_Stock_Allocation_Studio.png)
*Figure 6.1: Stock Allocation Studio with Automated FIFO Heat Lot Engine*

![Figure 7.1: Storekeeper Approvals Queue](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/07_Warehouse_Approvals/Fig_7_1_Storekeeper_Approvals_Queue.png)
*Figure 7.1: Storekeeper Physical Verification & Approvals Queue*

### Steps to Allocate and Approve:
1. In **Stock Allocation Studio**, select the sales order.
2. Click **Auto FIFO Allocate** to reserve oldest inventory lots, or manually assign specific heat batches.
3. Click **Confirm Allocation**. Order status updates to `Awaiting Storekeeper Sign-off`.
4. Switch to **Storekeeper Approvals**. Verify physical markings on fittings/flanges.
5. Click **Approve & Release Material**. The reservation is physically locked for packing.

---

## 9. MTC Digital Vault & Stamping Engine (Module 08)

### Purpose
Stores EN 10204 3.1 mill test certificates and provides client-side certified red stamp watermarking.

![Figure 8.1: MTC Digital Vault](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/08_MTC_Vault/Fig_8_1_MTC_Digital_Vault.png)
*Figure 8.1: MTC Digital Vault with EN 10204 3.1 Certificate Index and PDF Previewer*

- **Inspection Stamp Calibration**: Adjust stamp scale, text, and coordinate offset (X/Y) to avoid obscuring critical chemical composition data.
- **Certified True Copy**: Imprints inspector name, designation, and official company seal.

---

## 10. Technical Sourcing, Split & CIPL (Module 09)

### Purpose
Splits unfulfilled order lines into external supplier RFQs and builds the export Commercial Invoice & Packing List (CIPL).

![Figure 9.1: Technical Sourcing & CIPL](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/09_Sourcing_CIPL/Fig_9_1_Sourcing_And_CIPL_Portal.png)
*Figure 9.1: Technical Sourcing, Supplier Order Split, and CIPL Workbook Portal*

---

## 11. Dispatch Management & Outbound Delivery Notes (Module 10)

### Purpose
Compiles legally binding Delivery Notes, customer gate passes, and transport manifests while automatically deducting physical yard balances.

![Figure 10.1: Dispatch Management Console](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/10_Dispatch_Logistics/Fig_10_1_Dispatch_Management_Console.png)
*Figure 10.1: Outbound Dispatch Management & Customer Delivery Note Generator*

---

## 12. Thermal Stickers & LOC Material Tags (Module 11)

### Purpose
Generates 58mm × 39mm waterproof thermal barcode labels and warehouse bin location markers.

![Figure 11.1: Thermal Barcode Sticker Generator](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/11_Sticker_LOC/Fig_11_1_Thermal_Sticker_Generator.png)
*Figure 11.1: Thermal Barcode & QR Code Sticker Generator (58mm × 39mm Format)*

![Figure 11.2: LOC Material Tags](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/11_Sticker_LOC/Fig_11_2_LOC_Material_Tags.png)
*Figure 11.2: LOC Material Identification Tags & Yard Bin Locator*

---

## 13. IT Software Config Console & Supabase Cloud Sync (Module 12)

### Purpose
Master administration console for corporate branding, QA stamp calibrator, RBAC permission matrix, and Supabase cloud PostgreSQL synchronization.

![Figure 12.1: IT Software Config Console](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/12_IT_Admin_Console/Fig_12_1_IT_Software_Config_Console.png)
*Figure 12.1: IT Software Configuration Console & Document Branding Calibrator*

![Figure 12.2: Supabase Cloud Settings](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/12_IT_Admin_Console/Fig_12_2_Supabase_Cloud_Settings.png)
*Figure 12.2: Supabase Cloud PostgreSQL Synchronization & Database Snapshot Settings*

---

## 14. Reports, Analytics & Immutable Audit Logs (Module 13)

### Purpose
Provides executive turnover analytics and an immutable, tamper-evident audit ledger of all user operations.

![Figure 13.1: Reports and Analytics Dashboard](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/13_Reports_Audit/Fig_13_1_Reports_And_Analytics.png)
*Figure 13.1: Executive Reports & Inventory Turnover Analytics Dashboard*

![Figure 13.2: Tamper-Evident Audit Logs](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/13_Reports_Audit/Fig_13_2_Audit_Logs_Ledger.png)
*Figure 13.2: Tamper-Evident Immutable Audit Log Ledger*

---

## 15. Frequently Asked Questions (FAQ)

### Q1: Why is unit price displayed as `•••••• [CONFIDENTIAL]`?
**Answer**: Commercial privacy masking is enforced for technical, yard, and IT roles. If your position requires customer pricing access, your Super Administrator can enable commercial pricing rights in the RBAC matrix.

### Q2: Can I cancel an order after partial dispatch?
**Answer**: Yes. When canceling a partially fulfilled order, items already dispatched remain strictly preserved in the historical dispatch records and movement ledger. Only the remaining unfulfilled reserved quantity is restored to available stock.

### Q3: How do I backup all ERP data?
**Answer**: Go to **Supabase & Settings** or **IT Software Config**, scroll to **Database Snapshot & Backup**, and click **Export Full JSON Backup**.

---

## 16. Glossary of Terms

- **MTC**: EN 10204 3.1 Mill Test Certificate certifying metallurgical chemistry and yield strength.
- **Heat Number**: Unique smelting lot identifier stamped on steel material.
- **FIFO**: First-In-First-Out automated material allocation algorithm.
- **CIPL**: Commercial Invoice & Packing List for shipping and customs clearance.
- **Balance Invariant**: $\text{Physical} = \text{Reserved} + \text{Available}$.
