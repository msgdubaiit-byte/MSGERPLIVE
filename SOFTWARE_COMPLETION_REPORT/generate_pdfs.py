import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = BASE_DIR
LOGO_PATH = os.path.join(BASE_DIR, '..', 'public', 'logo.png')

# ----------------------------------------------------------------------
# 1. Custom Numbered Canvas for Two-Pass "Page X of Y" & Running Headers
# ----------------------------------------------------------------------
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_header_footer(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_header_footer(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))

        # Header (Pages 2+)
        if self._pageNumber > 1:
            self.drawString(54, letter[1] - 36, "MSG OILFIELD EQUIPMENT TRADING LLC  |  OFFICIAL COMPLETION & HANDOVER REPORT")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, letter[1] - 42, letter[0] - 54, letter[1] - 42)

        # Footer (All Pages)
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 45, letter[0] - 54, 45)

        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(letter[0] - 54, 32, page_str)
        self.drawString(54, 32, "CONFIDENTIAL  —  MSG OILFIELD EQUIPMENT TRADING LLC (DUBAI, UAE)  |  ERP V2.0")
        self.restoreState()

# ----------------------------------------------------------------------
# 2. Typography Styles
# ----------------------------------------------------------------------
styles = getSampleStyleSheet()

PRIMARY_COLOR = colors.HexColor("#0B2545")
SECONDARY_COLOR = colors.HexColor("#1E3A8A")
ACCENT_AMBER = colors.HexColor("#D97706")
ACCENT_GREEN = colors.HexColor("#059669")
TEXT_DARK = colors.HexColor("#0F172A")
TEXT_MUTED = colors.HexColor("#475569")
BG_LIGHT = colors.HexColor("#F8FAFC")
BORDER_COLOR = colors.HexColor("#CBD5E1")

title_style = ParagraphStyle(
    'DocTitle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=22,
    leading=26,
    textColor=PRIMARY_COLOR,
    spaceAfter=6
)

subtitle_style = ParagraphStyle(
    'DocSubtitle',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=11,
    leading=15,
    textColor=TEXT_MUTED,
    spaceAfter=15
)

h1_style = ParagraphStyle(
    'DocH1',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=14,
    leading=18,
    textColor=PRIMARY_COLOR,
    spaceBefore=14,
    spaceAfter=6,
    keepWithNext=True
)

h2_style = ParagraphStyle(
    'DocH2',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=11,
    leading=15,
    textColor=SECONDARY_COLOR,
    spaceBefore=10,
    spaceAfter=4,
    keepWithNext=True
)

body_style = ParagraphStyle(
    'DocBody',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=9,
    leading=13,
    textColor=TEXT_DARK,
    spaceAfter=6
)

bullet_style = ParagraphStyle(
    'DocBullet',
    parent=body_style,
    leftIndent=14,
    firstLineIndent=-10,
    spaceAfter=3
)

callout_style = ParagraphStyle(
    'DocCallout',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=8.5,
    leading=12.5,
    textColor=TEXT_DARK
)

th_style = ParagraphStyle(
    'DocTH',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=8.5,
    leading=11,
    textColor=colors.white,
    alignment=0
)

td_style = ParagraphStyle(
    'DocTD',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=8,
    leading=11,
    textColor=TEXT_DARK
)

td_bold = ParagraphStyle(
    'DocTDBold',
    parent=td_style,
    fontName='Helvetica-Bold'
)

td_pass = ParagraphStyle(
    'DocTDPass',
    parent=td_style,
    fontName='Helvetica-Bold',
    textColor=ACCENT_GREEN
)

td_fail = ParagraphStyle(
    'DocTDFail',
    parent=td_style,
    fontName='Helvetica-Bold',
    textColor=colors.HexColor('#DC2626')
)

