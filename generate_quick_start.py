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
OUT_DIR = os.path.join(BASE_DIR, 'Software_Documentation', '02_Quick_Start_Guide')
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
            self.drawString(54, letter[1] - 36, "MSG OILFIELD ERP  |  QUICK START GUIDE FOR NEW EMPLOYEES")
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
    pdf_filename = os.path.join(OUT_DIR, "Quick_Start_Guide.pdf")
    doc = SimpleDocTemplate(
        pdf_filename, pagesize=letter,
        leftMargin=54, rightMargin=54, topMargin=54, bottomMargin=54
    )
    story = []

    story.append(Paragraph("MSG OILFIELD EQUIPMENT TRADING LLC", ParagraphStyle('Company', fontName='Helvetica-Bold', fontSize=13, textColor=PRIMARY_COLOR)))
    story.append(Paragraph("Industrial Area 2, Al Qusais, P.O. Box 92831, Dubai, UAE", ParagraphStyle('Address', fontName='Helvetica', fontSize=8, textColor=TEXT_MUTED, spaceAfter=10)))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY_COLOR, spaceBefore=0, spaceAfter=12))

    story.append(Paragraph("ERP QUICK START GUIDE FOR NEW USERS", title_style))
    story.append(Paragraph("Essential 15-Minute Operational Onboarding & Core Workflow Walkthrough", subtitle_style))

    story.append(Paragraph("1. ACCESSING & LOGGING IN", h1_style))
    story.append(Paragraph(
        "Open Google Chrome or Microsoft Edge and navigate to the application URL. "
        "Enter your corporate email address and assigned password, then click <b>Sign In to ERP Portal</b>.",
        body_style
    ))
    story.extend(make_screenshot(os.path.join("01_Login", "Fig_1_1_Login_Screen.png"), "Figure 1: Application Login & Role Switcher Screen"))

    story.append(Paragraph("<b>Standard Corporate Credentials:</b>", body_style))
    cred_data = [
        [Paragraph("<b>Employee Role</b>", body_style), Paragraph("<b>Email Address</b>", body_style), Paragraph("<b>Default Password</b>", body_style), Paragraph("<b>Primary Focus Area</b>", body_style)],
        [Paragraph("Super Administrator", body_style), Paragraph("admin@msgoilfield.ae", body_style), Paragraph("Pass@123", body_style), Paragraph("Full Governance, Overrides & Management", body_style)],
        [Paragraph("Senior Sales Coordinator", body_style), Paragraph("sales.lead@msgoilfield.ae", body_style), Paragraph("Pass@123", body_style), Paragraph("PO Intake, Pricing, Solo Hub, CIPL", body_style)],
        [Paragraph("Chief Storekeeper", body_style), Paragraph("storekeeper@msgoilfield.ae", body_style), Paragraph("Pass@123", body_style), Paragraph("Physical Verification, Approvals, Bins", body_style)],
        [Paragraph("IT Systems Engineer", body_style), Paragraph("it.engineer@msgoilfield.ae", body_style), Paragraph("Admin@123", body_style), Paragraph("Branding, Seals, RBAC, Cloud Sync", body_style)]
    ]
    cred_table = Table(cred_data, colWidths=[120, 150, 80, 154])
    cred_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY_COLOR),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]))
    for c in range(4):
        cred_table.setStyle(TableStyle([('TEXTCOLOR', (c,0), (c,0), colors.white)]))
    story.append(cred_table)
    story.append(PageBreak())

    story.append(Paragraph("2. CENTRALIZED SOLO HUB (FASTEST WAY TO WORK)", h1_style))
    story.append(Paragraph(
        "For daily operations, new coordinators should start in the <b>Centralized Solo Hub</b>. "
        "It unites PO intake, automatic GCC tariff HSN assignment, dual-tab Excel generation, and certified MTC watermarking in one screen.",
        body_style
    ))
    story.extend(make_screenshot(os.path.join("03_Solo_Hub", "Fig_3_1_Centralized_Solo_Hub.png"), "Figure 2: Centralized Solo Hub Operations Desk"))
    story.append(Paragraph("<b>How to Fulfill an Order in 3 Simple Steps:</b>", body_style))
    story.append(Paragraph("1. <b>Select or Intake Order:</b> Choose the active Sales Order from the dropdown or upload a customer PDF PO.", bullet_style))
    story.append(Paragraph("2. <b>Verify HSN Codes:</b> Check the live HSN table below the order selector. The system automatically classifies Stainless Steel (7307.2100) and Carbon Steel (7307.9100).", bullet_style))
    story.append(Paragraph("3. <b>1-Click Package:</b> Click the amber <b>Generate Complete Deliverables Package (ZIP)</b> button. The system packages Client Excel, Stores Sheet, CIPL, and watermarked MTCs into a single ZIP file.", bullet_style))
    story.append(Spacer(1, 10))

    story.append(Paragraph("3. CHECKING REAL-TIME STOCK & HEAT NUMBERS", h1_style))
    story.append(Paragraph(
        "To check whether material is physically in the yard, click <b>Master Stock</b> in the left sidebar. "
        "The inventory ledger shows Physical Pieces, Reserved Pieces, and Immediately Available Pieces.",
        body_style
    ))
    story.extend(make_screenshot(os.path.join("05_Stock_Inventory", "Fig_5_1_Master_Stock_Inventory.png"), "Figure 3: Master Stock Live Balance Ledger"))
    story.append(PageBreak())

    story.append(Paragraph("4. PHYSICAL DISPATCH & CUSTOMER DELIVERY NOTES", h1_style))
    story.append(Paragraph(
        "Once items are approved by the warehouse storekeeper, navigate to <b>Dispatch Management</b> to compile the official Delivery Note.",
        body_style
    ))
    story.extend(make_screenshot(os.path.join("10_Dispatch_Logistics", "Fig_10_1_Dispatch_Management_Console.png"), "Figure 4: Outbound Dispatch Management & Delivery Notes"))
    story.append(Paragraph("<b>Dispatch Checklist:</b>", body_style))
    story.append(Paragraph("• Verify Customer Name, Vehicle Number, and Driver Name.", bullet_style))
    story.append(Paragraph("• Review allocated heat numbers on the delivery line items.", bullet_style))
    story.append(Paragraph("• Click <b>Generate Delivery Note (.pdf)</b> to print the official signed dispatch document.", bullet_style))
    story.append(Paragraph("• Click <b>Confirm Dispatch</b> to record material deduction in the permanent double-entry audit ledger.", bullet_style))
    story.append(Spacer(1, 15))

    story.append(Paragraph("5. LOGGING OUT & SESSION SECURITY", h1_style))
    story.append(Paragraph(
        "To safeguard commercial trade data, always log out when leaving your workstation. "
        "Click your user profile avatar in the top-right corner of the navigation bar and select <b>Log Out</b>. "
        "The application terminates the active session immediately.",
        body_style
    ))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
