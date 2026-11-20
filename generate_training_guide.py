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
OUT_DIR = os.path.join(BASE_DIR, 'Software_Documentation', '04_Training_Materials')
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
            self.drawString(54, letter[1] - 36, "MSG OILFIELD ERP  |  STAFF TRAINING CURRICULUM & ASSESSMENT")
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
    pdf_filename = os.path.join(OUT_DIR, "Software_Training_Guide.pdf")
    doc = SimpleDocTemplate(
        pdf_filename, pagesize=letter,
        leftMargin=54, rightMargin=54, topMargin=54, bottomMargin=54
    )
    story = []

    story.append(Paragraph("MSG OILFIELD EQUIPMENT TRADING LLC", ParagraphStyle('Company', fontName='Helvetica-Bold', fontSize=13, textColor=PRIMARY_COLOR)))
    story.append(Paragraph("Industrial Area 2, Al Qusais, P.O. Box 92831, Dubai, UAE", ParagraphStyle('Address', fontName='Helvetica', fontSize=8, textColor=TEXT_MUTED, spaceAfter=10)))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY_COLOR, spaceBefore=0, spaceAfter=12))

    story.append(Paragraph("ENTERPRISE SOFTWARE TRAINING GUIDE & CURRICULUM", title_style))
    story.append(Paragraph("Structured Staff Training Syllabus, Hands-On Exercises & Competency Sign-Off", subtitle_style))

    # 1. Training Objectives
    story.append(Paragraph("1. TRAINING OBJECTIVES & METHODOLOGY", h1_style))
    story.append(Paragraph(
        "This training manual prepares commercial coordinators, storekeepers, quality inspectors, and logistics personnel to operate the MSG Oilfield ERP with zero errors. "
        "Upon completion of this curriculum, trainees will be able to:",
        body_style
    ))
    story.append(Paragraph("• Intake customer POs and auto-parse multi-line specifications within 30 seconds.", bullet_style))
    story.append(Paragraph("• Allocate physical heat lots using FIFO automation or manual client overrides.", bullet_style))
    story.append(Paragraph("• Verify physical yard stock markings and confirm storekeeper inspection sign-offs.", bullet_style))
    story.append(Paragraph("• Apply red inspection watermarks to EN 10204 3.1 mill test certificates.", bullet_style))
    story.append(Paragraph("• Generate compliant CIPL workbooks and official signed customer Delivery Notes.", bullet_style))
    story.append(Spacer(1, 10))

    # 2. Hands-on Labs
    story.append(Paragraph("2. HANDS-ON PRACTICAL LAB EXERCISES", h1_style))
    story.append(Paragraph("<b>Lab Exercise 1: Centralized Solo Hub 1-Click Package</b>", h2_style))
    story.append(Paragraph(
        "Scenario: An urgent after-hours customer order arrives for 20 PCS of 2\" 300# WN Flanges. The warehouse staff is off-duty.",
        body_style
    ))
    story.extend(make_screenshot(os.path.join("03_Solo_Hub", "Fig_3_1_Centralized_Solo_Hub.png"), "Lab 1 Reference: Centralized Solo Hub"))
    story.append(Paragraph("<b>Action Steps:</b>", body_style))
    story.append(Paragraph("1. Switch to <i>Centralized Solo Hub</i> from the sidebar navigation.", bullet_style))
    story.append(Paragraph("2. Select active sales order SO-2026-001 from the dropdown list.", bullet_style))
    story.append(Paragraph("3. Inspect the live HSN tariff table to ensure A105 Carbon Steel is classified under 7307.9100.", bullet_style))
    story.append(Paragraph("4. Click <b>Generate Complete Deliverables Package (ZIP)</b>.", bullet_style))
    story.append(Paragraph("5. Extract the downloaded ZIP archive and verify the four deliverables (Client Excel, Stores Sheet, CIPL, and watermarked MTCs).", bullet_style))
    story.append(PageBreak())

    story.append(Paragraph("<b>Lab Exercise 2: FIFO Allocation & Storekeeper Approvals</b>", h2_style))
    story.append(Paragraph(
        "Scenario: Allocate stock for a high-volume piping order and complete physical warehouse verification.",
        body_style
    ))
    story.extend(make_screenshot(os.path.join("06_Allocation_Studio", "Fig_6_1_Stock_Allocation_Studio.png"), "Lab 2 Reference: Stock Allocation Studio"))
    story.append(Paragraph("<b>Action Steps:</b>", body_style))
    story.append(Paragraph("1. Open <i>Stock Allocation Studio</i>.", bullet_style))
    story.append(Paragraph("2. Choose order SO-2026-002 and click <b>Auto FIFO Allocate</b>.", bullet_style))
    story.append(Paragraph("3. Notice that the system automatically consumes the oldest lot first, preserving available stock invariants.", bullet_style))
    story.append(Paragraph("4. Switch to <i>Storekeeper Approvals</i>. Locate the pending reservation.", bullet_style))
    story.append(Paragraph("5. Click <b>Approve & Release Material</b>. Confirm that status changes to 'Ready for Dispatch'.", bullet_style))
    story.append(Spacer(1, 10))

    # 3. Knowledge Assessment
    story.append(Paragraph("3. KNOWLEDGE ASSESSMENT & COMPETENCY QUIZ", h1_style))
    quiz_data = [
        [Paragraph("<b>#</b>", body_style), Paragraph("<b>Question</b>", body_style), Paragraph("<b>Correct Answer</b>", body_style)],
        [
            Paragraph("1", body_style),
            Paragraph("What is the mathematical balance invariant enforced across all stock lots?", body_style),
            Paragraph("Physical Stock = Reserved Quantity + Available Balance", body_style)
        ],
        [
            Paragraph("2", body_style),
            Paragraph("Which module allows a solo operator to generate all trade deliverables in 1 click?", body_style),
            Paragraph("Centralized Solo Hub (Workers Away Mode)", body_style)
        ],
        [
            Paragraph("3", body_style),
            Paragraph("What happens to already dispatched items if an order is cancelled?", body_style),
            Paragraph("Dispatched items are permanently preserved in history; only unfulfilled reservations are restored.", body_style)
        ],
        [
            Paragraph("4", body_style),
            Paragraph("Why are prices masked as •••••• for IT Engineers and Storekeepers?", body_style),
            Paragraph("Commercial confidentiality policy protects unit margins from non-commercial roles.", body_style)
        ]
    ]
    quiz_table = Table(quiz_data, colWidths=[20, 244, 240])
    quiz_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY_COLOR),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    for c in range(3):
        quiz_table.setStyle(TableStyle([('TEXTCOLOR', (c,0), (c,0), colors.white)]))
    story.append(quiz_table)
    story.append(PageBreak())

    # 4. Trainee Sign-off
    story.append(Paragraph("4. TRAINING COMPLETION & SIGN-OFF RECORD", h1_style))
    story.append(Paragraph(
        "This sign-off sheet certifies that the employee has completed hands-on training, successfully executed all lab exercises, and demonstrated competence in operating the MSG Oilfield ERP System.",
        body_style
    ))
    sign_data = [
        [Paragraph("<b>Employee Name:</b>", body_style), Paragraph("", body_style), Paragraph("<b>Employee ID:</b>", body_style), Paragraph("", body_style)],
        [Paragraph("<b>Department:</b>", body_style), Paragraph("", body_style), Paragraph("<b>Assigned Role:</b>", body_style), Paragraph("", body_style)],
        [Paragraph("<b>Trainer Name:</b>", body_style), Paragraph("Senior SQA & Training Lead", body_style), Paragraph("<b>Training Date:</b>", body_style), Paragraph("November 20, 2026", body_style)],
        [Paragraph("<b>Assessment Result:</b>", body_style), Paragraph("PASSED (100% Competency)", body_style), Paragraph("<b>Status:</b>", body_style), Paragraph("CERTIFIED FOR PRODUCTION", body_style)],
        [Paragraph("<b>Employee Signature:</b>", body_style), Paragraph("", body_style), Paragraph("<b>Trainer Signature:</b>", body_style), Paragraph("", body_style)]
    ]
    sign_table = Table(sign_data, colWidths=[120, 150, 110, 124])
    sign_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(sign_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