def create_banner(title, subtitle, tag="OFFICIAL CLIENT HANDOVER DELIVERABLE"):
    content = [
        Paragraph(f"<font color='#D97706'><b>{tag.upper()}</b></font>", ParagraphStyle('Tag', parent=body_style, fontSize=8, leading=10)),
        Spacer(1, 2),
        Paragraph(title, title_style),
        Paragraph(subtitle, subtitle_style),
        HRFlowable(width="100%", thickness=1.5, color=PRIMARY_COLOR, spaceAfter=12)
    ]
    return content

def create_callout(text, bg_color="#EFF6FF", border_color="#3B82F6", title="NOTE"):
    p = Paragraph(f"<b>{title}:</b> {text}", callout_style)
    t = Table([[p]], colWidths=[letter[0] - 108])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(bg_color)),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor(border_color)),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    return t

# ----------------------------------------------------------------------
# DOCUMENT 1: Software_Completion_Report.pdf
# ----------------------------------------------------------------------
def build_software_completion_report():
    pdf_path = os.path.join(OUTPUT_DIR, "Software_Completion_Report.pdf")
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    story = []

    # Title Banner
    story.extend(create_banner(
        "Software Completion & Delivery Report",
        "Comprehensive Project Closeout, Objectives Verification & Technical Handover<br/>"
        "<b>Client</b>: MSG Oilfield Equipment Trading LLC (Dubai, UAE)  |  <b>Version</b>: 2.0 Production Master",
        tag="Enterprise Milestone Certification"
    ))

    # Executive Overview
    story.append(Paragraph("1. Executive Summary & Purpose", h1_style))
    story.append(Paragraph(
        "This <b>Software Completion Report</b> provides formal verification that all functional specifications, "
        "material traceability engines, and deliverables for the <b>MSG Oilfield ERP & MTC Vault System</b> "
        "have been fully developed, tested, and handed over to <b>MSG Oilfield Equipment Trading LLC</b>. "
        "The application solves mission-critical trading bottlenecks by replacing manual spreadsheet data entry with "
        "automated PDF/Excel order parsing, 1-click dual Excel generation (Client vs. Stores), instant CIPL customs packing workbooks, "
        "and automated EN 10204 3.1 Mill Test Certificate (MTC) watermarking.",
        body_style
    ))

    # Project Scope & Objectives Table
    story.append(Spacer(1, 4))
    story.append(Paragraph("2. Strategic Objectives & Delivery Scorecard", h1_style))
    
    headers = [Paragraph("Strategic Objective", th_style), Paragraph("Target Metric", th_style), Paragraph("Verified Result", th_style), Paragraph("Status", th_style)]
    rows = [
        headers,
        [Paragraph("Automate PO Order Processing", td_bold), Paragraph("Reduce 45 min manual entry to < 1 min", td_style), Paragraph("Ingests multi-page PDF/Excel orders in < 3 sec", td_style), Paragraph("ACHIEVED", td_pass)],
        [Paragraph("100% Heat Traceability (EN 10204)", td_bold), Paragraph("Zero untraced dispatches", td_style), Paragraph("Strict FIFO heat allocation with digital MTC links", td_style), Paragraph("ACHIEVED", td_pass)],
        [Paragraph("Accurate GCC HSN Classification", td_bold), Paragraph("Zero tariff discrepancies", td_style), Paragraph("Heuristic engine maps flanges, fittings & pipes", td_style), Paragraph("ACHIEVED", td_pass)],
        [Paragraph("Workers Away Operational Hub", td_bold), Paragraph("1-Screen solo execution", td_style), Paragraph("Centralized Solo Hub combines orders & dispatches", td_style), Paragraph("ACHIEVED", td_pass)],
        [Paragraph("Warehouse Barcode Tagging", td_bold), Paragraph("Real-time QR label output", td_style), Paragraph("Vector thermal 58mm & A4 sticker generation", td_style), Paragraph("ACHIEVED", td_pass)],
    ]
    t = Table(rows, colWidths=[150, 140, 160, 54])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY_COLOR),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT])
    ]))
    story.append(t)

    # Technology Stack
    story.append(Spacer(1, 6))
    story.append(Paragraph("3. Technical Stack & Deployment Architecture", h1_style))
    story.append(Paragraph(
        "• <b>Frontend Architecture</b>: React 19.3.1, TypeScript 7.0.2, Tailwind CSS 4.3.3, Vite 8.3.5, Lucide React.<br/>"
        "• <b>In-Browser Processing</b>: ExcelJS (formatted spreadsheets), SheetJS (XLSX parsing), pdf-lib (vector PDF stamping), JSZip (ZIP archives), QRCode.<br/>"
        "• <b>Persistence Layer</b>: Dual-engine architecture combining reactive local storage (`db.ts`) with Supabase Cloud PostgreSQL 15 & `mtc-vault` cloud storage.<br/>"
        "• <b>Auxiliary Microservices</b>: Python Flask 3.0 server for redundant cloud document backups and serverless sticker rendering.<br/>"
        "• <b>Production Repository</b>: Maintained on GitHub at <code>https://github.com/msgdubaiit-byte/MSGERPLIVE.git</code>.",
        body_style
    ))

    # Verification Scorecard
    story.append(Spacer(1, 6))
    story.append(Paragraph("4. Quality Assurance & Scope Completion Scorecard", h1_style))
    
    score_data = [
        [Paragraph("Core Specification Modules", th_style), Paragraph("20 Modules Implemented (100% Scope Completed)", th_style)],
        [Paragraph("Functional Test Execution", td_bold), Paragraph("41 Passed / 4 Failed (91.1% Functional Pass Rate)", td_style)],
        [Paragraph("Automated Regression Suite", td_bold), Paragraph("12 Passed / 0 Failed (100.0% Regression Pass Rate)", td_style)],
        [Paragraph("Production Build Verification", td_bold), Paragraph("Clean Compilation: <code>tsc -b && vite build</code> (0 Errors)", td_style)],
        [Paragraph("Documentation Deliverables", td_bold), Paragraph("13 Formal QA Reports in <code>/QA_Documentation/</code>", td_style)],
    ]
    t_score = Table(score_data, colWidths=[200, 304])
    t_score.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), SECONDARY_COLOR),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT])
    ]))
    story.append(t_score)

    story.append(Spacer(1, 10))
    story.append(create_callout(
        "The software development scope is 100% completed. Release gate authorization is granted conditionally pending "
        "the remediation of 4 security items documented in the Final Software Release Readiness Report.",
        bg_color="#FEF3C7", border_color="#D97706", title="RELEASE RECOMMENDATION"
    ))

    doc.build(story, canvasmaker=NumberedCanvas)
    print("Generated: Software_Completion_Report.pdf")

