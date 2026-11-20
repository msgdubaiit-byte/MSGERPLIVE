import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import os

ref_dir = os.path.join(os.getcwd(), 'Software_Documentation', '06_Reference')
os.makedirs(ref_dir, exist_ok=True)

# -------------------------------------------------------------
# 1. Module_List.xlsx
# -------------------------------------------------------------
wb1 = openpyxl.Workbook()
ws1 = wb1.active
ws1.title = "ERP Modules Master List"

headers1 = [
    "Module ID", "Module Name", "Functional Category", 
    "Primary Purpose & Features", "Recommended Roles", "Key Deliverables / Output"
]

modules_data = [
    ("solo_hub", "Centralized Solo Hub", "Sales & Orders", "All-in-one operations desk for fast-track processing, workers away mode, and 1-click deliverables", "Solo Operators, Shift Supervisors, Sales Lead", "Complete Deliverables Package (Dual Excel, CIPL, Stickers, MTC ZIP)"),
    ("orders", "Sales Order Management", "Sales & Orders", "Customer PO intake, automated PDF parsing, item grid, and status tracking", "Sales Team, Commercial Coordinators", "Sales Order Summary, Parsed Line Items Grid"),
    ("sourcing", "Sourcing, Split & CIPL", "Sales & Orders", "Supplier PO generation, item isolation, and CIPL commercial invoice & packing list builder", "Sales, Sourcing, Logistics", "Supplier Inquiries (.xlsx), CIPL Export (.xlsx)"),
    ("stickers", "QR Thermal Sticker Generator", "Sales & Orders", "58mm x 39mm waterproof thermal barcode sticker generation with heat numbers and QR", "Warehouse, Packing Team, Storekeeper", "Multi-up Thermal QR Sticker Sheets (.pdf)"),
    ("loc", "LOC & Material Identification Tags", "Sales & Orders", "Physical bin storage assignment, material tags, rack numbers, and clean remarks", "Storekeepers, Yard Foremen", "Material Identification Tags & Rack Labels"),
    ("stock", "Master Stock Inventory", "Stock & Heats", "Real-time stock valuation, physical vs reserved quantities, lot locations, and heat details", "Inventory Controllers, Sales, Storekeepers", "Live Inventory Snapshot, Stock Health Report"),
    ("items", "Item Master Catalog", "Stock & Heats", "Standard oilfield dimensional catalog (Fittings, Flanges, Pipes, Valves, Bolts)", "Inventory Engineers, Material Specialists", "Standard Item Master Ledger"),
    ("traceability", "Heat Traceability 360°", "Stock & Heats", "Complete metallurgical pedigree from mill cert to customer dispatch, heat lot search", "QA/QC Inspectors, Document Controllers, Auditors", "Heat Pedigree Audit Report (.pdf)"),
    ("allocation", "Stock Allocation Studio", "Stock & Heats", "Reserve physical heat lots to sales order lines via automated FIFO or manual selection", "Inventory Managers, Storekeepers", "Order Allocation Matrix, Reservation Confirmation"),
    ("approvals", "Storekeeper Approvals", "Warehouse & Yard", "Two-tier physical verification desk, heat confirmation, material stamp authorization", "Storekeepers, Yard Foremen", "Storekeeper Physical Inspection Sign-off"),
    ("local_purchase", "Local Purchases / L-Codes", "Warehouse & Yard", "Emergency local buyouts, stock deficit replenishment, and L-code tracking", "Procurement Officers, Storekeepers", "Local Purchase Order, L-Code Goods Receipt"),
    ("dispatch", "Dispatch Management", "Warehouse & Yard", "Generate customer delivery notes, gate passes, vehicle manifests, and balance deduction", "Logistics Officers, Dispatch Coordinators", "Official Delivery Note (.pdf), Gate Pass"),
    ("movements", "Stock Movements Ledger", "Warehouse & Yard", "Immutable double-entry chronological audit ledger of all receipts, reservations, and dispatches", "Auditors, Inventory Controllers", "Movement History Log (.csv / .xlsx)"),
    ("returns", "Returns & Adjustments", "Warehouse & Yard", "Material return authorization, damaged lot quarantine, physical count reconciliation", "Storekeepers, Inventory Admin", "Stock Adjustment Record, Quarantine Certificate"),
    ("mtc", "MTC Digital Vault", "Quality & Compliance", "EN 10204 3.1 mill test certificates, automated inspection seals, multi-page watermarking", "QA/QC Lead, Document Controllers", "Certified True Copy Watermarked MTC (.pdf)"),
    ("reports", "Reports & Analytics", "Quality & Compliance", "Executive KPIs, stock aging, turnover rates, supplier lead times, customer ordering trends", "Managing Director, Financial Reviewers", "Executive Analytics Summary (.pdf / .xlsx)"),
    ("dashboard", "Executive KPI Dashboard", "System & Admin", "Real-time metrics, active orders, pending approvals counter, rapid action shortcuts", "All Authenticated Users", "Live Interactive Metrics & Action Feed"),
    ("excel", "Excel Studio", "System & Admin", "Bulk inventory spreadsheet import, formula validation, format sanitizer, template download", "Data Operators, Inventory Admins", "Validated Bulk Stock Ingest"),
    ("users", "User Management & RBAC", "System & Admin", "User provisioning, department assignment, role granting, status toggle, password management", "Super Administrator, IT Systems Admin", "Corporate User Registry"),
    ("audit", "Immutable Audit Logs", "System & Admin", "Tamper-evident chronological record of all system events, logins, edits, and exports", "Compliance Auditors, Super Admin", "Tamper-Evident Security Log"),
    ("settings", "Supabase & Cloud Sync", "System & Admin", "Cloud PostgreSQL database synchronization, API credentials, offline JSON backup/restore", "Super Admin, Database Administrator", "Full Database JSON Snapshot, Schema Migration"),
    ("it_console", "IT Software Config Console", "System & Admin", "Corporate branding, custom red QA stamp calibrator, digital signature, and RBAC governance", "IT Systems Engineer, Technical Architect", "System Configuration State & Brand Profile")
]

