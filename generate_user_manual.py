import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable, Image
)
from reportlab.pdfgen import canvas

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE_DIR, 'Software_Documentation', '01_Complete_User_Manual')
SCREENSHOT_DIR = os.path.join(BASE_DIR, 'Software_Documentation', '05_Screenshots')
os.makedirs(OUT_DIR, exist_ok=True)

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

        if self._pageNumber > 1:
            self.drawString(54, letter[1] - 36, "MSG OILFIELD ERP  |  COMPLETE END-USER MANUAL & SYSTEM GUIDE")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, letter[1] - 40, letter[0] - 54, letter[1] - 40)

        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 45, letter[0] - 54, 45)

        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(letter[0] - 54, 32, page_str)
        self.drawString(54, 32, "CONFIDENTIAL  —  MSG OILFIELD EQUIPMENT TRADING LLC (DUBAI, UAE)  |  RELEASE 2.0")
        self.restoreState()

styles = getSampleStyleSheet()
PRIMARY_COLOR = colors.HexColor("#0B2545")
SECONDARY_COLOR = colors.HexColor("#1E3A8A")
ACCENT_RED = colors.HexColor("#B91C1C")
TEXT_DARK = colors.HexColor("#0F172A")
TEXT_MUTED = colors.HexColor("#475569")
BG_LIGHT = colors.HexColor("#F8FAFC")
BORDER_COLOR = colors.HexColor("#CBD5E1")

title_style = ParagraphStyle(
    'DocTitle', parent=styles['Normal'],
    fontName='Helvetica-Bold', fontSize=24, leading=28,
    textColor=PRIMARY_COLOR, alignment=0, spaceAfter=8
)
subtitle_style = ParagraphStyle(
    'DocSubTitle', parent=styles['Normal'],
    fontName='Helvetica', fontSize=12, leading=16,
    textColor=SECONDARY_COLOR, alignment=0, spaceAfter=15
)
h1_style = ParagraphStyle(
    'Heading1_Custom', parent=styles['Heading1'],
    fontName='Helvetica-Bold', fontSize=15, leading=19,
    textColor=PRIMARY_COLOR, spaceBefore=14, spaceAfter=6, keepWithNext=True
)
h2_style = ParagraphStyle(
    'Heading2_Custom', parent=styles['Heading2'],
    fontName='Helvetica-Bold', fontSize=12, leading=15,
    textColor=SECONDARY_COLOR, spaceBefore=10, spaceAfter=4, keepWithNext=True
)
body_style = ParagraphStyle(
    'Body_Custom', parent=styles['Normal'],
    fontName='Helvetica', fontSize=9, leading=13,
    textColor=TEXT_DARK, spaceAfter=5
)
bullet_style = ParagraphStyle(
    'Bullet_Custom', parent=body_style,
    leftIndent=15, bulletIndent=5, spaceAfter=3
)
caption_style = ParagraphStyle(
    'FigCaption', parent=styles['Normal'],
    fontName='Helvetica-Bold', fontSize=9, leading=12,
    textColor=SECONDARY_COLOR, alignment=1, spaceBefore=4, spaceAfter=8
)
callout_style = ParagraphStyle(
    'CalloutText', parent=styles['Normal'],
    fontName='Helvetica-Oblique', fontSize=8.5, leading=12,
    textColor=colors.HexColor("#1E293B")
)

def create_callout(text, bg_color="#EFF6FF", border_color="#3B82F6"):
    p = Paragraph(f"<b>NOTE / BEST PRACTICE:</b> {text}", callout_style)
    t = Table([[p]], colWidths=[letter[0] - 108])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(bg_color)),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor(border_color)),
    ]))
    return t

def make_screenshot_flowable(rel_path, fig_title):
    full_path = os.path.join(SCREENSHOT_DIR, rel_path)
    elems = []
    if os.path.exists(full_path):
        # 6.5 inches wide, 3.65 inches high
        img = Image(full_path, width=6.5*inch, height=3.65*inch)
        elems.append(img)
        elems.append(Paragraph(fig_title, caption_style))
    else:
        elems.append(Paragraph(f"[Screenshot Placeholder: {fig_title}]", caption_style))
    return elems