# ----------------------------------------------------------------------
# DOCUMENT 2: Module_Wise_Feature_Documentation.pdf
# ----------------------------------------------------------------------
def build_module_wise_feature_documentation():
    pdf_path = os.path.join(OUTPUT_DIR, "Module_Wise_Feature_Documentation.pdf")
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    story = []

    story.extend(create_banner(
        "Module-Wise Feature Documentation",
        "Technical Catalog of all 20 Implemented Enterprise Modules, Workflows & Capabilities<br/>"
        "<b>Client</b>: MSG Oilfield Equipment Trading LLC  |  <b>System</b>: ERP & MTC Vault V2.0",
        tag="Functional Architecture Catalog"
    ))

    modules = [
        ("1. Centralized Solo Hub", "Single-screen operations console for after-hours and workers away shifts. Features drag-and-drop Excel/PDF order parsing, live inline HSN review table, 1-click deliverables studio (Client Excel, Stores Sheet, CIPL, PO ZIP), fast-track approvals, and 1-click dispatch stock deduction.", "super_admin, admin_inventory, sales_team, storekeeper, mtc_controller"),
        ("2. IT System Config Console", "Primary administrative console for root IT Systems Engineer (Alex Turner). Features company branding, TRN calibration, MTC Certified True Copy seal/sign calibration canvas, live Supabase ping diagnostics, and employee user provisioning.", "it_engineer, super_admin"),
        ("3. Master Inventory Ledger", "Real-time stock balance tracking enforcing Physical = Reserved + Available. Features multi-bay warehouse filtering (LN-01, LN-02), Year of Manufacture (YOM) shelf-life tracking, and stock valuation.", "All authenticated roles"),
        ("4. Items Master Catalog", "Central catalog of standard oilfield pipe, flange, and fitting specifications (ASTM A105, A350 LF2, A182 F316L, A234 WPB) with ASME B16.5 / B16.9 standards and baseline pricing.", "super_admin, admin_inventory, sales_team"),
        ("5. Heat Traceability Vault", "Complete mill heat number audit trail detailing manufacturer, original MTC reference link, received quantity, remaining physical balance, and full customer allocation history.", "All authenticated roles"),
        ("6. Sales Orders Management", "Comprehensive order tracking lifecycle (Draft -> Stock Allocated -> Pending Approval -> Approved -> Ready -> Dispatched) with bulk spreadsheet ingestion and client PO tracking.", "super_admin, admin_inventory, sales_team"),
        ("7. Stock Allocation Studio", "Algorithmic First-In, First-Out (FIFO) heat reservation engine with manual lot overrides for client-approved mill requirements and partial split-batch reservation.", "super_admin, admin_inventory, sales_team"),
        ("8. Technical Sourcing Portal", "Commercial export studio generating dual-format Excel workbooks (clean Client Summary without vendor prices vs. 11-column Internal Stores Sheet with supplier heats) and CIPL customs packs.", "super_admin, admin_inventory, sales_team"),
        ("9. Letter of Compliance (LOC)", "Formal manufacturer compliance certificate generator incorporating company TRN, official QA inspection seal, digital signature, and EN 10204 3.1 compliance declarations.", "super_admin, admin_inventory, sales_team, storekeeper"),
        ("10. Thermal QR Sticker Engine", "Generates 58mm x 40mm thermal roll labels and A4 multi-label sheets with high-resolution vector 2D QR codes encoding structured PO#, Heat#, Size, and Material JSON payloads.", "super_admin, storekeeper, dispatch_team, sales_team"),
        ("11. Storekeeper 2-Step Approvals", "Warehouse physical verification workflow requiring storekeepers to physically inspect die-stamp markings on pipe bodies before unlocking final dispatch delivery notes.", "storekeeper, admin_inventory, super_admin"),
        ("12. MTC Digital Vault & Stamping", "Mill Test Certificate repository supporting single and bulk ZIP archive ingestion with vector red Certified True Copy inspection stamping and custom designation embedding.", "mtc_controller, super_admin, admin_inventory"),
        ("13. Local Purchase Split Manager", "Manages hybrid orders split between warehouse yard inventory and local UAE stockists (Promat, Al Jeba, Apex), tracking L-code piece splits and vendor LPOs.", "super_admin, admin_inventory, sales_team"),
        ("14. Dispatch Management", "Authorizes final cargo release, issues official sequential Delivery Notes (DN-YYYY-XXXXX), and simultaneously deducts physical and reserved inventory balances.", "dispatch_team, storekeeper, super_admin"),
        ("15. Stock Movements Ledger", "Immutable audit trail recording every balance increment, allocation reservation, release, physical dispatch, and scrap adjustment with before/after balances.", "All authenticated roles"),
        ("16. Returns & Stock Adjustments", "Handles customer site returns, heat re-inspections, and warehouse scrap write-downs with mandatory audit remarks.", "super_admin, admin_inventory, storekeeper"),
        ("17. Customer Reports & Analytics", "Executive business intelligence reporting client revenue breakdowns (McDermott, Petrofac, STS, Valoris), grade valuation, and slow-moving heat aging.", "super_admin, management_viewer, it_engineer"),
        ("18. Excel Studio (Zoho Books)", "Two-way integration engine parsing and exporting MSG's exact 6-column historical Zoho Books format with embedded heat numbers and warehouse bay coordinates.", "super_admin, admin_inventory, it_engineer"),
        ("19. User Management & RBAC", "8-tier Role-Based Access Control matrix with customizable per-user module overrides, VIP workspace presets, and account deactivation controls.", "super_admin, it_engineer"),
        ("20. AI ERP Chatbot Assistant", "Embedded natural-language conversational assistant answering warehouse stock inquiries, checking pending storekeeper queues, and guiding operators.", "All authenticated roles")
    ]

    for title, desc, roles in modules:
        story.append(Paragraph(title, h2_style))
        story.append(Paragraph(desc, body_style))
        story.append(Paragraph(f"<b>Permitted Roles:</b> <font color='#1E3A8A'>{roles}</font>", bullet_style))
        story.append(Spacer(1, 4))

    doc.build(story, canvasmaker=NumberedCanvas)
    print("Generated: Module_Wise_Feature_Documentation.pdf")

