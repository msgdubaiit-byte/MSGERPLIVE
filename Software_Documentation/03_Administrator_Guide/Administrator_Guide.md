# MSG OILFIELD EQUIPMENT TRADING LLC
# ENTERPRISE SYSTEM ADMINISTRATOR GUIDE
**Document Reference**: MSG-SOP-ADMIN-GUIDE-2026  
**Audience**: IT Systems Administrators, Technical Architects & Corporate Security Officers  
**Release Version**: Version 2.0 (Build 2026.11)  
**Classification**: CONFIDENTIAL / INTERNAL ENTERPRISE SOP  

---

## 1. Initial IT Configuration & Document Branding

The **IT Software Configuration Console** is the administrative command center for enterprise branding, legal header configurations, and quality assurance seal calibration.

![Figure 1: IT Software Configuration Console](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/12_IT_Admin_Console/Fig_12_1_IT_Software_Config_Console.png)
*Figure 1: IT Software Configuration Console & Stamp Calibrator*

### Key Governance Settings:
- **Corporate Legal Identity**: Company Name, UAE TRN Tax Number (`100293847500003`), Dubai address, and phone contacts.
- **MTC Certified True Copy Red Stamp**:
  - Legend: `CERTIFIED TRUE COPY OF ORIGINAL / MSG QA/QC APPROVED`
  - Color: `#D32F2F` (Deep Crimson Red)
  - Scale: Calibrated between `50%` and `150%`
  - Coordinate Offset: Adjustable X/Y millimeter shifts to prevent covering metallurgical chemistry on mill test certs.
- **Commercial Confidentiality Masking**: Enforces strict commercial price redaction (`•••••• [CONFIDENTIAL]`) on IT and technical profiles to protect profit margins and client contractual values.

---

## 2. User Roles & Granular RBAC Matrix

The ERP defines 8 distinct user roles across the organization:

| Role ID | Formal Title | Target User Persona | Permitted Modules | Price Masking Status |
|:---|:---|:---|:---|:---:|
| `super_admin` | Super Administrator | CEO / Managing Director | All 22 Modules | **Unmasked (Full Access)** |
| `admin_inventory` | Inventory Controller | Materials Manager | Stock, Heats, Solo Hub, Allocations, Approvals, MTC | Operational Rates Only |
| `sales_team` | Senior Sales Coordinator | Commercial Executives | Solo Hub, Sales Orders, Sourcing, CIPL, Stickers | **Unmasked (Commercial Rates)** |
| `storekeeper` | Chief Warehouse Storekeeper | Yard Foremen / Handlers | Approvals, Master Stock, Traceability, Bins, Movements | **Commercially Blind** |
| `mtc_controller` | QA/QC Inspection Lead | Document Controller | MTC Digital Vault, Traceability, Sales Orders, Stock | **Commercially Blind** |
| `dispatch_team` | Dispatch & Logistics Officer | Shipping Coordinators | Dispatch Management, Delivery Notes, Thermal Labels | **Commercially Blind** |
| `management_viewer`| Senior Management Auditor | CFO / Financial Auditor | Solo Hub, Dashboard, Reports, Master Stock, Audit Logs | **Unmasked (Audit Review)** |
| `it_engineer` | IT Systems Engineer | Technical Infrastructure | IT Config, Cloud Settings, Users, Audit Logs, Excel | **Confidential Masking Enforced** |

---

## 3. Supabase Cloud PostgreSQL Synchronization

MSG Oilfield ERP utilizes a dual-tier persistence model: client-side offline caching paired with Supabase cloud PostgreSQL.

![Figure 2: Supabase Cloud PostgreSQL Settings](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/12_IT_Admin_Console/Fig_12_2_Supabase_Cloud_Settings.png)
*Figure 2: Supabase Cloud PostgreSQL Synchronization & Database Snapshot Settings*

### Connection Procedure:
1. Log into your Supabase project console (`https://supabase.com/dashboard`).
2. Copy the **Project URL** and **Anon Public Key**.
3. Paste these values into the respective fields in the **Supabase & Settings** panel.
4. Click **Test Cloud Connection** to verify end-to-end table accessibility.
5. Click **Save Supabase Configuration**.

---

## 4. Immutable Audit Logs & Disaster Recovery

The system maintains an append-only, tamper-evident audit ledger that records every significant operational event (user logins, sales order creation, FIFO allocations, storekeeper sign-offs, and delivery note dispatches).

![Figure 3: Tamper-Evident Audit Logs](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/13_Reports_Audit/Fig_13_2_Audit_Logs_Ledger.png)
*Figure 3: Tamper-Evident Immutable Audit Log Ledger*

### Disaster Recovery Protocol:
1. **Regular Full Backup**: Administrators should click **Export Full JSON Backup** daily.
2. **Instant Restoration**: In case of hardware failure, use **Import JSON Backup** to restore the entire database state within seconds.
3. **Self-Healing Balance Sanitizer**: Built-in invariants automatically repair orphaned reservations on system startup.