def build_pdf():
    pdf_filename = os.path.join(OUT_DIR, "Software_User_Manual.pdf")
    doc = SimpleDocTemplate(
        pdf_filename,
        pagesize=letter,
        leftMargin=54, rightMargin=54, topMargin=54, bottomMargin=54
    )
    story = []

    # COVER / HEADER
    story.append(Paragraph("MSG OILFIELD EQUIPMENT TRADING LLC", ParagraphStyle('Company', fontName='Helvetica-Bold', fontSize=14, textColor=PRIMARY_COLOR, spaceAfter=2)))
    story.append(Paragraph("Industrial Area 2, Al Qusais, P.O. Box 92831, Dubai, United Arab Emirates", ParagraphStyle('Address', fontName='Helvetica', fontSize=8.5, textColor=TEXT_MUTED, spaceAfter=15)))
    story.append(HRFlowable(width="100%", thickness=2, color=PRIMARY_COLOR, spaceBefore=0, spaceAfter=15))

    story.append(Paragraph("COMPLETE SOFTWARE USER MANUAL", title_style))
    story.append(Paragraph("Enterprise Operating Guide & Standard Operating Procedures (SOP) — Version 2.0", subtitle_style))

    # Meta Table
    meta_data = [
        [Paragraph("<b>Document Reference:</b>", body_style), Paragraph("MSG-SOP-USER-MANUAL-2026", body_style), Paragraph("<b>Release Version:</b>", body_style), Paragraph("Version 2.0 (Build 2026.11)", body_style)],
        [Paragraph("<b>Target Audience:</b>", body_style), Paragraph("All Employees, Coordinators, Storekeepers & Admins", body_style), Paragraph("<b>Effective Date:</b>", body_style), Paragraph("November 20, 2026", body_style)],
        [Paragraph("<b>Classification:</b>", body_style), Paragraph("CONFIDENTIAL / INTERNAL ENTERPRISE SOP", body_style), Paragraph("<b>Platform:</b>", body_style), Paragraph("Web Desktop, Tablet & Industrial Terminals", body_style)]
    ]
    meta_table = Table(meta_data, colWidths=[120, 180, 90, 114])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 15))

    # TABLE OF CONTENTS SUMMARY
    story.append(Paragraph("TABLE OF CONTENTS SUMMARY", h1_style))
    toc_data = [
        [Paragraph("1. System Overview & Technology Stack", body_style), Paragraph("8. Quality & MTC Digital Vault", body_style)],
        [Paragraph("2. System Requirements & Browser Setup", body_style), Paragraph("9. Sourcing, Split & CIPL Invoicing", body_style)],
        [Paragraph("3. Authentication & Account Access", body_style), Paragraph("10. Dispatch & Customer Delivery Notes", body_style)],
        [Paragraph("4. Executive KPI Dashboard", body_style), Paragraph("11. Thermal Barcodes & LOC Tags", body_style)],
        [Paragraph("5. Centralized Solo Hub & Workers Away", body_style), Paragraph("12. IT Software Config & RBAC", body_style)],
        [Paragraph("6. Sales Order Intake & PDF Parsing", body_style), Paragraph("13. Reports, Audit Logs & Backups", body_style)],
        [Paragraph("7. Master Stock & 360° Heat Traceability", body_style), Paragraph("14. Troubleshooting & FAQ", body_style)]
    ]
    toc_table = Table(toc_data, colWidths=[252, 252])
    toc_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(toc_table)
    story.append(PageBreak())

    # SECTION 1: SYSTEM OVERVIEW
    story.append(Paragraph("1. SYSTEM OVERVIEW & ARCHITECTURE", h1_style))
    story.append(Paragraph(
        "The MSG Oilfield ERP & MTC Vault System is an enterprise resource planning and traceability suite engineered specifically for oilfield piping materials trading, flange distribution, and warehouse yard logistics. "
        "The system eliminates manual data re-entry by synchronizing sales order intake, automated mill certificate watermarking, physical lot reservation via FIFO algorithms, commercial export packing lists (CIPL), and thermal QR barcode generation in a unified interface.",
        body_style
    ))
    story.append(Paragraph("Key architectural highlights include:", body_style))
    story.append(Paragraph("• <b>Zero-Latency In-Browser Processing:</b> High-speed client-side generation of 11-column Excel workbooks, multi-page watermarked MTC certificates, and ZIP packages without server roundtrips.", bullet_style))
    story.append(Paragraph("• <b>Workers Away / Solo Hub Resilience:</b> An all-in-one operations portal allowing a single duty coordinator to execute customer order processing, supplier sourcing, thermal labeling, and approvals in under 60 seconds.", bullet_style))
    story.append(Paragraph("• <b>360° Heat Pedigree & Invariants:</b> Mathematical enforcement of stock conservation (Physical = Reserved + Available) and complete traceability linking heat numbers to mill test certificates and delivery notes.", bullet_style))
    story.append(Spacer(1, 10))

    # SECTION 2: SYSTEM REQUIREMENTS
    story.append(Paragraph("2. SYSTEM REQUIREMENTS & ACCESS", h1_style))
    req_data = [
        [Paragraph("<b>Component</b>", body_style), Paragraph("<b>Minimum Specification</b>", body_style), Paragraph("<b>Recommended Specification</b>", body_style)],
        [Paragraph("Web Browser", body_style), Paragraph("Chrome 110+, Edge 110+, Firefox 115+", body_style), Paragraph("Google Chrome 120+ or Microsoft Edge Latest (Chromium)", body_style)],
        [Paragraph("Display Resolution", body_style), Paragraph("1280 × 720 (HD)", body_style), Paragraph("1920 × 1080 (Full HD) or higher for optimal data density", body_style)],
        [Paragraph("Memory (RAM)", body_style), Paragraph("4 GB System RAM", body_style), Paragraph("8 GB+ System RAM (Smooth multi-PDF watermarking)", body_style)],
        [Paragraph("Network Connectivity", body_style), Paragraph("1 Mbps Broadband / 4G", body_style), Paragraph("10 Mbps+ High-Speed Fiber for cloud database sync", body_style)],
        [Paragraph("Supported Devices", body_style), Paragraph("Desktop PC, Laptop", body_style), Paragraph("Desktop, Industrial Yard Tablet, Barcode Scanner Terminal", body_style)]
    ]
    req_table = Table(req_data, colWidths=[110, 180, 214])
    req_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY_COLOR),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    for c in range(3):
        req_table.setStyle(TableStyle([('TEXTCOLOR', (c,0), (c,0), colors.white)]))
    story.append(req_table)
    story.append(Spacer(1, 15))

    # SECTION 3: LOGIN & AUTHENTICATION
    story.append(Paragraph("3. LOGIN & AUTHENTICATION (MODULE 01)", h1_style))
    story.append(Paragraph(
        "Access to the ERP requires authenticated corporate credentials. The login portal enforces role-specific permissions and restricts commercial price visibility based on the assigned job profile.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("01_Login", "Fig_1_1_Login_Screen.png"), "Figure 1.1: Secure Login Interface with Corporate Credentials and Role-Based Presets"))
    story.append(Paragraph("<b>Step-by-Step Login Instructions:</b>", body_style))
    story.append(Paragraph("1. Open Google Chrome or Microsoft Edge and navigate to the application URL (e.g. <code>http://localhost:5173</code> or production domain).", bullet_style))
    story.append(Paragraph("2. In the <b>Corporate Email</b> field, enter your authorized email address (e.g., <code>sales.lead@msgoilfield.ae</code>).", bullet_style))
    story.append(Paragraph("3. In the <b>Password</b> field, enter your personal account password. (For testing, pre-configured accounts use standard corporate credentials).", bullet_style))
    story.append(Paragraph("4. Click the blue <b>Sign In to ERP Portal</b> button. Upon successful verification, you will be redirected to your authorized workspace.", bullet_style))
    story.append(Paragraph("5. <b>Quick Role Switcher (Training & Demo Mode):</b> Click any of the pre-configured role buttons at the bottom of the card to instantaneously evaluate the application under that specific security context.", bullet_style))
    story.append(create_callout("Passwords must be at least 8 characters long and contain letters and numbers. Consecutive failed attempts trigger a temporary cooldown."))
    story.append(PageBreak())

    # SECTION 4: KPI DASHBOARD
    story.append(Paragraph("4. EXECUTIVE KPI DASHBOARD (MODULE 02)", h1_style))
    story.append(Paragraph(
        "The Executive KPI Dashboard presents high-level operational intelligence, inventory metrics, pending order alerts, and instant action shortcuts.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("02_Dashboard", "Fig_2_1_Executive_Dashboard.png"), "Figure 2.1: Executive KPI Dashboard & Real-Time Operational Overview"))
    story.append(Paragraph("<b>Dashboard Components & Widgets:</b>", body_style))
    story.append(Paragraph("• <b>Stock Valuation & Counts:</b> Real-time metric card displaying Total Physical Stock, Reserved Lots, and Immediately Available Material.", bullet_style))
    story.append(Paragraph("• <b>Active Orders Tracker:</b> Quick count of orders awaiting allocation, pending warehouse physical sign-off, or ready for dispatch.", bullet_style))
    story.append(Paragraph("• <b>Pending Approvals Counter:</b> Urgent indicator for storekeepers highlighting unconfirmed heat reservations.", bullet_style))
    story.append(Paragraph("• <b>Quick Jump Shortcuts:</b> One-click navigation to Centralized Solo Hub, Sales Order Intake, or Delivery Note generator.", bullet_style))
    story.append(Spacer(1, 10))

    # SECTION 5: CENTRALIZED SOLO HUB
    story.append(Paragraph("5. CENTRALIZED SOLO HUB (MODULE 03 - WORKERS AWAY MODE)", h1_style))
    story.append(Paragraph(
        "The Centralized Solo Hub is the flagship operational command center of MSG Oilfield ERP. It is engineered for solo coordinators, night-shift operators, and times when yard workers are off-duty. "
        "From this single screen, an operator can intake customer purchase orders, auto-classify GCC tariff HSN codes, verify inventory, generate dual-tab Excel files, compile CIPL commercial invoices, watermark MTC certificates, and generate thermal barcode stickers with <b>1 Single Click</b>.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("03_Solo_Hub", "Fig_3_1_Centralized_Solo_Hub.png"), "Figure 3.1: Centralized Solo Hub Command Center & 1-Click Deliverables Suite"))
    story.append(Paragraph("<b>1-Click Deliverables Package:</b>", body_style))
    story.append(Paragraph("Clicking the amber <b>Generate Complete Deliverables Package (ZIP)</b> button automatically triggers the following pipeline:", body_style))
    story.append(Paragraph("1. Compiles <b>Client Order Summary (.xlsx)</b> isolating customer lines and prices.", bullet_style))
    story.append(Paragraph("2. Compiles <b>Internal Stores Preparation Sheet (.xlsx)</b> with warehouse bin locations, rack tags, and heat numbers.", bullet_style))
    story.append(Paragraph("3. Builds <b>CIPL Commercial Invoice & Packing List (.xlsx)</b> calculating net/gross weights with 15% safety buffer.", bullet_style))
    story.append(Paragraph("4. Bundles all matching <b>MTC Mill Test Certificates (.pdf)</b> with certified red inspection seals.", bullet_style))
    story.append(Paragraph("5. Packages everything into an organized <b>ZIP Archive</b> downloaded instantly to the local workstation.", bullet_style))
    story.append(Spacer(1, 10))

    story.append(Paragraph("<b>Live HSN Tariff Review & Editing:</b>", h2_style))
    story.append(Paragraph(
        "Oilfield materials require strict 8-digit Harmonized System (HSN) tariff classification for UAE Federal Tax Authority (FTA) and GCC customs clearance. "
        "The Solo Hub includes an interactive, live-editable HSN review table allowing users to verify or adjust classifications prior to export generation.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("03_Solo_Hub", "Fig_3_2_HSN_Tariff_Review_Table.png"), "Figure 3.2: Live Editable HSN Tariff Classification & Material Grade Table"))
    story.append(PageBreak())

    # SECTION 6: SALES ORDER MANAGEMENT
    story.append(Paragraph("6. SALES ORDER MANAGEMENT (MODULE 04)", h1_style))
    story.append(Paragraph(
        "The Sales Order Management module oversees customer purchase orders from intake to final fulfillment. It features client-side PDF PO parsing, extracting line item descriptions, sizes, quantities, and schedule ratings.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("04_Sales_Orders", "Fig_4_1_Sales_Order_Management.png"), "Figure 4.1: Sales Order Management Register & Order Tracking"))
    story.append(Paragraph("<b>Step-by-Step Order Creation Workflow:</b>", body_style))
    story.append(Paragraph("1. Click the green <b>+ New Sales Order</b> button in the top right corner.", bullet_style))
    story.append(Paragraph("2. Select customer from the dropdown catalog or enter a new customer entity.", bullet_style))
    story.append(Paragraph("3. Upload the customer's PDF Purchase Order into the drop-zone to auto-populate items.", bullet_style))
    story.append(Paragraph("4. Review parsed item quantities, wall thickness, rating (e.g. 150#, 300#, 600#), and material grade.", bullet_style))
    story.append(Paragraph("5. Click <b>Confirm & Save Order</b>. The order transitions to <i>Pending Allocation</i> status.", bullet_style))
    story.append(Spacer(1, 10))

    # SECTION 7: MASTER STOCK & HEAT TRACEABILITY
    story.append(Paragraph("7. MASTER STOCK & 360° HEAT TRACEABILITY (MODULE 05)", h1_style))
    story.append(Paragraph(
        "Inventory in the oil and gas sector is strictly governed by metallurgical heat lots. The Master Stock ledger maintains real-time quantities while preserving the mathematical invariant: <b>Physical Stock = Reserved Quantity + Available Balance</b>.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("05_Stock_Inventory", "Fig_5_1_Master_Stock_Inventory.png"), "Figure 5.1: Master Stock Inventory Ledger with Physical, Reserved, and Available Counts"))
    story.append(Paragraph("<b>Item Master Catalog & Specifications:</b>", h2_style))
    story.append(Paragraph(
        "The Item Master serves as the central materials specification dictionary, cataloging standard ASTM/ASME fittings, ANSI flanges, seamless pipes, and stud bolts.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("05_Stock_Inventory", "Fig_5_2_Item_Master_Catalog.png"), "Figure 5.2: Item Master Materials Catalog with Dimensional Specifications"))
    story.append(PageBreak())

    story.append(Paragraph("<b>360° Heat Pedigree & Mill Traceability:</b>", h2_style))
    story.append(Paragraph(
        "Every batch of piping material carries an embossed mill heat number. The 360° Heat Traceability module provides full genealogical auditing from raw mill manufacturer, through chemical composition analysis, to final customer delivery note.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("05_Stock_Inventory", "Fig_5_3_Heat_Traceability_360.png"), "Figure 5.3: 360° Heat Traceability & Metallurgical Pedigree Portal"))
    story.append(Spacer(1, 10))

    # SECTION 8: ALLOCATION STUDIO & WAREHOUSE APPROVALS
    story.append(Paragraph("8. STOCK ALLOCATION & STOREKEEPER APPROVALS (MODULES 06 & 07)", h1_style))
    story.append(Paragraph(
        "When a sales order is accepted, physical inventory must be allocated to satisfy order line items. The Stock Allocation Studio features both automated First-In-First-Out (FIFO) allocation and manual heat selection for customer-specified mill requirements.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("06_Allocation_Studio", "Fig_6_1_Stock_Allocation_Studio.png"), "Figure 6.1: Stock Allocation Studio with Automated FIFO Heat Lot Engine"))
    story.append(Paragraph("<b>Storekeeper Approvals Desk:</b>", h2_style))
    story.append(Paragraph(
        "To guarantee physical yard accuracy, allocations must be confirmed by the yard storekeeper before material can be packaged or dispatched. "
        "The Storekeeper Approvals desk provides a clean touch-friendly interface for yard foremen to verify physical markings, stamping, and rack releases.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("07_Warehouse_Approvals", "Fig_7_1_Storekeeper_Approvals_Queue.png"), "Figure 7.1: Storekeeper Physical Verification & Approvals Queue"))
    story.append(PageBreak())

    # SECTION 9: MTC DIGITAL VAULT
    story.append(Paragraph("9. MTC DIGITAL VAULT & CERTIFIED SEALS (MODULE 08)", h1_style))
    story.append(Paragraph(
        "EN 10204 3.1 Inspection Certificates (MTC) are legally mandated compliance documents verifying chemical and mechanical tensile properties. "
        "The MTC Digital Vault enables storage, indexing, and automated red-seal watermarking of mill test certificates.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("08_MTC_Vault", "Fig_8_1_MTC_Digital_Vault.png"), "Figure 8.1: MTC Digital Vault with EN 10204 3.1 Certificate Index and PDF Previewer"))
    story.append(Paragraph("<b>Automated Watermarking Engine:</b>", body_style))
    story.append(Paragraph("• <b>Certified True Copy Stamp:</b> Applies a vector red circular or rectangular corporate QA/QC stamp containing inspector name, date, and designation.", bullet_style))
    story.append(Paragraph("• <b>Position & Scale Calibration:</b> Mill certs have varying layouts; the system allows inspectors to adjust the X/Y coordinate offset and stamp scale.", bullet_style))
    story.append(Paragraph("• <b>Multi-Page Propagation:</b> Automatically stamps every page of multi-page mill test dossiers.", bullet_style))
    story.append(Spacer(1, 10))

    # SECTION 10: SOURCING & CIPL
    story.append(Paragraph("10. TECHNICAL SOURCING, SPLIT & CIPL (MODULE 09)", h1_style))
    story.append(Paragraph(
        "When order quantities exceed current yard stock, the Sourcing & Split portal partitions the order into in-stock items and supplier procurement lines. "
        "It also builds the official Commercial Invoice & Packing List (CIPL) for international export shipping.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("09_Sourcing_CIPL", "Fig_9_1_Sourcing_And_CIPL_Portal.png"), "Figure 9.1: Technical Sourcing, Supplier Order Split, and CIPL Workbook Portal"))
    story.append(PageBreak())

    # SECTION 11: DISPATCH MANAGEMENT
    story.append(Paragraph("11. DISPATCH MANAGEMENT & DELIVERY NOTES (MODULE 10)", h1_style))
    story.append(Paragraph(
        "The Dispatch Management console generates legally binding Delivery Notes, customer gate passes, and transport manifests. "
        "Executing dispatch permanently reduces physical stock balance and records the event in the immutable double-entry movement ledger.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("10_Dispatch_Logistics", "Fig_10_1_Dispatch_Management_Console.png"), "Figure 10.1: Outbound Dispatch Management & Customer Delivery Note Generator"))
    story.append(Spacer(1, 10))

    # SECTION 12: STICKERS & LOC TAGS
    story.append(Paragraph("12. THERMAL QR STICKERS & MATERIAL TAGS (MODULE 11)", h1_style))
    story.append(Paragraph(
        "To ensure seamless physical identification in the yard, the system generates 58mm × 39mm waterproof thermal barcode stickers and LOC bin tags.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("11_Sticker_LOC", "Fig_11_1_Thermal_Sticker_Generator.png"), "Figure 11.1: Thermal Barcode & QR Code Sticker Generator (58mm × 39mm Format)"))
    story.extend(make_screenshot_flowable(os.path.join("11_Sticker_LOC", "Fig_11_2_LOC_Material_Tags.png"), "Figure 11.2: LOC Material Identification Tags & Yard Bin Locator"))
    story.append(PageBreak())

    # SECTION 13: IT CONFIG & CLOUD SETTINGS
    story.append(Paragraph("13. IT SOFTWARE CONFIG & CLOUD SETTINGS (MODULE 12)", h1_style))
    story.append(Paragraph(
        "The IT Software Configuration Console is the master governance environment for corporate branding, QA stamp design, and granular Role-Based Access Control (RBAC). "
        "Commercial confidentiality masking is strictly enforced, redacting unit prices and profit margins for technical IT profiles.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("12_IT_Admin_Console", "Fig_12_1_IT_Software_Config_Console.png"), "Figure 12.1: IT Software Configuration Console & Document Branding Calibrator"))
    story.append(Paragraph("<b>Supabase Cloud PostgreSQL Synchronization:</b>", h2_style))
    story.append(Paragraph(
        "The application provides seamless dual-tier persistence: zero-latency local caching paired with real-time Supabase cloud synchronization. "
        "Administrators can perform one-click full JSON database snapshots and verify database health.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("12_IT_Admin_Console", "Fig_12_2_Supabase_Cloud_Settings.png"), "Figure 12.2: Supabase Cloud PostgreSQL Synchronization & Database Snapshot Settings"))
    story.append(PageBreak())

    # SECTION 14: REPORTS & AUDIT LOGS
    story.append(Paragraph("14. REPORTS, ANALYTICS & AUDIT LOGS (MODULE 13)", h1_style))
    story.append(Paragraph(
        "Executive management requires clear visibility into sales velocity, inventory aging, and customer ordering trends. "
        "The Reports module generates detailed visual charts and tabular exports, while the Immutable Audit Log records every user interaction.",
        body_style
    ))
    story.extend(make_screenshot_flowable(os.path.join("13_Reports_Audit", "Fig_13_1_Reports_And_Analytics.png"), "Figure 13.1: Executive Reports & Inventory Turnover Analytics Dashboard"))
    story.extend(make_screenshot_flowable(os.path.join("13_Reports_Audit", "Fig_13_2_Audit_Logs_Ledger.png"), "Figure 13.2: Tamper-Evident Immutable Audit Log Ledger"))
    story.append(PageBreak())

    # SECTION 15: TROUBLESHOOTING & FAQ
    story.append(Paragraph("15. FREQUENTLY ASKED QUESTIONS & TROUBLESHOOTING", h1_style))
    faq_data = [
        [Paragraph("<b>Scenario / Question</b>", body_style), Paragraph("<b>Explanation & Resolution Procedure</b>", body_style)],
        [
            Paragraph("<b>Q1: Why is unit price showing as •••••• [CONFIDENTIAL]?</b>", body_style),
            Paragraph("Commercial confidentiality is enabled for your profile (e.g. IT Engineer or Storekeeper). If your role requires commercial quotation access, request your Super Administrator to grant unmasked commercial rights.", body_style)
        ],
        [
            Paragraph("<b>Q2: Order shows 'Pending Allocation' after saving.</b>", body_style),
            Paragraph("This is expected behavior. Navigate to <i>Stock Allocation Studio</i> or open <i>Centralized Solo Hub</i> and click <i>Auto FIFO Allocate</i> to reserve heat lots.", body_style)
        ],
        [
            Paragraph("<b>Q3: Why can't I click 'Confirm Dispatch'?</b>", body_style),
            Paragraph("Dispatch is blocked until the physical storekeeper signs off on the allocated heat lots in the <i>Storekeeper Approvals</i> queue.", body_style)
        ],
        [
            Paragraph("<b>Q4: How do I export a full backup of all ERP data?</b>", body_style),
            Paragraph("Navigate to <i>Supabase & Settings</i> or <i>IT Software Config</i>, scroll to <i>Database Tools</i>, and click <b>Export Full JSON Backup</b>. Save the downloaded file securely.", body_style)
        ],
        [
            Paragraph("<b>Q5: Thermal sticker barcode is truncated on 58mm printer.</b>", body_style),
            Paragraph("Verify that your printer driver is configured to 58mm × 39mm with 0 margins, and scale is set to 100% (Actual Size) in the browser print dialogue.", body_style)
        ]
    ]
    faq_table = Table(faq_data, colWidths=[180, 324])
    faq_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY_COLOR),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    for c in range(2):
        faq_table.setStyle(TableStyle([('TEXTCOLOR', (c,0), (c,0), colors.white)]))
    story.append(faq_table)
    story.append(Spacer(1, 15))

    # SECTION 16: GLOSSARY OF TERMS
    story.append(Paragraph("16. GLOSSARY OF OILFIELD & ERP TERMINOLOGY", h1_style))
    glossary_data = [
        [Paragraph("<b>Term</b>", body_style), Paragraph("<b>Definition in MSG Oilfield ERP Context</b>", body_style)],
        [Paragraph("MTC (Mill Test Cert)", body_style), Paragraph("EN 10204 3.1 inspection certificate issued by the steel mill detailing chemical & mechanical test results.", body_style)],
        [Paragraph("Heat Number", body_style), Paragraph("Unique alphanumeric tracking code stamped onto raw steel identifying the specific furnace smelting batch.", body_style)],
        [Paragraph("FIFO Allocation", body_style), Paragraph("First-In-First-Out automated algorithm assigning oldest purchased stock lots to new customer orders.", body_style)],
        [Paragraph("CIPL", body_style), Paragraph("Commercial Invoice & Packing List workbook detailing carton counts, net weights, gross weights, and HSN codes.", body_style)],
        [Paragraph("LOC / Bin Location", body_style), Paragraph("Physical warehouse coordinates (e.g. Rack A-04, Yard Bay 2) indicating where physical inventory is stored.", body_style)],
        [Paragraph("HSN Code", body_style), Paragraph("Harmonized System of Nomenclature 8-digit tariff code used by customs authorities for commodity taxation.", body_style)],
        [Paragraph("Balance Invariant", body_style), Paragraph("Mathematical principle enforcing that Physical Stock strictly equals Reserved Stock plus Available Stock.", body_style)]
    ]
    glossary_table = Table(glossary_data, colWidths=[130, 374])
    glossary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), SECONDARY_COLOR),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    for c in range(2):
        glossary_table.setStyle(TableStyle([('TEXTCOLOR', (c,0), (c,0), colors.white)]))
    story.append(glossary_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