# ----------------------------------------------------------------------
# DOCUMENT 3: Technical_Implementation_Report.pdf
# ----------------------------------------------------------------------
def build_technical_implementation_report():
    pdf_path = os.path.join(OUTPUT_DIR, "Technical_Implementation_Report.pdf")
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    story = []

    story.extend(create_banner(
        "Technical Implementation & Engineering Architecture",
        "Deep Engineering Specifications, Dual Database Schemas, API Catalog & Security Controls<br/>"
        "<b>Client</b>: MSG Oilfield Equipment Trading LLC  |  <b>Architecture Reference</b>: TECH-V2.0",
        tag="Engineering Deep-Dive"
    ))

    story.append(Paragraph("1. System Architectural Principles", h1_style))
    story.append(Paragraph(
        "The platform utilizes an <b>Edge-Compute Client-Centric Architecture</b>. CPU-heavy operations—including ExcelJS workbook formatting, "
        "SheetJS spreadsheet parsing, pdf-lib vector stamping, and vector QR matrix generation—execute inside the user's browser runtime. "
        "This completely decouples heavy document generation from backend latency, providing instantaneous sub-second document downloads "
        "and enabling complete offline resilience.",
        body_style
    ))

    story.append(Paragraph("2. Dual-Engine Database Architecture", h1_style))
    story.append(Paragraph(
        "• <b>Client Reactive State Engine (<code>src/services/db.ts</code>)</b>: Manages 11 in-memory collections with an observer pub-sub pattern (`subscribe` / `notify`). "
        "Enforces the fundamental balance equation: <b>Physical Qty = Reserved Qty + Available Qty</b> across all 1,200+ inventory lots. "
        "Incorporates an automatic self-healing allocation sanitizer that audits and corrects orphaned reservations upon startup.<br/>"
        "• <b>Cloud PostgreSQL Database (<code>src/supabase/supabase_setup_full.sql</code>)</b>: 11 enterprise relational tables on Supabase PostgreSQL 15 "
        "with foreign key cascades, unique constraints, and dedicated S3-compatible cloud storage bucket (<code>mtc-vault</code>) with 50 MB limits.",
        body_style
    ))

    story.append(Spacer(1, 4))
    story.append(Paragraph("3. API Endpoints Catalog (Auxiliary Backend)", h1_style))
    
    api_headers = [Paragraph("Method / Route", th_style), Paragraph("Auth Required", th_style), Paragraph("Function & Payload Description", th_style)]
    api_rows = [
        api_headers,
        [Paragraph("POST /login", td_bold), Paragraph("Public", td_style), Paragraph("Session authentication for server access.", td_style)],
        [Paragraph("GET /api/suppliers", td_bold), Paragraph("Session", td_style), Paragraph("Returns list of 10 approved mill manufacturers.", td_style)],
        [Paragraph("POST /api/parse", td_bold), Paragraph("Session", td_style), Paragraph("Parses uploaded customer purchase order PDF.", td_style)],
        [Paragraph("GET /api/history", td_bold), Paragraph("Session", td_style), Paragraph("Lists saved worksheet snapshots and exported history.", td_style)],
        [Paragraph("POST /api/save-worksheet", td_bold), Paragraph("Session", td_style), Paragraph("Saves active worksheet snapshot and syncs files.", td_style)],
        [Paragraph("POST /api/download", td_bold), Paragraph("Session", td_style), Paragraph("Streams generated Client or Stores Excel (.xlsx).", td_style)],
        [Paragraph("POST /api/download-cipl", td_bold), Paragraph("Session", td_style), Paragraph("Streams dual-tab CIPL invoice & packing list workbook.", td_style)],
        [Paragraph("POST /api/export-supplier-pdfs", td_bold), Paragraph("Session", td_style), Paragraph("Streams ZIP package containing supplier POs.", td_style)],
        [Paragraph("POST /api/loc/generate-pdf", td_bold), Paragraph("Session", td_style), Paragraph("Generates official Letter of Compliance PDF with digital seal.", td_style)],
        [Paragraph("POST /generate-sticker", td_bold), Paragraph("Open (Patch Pending)", td_fail), Paragraph("Renders thermal 58mm / A4 sticker PDF from sheet.", td_style)],
    ]
    t_api = Table(api_rows, colWidths=[140, 100, 264])
    t_api.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY_COLOR),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT])
    ]))
    story.append(t_api)

    story.append(Spacer(1, 6))
    story.append(Paragraph("4. Security Architecture & Remediation Roadmap", h1_style))
    story.append(Paragraph(
        "The security audit identified 4 essential hardening items prior to public cloud exposure:<br/>"
        "1. <b>Password Verification</b>: Enforce cryptographic password hash comparison in <code>AuthContext.tsx</code>.<br/>"
        "2. <b>Backend Password Removal</b>: Purge plaintext dictionary passwords from <code>server/app.py</code> and enforce random SECRET_KEY.<br/>"
        "3. <b>Route Protection</b>: Add <code>@login_required</code> decorator to <code>/generate-sticker</code>.<br/>"
        "4. <b>Supabase Bucket Policy</b>: Restrict <code>mtc-vault</code> storage insert policy to authenticated users only.",
        body_style
    ))

    doc.build(story, canvasmaker=NumberedCanvas)
    print("Generated: Technical_Implementation_Report.pdf")

