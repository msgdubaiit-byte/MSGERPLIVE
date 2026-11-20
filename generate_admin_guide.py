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
OUT_DIR = os.path.join(BASE_DIR, 'Software_Documentation', '03_Administrator_Guide')
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
            self.drawString(54, letter[1] - 36, "MSG OILFIELD ERP  |  ENTERPRISE SYSTEM ADMINISTRATOR GUIDE")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, letter[1] - 40, letter[0] - 54, letter[1] - 40)

        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 45, letter[0] - 54, 45)

        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(letter[0] - 54, 32, page_str)
        self.drawString(54, 32, "CONFIDENTIAL  —  MSG OILFIELD EQUIPMENT TRADING LLC (DUBAI, UAE)")
        self.restoreState()

styles = getSampleStyleSheet()
PRIMARY_COLOR = colors.HexColor("#0B2545")
SECONDARY_COLOR = colors.HexColor("#1E3A8A")
TEXT_DARK = colors.HexColor("#0F172A")
TEXT_MUTED = colors.HexColor("#475569")
BG_LIGHT = colors.HexColor("#F8FAFC")
BORDER_COLOR = colors.HexColor("#CBD5E1")

title_style = ParagraphStyle(
    'DocTitle', parent=styles['Normal'],
    fontName='Helvetica-Bold', fontSize=22, leading=26,
    textColor=PRIMARY_COLOR, spaceAfter=6
)
subtitle_style = ParagraphStyle(
    'DocSubTitle', parent=styles['Normal'],
    fontName='Helvetica', fontSize=11, leading=15,
    textColor=SECONDARY_COLOR, spaceAfter=12
)
h1_style = ParagraphStyle(
    'Heading1_Custom', parent=styles['Heading1'],
    fontName='Helvetica-Bold', fontSize=14, leading=18,
    textColor=PRIMARY_COLOR, spaceBefore=12, spaceAfter=6, keepWithNext=True
)
h2_style = ParagraphStyle(
    'Heading2_Custom', parent=styles['Heading2'],
    fontName='Helvetica-Bold', fontSize=11, leading=14,
    textColor=SECONDARY_COLOR, spaceBefore=8, spaceAfter=4, keepWithNext=True
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
    fontName='Helvetica-Bold', fontSize=8.5, leading=11,
    textColor=SECONDARY_COLOR, alignment=1, spaceBefore=3, spaceAfter=6
)

def make_screenshot(rel_path, fig_title):
    full_path = os.path.join(SCREENSHOT_DIR, rel_path)
    elems = []
    if os.path.exists(full_path):
        img = Image(full_path, width=6.5*inch, height=3.5*inch)
        elems.append(img)
        elems.append(Paragraph(fig_title, caption_style))
    return elems

