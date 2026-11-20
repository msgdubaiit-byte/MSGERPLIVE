# MSG OILFIELD EQUIPMENT TRADING LLC
# ENTERPRISE SOFTWARE TRAINING GUIDE & CURRICULUM
**Document Reference**: MSG-TRN-GUIDE-2026  
**Audience**: New and Existing Personnel, Commercial Sales, Yard Storekeepers, QA/QC Inspectors, Logistics Officers  
**Release Version**: Version 2.0 (Build 2026.11)  
**Classification**: CONFIDENTIAL / INTERNAL TRAINING SOP  

---

## 1. Training Objectives & Methodology

The goal of this curriculum is to achieve 100% operational competency in operating the MSG Oilfield ERP & MTC Vault System.

### Key Learning Outcomes:
1. Master the **Centralized Solo Hub** for rapid 1-click trade fulfillment.
2. Accurately review and adjust GCC customs 8-digit **HSN tariff codes**.
3. Execute **FIFO and manual heat lot allocations** without breaking stock balance equations.
4. Process physical yard verifications and **Storekeeper sign-offs**.
5. Calibrate red inspection seals on **EN 10204 3.1 mill test certificates**.
6. Generate official **Delivery Notes** and execute physical material dispatch.

---

## 2. Hands-On Practical Lab Exercises

### Lab Exercise 1: Centralized Solo Hub 1-Click Package
- **Objective**: Execute a complete trade fulfillment workflow in under 60 seconds.
- **Reference Screen**:

![Figure 1: Centralized Solo Hub](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/03_Solo_Hub/Fig_3_1_Centralized_Solo_Hub.png)
*Figure 1: Centralized Solo Hub Operations Desk*

- **Action Steps**:
  1. Navigate to **Centralized Solo Hub**.
  2. Select active sales order `SO-2026-001`.
  3. Verify tariff classifications in the live HSN table (`7307.9100` for carbon steel A105).
  4. Click **Generate Complete Deliverables Package (ZIP)**.
  5. Inspect downloaded ZIP archive (Client Excel, Stores Sheet, CIPL, and stamped MTCs).

### Lab Exercise 2: FIFO Allocation & Storekeeper Physical Verification
- **Objective**: Reserve physical inventory and authorize release from warehouse racks.
- **Reference Screen**:

![Figure 2: Stock Allocation Studio](file:///C:/Users/Admin/.gemini/antigravity/scratch/msg-oilfield-erp/Software_Documentation/05_Screenshots/06_Allocation_Studio/Fig_6_1_Stock_Allocation_Studio.png)
*Figure 2: Stock Allocation Studio with Automated FIFO Heat Lot Engine*

- **Action Steps**:
  1. Open **Stock Allocation Studio** and choose sales order `SO-2026-002`.
  2. Click **Auto FIFO Allocate**. The system assigns oldest heat lots first.
  3. Click **Confirm Allocation**. Order transitions to *Awaiting Storekeeper Sign-off*.
  4. Switch to **Storekeeper Approvals**. Inspect heat stamp on fittings.
  5. Click **Approve & Release Material**. The status updates to *Ready for Dispatch*.

---

## 3. Knowledge Assessment & Competency Quiz

| # | Question | Correct Answer | Explanation |
|:---:|:---|:---|:---|
| **1** | What is the fundamental stock balance invariant equation? | $\text{Physical} = \text{Reserved} + \text{Available}$ | Enforces that material cannot be allocated beyond available yard stock. |
| **2** | Which module enables solo operators to generate all deliverables in 1 click? | Centralized Solo Hub (Workers Away Mode) | Consolidates Excel, CIPL, MTC stamping, and thermal labeling in one screen. |
| **3** | If an order is canceled after 5 pieces have been dispatched, what happens? | Dispatched items remain in history; unfulfilled reservations are restored. | Preserves historical audit records and delivery note validity. |
| **4** | Why are prices masked as `••••••` for IT Engineers and Storekeepers? | Commercial confidentiality policy | Restricts customer unit prices and profit margins to commercial profiles. |

---

## 4. Trainee Competency Sign-off Record

| Field | Trainee Record | Certification Field | Official Record |
|:---|:---|:---|:---|
| **Employee Name:** | `______________________` | **Trainer Name:** | Senior SQA & Training Lead |
| **Employee ID:** | `______________________` | **Training Date:** | November 20, 2026 |
| **Department:** | `______________________` | **Assessment Score:**| 100% Competency Verified |
| **Assigned Role:** | `______________________` | **Status:** | **CERTIFIED FOR PRODUCTION** |
| **Signature:** | `______________________` | **Trainer Signature:**| *Enterprise QA/QC Group* |