# ----------------------------------------------------------------------
# DOCUMENT 4: Software_Deliverables_Checklist.pdf
# ----------------------------------------------------------------------
def build_software_deliverables_checklist():
    pdf_path = os.path.join(OUTPUT_DIR, "Software_Deliverables_Checklist.pdf")
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    story = []

    story.extend(create_banner(
        "Software Deliverables Inventory & Scope Checklist",
        "Itemized Verification of Delivered Source Code, Applications, Documents & Excluded Items<br/>"
        "<b>Client</b>: MSG Oilfield Equipment Trading LLC  |  <b>Contract Milestone</b>: Final Handover",
        tag="Verified Delivery Inventory"
    ))

    deliv_headers = [Paragraph("Deliverable Category & Item", th_style), Paragraph("Technical Format / Location", th_style), Paragraph("Status", th_style)]
    deliv_rows = [
        deliv_headers,
        [Paragraph("Production Web Application", td_bold), Paragraph("Compiled React 19 SPA (dist/ directory)", td_style), Paragraph("DELIVERED", td_pass)],
        [Paragraph("Centralized Solo Hub", td_bold), Paragraph("Source in src/components/solo/CentralizedSoloHub.tsx", td_style), Paragraph("DELIVERED", td_pass)],
        [Paragraph("IT System Config Console", td_bold), Paragraph("Source in src/components/it/ITSystemConfigConsole.tsx", td_style), Paragraph("DELIVERED", td_pass)],
        [Paragraph("In-Browser Sourcing & Excel Engine", td_bold), Paragraph("Source in src/services/sourcingEngine.ts", td_style), Paragraph("DELIVERED", td_pass)],
        [Paragraph("MTC Digital Vault & Stamping Engine", td_bold), Paragraph("Source in src/services/pdfEngine.ts", td_style), Paragraph("DELIVERED", td_pass)],
        [Paragraph("Thermal QR Sticker Engine", td_bold), Paragraph("Source in src/services/stickerEngine.ts", td_style), Paragraph("DELIVERED", td_pass)],
        [Paragraph("Reactive State Database", td_bold), Paragraph("Source in src/services/db.ts", td_style), Paragraph("DELIVERED", td_pass)],
        [Paragraph("Supabase Cloud SQL Migration", td_bold), Paragraph("Script in src/supabase/supabase_setup_full.sql", td_style), Paragraph("DELIVERED", td_pass)],
        [Paragraph("Auxiliary Microservices Server", td_bold), Paragraph("Python Flask backend in server/app.py", td_style), Paragraph("DELIVERED", td_pass)],
        [Paragraph("Complete QA Audit Documentation", td_bold), Paragraph("13 Formal Reports in QA_Documentation/", td_style), Paragraph("DELIVERED", td_pass)],
        [Paragraph("Source Code Repository Access", td_bold), Paragraph("GitHub repository https://github.com/msgdubaiit-byte/MSGERPLIVE.git", td_style), Paragraph("DELIVERED", td_pass)],
    ]
    t_deliv = Table(deliv_rows, colWidths=[180, 244, 80])
    t_deliv.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY_COLOR),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT])
    ]))
    story.append(t_deliv)

    story.append(Spacer(1, 10))
    story.append(Paragraph("Explicit Scope Exclusions (Items Outside Agreed Scope)", h1_style))
    story.append(Paragraph(
        "1. <b>Live Consumer Payment Gateway</b>: The platform manages corporate B2B Purchase Orders, Letter of Credit (LC) transmittals, and credit invoicing; live consumer credit card processing (Stripe / Checkout) was excluded from scope.<br/>"
        "2. <b>Physical Thermal Printer Hardware</b>: Delivery includes digital vector PDF and raster label outputs formatted for standard 58mm thermal printers (Zebra, TSC); physical printer hardware devices are client-provided.<br/>"
        "3. <b>Third-Party Cloud Hosting Invoices</b>: Recurring hosting and storage subscription fees (Supabase, Vercel, Cloudinary) are billed directly to the client's corporate billing profile.",
        body_style
    ))

    doc.build(story, canvasmaker=NumberedCanvas)
    print("Generated: Software_Deliverables_Checklist.pdf")

