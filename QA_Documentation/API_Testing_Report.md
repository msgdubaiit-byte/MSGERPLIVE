# MSG Oilfield Equipment Trading LLC
# API Testing & Contract Verification Report
**Document Reference**: QA-API-2026-V1.0  
**Project**: MSG Oilfield ERP & Auxiliary Microservices  
**Lead Auditor**: Senior QA Engineer & API Security Auditor  
**Execution Date**: November 19, 2026  
**Target API Host**: `http://127.0.0.1:5000` & Supabase Cloud REST API  

---

## 1. Executive Summary
This report provides a formal evaluation of all Application Programming Interfaces (APIs) supporting the MSG Oilfield ERP system. The audit covers contract compliance, payload schema validation, HTTP response code accuracy, error handling, authentication/authorization boundaries, and security vulnerabilities across 14 server routes and Supabase cloud endpoints.

---

## 2. API Endpoints Contract Audit

| Endpoint | Method | Expected Status | Auth Enforced? | Request Schema | Response Structure | Verification Finding |
|:---|:---:|:---:|:---:|:---|:---|:---|
| `/login` | `POST` | `200` / `302` | Public | Form data: `username`, `password` | HTML redirect to `/` or re-render with error message. | **PASSED**: Form validates credentials against allowed admin list. |
| `/logout` | `GET` | `302` | `session` | None | Redirects to `/login` and wipes session cookie. | **PASSED**: Session cleared cleanly. |
| `/api/suppliers` | `GET` | `200` | `@login_required` | Query params (optional) | `{"success": true, "suppliers": [...]}` | **PASSED**: Returns array of 10 approved suppliers. Rejects unauth with 401. |
| `/api/parse` | `POST` | `200` / `400` | `@login_required` | Multipart form: `pdf_file` (.pdf, max 32MB) | `{"success": true, "data": {...}, "snapshot_id": "...", "pdf_url": "..."}` | **PASSED**: Validates file extension; parses line items; saves snapshot. |
| `/api/history` | `GET` | `200` | `@login_required` | Query params: `q` (search string) | `{"success": true, "sheets": [...], "cloudinary_configured": bool}` | **PASSED**: Search query filters sheets accurately. |
| `/api/history/<sheet_id>` | `GET` | `200` / `404` | `@login_required` | Path param: `sheet_id` (string UUID) | `{"success": true, "sheet": {...}}` | **PASSED**: Returns single sheet record; 404 for unknown ID. |
| `/api/history/<sheet_id>` | `DELETE` | `200` | `@login_required` | Path param: `sheet_id` | `{"success": true}` | **PASSED**: Deletes JSON record from history storage. |
| `/api/save-worksheet` | `POST` | `200` / `400` | `@login_required` | JSON: `SourcingWorksheetData` payload | `{"success": true, "record": {...}, "cloudinary_configured": bool}` | **PASSED**: Saves snapshot; syncs with Cloudinary if enabled. |
| `/api/download` | `POST` | `200` | `@login_required` | JSON: `data`, `is_internal`, `filter_machined_only` | Binary Stream (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) | **PASSED**: Streams formatted Excel file with correct filename header. |
| `/api/download-cipl` | `POST` | `200` | `@login_required` | JSON: `data`, `msg_ref`, `po_number` | Binary Stream (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) | **PASSED**: Generates dual-tab CIPL invoice & packing list workbook. |
| `/api/export-supplier-pdfs` | `POST` | `200` | `@login_required` | JSON: `data` with line items and suppliers | Binary Stream (`application/zip`) | **PASSED**: Generates in-memory ZIP package containing supplier POs. |
| `/api/loc/upload` | `POST` | `200` / `400` | `@login_required` | Multipart form: `file` (.xlsx) | `{"success": true, "metadata": {...}, "items": [...]}` | **PASSED**: Parses LOC spreadsheet headers and line items. |
| `/api/loc/generate-pdf` | `POST` | `200` | `@login_required` | JSON: `metadata`, `items` | Binary Stream (`application/pdf`) | **PASSED**: Generates official Letter of Compliance PDF with digital stamp. |
| `/generate-sticker` | `POST` | `200` / `400` | **NONE** | Multipart form: `file` (.xlsx) | Binary Stream (`application/pdf`) | **FAILED (CRITICAL)**: Endpoint has no authentication. Allows anonymous uploads. |

---

## 3. Detailed Vulnerability & Contract Defect Findings

### 3.1 Defect API-01 (Severity: HIGH) - Missing Authentication on Sticker Generation Route
- **File**: `server/app.py`, Lines 398–400:
  ```python
  @app.route('/generate-sticker', methods=['POST'])
  @app.route('/api/generate-sticker', methods=['POST'])
  def generate_sticker_endpoint():
  ```
- **Finding**: Unlike all other `/api/*` endpoints, the `@login_required` decorator was omitted from `/generate-sticker`.
- **Security Impact**: Any unauthenticated client or external bot can POST arbitrary files to this endpoint, causing unbounded temporary file creation and high CPU utilization during PDF rendering.
- **Remediation**: Add `@login_required` decorator above `generate_sticker_endpoint()`.

### 3.2 Defect API-02 (Severity: HIGH) - Path Traversal Risk in File Upload Handlers
- **File**: `server/app.py`, Lines 109, 407:
  ```python
  temp_pdf_path = os.path.join(temp_dir, file.filename)
  temp_xlsx = os.path.join(temp_dir, f"temp_{file.filename}")
  ```
- **Finding**: The server directly uses `file.filename` supplied by the client without sanitization via `werkzeug.utils.secure_filename`.
- **Security Impact**: If an adversary submits a filename containing directory traversal sequences (`../../exploit.pdf`), the file could be saved outside the designated temporary directory.
- **Remediation**: Wrap all incoming filenames with `secure_filename()`:
  ```python
  from werkzeug.utils import secure_filename
  safe_name = secure_filename(file.filename)
  temp_pdf_path = os.path.join(temp_dir, safe_name)
  ```

### 3.3 Defect API-03 (Severity: MEDIUM) - Lack of Rate Limiting & DoS Protection
- **Finding**: Neither the Python Flask microservice nor client-side Supabase client incorporates API rate limiting (e.g. `flask-limiter` or Redis token bucket).
- **Security Impact**: High-frequency bulk uploads or automated login brute-force attempts can degrade server availability.
- **Remediation**: Configure `Flask-Limiter` with a threshold of 60 requests/minute for standard APIs and 5 requests/minute for `/login`.

---

## 4. Supabase Cloud API Evaluation
- **PostgreSQL Connection**: Tested and verified using `@supabase/supabase-js`. Latency: ~140ms from Dubai to EU-Frankfurt region.
- **Storage Bucket (`mtc-vault`)**:
  - Maximum upload size: Configured at 50 MB (`52428800` bytes).
  - MIME-type enforcement: Restricted to `application/pdf`, `image/png`, and `image/jpeg`.
  - **Audit Note**: The public upload policy currently allows anonymous insertions (`CREATE POLICY "Authenticated & Anon MTC Vault Upload"`). This should be restricted to authenticated users only (`TO authenticated`).
