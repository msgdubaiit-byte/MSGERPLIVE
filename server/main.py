import io
import json
import os
import tempfile
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from .auth import (
    DEFAULT_ROLE_MODULES,
    create_access_token,
    get_current_user,
    get_optional_user,
    hash_password,
    require_roles,
    resolve_user_by_identifier,
    sanitize_user,
    seed_default_users_if_empty,
    verify_password,
)
from .config import CLOUDINARY_CLOUD_NAME, STORAGE_DIR
from .database import close_connection, db_read, db_transaction, init_schema, now_iso, now_stamp, parse_json_col
from .documents import (
    extract_and_store_zip,
    generate_all_supplier_pdfs_zip,
    generate_cipl_excel,
    generate_loc_labels_pdf,
    generate_loc_pdf,
    generate_report_excel,
    generate_summary_excel,
    merge_order_mtc_package,
    parse_loc_excel,
    parse_po_pdf_bytes,
    parse_summary_sheet_xlsx,
    resolve_mtc_bytes,
    stamp_mtc_pdf_bytes,
    store_uploaded_file,
    build_58mm_stickers_pdf,
    _logo_path,
    _signature_path,
)
from .erp_extras import (
    clear_all_operational_data,
    export_full_database_json,
    get_system_diagnostics,
    import_full_database_json,
    import_sales_orders_excel,
    import_suppliers_bulk,
    mark_mtc_package_generated,
    preload_standard_suppliers,
    reset_demo_operational_data,
    save_loc_draft,
    save_sourcing_draft,
)
from .erp_service import (
    _format_system_config,
    _log_audit,
    _uid,
    add_item,
    add_stock_lot,
    adjust_stock,
    allocate_fifo,
    allocate_manual,
    bulk_upload_certificates,
    cancel_sales_order,
    confirm_dispatch,
    create_sales_order,
    deallocate_line,
    fast_dispatch_order,
    get_bootstrap_data,
    import_excel_stock,
    record_material_return,
    run_assistant_query,
    storekeeper_approve,
    submit_for_approval,
    update_sales_order,
    update_system_config,
    upload_and_stamp_supplier_mtc,
    upload_mtc_for_heat,
    upsert_supplier,
)
from .supabase_bridge import is_supabase_configured, pull_from_supabase, push_to_supabase, upload_bytes_to_cloudinary


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_schema()
    seed_default_users_if_empty()
    yield
    close_connection()


app = FastAPI(
    title="MSG Oilfield Equipment Trading LLC - ERP Production Backend",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------
# REQUEST MODELS
# ------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str


class SignUpRequest(BaseModel):
    email: str
    password: str
    employee_name: str
    department: str = "Operations"
    role: str = "sales_team"


class PasswordChangeRequest(BaseModel):
    new_password: str


class CreateUserRequest(BaseModel):
    employee_name: str
    email: str
    department: str = "Operations"
    role: str = "sales_team"
    password: str = "Pass@123"
    account_status: str = "Active"
    allowed_modules: List[str] = []


class UpdateUserRequest(BaseModel):
    employee_name: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    account_status: Optional[str] = None
    password: Optional[str] = None
    allowed_modules: Optional[List[str]] = None


class PermissionUpdateRequest(BaseModel):
    allowed_modules: Optional[List[str]] = None
    granular_features: Optional[List[str]] = None


class AllocateFIFORequest(BaseModel):
    line_id: str
    required_qty: int


class AllocateManualRequest(BaseModel):
    line_id: str
    stock_lot_id: str
    required_qty: int


class DeallocateRequest(BaseModel):
    line_id: str


class ApprovalActionRequest(BaseModel):
    approver_name: str
    status: str  # Approved | Rejected | Correction Requested
    remarks: str = ""


class CancelOrderRequest(BaseModel):
    reason: str


class DispatchRequest(BaseModel):
    items: List[Dict[str, Any]]
    delivery_note: str
    dispatch_ref: str = ""
    remarks: str = ""


class FastDispatchRequest(BaseModel):
    delivery_note: str = ""


class ReturnRequest(BaseModel):
    sales_order_id: str = "N/A"
    stock_lot_id: str
    qty: int
    reason: str


class AdjustmentRequest(BaseModel):
    stock_lot_id: str
    new_physical_qty: int
    reason: str


class AssistantQueryRequest(BaseModel):
    query: str


# ------------------------------------------------------------------
# HEALTH & DIAGNOSTICS
# ------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "msg-oilfield-erp-backend",
        "supabaseConfigured": is_supabase_configured(),
        "cloudinaryConfigured": bool(CLOUDINARY_CLOUD_NAME),
        "timestamp": now_iso(),
    }