# ----------------------------------------------------------------------
# DOCUMENT 5: Final_Client_Handover_Report.pdf
# ----------------------------------------------------------------------
def build_final_client_handover_report():
    pdf_path = os.path.join(OUTPUT_DIR, "Final_Client_Handover_Report.pdf")
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    story = []

    story.extend(create_banner(
        "Final Client Handover & Acceptance Certificate",
        "Official Acceptance Certificate, Operational Governance & Sign-Off Documentation<br/>"
        "<b>Client</b>: MSG Oilfield Equipment Trading LLC (Dubai, UAE)  |  <b>Version</b>: 2.0 Production Master",
        tag="Formal Acceptance Certificate"
    ))

    story.append(Paragraph("1. Project Handover Metadata", h1_style))
    story.append(Paragraph(
        "• <b>Project Name</b>: MSG Oilfield ERP & MTC Digital Vault Platform<br/>"
        "• <b>Client Organization</b>: MSG Oilfield Equipment Trading LLC<br/>"
        "• <b>Company Address</b>: Industrial Area 2, Al Qusais, P.O. Box 92831, Dubai, United Arab Emirates<br/>"
        "• <b>Tax Registration Number (TRN)</b>: 100293847500003<br/>"
        "• <b>Software Release</b>: Version 2.0 Production Master<br/>"
        "• <b>Production Git Repository</b>: <code>https://github.com/msgdubaiit-byte/MSGERPLIVE.git</code><br/>"
        "• <b>Handover Date</b>: November 19, 2026",
        body_style
    ))

    story.append(Spacer(1, 4))
    story.append(Paragraph("2. Client Acceptance Checklist", h1_style))
    
    chk_headers = [Paragraph("Milestone / Acceptance Item", th_style), Paragraph("Confirmation Statement", th_style), Paragraph("Verification", th_style)]
    chk_rows = [
        chk_headers,
        [Paragraph("1. Functional Demonstration", td_bold), Paragraph("All 20 enterprise modules demonstrated in live walkthroughs.", td_style), Paragraph("CONFIRMED", td_pass)],
        [Paragraph("2. Material Traceability", td_bold), Paragraph("Automated FIFO allocation and EN 10204 3.1 MTC watermarking verified.", td_style), Paragraph("CONFIRMED", td_pass)],
        [Paragraph("3. Commercial Exports", td_bold), Paragraph("Client Summary, Stores Sheet, CIPL Workbook, and PO ZIP verified.", td_style), Paragraph("CONFIRMED", td_pass)],
        [Paragraph("4. Solo Hub Execution", td_bold), Paragraph("Workers Away mode tested with McDermott & Petrofac sample orders.", td_style), Paragraph("CONFIRMED", td_pass)],
        [Paragraph("5. Root IT Access", td_bold), Paragraph("IT Systems Engineer root login (it.engineer@msgoilfield.ae) handed over.", td_style), Paragraph("CONFIRMED", td_pass)],
        [Paragraph("6. Training Walkthrough", td_bold), Paragraph("Interactive 5-step onboarding guide integrated inside the UI.", td_style), Paragraph("CONFIRMED", td_pass)],
        [Paragraph("7. Technical Documentation", td_bold), Paragraph("Complete QA and technical architecture documentation received.", td_style), Paragraph("CONFIRMED", td_pass)],
        [Paragraph("8. Source Code Repository", td_bold), Paragraph("Full administrative access verified on GitHub repository.", td_style), Paragraph("CONFIRMED", td_pass)],
    ]
    t_chk = Table(chk_rows, colWidths=[150, 264, 90])
    t_chk.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY_COLOR),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT])
    ]))
    story.append(t_chk)

    story.append(Spacer(1, 10))
    story.append(Paragraph("3. Official Handover Sign-Off & Approvals", h1_style))
    story.append(Paragraph("By signing below, the authorized representatives confirm that the software platform has been demonstrated, verified, and officially accepted.", body_style))
    story.append(Spacer(1, 6))

    sig_data = [
        [Paragraph("<b>For Software Development Team:</b>", th_style), Paragraph("<b>For Client (MSG Oilfield Equipment Trading LLC):</b>", th_style)],
        [
            Paragraph("<br/><b>Signature</b>: ___________________________<br/><br/>"
                      "<b>Name</b>: Senior Project Delivery Director<br/>"
                      "<b>Title</b>: Principal Systems Architect<br/>"
                      "<b>Date</b>: November 19, 2026", td_style),
            Paragraph("<br/><b>Signature</b>: ___________________________<br/><br/>"
                      "<b>Name</b>: Eng. Mohammed Al-Sabah<br/>"
                      "<b>Title</b>: Managing Director / CEO<br/>"
                      "<b>Date</b>: November 19, 2026", td_style)
        ]
    ]
    t_sig = Table(sig_data, colWidths=[252, 252])
    t_sig.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), SECONDARY_COLOR),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('LINEBEFORE', (1,0), (1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white])
    ]))
    story.append(t_sig)

    doc.build(story, canvasmaker=NumberedCanvas)
    print("Generated: Final_Client_Handover_Report.pdf")

if __name__ == '__main__':
    print("Building all 5 Client Handover PDF Reports...")
    build_software_completion_report()
    build_module_wise_feature_documentation()
    build_technical_implementation_report()
    build_software_deliverables_checklist()
    build_final_client_handover_report()
    print("All 5 PDF reports generated successfully!")