# Styling helpers
navy_header_fill = PatternFill(start_color="0B2545", end_color="0B2545", fill_type="solid")
header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
regular_font = Font(name="Calibri", size=10)
bold_font = Font(name="Calibri", size=10, bold=True)
thin_border = Border(
    left=Side(style='thin', color='D0D7DE'),
    right=Side(style='thin', color='D0D7DE'),
    top=Side(style='thin', color='D0D7DE'),
    bottom=Side(style='thin', color='D0D7DE')
)

ws1.append(headers1)
for col_idx in range(1, len(headers1) + 1):
    cell = ws1.cell(row=1, column=col_idx)
    cell.fill = navy_header_fill
    cell.font = header_font
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

for row_idx, row_data in enumerate(modules_data, start=2):
    ws1.append(row_data)
    for col_idx in range(1, len(row_data) + 1):
        cell = ws1.cell(row=row_idx, column=col_idx)
        cell.font = regular_font
        cell.border = thin_border
        if col_idx in [1, 3]:
            cell.alignment = Alignment(horizontal="center", vertical="center")
        elif col_idx == 2:
            cell.font = bold_font
            cell.alignment = Alignment(horizontal="left", vertical="center")
        else:
            cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

# Adjust column widths
for col in ws1.columns:
    max_len = max(len(str(cell.value or '')) for cell in col)
    col_letter = get_column_letter(col[0].column)
    ws1.column_dimensions[col_letter].width = min(max(max_len + 3, 14), 45)

file1_path = os.path.join(ref_dir, "Module_List.xlsx")
wb1.save(file1_path)
print(f"Generated: {file1_path}")


# -------------------------------------------------------------
# 2. User_Roles_and_Permissions.xlsx
# -------------------------------------------------------------
wb2 = openpyxl.Workbook()
ws2 = wb2.active
ws2.title = "Roles & Permissions Matrix"

headers2 = [
    "Role Identifier", "Formal Role Title", "Target User Persona",
    "Permitted Modules", "Restricted Modules", "Commercial Price Visibility", 
    "System Privileges & Governance"
]