def build_pdf():
    pdf_filename = os.path.join(OUT_DIR, "Administrator_Guide.pdf")
    doc = SimpleDocTemplate(
        pdf_filename, pagesize=letter,
        leftMargin=54, rightMargin=54, topMargin=54, bottomMargin=54
    )
    story = []

    story.append(Paragraph("MSG OILFIELD EQUIPMENT TRADING LLC", ParagraphStyle('Company', fontName='Helvetica-Bold', fontSize=13, textColor=PRIMARY_COLOR)))
    story.append(Paragraph("Industrial Area 2, Al Qusais, P.O. Box 92831, Dubai, UAE", ParagraphStyle('Address', fontName='Helvetica', fontSize=8, textColor=TEXT_MUTED, spaceAfter=10)))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY_COLOR, spaceBefore=0, spaceAfter=12))

    story.append(Paragraph("ENTERPRISE SYSTEM ADMINISTRATOR GUIDE", title_style))
    story.append(Paragraph("System Governance, RBAC Matrix, Supabase Cloud Synchronization & Security SOP", subtitle_style))

    # Section 1: IT Console & Branding
    story.append(Paragraph("1. IT SOFTWARE CONFIG CONSOLE & BRANDING", h1_style))
    story.append(Paragraph(
        "The IT Software Configuration Console is the master administrative console for managing document templates, corporate TRN numbers, official red inspection stamps, digital inspector signatures, and commercial confidentiality settings.",
        body_style
    ))
    story.extend(make_screenshot(os.path.join("12_IT_Admin_Console", "Fig_12_1_IT_Software_Config_Console.png"), "Figure 1: IT Software Configuration Console & Stamp Calibrator"))
    story.append(Paragraph("<b>Configurable Parameters:</b>", body_style))
    story.append(Paragraph("• <b>Corporate Legal Profile:</b> Company Name, UAE TRN Tax Number (100293847500003), registered Dubai address, and contact headers.", bullet_style))
    story.append(Paragraph("• <b>MTC Inspection Stamp:</b> Text legend ('CERTIFIED TRUE COPY OF ORIGINAL / MSG QA/QC APPROVED'), vector red stamp color (#D32F2F), scale (50%–150%), and X/Y offset.", bullet_style))
    story.append(Paragraph("• <b>Inspector Signature & Seal:</b> Upload custom PNG transparent signatures and circular/rectangular corporate seals.", bullet_style))
    story.append(Paragraph("• <b>Commercial Data Privacy Masking:</b> Toggle masking for technical roles, converting unit rates and profit margins into <code>•••••• [CONFIDENTIAL]</code>.", bullet_style))
    story.append(PageBreak())

    # Section 2: RBAC Matrix & Governance
    story.append(Paragraph("2. USER ROLES & GRANULAR RBAC GOVERNANCE", h1_style))
    story.append(Paragraph(
        "The system enforces strict Role-Based Access Control (RBAC). Administrators can configure module permissions globally by role or override permissions for individual employee profiles.",
        body_style
    ))
    story.append(Paragraph("<b>Standard Corporate Roles & Permissions Matrix:</b>", body_style))
    role_data = [
        [Paragraph("<b>Role ID</b>", body_style), Paragraph("<b>Title</b>", body_style), Paragraph("<b>Permitted Modules</b>", body_style), Paragraph("<b>Commercial Visibility</b>", body_style)],
        [Paragraph("<code>super_admin</code>", body_style), Paragraph("Super Administrator", body_style), Paragraph("All Modules (22/22) Unrestricted", body_style), Paragraph("Full Commercial Pricing", body_style)],
        [Paragraph("<code>admin_inventory</code>", body_style), Paragraph("Inventory Controller", body_style), Paragraph("Stock, Heats, Solo Hub, Allocations, Approvals, MTC", body_style), Paragraph("Operational Rates Only", body_style)],
        [Paragraph("<code>sales_team</code>", body_style), Paragraph("Sales Coordinator", body_style), Paragraph("Solo Hub, Sales Orders, Sourcing, CIPL, Stickers", body_style), Paragraph("Full Commercial Pricing", body_style)],
        [Paragraph("<code>storekeeper</code>", body_style), Paragraph("Chief Storekeeper", body_style), Paragraph("Approvals, Master Stock, Traceability, Bins, Movements", body_style), Paragraph("Masked (Commercially Blind)", body_style)],
        [Paragraph("<code>mtc_controller</code>", body_style), Paragraph("QA/QC Lead", body_style), Paragraph("MTC Digital Vault, Traceability, Sales Orders, Stock", body_style), Paragraph("Masked (Commercially Blind)", body_style)],
        [Paragraph("<code>dispatch_team</code>", body_style), Paragraph("Dispatch Officer", body_style), Paragraph("Dispatch Management, Delivery Notes, Thermal Labels", body_style), Paragraph("Masked (Commercially Blind)", body_style)],
        [Paragraph("<code>it_engineer</code>", body_style), Paragraph("IT Systems Engineer", body_style), Paragraph("IT Config, Cloud Settings, Users, Audit Logs, Excel", body_style), Paragraph("Masked (Confidential Enforced)", body_style)]
    ]
    role_table = Table(role_data, colWidths=[90, 110, 184, 120])
    role_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY_COLOR),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]))
    for c in range(4):
        role_table.setStyle(TableStyle([('TEXTCOLOR', (c,0), (c,0), colors.white)]))
    story.append(role_table)
    story.append(Spacer(1, 10))

    # Section 3: Supabase Cloud Synchronization
    story.append(Paragraph("3. SUPABASE CLOUD POSTGRESQL SYNCHRONIZATION", h1_style))
    story.append(Paragraph(
        "MSG Oilfield ERP employs a dual-tier storage architecture: client-side offline storage for instant local response times, backed by Supabase cloud PostgreSQL for multi-user enterprise synchronization.",
        body_style
    ))
    story.extend(make_screenshot(os.path.join("12_IT_Admin_Console", "Fig_12_2_Supabase_Cloud_Settings.png"), "Figure 2: Supabase Cloud PostgreSQL Settings & Backup Management"))
    story.append(Paragraph("<b>Setup & Connection Protocol:</b>", body_style))
    story.append(Paragraph("1. Obtain your Supabase Project URL and Anon API Public Key from the Supabase Project Dashboard.", bullet_style))
    story.append(Paragraph("2. In the ERP settings panel, enter the <b>Supabase URL</b> and <b>Supabase Anon Key</b>.", bullet_style))
    story.append(Paragraph("3. Click <b>Test Cloud Connection</b>. The system tests live database connectivity.", bullet_style))
    story.append(Paragraph("4. Click <b>Save Supabase Configuration</b> to activate cloud synchronization.", bullet_style))
    story.append(PageBreak())

    # Section 4: Audit Trails & Disaster Recovery
    story.append(Paragraph("4. AUDIT TRAILS & DISASTER RECOVERY", h1_style))
    story.append(Paragraph(
        "To maintain regulatory compliance and prevent unauthorized alterations, the system maintains an immutable, append-only audit trail.",
        body_style
    ))
    story.extend(make_screenshot(os.path.join("13_Reports_Audit", "Fig_13_2_Audit_Logs_Ledger.png"), "Figure 3: Tamper-Evident Immutable Audit Log Ledger"))
    story.append(Paragraph("<b>Disaster Recovery & Backup SOP:</b>", body_style))
    story.append(Paragraph("• <b>Daily Snapshot:</b> In <i>IT Software Config</i>, click <b>Export Full JSON Backup</b>. Save the snapshot file to secure offsite cloud storage.", bullet_style))
    story.append(Paragraph("• <b>Restoration Protocol:</b> In the event of workstation failure or data corruption, navigate to <i>Database Tools</i>, select <b>Import JSON Backup</b>, and upload the snapshot. The database restores in under 2 seconds.", bullet_style))
    story.append(Paragraph("• <b>Balance Self-Healing:</b> If orphaned order reservations occur, the database automatically audits and repairs stock balances upon startup.", bullet_style))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
