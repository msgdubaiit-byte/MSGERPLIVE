# MSG Oilfield Equipment Trading LLC
# Client User Acceptance Testing (UAT) & Sign-Off Document
**Document Reference**: QA-UAT-2026-V1.0  
**Project**: MSG Oilfield ERP & MTC Digital Vault Platform  
**Client Organization**: MSG Oilfield Equipment Trading LLC (Dubai, United Arab Emirates)  
**Testing Period**: November 15 – November 19, 2026  
**Target Release**: Version 2.0 (Production Candidate)  

---

## 1. Project & Software Overview
The **MSG Oilfield ERP & MTC Digital Vault** is an automated enterprise software platform built specifically for high-volume piping, valve, flange, and fitting distribution in the United Arab Emirates and broader GCC oilfield sector. 

The software automates the end-to-end commercial and quality assurance lifecycle:
- Ingesting customer Purchase Orders in Excel and PDF formats.
- Classifying materials and assigning GCC Customs HSN / HS Tariff codes automatically.
- Reserving stock according to strict First-In, First-Out (FIFO) heat traceability rules.
- Producing 1-click commercial deliverables: Client Summary, Internal Stores Sheet, CIPL (Commercial Invoice & Packing List), and Supplier PO packages.
- Stamping and watermarking Mill Test Certificates (MTCs) with official QA/QC certified true copy seals.
- Generating thermal 58mm and A4 QR-coded warehouse bin and pallet labels.
- Providing a **Centralized Solo Hub (Workers Away Mode)** for single-operator after-hours operations.

---

## 2. Testing Methodology & Verification Approach
Testing was executed across simulated commercial workflows representing actual trading operations with major regional engineering contractors (e.g. McDermott Middle East, Petrofac International, STS Bahrain, Valoris Energy). 

Every user persona was validated through hands-on role simulation:
1. **Root IT Systems Engineer**: System branding, calibration of inspection seals, user provisioning.
2. **Sales Coordinator**: PO parsing, HSN code verification, client quote generation.
3. **Warehouse Storekeeper**: Physical heat verification, yard bin locations (`LN-`), stock receipt.
4. **QA/QC Materials Controller**: MTC watermarking, inspection stamp scaling, compliance certificates.
5. **Logistics & Dispatch Officer**: QR code scanning, Delivery Note issuance, physical balance reduction.
6. **Solo Hub Operator**: Single-screen execution during weekend/after-hours operations.

---

## 3. Client UAT Verification Checklist

| Item # | Module | Acceptance Criteria & Scenario | Status | Client Verification Notes |
|:---:|:---|:---|:---:|:---|
| **UAT-01** | Solo Hub | Operator can drag-and-drop customer PO (Excel/PDF) and see all line items loaded immediately. | **PASS** | Tested with McDermott 12-line PO. Items loaded in < 1s. |
| **UAT-02** | Solo Hub | System automatically assigns accurate 8-digit GCC HSN codes to flanges (`7307.21/91`), elbows (`7307.23/93`), and pipes (`7304.11/19`). | **PASS** | All standard materials detected accurately. |
| **UAT-03** | Solo Hub | Operator can click any HSN code badge to edit or correct the code inline and see it save instantly. | **PASS** | Inline editing functions smoothly; instant DB persistence. |
| **UAT-04** | Solo Hub | Operator can click "Client Summary (.xlsx)" and download clean formatted Excel showing only Client Item Numbers. | **PASS** | Verified clean layout with no internal vendor pricing. |
| **UAT-05** | Solo Hub | Operator can click "Internal Stores Sheet (.xlsx)" and download 11-column sheet with mill heats, makes, and locations. | **PASS** | 11 columns present with exact yard locations. |
| **UAT-06** | Solo Hub | Operator can click "CIPL Logistics Workbook" and download dual-tab Excel with Commercial Invoice, Packing List, and Net/Gross Weights. | **PASS** | Invoice and packing list generated with 15% safety buffer. |
| **UAT-07** | Solo Hub | Operator can click "Supplier POs (.zip)" and download multi-supplier POs in an organized ZIP archive. | **PASS** | Separate POs grouped by manufacturer. |
| **UAT-08** | Solo Hub | Operator can fast-track approve orders awaiting storekeeper review when staff is away. | **PASS** | 1-click fast-pass approval releases goods for delivery. |
| **UAT-09** | Solo Hub | Operator can click "Confirm Dispatch" to immediately deduct physical stock and generate Delivery Note. | **PASS** | Physical stock deducted cleanly from warehouse balances. |
| **UAT-10** | Solo Hub | Instant Heat & Stock finder filters warehouse lots by heat number or location in real-time. | **PASS** | Immediate results as user types heat query. |
| **UAT-11** | Master Stock | Stock Ledger displays accurate Physical, Reserved, and Available balances with mathematical integrity ($\text{P} = \text{R} + \text{A}$). | **PASS** | Mathematical invariant holds across all inventory lots. |
| **UAT-12** | Traceability | Full Heat Traceability modal shows complete chain of custody from mill certificate to customer SO allocation. | **PASS** | Full audit trail and certificate link displayed. |
| **UAT-13** | MTC Vault | QA/QC controller can upload single or bulk ZIP mill test certificates and have them auto-matched by heat number. | **PASS** | Tested with ZIP containing 10 certs; heats matched. |
| **UAT-14** | MTC Vault | Inspection stamp can be placed on MTC PDF with customizable color, scale, and inspector designation. | **PASS** | Vector stamp rendered crisply on page 1 of certificate. |
| **UAT-15** | QR Stickers | Thermal 58mm and A4 QR stickers generate scannable labels with PO#, Heat#, Size, and Material Description. | **PASS** | QR code decodes accurately on standard mobile scanner. |
| **UAT-16** | LOC Portal | Letter of Compliance generates formal PDF letterhead with company TRN, official seal, and digital signature. | **PASS** | Formal compliance certificate produced. |
| **UAT-17** | IT Console | IT Engineer can calibrate seal position (X/Y offsets) and verify Supabase cloud database connectivity. | **PASS** | Real-time calibration canvas functions cleanly. |
| **UAT-18** | Security | Authentication enforces password verification for all users. | **FAIL** | **BLOCKER**: Password currently ignored on client login. |
| **UAT-19** | Security | Auxiliary backend endpoints are secured against unauthorized access. | **FAIL** | **BLOCKER**: `/generate-sticker` lacks auth; hardcoded credentials. |