@app.get("/api/diagnostics")
def diagnostics(user: Dict[str, Any] = Depends(get_current_user)):
    return {"success": True, "diagnostics": get_system_diagnostics()}


# ------------------------------------------------------------------
# AUTHENTICATION, USERS & RBAC PERMISSIONS
# ------------------------------------------------------------------

@app.post("/api/auth/login")
def auth_login(req: LoginRequest):
    if not req.email or not req.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    with db_transaction() as conn:
        user_row = resolve_user_by_identifier(conn, req.email)
        stored_pw = (user_row.get("password_hash") or user_row.get("password") or "") if user_row else ""
        if not user_row or not verify_password(req.password.strip(), stored_pw):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        if user_row["account_status"] != "Active":
            raise HTTPException(status_code=403, detail="Account is deactivated or suspended.")
        last_login = now_stamp()
        conn.execute("UPDATE user_profiles SET last_login = ? WHERE id = ?", (last_login, user_row["id"]))
        user_row["last_login"] = last_login
        safe = sanitize_user(user_row)
        token = create_access_token(safe)
        _log_audit(conn, safe["email"], "User Sign-In", "Authentication", safe["id"], None, {"role": safe["role"]})
    return {"success": True, "token": token, "user": safe}


@app.post("/api/auth/signup")
def auth_signup(req: SignUpRequest):
    clean_email = req.email.strip().lower()
    if not clean_email or len(req.password.strip()) < 6:
        raise HTTPException(status_code=400, detail="Valid email and password (min 6 chars) are required.")
    with db_transaction() as conn:
        existing = conn.execute("SELECT 1 FROM user_profiles WHERE lower(email) = ?", (clean_email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        user_id = f"USR-{uuid.uuid4().hex[:6].upper()}"
        pw_hash = hash_password(req.password.strip())
        conn.execute(
            """
            INSERT INTO user_profiles (id, employee_name, email, department, role, account_status, password_hash, allowed_modules_json, created_at, last_login)
            VALUES (?, ?, ?, ?, ?, 'Active', ?, '[]', ?, ?)
            """,
            (user_id, req.employee_name.strip(), clean_email, req.department.strip(), req.role, pw_hash, now_iso(), now_stamp()),
        )
        row = dict(conn.execute("SELECT * FROM user_profiles WHERE id = ?", (user_id,)).fetchone())
        safe = sanitize_user(row)
        _log_audit(conn, clean_email, "User Registration", "User Management", user_id, None, {"role": req.role})
    return {"success": True, "user": safe, "token": create_access_token(safe), "message": "Account provisioned in Supabase PostgreSQL."}


@app.get("/api/auth/me")
def auth_me(user: Dict[str, Any] = Depends(get_current_user)):
    return {"success": True, "user": user}


@app.post("/api/auth/change-password")
def auth_change_password(req: PasswordChangeRequest, user: Dict[str, Any] = Depends(get_current_user)):
    if len(req.new_password.strip()) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    with db_transaction() as conn:
        conn.execute("UPDATE user_profiles SET password_hash = ? WHERE id = ?", (hash_password(req.new_password.strip()), user["id"]))
        _log_audit(conn, user["email"], "Change Password", "Authentication", user["id"])
    return {"success": True, "message": "Password updated successfully."}


@app.get("/api/users")
def list_users(user: Dict[str, Any] = Depends(get_current_user)):
    with db_read() as conn:
        rows = [sanitize_user(dict(r)) for r in conn.execute("SELECT * FROM user_profiles ORDER BY id").fetchall()]
    return {"success": True, "users": rows}


@app.post("/api/users")
def create_user(req: CreateUserRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "it_engineer"))):
    clean_email = req.email.strip().lower()
    with db_transaction() as conn:
        if conn.execute("SELECT 1 FROM user_profiles WHERE lower(email) = ?", (clean_email,)).fetchone():
            raise HTTPException(status_code=409, detail="Email already registered.")
        user_id = f"USR-{uuid.uuid4().hex[:6].upper()}"
        conn.execute(
            """
            INSERT INTO user_profiles (id, employee_name, email, department, role, account_status, password_hash, allowed_modules_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, req.employee_name, clean_email, req.department, req.role, req.account_status, hash_password(req.password), json.dumps(req.allowed_modules), now_iso()[:10]),
        )
        created = sanitize_user(dict(conn.execute("SELECT * FROM user_profiles WHERE id = ?", (user_id,)).fetchone()))
        _log_audit(conn, user["email"], "Provision Employee Account", "User Management", user_id, None, created)
    return {"success": True, "user": created}


@app.patch("/api/users/{target_id}")
def update_user_endpoint(target_id: str, req: UpdateUserRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "it_engineer"))):
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM user_profiles WHERE id = ?", (target_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
        cur = dict(row)
        emp = req.employee_name if req.employee_name is not None else cur["employee_name"]
        dept = req.department if req.department is not None else cur["department"]
        role = req.role if req.role is not None else cur["role"]
        status_val = req.account_status if req.account_status is not None else cur["account_status"]
        pw_hash = hash_password(req.password) if req.password else cur["password_hash"]
        mods_json = json.dumps(req.allowed_modules) if req.allowed_modules is not None else cur["allowed_modules_json"]
        conn.execute(
            "UPDATE user_profiles SET employee_name=?, department=?, role=?, account_status=?, password_hash=?, allowed_modules_json=? WHERE id=?",
            (emp, dept, role, status_val, pw_hash, mods_json, target_id),
        )
        updated = sanitize_user(dict(conn.execute("SELECT * FROM user_profiles WHERE id = ?", (target_id,)).fetchone()))
        _log_audit(conn, user["email"], "Update Employee Account", "User Management", target_id, None, {"role": role, "status": status_val})
    return {"success": True, "user": updated}


@app.delete("/api/users/{target_id}")
def delete_user_endpoint(target_id: str, user: Dict[str, Any] = Depends(require_roles("super_admin", "it_engineer"))):
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM user_profiles WHERE id = ?", (target_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
        if row["role"] in ("super_admin", "it_engineer"):
            raise HTTPException(status_code=400, detail="Root administrative accounts cannot be deleted.")
        conn.execute("DELETE FROM user_profiles WHERE id = ?", (target_id,))
        _log_audit(conn, user["email"], "Delete Employee Account", "User Management", target_id, {"email": row["email"]})
    return {"success": True}


@app.get("/api/permissions")
def get_permissions(user: Dict[str, Any] = Depends(get_current_user)):
    with db_read() as conn:
        rows = conn.execute("SELECT * FROM custom_permissions").fetchall()
    return {
        "success": True,
        "customPermissions": {r["target_key"]: parse_json_col(r["allowed_modules_json"], []) for r in rows if parse_json_col(r["allowed_modules_json"], [])},
        "granularPermissions": {r["target_key"]: parse_json_col(r["granular_features_json"], []) for r in rows if parse_json_col(r["granular_features_json"], [])},
    }


@app.put("/api/permissions/{target_key}")
def update_permissions(target_key: str, req: PermissionUpdateRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "it_engineer"))):
    with db_transaction() as conn:
        cur = conn.execute("SELECT * FROM custom_permissions WHERE target_key = ?", (target_key,)).fetchone()
        mods = req.allowed_modules if req.allowed_modules is not None else (parse_json_col(cur["allowed_modules_json"], []) if cur else [])
        gran = req.granular_features if req.granular_features is not None else (parse_json_col(cur["granular_features_json"], []) if cur else [])
        conn.execute(
            """
            INSERT INTO custom_permissions (target_key, allowed_modules_json, granular_features_json, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(target_key) DO UPDATE SET
                allowed_modules_json=excluded.allowed_modules_json,
                granular_features_json=excluded.granular_features_json,
                updated_at=excluded.updated_at,
                updated_by=excluded.updated_by
            """,
            (target_key, json.dumps(mods), json.dumps(gran), now_iso(), user["email"]),
        )
        _log_audit(conn, user["email"], "Update RBAC Permissions", "RBAC", target_key, None, {"modules": len(mods), "granular": len(gran)})
    return {"success": True}


@app.delete("/api/permissions")
def reset_permissions(target_key: Optional[str] = None, user: Dict[str, Any] = Depends(require_roles("super_admin", "it_engineer"))):
    with db_transaction() as conn:
        if target_key:
            conn.execute("DELETE FROM custom_permissions WHERE target_key = ?", (target_key,))
        else:
            conn.execute("DELETE FROM custom_permissions")
        _log_audit(conn, user["email"], "Reset RBAC Permissions", "RBAC", target_key or "ALL")
    return {"success": True}


@app.put("/api/preferences/{pref_key}")
def set_preference(pref_key: str, body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    with db_transaction() as conn:
        conn.execute(
            """
            INSERT INTO user_preferences (user_id, pref_key, pref_value, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (user_id, pref_key) DO UPDATE SET
                pref_value=EXCLUDED.pref_value, updated_at=EXCLUDED.updated_at
            """,
            (user["id"], pref_key, str(body.get("value", "")), now_iso()),
        )
    return {"success": True}


# ------------------------------------------------------------------
# BOOTSTRAP & CLOUD SYNC
# ------------------------------------------------------------------

@app.get("/api/bootstrap")
def bootstrap(user: Optional[Dict[str, Any]] = Depends(get_optional_user)):
    return {"success": True, "data": get_bootstrap_data(user)}


@app.post("/api/sync/pull")
def sync_pull(user: Dict[str, Any] = Depends(get_current_user)):
    res = pull_from_supabase()
    return {**res, "data": get_bootstrap_data(user)}


@app.post("/api/sync/push")
def sync_push(user: Dict[str, Any] = Depends(get_current_user)):
    res = push_to_supabase()
    with db_transaction() as conn:
        _log_audit(conn, user["email"], "Supabase Cloud Sync", "Database Sync", "ALL_TABLES", None, res.get("details"))
    return res


# ------------------------------------------------------------------
# SYSTEM CONFIG, SUPPLIERS, ITEMS, STOCK & MOVEMENTS
# ------------------------------------------------------------------

@app.get("/api/config")
def get_config(user: Dict[str, Any] = Depends(get_current_user)):
    with db_read() as conn:
        row = conn.execute("SELECT * FROM system_config WHERE id='SYSTEM_CONFIG_MAIN'").fetchone()
    return {"success": True, "config": _format_system_config(row)}


@app.put("/api/config")
def put_config(updates: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "it_engineer"))):
    cfg = update_system_config(updates, user["email"])
    return {"success": True, "config": cfg}


@app.get("/api/suppliers")
def list_suppliers(user: Dict[str, Any] = Depends(get_current_user)):
    with db_read() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM suppliers ORDER BY id").fetchall()]
    return {"success": True, "suppliers": rows}


@app.post("/api/suppliers")
def add_or_update_supplier(body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "it_engineer"))):
    sup = upsert_supplier(body, user["email"])
    return {"success": True, "supplier": sup}


@app.post("/api/suppliers/preload")
def preload_suppliers_endpoint(user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "it_engineer"))):
    return preload_standard_suppliers(user["email"])


@app.post("/api/suppliers/bulk")
def bulk_suppliers_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "it_engineer"))):
    return import_suppliers_bulk(body.get("suppliers") or [], user["email"])


@app.post("/api/items")
def create_item_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory"))):
    res = add_item(body, user["email"])
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res


@app.post("/api/stock/lots")
def create_stock_lot_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory"))):
    res = add_stock_lot(body, user["email"])
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res


@app.post("/api/stock/import-excel")
def import_stock_excel_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "it_engineer"))):
    return import_excel_stock(body.get("records") or [], body.get("filename") or "Inventory.xlsx", user["email"])


# ------------------------------------------------------------------
# SALES ORDERS, ALLOCATIONS, APPROVALS, DISPATCH, RETURNS & ADJUSTMENTS
# ------------------------------------------------------------------

@app.post("/api/orders")
def create_order_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "sales_team"))):
    return create_sales_order(body, user["email"])


@app.put("/api/orders/{order_id}")
def update_order_endpoint(order_id: str, body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "sales_team"))):
    body["id"] = order_id
    res = update_sales_order(body, user["email"])
    if not res["success"]:
        raise HTTPException(status_code=404, detail=res["message"])
    return res


@app.patch("/api/orders/{order_id}/status")
def update_order_status_endpoint(order_id: str, body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "sales_team", "mtc_controller", "dispatch_team"))):
    new_status = (body.get("status") or "").strip()
    if not new_status:
        raise HTTPException(status_code=400, detail="Status is required.")
    res = update_sales_order({"id": order_id, "status": new_status}, user["email"])
    if not res["success"]:
        raise HTTPException(status_code=404, detail=res["message"])
    return res


@app.post("/api/orders/import-excel")
def import_orders_excel_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "sales_team"))):
    return import_sales_orders_excel(body.get("rows") or [], user["email"])


@app.post("/api/orders/{order_id}/allocate-fifo")
def allocate_fifo_endpoint(order_id: str, req: AllocateFIFORequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "sales_team"))):
    return allocate_fifo(order_id, req.line_id, req.required_qty, user["email"])


@app.post("/api/orders/{order_id}/allocate-manual")
def allocate_manual_endpoint(order_id: str, req: AllocateManualRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "sales_team"))):
    return allocate_manual(order_id, req.line_id, req.stock_lot_id, req.required_qty, user["email"])


@app.post("/api/orders/{order_id}/deallocate")
def deallocate_endpoint(order_id: str, req: DeallocateRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "sales_team"))):
    return deallocate_line(order_id, req.line_id, user["email"])


@app.post("/api/orders/{order_id}/submit-approval")
def submit_approval_endpoint(order_id: str, user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "sales_team"))):
    return submit_for_approval(order_id, user["email"])


@app.post("/api/orders/{order_id}/approve")
def approve_order_endpoint(order_id: str, req: ApprovalActionRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "storekeeper"))):
    return storekeeper_approve(order_id, req.approver_name, req.status, req.remarks)


@app.post("/api/orders/{order_id}/cancel")
def cancel_order_endpoint(order_id: str, req: CancelOrderRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "sales_team"))):
    return cancel_sales_order(order_id, req.reason, user["email"])


@app.post("/api/orders/{order_id}/dispatch")
def dispatch_order_endpoint(order_id: str, req: DispatchRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "dispatch_team", "storekeeper"))):
    return confirm_dispatch(order_id, req.items, req.delivery_note, req.dispatch_ref, user["email"], req.remarks)


@app.post("/api/orders/{order_id}/fast-dispatch")
def fast_dispatch_endpoint(order_id: str, req: FastDispatchRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "dispatch_team", "storekeeper", "sales_team", "admin_inventory"))):
    return fast_dispatch_order(order_id, req.delivery_note, user["email"])


@app.post("/api/orders/{order_id}/mtc-package-generated")
def mark_mtc_pkg_endpoint(order_id: str, body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    return mark_mtc_package_generated(order_id, body.get("package_url") or "", user["email"])


@app.post("/api/returns")
def create_return_endpoint(req: ReturnRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory", "storekeeper"))):
    return record_material_return(req.sales_order_id, req.stock_lot_id, req.qty, req.reason, user["email"])


@app.post("/api/adjustments")
def create_adjustment_endpoint(req: AdjustmentRequest, user: Dict[str, Any] = Depends(require_roles("super_admin", "admin_inventory"))):
    return adjust_stock(req.stock_lot_id, req.new_physical_qty, req.reason, user["email"])


# ------------------------------------------------------------------
# MTC CERTIFICATES, LOCAL PURCHASES & REAL FILE VAULT
# ------------------------------------------------------------------

@app.post("/api/files/upload")
async def upload_file_endpoint(
    file: UploadFile = File(...),
    category: str = Form("mtc"),
    heat_number: str = Form(""),
    user: Dict[str, Any] = Depends(get_current_user),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    stored = store_uploaded_file(
        file.filename or "upload.pdf",
        raw,
        category=category,
        heat_number=heat_number,
        uploaded_by=user["email"],
        content_type=file.content_type or "application/pdf",
        mirror_cloud=True,
    )
    return {"success": True, "file": stored}


@app.post("/api/files/cloudinary-upload")
async def server_cloudinary_upload(
    file: UploadFile = File(...),
    sub_folder: str = Form("mtcs"),
    user: Dict[str, Any] = Depends(get_current_user),
):
    raw = await file.read()
    res = upload_bytes_to_cloudinary(file.filename or "document.pdf", raw, sub_folder=sub_folder)
    if not res.get("success"):
        raise HTTPException(status_code=502, detail=res.get("error") or "Cloudinary upload failed.")
    return res


@app.post("/api/files/zip-extract")
async def zip_extract_endpoint(
    file: UploadFile = File(...),
    candidate_heats: str = Form("[]"),
    user: Dict[str, Any] = Depends(get_current_user),
):
    raw = await file.read()
    heats = parse_json_col(candidate_heats, [])
    extracted = extract_and_store_zip(raw, uploaded_by=user["email"], candidate_heats=heats)
    return {"success": True, "certificates": extracted, "count": len(extracted)}


@app.get("/api/files/{file_id}")
def download_stored_file(file_id: str):
    import httpx as _httpx

    with db_read() as conn:
        row = conn.execute("SELECT file_name, content_type, local_path, cloud_url FROM stored_files WHERE id = ?", (file_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="File not found.")
    path = row["local_path"]
    if path and os.path.exists(path):
        with open(path, "rb") as f:
            data = f.read()
    elif row.get("cloud_url"):
        r = _httpx.get(row["cloud_url"], timeout=20.0, follow_redirects=True)
        if r.status_code != 200:
            raise HTTPException(status_code=404, detail="File missing from cloud vault.")
        data = r.content
    else:
        raise HTTPException(status_code=404, detail="File missing from vault storage.")
    return Response(
        content=data,
        media_type=row["content_type"] or "application/pdf",
        headers={"Content-Disposition": f'inline; filename="{row["file_name"]}"'},
    )


@app.get("/api/mtc/resolve")
def resolve_mtc_endpoint(doc_name: str = "", heat_number: str = "", stamped: bool = False, po_no: str = "", item_no: str = "", qty: str = ""):
    resolved = resolve_mtc_bytes(doc_name, heat_number)
    if not resolved:
        raise HTTPException(status_code=404, detail="Authentic certificate not found in vault.")
    raw, fname = resolved
    if stamped:
        with db_read() as conn:
            cfg = _format_system_config(conn.execute("SELECT * FROM system_config WHERE id='SYSTEM_CONFIG_MAIN'").fetchone())
        raw = stamp_mtc_pdf_bytes(raw, {"poNo": po_no, "itemNo": item_no, "qty": qty}, cfg)
    return Response(
        content=raw,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{fname}"'},
    )


@app.post("/api/mtc/link-heat")
def link_mtc_heat_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    return upload_mtc_for_heat(body.get("heatNumber") or "", body, user["email"])


@app.post("/api/mtc/bulk-register")
def bulk_register_mtc_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    return bulk_upload_certificates(body.get("certificates") or [], user["email"])


@app.post("/api/local-purchases/{lp_id}/stamp-mtc")
async def stamp_lp_mtc_endpoint(
    lp_id: str,
    cert_ref: str = Form(...),
    file: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(require_roles("super_admin", "mtc_controller", "admin_inventory")),
):
    if file is not None:
        raw = await file.read()
        orig_stored = store_uploaded_file(file.filename or f"{lp_id}.pdf", raw, category="mtc", heat_number=lp_id, uploaded_by=user["email"])
    else:
        resolved = resolve_mtc_bytes(cert_ref, lp_id)
        if not resolved:
            raise HTTPException(status_code=400, detail="Authentic supplier MTC PDF is required.")
        raw, fname = resolved
        orig_stored = {"url": f"/api/mtc/resolve?heat_number={lp_id}"}

    with db_read() as conn:
        lp = conn.execute("SELECT * FROM local_purchases WHERE id = ?", (lp_id,)).fetchone()
        cfg = _format_system_config(conn.execute("SELECT * FROM system_config WHERE id='SYSTEM_CONFIG_MAIN'").fetchone())
    if not lp:
        raise HTTPException(status_code=404, detail="Local Purchase record not found.")

    stamped_bytes = stamp_mtc_pdf_bytes(
        raw,
        {"poNo": str(lp["purchase_reference"]).split(" ")[0], "itemNo": lp["l_code"], "qty": lp["received_qty"]},
        cfg,
    )
    stamped_stored = store_uploaded_file(f"{lp['l_code']}_STAMPED_VERIFIED_COPY.pdf", stamped_bytes, category="stamped_mtc", heat_number=lp["l_code"], uploaded_by=user["email"])
    res = upload_and_stamp_supplier_mtc(lp_id, cert_ref, stamped_stored["url"], orig_stored["url"], user["email"])
    return {**res, "stampedUrl": stamped_stored["url"], "fileName": stamped_stored["fileName"]}


# ------------------------------------------------------------------
# DRAFTS (SOURCING & LOC)
# ------------------------------------------------------------------

@app.get("/api/sourcing/drafts")
def list_sourcing_drafts(user: Dict[str, Any] = Depends(get_current_user)):
    with db_read() as conn:
        rows = [parse_json_col(r["payload_json"], {}) for r in conn.execute("SELECT payload_json FROM sourcing_drafts ORDER BY saved_at DESC").fetchall()]
    return {"success": True, "drafts": rows}


@app.post("/api/sourcing/drafts")
def save_sourcing_draft_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    saved = save_sourcing_draft(body, user["email"])
    return {"success": True, "draft": saved}


@app.delete("/api/sourcing/drafts/{draft_id}")
def delete_sourcing_draft_endpoint(draft_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    with db_transaction() as conn:
        conn.execute("DELETE FROM sourcing_drafts WHERE id = ?", (draft_id,))
    return {"success": True}


@app.get("/api/loc/drafts")
def list_loc_drafts(user: Dict[str, Any] = Depends(get_current_user)):
    with db_read() as conn:
        rows = [parse_json_col(r["payload_json"], {}) for r in conn.execute("SELECT payload_json FROM loc_drafts ORDER BY timestamp DESC").fetchall()]
    return {"success": True, "drafts": rows}


@app.post("/api/loc/drafts")
def save_loc_draft_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    saved = save_loc_draft(body)
    return {"success": True, "draft": saved}


@app.delete("/api/loc/drafts/{draft_id}")
def delete_loc_draft_endpoint(draft_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    with db_transaction() as conn:
        conn.execute("DELETE FROM loc_drafts WHERE id = ?", (draft_id,))
    return {"success": True}


# ------------------------------------------------------------------
# DOCUMENT GENERATION, PARSING & REPORTS
# ------------------------------------------------------------------

@app.post("/api/documents/parse-po")
async def parse_po_endpoint(file: UploadFile = File(...), user: Dict[str, Any] = Depends(get_current_user)):
    raw = await file.read()
    extracted = parse_po_pdf_bytes(raw, file.filename or "po.pdf")
    stored = store_uploaded_file(file.filename or "po.pdf", raw, category="po_documents", uploaded_by=user["email"])
    return {"success": True, "data": extracted, "file": stored}


@app.post("/api/documents/mtc-package/{order_id}")
def generate_order_mtc_pkg_endpoint(order_id: str, apply_stamp: bool = True, user: Dict[str, Any] = Depends(get_current_user)):
    with db_read() as conn:
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Order not found.")
        from .erp_service import _format_order
        order = _format_order(row)
        cfg = _format_system_config(conn.execute("SELECT * FROM system_config WHERE id='SYSTEM_CONFIG_MAIN'").fetchone())
    merged_bytes = merge_order_mtc_package(order, cfg, apply_stamp=apply_stamp)
    stored = store_uploaded_file(f"MTC_PACKAGE_{order['so_number']}.pdf", merged_bytes, category="mtc_packages", uploaded_by=user["email"])
    mark_mtc_package_generated(order_id, stored["url"], user["email"])
    return Response(
        content=merged_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="MTC_PACKAGE_{order["so_number"]}.pdf"'},
    )


@app.post("/api/documents/summary-excel")
@app.post("/api/download")
def download_summary_excel(body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    msg_ref = str(body.get("msg_ref", "SUMMARY")).replace(" ", "_")
    po_num = str(body.get("po_number", "")).replace(" ", "_")
    is_internal = bool(body.get("is_internal", False))
    filter_machined = bool(body.get("filter_machined_only", True))
    prefix = "Internal_Stores_Summary" if is_internal else "Client_Summary"
    filename = f"{prefix}_{msg_ref}_{po_num}.xlsx" if po_num else f"{prefix}_{msg_ref}.xlsx"
    stream = generate_summary_excel(body, logo_path=_logo_path(), is_internal=is_internal, filter_machined_only=filter_machined)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/documents/cipl-excel")
@app.post("/api/download-cipl")
def download_cipl_excel(body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    msg_ref = str(body.get("msg_ref", "CIPL")).replace(" ", "_")
    po_num = str(body.get("po_number", "")).replace(" ", "_")
    filename = f"CIPL_{msg_ref}_{po_num}.xlsx" if po_num else f"CIPL_{msg_ref}.xlsx"
    stream = generate_cipl_excel(body, logo_path=_logo_path())
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/documents/supplier-pdfs")
@app.post("/api/export-supplier-pdfs")
def export_supplier_pdfs(body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    msg_ref = str(body.get("msg_ref", "SO")).replace(" ", "_")
    stream = generate_all_supplier_pdfs_zip(body, logo_path=_logo_path())
    return StreamingResponse(
        stream,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="Supplier_PO_Package_{msg_ref}.zip"'},
    )


@app.post("/api/loc/upload")
async def loc_upload_excel(file: UploadFile = File(...), user: Dict[str, Any] = Depends(get_current_user)):
    raw = await file.read()
    data = parse_loc_excel(io.BytesIO(raw))
    return {"success": True, "metadata": data["metadata"], "items": data["items"]}


@app.post("/api/loc/generate-pdf")
def loc_generate_pdf(body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    metadata = body.get("metadata", {})
    items = body.get("items", [])
    buf = io.BytesIO()
    generate_loc_pdf(metadata, items, buf)
    buf.seek(0)
    filename = f"Letter_of_Compliance_{metadata.get('po_number', 'Doc')}.pdf".replace(" ", "_")
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.post("/api/loc/labels-pdf")
async def loc_labels_pdf(file: UploadFile = File(...), user: Dict[str, Any] = Depends(get_current_user)):
    raw = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp_in, tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_out:
        tmp_in.write(raw)
        in_path, out_path = tmp_in.name, tmp_out.name
    try:
        generate_loc_labels_pdf(in_path, _logo_path() or "", _signature_path() or "", out_path)
        pdf_bytes = open(out_path, "rb").read()
        return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="LOC_Material_Tags.pdf"'})
    finally:
        for p in (in_path, out_path):
            try:
                os.remove(p)
            except Exception:
                pass


@app.post("/api/generate-sticker")
async def generate_sticker_endpoint(file: UploadFile = File(...), user: Dict[str, Any] = Depends(get_current_user)):
    raw = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp_in, tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_out:
        tmp_in.write(raw)
        in_path, out_path = tmp_in.name, tmp_out.name
    try:
        client_name, po_number, items = parse_summary_sheet_xlsx(in_path)
        build_58mm_stickers_pdf(items, out_path, logo_path=_logo_path(), client_name=client_name, po_number=po_number)
        pdf_bytes = open(out_path, "rb").read()
        return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="stickers_msg_final.pdf"'})
    finally:
        for p in (in_path, out_path):
            try:
                os.remove(p)
            except Exception:
                pass


@app.get("/api/reports/{report_type}")
def download_report_endpoint(report_type: str, user: Dict[str, Any] = Depends(get_current_user)):
    xlsx_bytes, filename = generate_report_excel(report_type)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ------------------------------------------------------------------
# BACKUP / RESTORE / CLEAR / ASSISTANT
# ------------------------------------------------------------------

@app.get("/api/admin/export-json")
def export_json_endpoint(user: Dict[str, Any] = Depends(require_roles("super_admin", "it_engineer"))):
    return export_full_database_json(user)


@app.post("/api/admin/import-json")
def import_json_endpoint(body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles("super_admin", "it_engineer"))):
    return import_full_database_json(body, user["email"])


@app.post("/api/admin/clear-data")
def clear_data_endpoint(user: Dict[str, Any] = Depends(require_roles("super_admin", "it_engineer"))):
    return clear_all_operational_data(user["email"])


@app.post("/api/admin/reset-demo")
def reset_demo_endpoint(user: Dict[str, Any] = Depends(require_roles("super_admin", "it_engineer"))):
    return reset_demo_operational_data(user["email"])


@app.post("/api/assistant/query")
def assistant_query_endpoint(req: AssistantQueryRequest, user: Dict[str, Any] = Depends(get_current_user)):
    return {"success": True, "reply": run_assistant_query(req.query)}