roles_data = [
    (
        "super_admin",
        "Super Administrator",
        "CEO / Managing Director / General Manager",
        "ALL Modules (Solo Hub, Orders, Stock, Traceability, Allocation, Approvals, MTC, Sourcing, Dispatch, Reports, Users, Settings, IT Console)",
        "None (Unrestricted)",
        "Full Commercial Visibility (Unmasked unit rates, margins, totals)",
        "Full administrative control: user provisioning, permission overrides, database snapshots, company branding"
    ),
    (
        "admin_inventory",
        "Inventory Controller",
        "Materials Manager / Warehouse Controller",
        "Solo Hub, Dashboard, Stock, Items, Traceability, Orders, Allocation, Sourcing, LOC, Stickers, Approvals, MTC, Local Purchase, Movements, Returns, Reports, Excel, Settings",
        "User Management (Restricted)",
        "Operational rates visible; margins masked",
        "Full stock movements control, heat re-allocation, physical inventory adjustments, quarantine authorization"
    ),
    (
        "sales_team",
        "Senior Sales Coordinator",
        "Commercial Executives / Account Managers",
        "Solo Hub, Dashboard, Sales Orders, Sourcing & CIPL, Stickers, LOC, Master Stock, Heat Traceability",
        "Approvals, Dispatch execution, User Management, System Settings",
        "Full Commercial Visibility for customer quotations and orders",
        "Create sales orders, parse customer POs, run automated sourcing splits, generate commercial packing lists"
    ),
    (
        "storekeeper",
        "Chief Warehouse Storekeeper",
        "Yard Foremen / Storekeepers / Physical Handlers",
        "Solo Hub, Storekeeper Approvals, Master Stock, Heat Traceability, LOC Tags, Dispatch Management, Stock Movements",
        "Commercial Sales, Financial Reports, User Management, Cloud Settings",
        "Commercially Blind (All prices and margins permanently hidden)",
        "Physical goods inspection, heat number stamping verification, physical dispatch confirmation, bin location update"
    ),
    (
        "mtc_controller",
        "QA/QC Inspection Lead",
        "MTC Document Controller / Quality Inspector",
        "Solo Hub, MTC Digital Vault, Heat Traceability, Sales Orders, Master Stock, Local Purchase",
        "Commercial margins, Dispatch notes, User provisioning, Cloud migrations",
        "Commercially Blind (Material specifications and heat numbers only)",
        "Upload EN 10204 3.1 certs, apply certified true copy red inspection stamp, verify chemical & mechanical values"
    ),
    (
        "dispatch_team",
        "Dispatch & Logistics Officer",
        "Shipping Coordinators / Transport Handlers",
        "Solo Hub, Dispatch Management, Sales Orders, Thermal Stickers, Master Stock",
        "Stock adjustments, QA/QC cert stamping, User management, System settings",
        "Commercially Blind (Quantities, weights, and items only)",
        "Generate official Delivery Notes, compile Gate Passes, print thermal shipping barcode labels"
    ),
    (
        "management_viewer",
        "Senior Management Auditor",
        "CFO / Financial Auditor / Board Member",
        "Solo Hub, Dashboard, Reports & Analytics, Master Stock, Sales Orders, Immutable Audit Logs",
        "Editing stock lots, modifying orders, approving storekeeper requests",
        "Full Commercial Visibility for financial auditing and performance tracking",
        "Read-only enterprise review, executive financial reporting, audit trail inspection"
    ),
    (
        "it_engineer",
        "IT Systems Engineer",
        "Technical Systems Architect / Infrastructure Admin",
        "IT Software Config Console, Supabase & Cloud Settings, User Management, Audit Logs, Excel Studio",
        "Commercial margins, sales pricing, customer contract values",
        "Confidential Masking Enforced (Unit rates and margins rendered as •••••• [CONFIDENTIAL])",
        "Calibrate red QA/QC stamp & digital signature, manage RBAC matrix, configure Supabase credentials, database backups"
    )
]

ws2.append(headers2)
for col_idx in range(1, len(headers2) + 1):
    cell = ws2.cell(row=1, column=col_idx)
    cell.fill = navy_header_fill
    cell.font = header_font
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

for row_idx, row_data in enumerate(roles_data, start=2):
    ws2.append(row_data)
    for col_idx in range(1, len(row_data) + 1):
        cell = ws2.cell(row=row_idx, column=col_idx)
        cell.font = regular_font
        cell.border = thin_border
        if col_idx in [1, 6]:
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            if col_idx == 6 and "Blind" in row_data[5]:
                cell.font = Font(name="Calibri", size=10, bold=True, color="B71C1C")
            elif col_idx == 6 and "Confidential" in row_data[5]:
                cell.font = Font(name="Calibri", size=10, bold=True, color="D97706")
        elif col_idx == 2:
            cell.font = bold_font
            cell.alignment = Alignment(horizontal="left", vertical="center")
        else:
            cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

for col in ws2.columns:
    max_len = max(len(str(cell.value or '')) for cell in col)
    col_letter = get_column_letter(col[0].column)
    ws2.column_dimensions[col_letter].width = min(max(max_len + 3, 16), 48)

file2_path = os.path.join(ref_dir, "User_Roles_and_Permissions.xlsx")
wb2.save(file2_path)
print(f"Generated: {file2_path}")