---

## 4. Summary of UAT Results & Outstanding Issues

### 4.1 Passed Functionalities ($41 / 45$ Functional Test Cases Passed)
- All core business operations, document exports, spreadsheet generators, PDF watermarking, QR thermal stickers, and warehouse allocation mechanisms have been verified and accepted by the testing team.

### 4.2 Outstanding Defects (Release Blockers)
1. **Defect BUG-SEC-01**: Authentication context ignores password argument during client login.
2. **Defect BUG-SEC-02**: Auxiliary Flask backend contains hardcoded default passwords (`admin123`) and fallback secret key.
3. **Defect BUG-SEC-03**: Auxiliary `/generate-sticker` endpoint lacks authentication decorator.
4. **Defect BUG-SEC-05**: Supabase `mtc-vault` storage bucket policy allows anonymous public uploads.

---

## 5. Browser & Device Compatibility Matrix
- **Google Chrome** (v120+): 100% Compatible (Recommended Enterprise Browser).
- **Microsoft Edge** (v120+): 100% Compatible.
- **Mozilla Firefox** (v120+): 100% Compatible.
- **Apple Safari** (macOS / iPadOS): Compatible (Minor PDF iframe scroll note on iOS).
- **Android WebKit / Zebra Scanners**: Compatible.

---

## 6. Client Feedback & Sign-Off Section

### Client Stakeholder Comments:
> *"The Centralized Solo Hub and the automated HSN classification engine represent a massive operational leap forward for MSG Oilfield Trading. Line item deliverables that previously took 45 minutes of manual copying between spreadsheets now generate in under 5 seconds. The inspection watermarking on MTCs is clean, crisp, and fully accepted by third-party inspectors.*  
> *We require the security authentication patch (BUG-SEC-01 & BUG-SEC-02) to be applied and verified before production cut-over."*

### Final Acceptance Signatures:

| Role | Signatory Name | Organization / Department | Signature & Date |
|:---|:---|:---|:---:|
| **Client Project Sponsor** | Eng. Mohammed Al-Sabah | Managing Director, MSG Oilfield LLC | `___________________` Date: `__/__/2026` |
| **Client QA/QC Lead** | Rajesh K. Pillai | QA/QC Materials Manager, MSG Oilfield | `___________________` Date: `__/__/2026` |
| **Lead IT Systems Auditor** | Senior Systems Auditor | Enterprise SQA & Security Audit Team | `___________________` Date: `__/__/2026` |
| **Project Lead Architect** | Principal Software Architect | Advanced Systems Engineering | `___________________` Date: `__/__/2026` |
