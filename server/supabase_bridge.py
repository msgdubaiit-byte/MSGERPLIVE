import hashlib
import json
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from .auth import hash_password
from .config import (
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_FOLDER,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
)
from .database import db_read, db_transaction, now_iso, parse_json_col


def _supabase_key() -> str:
    return SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY


def is_supabase_configured() -> bool:
    return bool(SUPABASE_URL and _supabase_key() and SUPABASE_URL.startswith("https://"))


def _headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    key = _supabase_key()
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _fetch_all_rows(client: httpx.Client, table: str, order_col: Optional[str] = None) -> Tuple[bool, List[Dict[str, Any]], str]:
    """Paginate through all rows of a Supabase PostgREST table (no arbitrary 100/200 limit)."""
    all_rows: List[Dict[str, Any]] = []
    page_size = 1000
    offset = 0
    while True:
        params: Dict[str, str] = {"select": "*"}
        if order_col:
            params["order"] = f"{order_col}.desc"
        headers = _headers({"Range": f"{offset}-{offset + page_size - 1}", "Range-Unit": "items"})
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        resp = client.get(url, headers=headers, params=params)
        if resp.status_code == 404:
            return False, [], f"Table {table} not found in Supabase"
        if resp.status_code >= 400:
            return False, [], f"HTTP {resp.status_code}: {resp.text[:200]}"
        batch = resp.json()
        if not isinstance(batch, list):
            break
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return True, all_rows, "ok"


def pull_from_supabase() -> Dict[str, Any]:
    """Pull all available tables from Supabase PostgREST and upsert into PostgreSQL."""
    if not is_supabase_configured():
        return {"success": False, "message": "Supabase credentials not configured."}

    counts: Dict[str, int] = {}
    warnings: List[str] = []

    with httpx.Client(timeout=20.0) as client:
        # 1. system_config
        ok, rows, msg = _fetch_all_rows(client, "system_config")
        if ok and rows:
            c = rows[0]
            with db_transaction() as conn:
                conn.execute(
                    """
                    INSERT INTO system_config (
                        id, company_name, trn_number, default_currency, company_address,
                        contact_email, contact_phone, theme_primary_color, mtc_stamp_text,
                        mtc_stamp_color, mtc_stamp_scale, mtc_stamp_offset_x, mtc_stamp_offset_y,
                        mtc_inspector_name, inspector_designation, inspector_sign_name,
                        custom_seal_data_url, custom_signature_data_url, seal_shape,
                        seal_border_width, show_machined_tag, default_weight_safety_buffer,
                        cipl_invoice_prefix, qr_sticker_format, data_privacy_masking_for_it, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        company_name=excluded.company_name,
                        trn_number=excluded.trn_number,
                        default_currency=excluded.default_currency,
                        company_address=excluded.company_address,
                        contact_email=excluded.contact_email,
                        contact_phone=excluded.contact_phone,
                        theme_primary_color=excluded.theme_primary_color,
                        mtc_stamp_text=excluded.mtc_stamp_text,
                        mtc_stamp_color=excluded.mtc_stamp_color,
                        mtc_stamp_scale=excluded.mtc_stamp_scale,
                        mtc_stamp_offset_x=excluded.mtc_stamp_offset_x,
                        mtc_stamp_offset_y=excluded.mtc_stamp_offset_y,
                        mtc_inspector_name=excluded.mtc_inspector_name,
                        inspector_designation=excluded.inspector_designation,
                        inspector_sign_name=excluded.inspector_sign_name,
                        custom_seal_data_url=COALESCE(NULLIF(excluded.custom_seal_data_url,''), system_config.custom_seal_data_url),
                        custom_signature_data_url=COALESCE(NULLIF(excluded.custom_signature_data_url,''), system_config.custom_signature_data_url),
                        seal_shape=excluded.seal_shape,
                        seal_border_width=excluded.seal_border_width,
                        show_machined_tag=excluded.show_machined_tag,
                        default_weight_safety_buffer=excluded.default_weight_safety_buffer,
                        cipl_invoice_prefix=excluded.cipl_invoice_prefix,
                        qr_sticker_format=excluded.qr_sticker_format,
                        data_privacy_masking_for_it=excluded.data_privacy_masking_for_it,
                        updated_at=excluded.updated_at
                    """,
                    (
                        c.get("id", "SYSTEM_CONFIG_MAIN"),
                        c.get("company_name", "MSG OILFIELD EQUIPMENT TRADING LLC"),
                        c.get("trn_number", "100293847500003"),
                        c.get("default_currency", "AED"),
                        c.get("company_address", ""),
                        c.get("contact_email", ""),
                        c.get("contact_phone", ""),
                        c.get("theme_primary_color", "#0B2545"),
                        c.get("mtc_stamp_text", "CERTIFIED TRUE COPY OF ORIGINAL / MSG QA/QC APPROVED"),
                        c.get("mtc_stamp_color", "#D32F2F"),
                        int(c.get("mtc_stamp_scale") or 100),
                        int(c.get("mtc_stamp_offset_x") or 0),
                        int(c.get("mtc_stamp_offset_y") or 0),
                        c.get("mtc_inspector_name", "QA/QC Lead Inspector"),
                        c.get("inspector_designation", "Senior QA/QC Materials Inspector"),
                        c.get("inspector_sign_name", "MSG/QC-04"),
                        c.get("custom_seal_data_url") or "",
                        c.get("custom_signature_data_url") or "",
                        c.get("seal_shape") or "rectangular",
                        int(c.get("seal_border_width") or 2),
                        bool(c.get("show_machined_tag", True)),
                        int(c.get("default_weight_safety_buffer") or 15),
                        c.get("cipl_invoice_prefix", "CIPL-INV-"),
                        c.get("qr_sticker_format", "thermal_4x6"),
                        bool(c.get("data_privacy_masking_for_it", True)),
                        c.get("updated_at") or now_iso(),
                    ),
                )
            counts["system_config"] = 1

        # 2. suppliers
        ok, rows, msg = _fetch_all_rows(client, "suppliers")
        if ok:
            with db_transaction() as conn:
                for s in rows:
                    conn.execute(
                        """
                        INSERT INTO suppliers (id, supplier_code, supplier_name, country, make, supplier_type, approved_status, contact_person, contact_email, contact_phone, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            supplier_name=excluded.supplier_name,
                            country=excluded.country,
                            make=excluded.make,
                            supplier_type=excluded.supplier_type,
                            approved_status=excluded.approved_status,
                            contact_person=excluded.contact_person,
                            contact_email=excluded.contact_email,
                            contact_phone=excluded.contact_phone,
                            updated_at=excluded.updated_at
                        """,
                        (
                            s["id"],
                            s.get("supplier_code") or s["id"],
                            s.get("supplier_name") or "",
                            s.get("country") or "United Arab Emirates",
                            s.get("make") or "",
                            s.get("supplier_type") or "international_maker",
                            s.get("approved_status") or "Approved",
                            s.get("contact_person") or "",
                            s.get("contact_email") or "",
                            s.get("contact_phone") or "",
                            s.get("created_at") or now_iso(),
                            s.get("updated_at") or now_iso(),
                        ),
                    )
            counts["suppliers"] = len(rows)
        else:
            warnings.append(msg)

        # 3. customers
        ok, rows, msg = _fetch_all_rows(client, "customers")
        if ok:
            with db_transaction() as conn:
                for c in rows:
                    conn.execute(
                        """
                        INSERT INTO customers (id, customer_code, customer_name, address, contact_details, status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            customer_name=excluded.customer_name,
                            address=excluded.address,
                            contact_details=excluded.contact_details,
                            status=excluded.status
                        """,
                        (
                            c["id"],
                            c.get("customer_code") or c["id"],
                            c.get("customer_name") or "",
                            c.get("address") or "",
                            c.get("contact_details") or "",
                            c.get("status") or "Active",
                            c.get("created_at") or now_iso(),
                            now_iso(),
                        ),
                    )
            counts["customers"] = len(rows)

        # 4. items
        ok, rows, msg = _fetch_all_rows(client, "items")
        if ok:
            with db_transaction() as conn:
                for it in rows:
                    conn.execute(
                        """
                        INSERT INTO items (id, item_code, item_description, material_grade, specification, size, uom, unit_price_aed, is_active, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            item_description=excluded.item_description,
                            material_grade=excluded.material_grade,
                            specification=excluded.specification,
                            size=excluded.size,
                            uom=excluded.uom,
                            unit_price_aed=excluded.unit_price_aed,
                            is_active=excluded.is_active
                        """,
                        (
                            it["id"],
                            it.get("item_code") or it["id"],
                            it.get("item_description") or "",
                            it.get("material_grade") or "",
                            it.get("specification") or "",
                            it.get("size") or "",
                            it.get("uom") or "PCS",
                            float(it.get("unit_price_aed") or 0),
                            bool(it.get("is_active", True)),
                            it.get("created_at") or now_iso(),
                            now_iso(),
                        ),
                    )
            counts["items"] = len(rows)

        # 5. stock_lots
        ok, rows, msg = _fetch_all_rows(client, "stock_lots")
        if ok:
            with db_transaction() as conn:
                for lot in rows:
                    conn.execute(
                        """
                        INSERT INTO stock_lots (id, item_id, item_code, item_description, heat_number, yom, original_qty, received_qty, purchase_type, supplier_name, l_code, stock_receipt_date, warehouse_location, mtc_ref, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            heat_number=excluded.heat_number,
                            yom=excluded.yom,
                            warehouse_location=excluded.warehouse_location,
                            mtc_ref=COALESCE(NULLIF(excluded.mtc_ref,''), stock_lots.mtc_ref),
                            updated_at=excluded.updated_at
                        """,
                        (
                            lot["id"],
                            lot.get("item_id") or "",
                            lot.get("item_code") or "",
                            lot.get("item_description") or "",
                            lot.get("heat_number") or "STOCK-HEAT",
                            int(lot.get("yom") or 0),
                            int(lot.get("original_qty") or 0),
                            int(lot.get("received_qty") or 0),
                            lot.get("purchase_type") or "regular",
                            lot.get("supplier_name") or "MSG Stock",
                            lot.get("l_code"),
                            str(lot.get("stock_receipt_date") or "")[:10],
                            lot.get("warehouse_location") or "MAIN YARD",
                            lot.get("mtc_ref") or "",
                            lot.get("created_at") or now_iso(),
                            lot.get("updated_at") or now_iso(),
                        ),
                    )
            counts["stock_lots"] = len(rows)

        # 6. stock_balances
        ok, rows, msg = _fetch_all_rows(client, "stock_balances")
        if ok:
            with db_transaction() as conn:
                for bal in rows:
                    lot_exists = conn.execute("SELECT 1 FROM stock_lots WHERE id = ?", (bal["stock_lot_id"],)).fetchone()
                    if not lot_exists:
                        continue
                    conn.execute(
                        """
                        INSERT INTO stock_balances (id, stock_lot_id, physical_qty, reserved_qty, available_qty, dispatched_qty, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            physical_qty=excluded.physical_qty,
                            reserved_qty=excluded.reserved_qty,
                            available_qty=excluded.available_qty,
                            dispatched_qty=excluded.dispatched_qty,
                            updated_at=excluded.updated_at
                        """,
                        (
                            bal["id"],
                            bal["stock_lot_id"],
                            max(0, int(bal.get("physical_qty") or 0)),
                            max(0, int(bal.get("reserved_qty") or 0)),
                            max(0, int(bal.get("available_qty") or 0)),
                            max(0, int(bal.get("dispatched_qty") or 0)),
                            bal.get("updated_at") or now_iso(),
                        ),
                    )
            counts["stock_balances"] = len(rows)

        # 7. sales_orders
        ok, rows, msg = _fetch_all_rows(client, "sales_orders")
        if ok:
            with db_transaction() as conn:
                for o in rows:
                    items_json = json.dumps(o.get("items") or []) if not isinstance(o.get("items"), str) else o["items"]
                    allocs_json = json.dumps(o.get("allocations") or []) if not isinstance(o.get("allocations"), str) else o["allocations"]
                    conn.execute(
                        """
                        INSERT INTO sales_orders (
                            id, so_number, po_number, msg_ref, bapco_transmittal, customer_id, customer_name,
                            order_date, required_delivery_date, status, order_type, purchase_type,
                            created_by, approved_by, cancellation_date, cancellation_reason, store_remarks,
                            mtc_package_generated, mtc_package_url, po_document_name, po_document_url,
                            items_json, allocations_json, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            status=excluded.status,
                            approved_by=excluded.approved_by,
                            store_remarks=excluded.store_remarks,
                            mtc_package_generated=excluded.mtc_package_generated,
                            mtc_package_url=excluded.mtc_package_url,
                            items_json=excluded.items_json,
                            allocations_json=excluded.allocations_json,
                            updated_at=excluded.updated_at
                        """,
                        (
                            o["id"],
                            o.get("so_number") or o["id"],
                            o.get("po_number") or "",
                            o.get("msg_ref") or "",
                            o.get("bapco_transmittal") or "",
                            o.get("customer_id") or "",
                            o.get("customer_name") or "",
                            str(o.get("order_date") or "")[:10],
                            str(o.get("required_delivery_date") or "")[:10],
                            o.get("status") or "Draft",
                            o.get("order_type") or "regular",
                            o.get("purchase_type") or "regular",
                            o.get("created_by") or "system",
                            o.get("approved_by"),
                            o.get("cancellation_date"),
                            o.get("cancellation_reason"),
                            o.get("store_remarks"),
                            bool(o.get("mtc_package_generated")),
                            o.get("mtc_package_url"),
                            o.get("po_document_name"),
                            o.get("po_document_url"),
                            items_json,
                            allocs_json,
                            o.get("created_at") or now_iso(),
                            o.get("updated_at") or now_iso(),
                        ),
                    )
            counts["sales_orders"] = len(rows)

        # 8. mtc_certificates
        ok, rows, msg = _fetch_all_rows(client, "mtc_certificates")
        if ok:
            with db_transaction() as conn:
                for m in rows:
                    conn.execute(
                        """
                        INSERT INTO mtc_certificates (
                            id, item_id, item_code, stock_lot_id, heat_number, l_code, yom,
                            certificate_reference, original_file_path, stamped_file_path,
                            purchase_type, supplier_name, upload_date, uploaded_by,
                            verification_status, approval_status, pages, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            certificate_reference=excluded.certificate_reference,
                            original_file_path=excluded.original_file_path,
                            stamped_file_path=excluded.stamped_file_path,
                            verification_status=excluded.verification_status,
                            approval_status=excluded.approval_status
                        """,
                        (
                            m["id"],
                            m.get("item_id") or "",
                            m.get("item_code") or "STOCK",
                            m.get("stock_lot_id") or "",
                            m.get("heat_number") or "",
                            m.get("l_code"),
                            int(m.get("yom") or 2025),
                            m.get("certificate_reference") or "",
                            m.get("original_file_path") or "",
                            m.get("stamped_file_path"),
                            m.get("purchase_type") or "regular",
                            m.get("supplier_name") or "",
                            m.get("upload_date") or "",
                            m.get("uploaded_by") or "",
                            m.get("verification_status") or "Verified",
                            m.get("approval_status") or "Approved",
                            int(m.get("pages") or 1),
                            m.get("created_at") or now_iso(),
                            now_iso(),
                        ),
                    )
            counts["mtc_certificates"] = len(rows)

        # 9. local_purchases
        ok, rows, msg = _fetch_all_rows(client, "local_purchases")
        if ok:
            with db_transaction() as conn:
                for lp in rows:
                    conn.execute(
                        """
                        INSERT INTO local_purchases (
                            id, l_code, item_id, item_code, stock_lot_id, supplier_name,
                            purchase_reference, purchase_date, received_qty, yom,
                            mtc_certificate_id, supplier_mtc_uploaded, created_by, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            lp["id"],
                            lp["l_code"],
                            lp.get("item_id") or "",
                            lp.get("item_code") or "",
                            lp.get("stock_lot_id") or "",
                            lp.get("supplier_name") or "",
                            lp.get("purchase_reference") or "",
                            str(lp.get("purchase_date") or "")[:10],
                            int(lp.get("received_qty") or 1),
                            int(lp.get("yom") or 2025),
                            lp.get("mtc_certificate_id"),
                            bool(lp.get("supplier_mtc_uploaded")),
                            lp.get("created_by") or "",
                            lp.get("created_at") or now_iso(),
                            now_iso(),
                        ),
                    )
            counts["local_purchases"] = len(rows)

        # 10. stock_movements (ALL rows, paginated)
        ok, rows, msg = _fetch_all_rows(client, "stock_movements", order_col="id")
        if ok:
            with db_transaction() as conn:
                for mv in rows:
                    conn.execute(
                        """
                        INSERT INTO stock_movements (
                            id, stock_lot_id, item_code, heat_number, movement_type, quantity,
                            reference_type, reference_id, previous_balance, new_balance,
                            performed_by, timestamp, remarks
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            mv["id"],
                            mv.get("stock_lot_id") or "",
                            mv.get("item_code") or "",
                            mv.get("heat_number") or "",
                            mv.get("movement_type") or "",
                            int(mv.get("quantity") or 0),
                            mv.get("reference_type") or "",
                            mv.get("reference_id") or "",
                            int(mv.get("previous_balance") or 0),
                            int(mv.get("new_balance") or 0),
                            mv.get("performed_by") or "system",
                            mv.get("timestamp") or "",
                            mv.get("remarks") or "",
                        ),
                    )
            counts["stock_movements"] = len(rows)

        # 11. dispatch_records
        ok, rows, msg = _fetch_all_rows(client, "dispatch_records")
        if ok:
            with db_transaction() as conn:
                for d in rows:
                    summary_json = json.dumps(d.get("items_summary") or []) if not isinstance(d.get("items_summary"), str) else d["items_summary"]
                    conn.execute(
                        """
                        INSERT INTO dispatch_records (
                            id, sales_order_id, so_number, dispatch_reference, dispatch_date,
                            delivery_note_number, customer_name, dispatched_by, delivery_remarks,
                            items_summary_json, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            d["id"],
                            d.get("sales_order_id") or "",
                            d.get("so_number") or "",
                            d.get("dispatch_reference") or "",
                            str(d.get("dispatch_date") or "")[:10],
                            d.get("delivery_note_number") or "",
                            d.get("customer_name") or "",
                            d.get("dispatched_by") or "",
                            d.get("delivery_remarks") or "",
                            summary_json,
                            d.get("created_at") or now_iso(),
                        ),
                    )
            counts["dispatch_records"] = len(rows)

        # 12. user_profiles (upgrade plaintext passwords into bcrypt hashes locally)
        ok, rows, msg = _fetch_all_rows(client, "user_profiles")
        if ok and rows:
            with db_transaction() as conn:
                for u in rows:
                    raw_pass = u.get("password") or "Pass@123"
                    pw_hash = hash_password(raw_pass)
                    mods_json = json.dumps(u.get("allowed_modules") or []) if not isinstance(u.get("allowed_modules"), str) else u["allowed_modules"]
                    conn.execute(
                        """
                        INSERT INTO user_profiles (
                            id, employee_name, email, department, role, account_status,
                            password_hash, allowed_modules_json, created_at, last_login
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(email) DO UPDATE SET
                            employee_name=excluded.employee_name,
                            department=excluded.department,
                            role=excluded.role,
                            account_status=excluded.account_status,
                            allowed_modules_json=excluded.allowed_modules_json
                        """,
                        (
                            u["id"],
                            u.get("employee_name") or "Staff",
                            (u.get("email") or "").strip().lower(),
                            u.get("department") or "Operations",
                            u.get("role") or "sales_team",
                            u.get("account_status") or "Active",
                            pw_hash,
                            mods_json,
                            u.get("created_at") or now_iso(),
                            u.get("last_login"),
                        ),
                    )
            counts["user_profiles"] = len(rows)

        # Optional newer tables (if migrated in Supabase)
        for opt_table in ["approval_records", "stock_returns", "stock_adjustments", "audit_logs", "excel_import_jobs"]:
            ok, rows, _ = _fetch_all_rows(client, opt_table)
            if ok and rows:
                counts[opt_table] = len(rows)

    return {
        "success": True,
        "message": "Synced live production records from Supabase PostgreSQL.",
        "counts": counts,
        "warnings": warnings,
    }


def _upsert_supabase_table(client: httpx.Client, table: str, rows: List[Dict[str, Any]], chunk_size: int = 200) -> Tuple[bool, int, str]:
    if not rows:
        return True, 0, "empty"
    headers = _headers({"Prefer": "resolution=merge-duplicates,return=minimal"})
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    pushed = 0
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        resp = client.post(url, headers=headers, json=chunk)
        if resp.status_code == 404:
            return False, pushed, f"Table {table} not yet created in Supabase"
        if resp.status_code >= 400:
            return False, pushed, f"{table} HTTP {resp.status_code}: {resp.text[:200]}"
        pushed += len(chunk)
    return True, pushed, "ok"


def push_to_supabase() -> Dict[str, Any]:
    """Push all ERP tables from SQLite to Supabase PostgreSQL."""
    if not is_supabase_configured():
        return {"success": False, "message": "Supabase credentials not configured.", "details": {}}

    details: Dict[str, Any] = {}
    warnings: List[str] = []

    with db_read() as conn:
        cfg = conn.execute("SELECT * FROM system_config WHERE id='SYSTEM_CONFIG_MAIN'").fetchone()
        suppliers = [dict(r) for r in conn.execute("SELECT * FROM suppliers").fetchall()]
        customers = [dict(r) for r in conn.execute("SELECT * FROM customers").fetchall()]
        items = [dict(r) for r in conn.execute("SELECT * FROM items").fetchall()]
        lots = [dict(r) for r in conn.execute("SELECT * FROM stock_lots").fetchall()]
        balances = [dict(r) for r in conn.execute("SELECT * FROM stock_balances").fetchall()]
        orders = [dict(r) for r in conn.execute("SELECT * FROM sales_orders").fetchall()]
        mtcs = [dict(r) for r in conn.execute("SELECT * FROM mtc_certificates").fetchall()]
        lps = [dict(r) for r in conn.execute("SELECT * FROM local_purchases").fetchall()]
        movements = [dict(r) for r in conn.execute("SELECT * FROM stock_movements").fetchall()]
        dispatches = [dict(r) for r in conn.execute("SELECT * FROM dispatch_records").fetchall()]
        approvals = [dict(r) for r in conn.execute("SELECT * FROM approval_records").fetchall()]
        returns = [dict(r) for r in conn.execute("SELECT * FROM stock_returns").fetchall()]
        adjustments = [dict(r) for r in conn.execute("SELECT * FROM stock_adjustments").fetchall()]
        audits = [dict(r) for r in conn.execute("SELECT * FROM audit_logs").fetchall()]
        import_jobs = [dict(r) for r in conn.execute("SELECT * FROM excel_import_jobs").fetchall()]

    with httpx.Client(timeout=25.0) as client:
        if cfg:
            c = dict(cfg)
            ok, n, msg = _upsert_supabase_table(client, "system_config", [{
                "id": c["id"],
                "company_name": c["company_name"],
                "trn_number": c["trn_number"],
                "default_currency": c["default_currency"],
                "company_address": c["company_address"],
                "contact_email": c["contact_email"],
                "contact_phone": c["contact_phone"],
                "theme_primary_color": c["theme_primary_color"],
                "mtc_stamp_text": c["mtc_stamp_text"],
                "mtc_stamp_color": c["mtc_stamp_color"],
                "mtc_stamp_scale": c["mtc_stamp_scale"],
                "mtc_stamp_offset_x": c["mtc_stamp_offset_x"],
                "mtc_stamp_offset_y": c["mtc_stamp_offset_y"],
                "mtc_inspector_name": c["mtc_inspector_name"],
                "inspector_designation": c["inspector_designation"],
                "inspector_sign_name": c["inspector_sign_name"],
                "custom_seal_data_url": c["custom_seal_data_url"],
                "custom_signature_data_url": c["custom_signature_data_url"],
                "seal_shape": c["seal_shape"],
                "seal_border_width": c["seal_border_width"],
                "show_machined_tag": bool(c["show_machined_tag"]),
                "default_weight_safety_buffer": c["default_weight_safety_buffer"],
                "cipl_invoice_prefix": c["cipl_invoice_prefix"],
                "qr_sticker_format": c["qr_sticker_format"],
                "data_privacy_masking_for_it": bool(c["data_privacy_masking_for_it"]),
                "updated_at": c["updated_at"] or now_iso(),
            }])
            details["system_config"] = n if ok else msg

        for tbl, payload in [
            ("suppliers", [{k: v for k, v in s.items()} for s in suppliers]),
            ("customers", [{k: v for k, v in c.items() if k != "updated_at"} for c in customers]),
            ("items", [{**{k: v for k, v in it.items() if k != "updated_at"}, "is_active": bool(it["is_active"])} for it in items]),
            ("stock_lots", lots),
            ("stock_balances", balances),
            ("sales_orders", [{
                "id": o["id"],
                "so_number": o["so_number"],
                "po_number": o["po_number"],
                "customer_id": o["customer_id"],
                "customer_name": o["customer_name"],
                "order_date": o["order_date"],
                "required_delivery_date": o["required_delivery_date"],
                "status": o["status"],
                "created_by": o["created_by"],
                "approved_by": o["approved_by"],
                "store_remarks": o["store_remarks"],
                "mtc_package_generated": bool(o["mtc_package_generated"]),
                "mtc_package_url": o["mtc_package_url"],
                "po_document_name": o["po_document_name"],
                "po_document_url": o["po_document_url"],
                "cancellation_date": o["cancellation_date"],
                "cancellation_reason": o["cancellation_reason"],
                "items": parse_json_col(o["items_json"], []),
                "allocations": parse_json_col(o["allocations_json"], []),
                "created_at": o["created_at"],
                "updated_at": o["updated_at"],
            } for o in orders]),
            ("mtc_certificates", [{k: v for k, v in m.items() if k != "updated_at"} for m in mtcs]),
            ("local_purchases", [{
                "id": lp["id"],
                "l_code": lp["l_code"],
                "item_id": lp["item_id"],
                "item_code": lp["item_code"],
                "stock_lot_id": lp["stock_lot_id"],
                "supplier_name": lp["supplier_name"],
                "purchase_reference": lp["purchase_reference"],
                "purchase_date": lp["purchase_date"],
                "received_qty": lp["received_qty"],
                "yom": lp["yom"],
                "supplier_mtc_uploaded": bool(lp["supplier_mtc_uploaded"]),
                "created_by": lp["created_by"],
                "created_at": lp["created_at"],
            } for lp in lps]),
            ("stock_movements", movements),
            ("dispatch_records", [{
                "id": d["id"],
                "sales_order_id": d["sales_order_id"],
                "so_number": d["so_number"],
                "dispatch_reference": d["dispatch_reference"],
                "delivery_note_number": d["delivery_note_number"],
                "customer_name": d["customer_name"],
                "dispatch_date": d["dispatch_date"],
                "items_summary": parse_json_col(d["items_summary_json"], []),
                "dispatched_by": d["dispatched_by"],
                "delivery_remarks": d["delivery_remarks"],
                "created_at": d["created_at"],
            } for d in dispatches]),
            ("approval_records", approvals),
            ("stock_returns", returns),
            ("stock_adjustments", adjustments),
            ("audit_logs", audits),
            ("excel_import_jobs", import_jobs),
        ]:
            ok, n, msg = _upsert_supabase_table(client, tbl, payload)
            if ok:
                details[tbl] = n
            else:
                warnings.append(msg)

    return {
        "success": True,
        "message": "ERP data pushed to Supabase Cloud PostgreSQL.",
        "details": details,
        "warnings": warnings,
    }


def upload_bytes_to_supabase_storage(file_name: str, file_bytes: bytes, folder: str = "mtcs", content_type: str = "application/pdf") -> Optional[str]:
    if not is_supabase_configured():
        return None
    clean = "".join(c if c.isalnum() or c in "._-" else "_" for c in file_name)
    object_path = f"{folder}/{int(time.time())}_{clean}"
    url = f"{SUPABASE_URL}/storage/v1/object/mtc-vault/{object_path}"
    headers = {
        "apikey": _supabase_key(),
        "Authorization": f"Bearer {_supabase_key()}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    try:
        with httpx.Client(timeout=25.0) as client:
            resp = client.post(url, headers=headers, content=file_bytes)
            if resp.status_code < 400:
                return f"{SUPABASE_URL}/storage/v1/object/public/mtc-vault/{object_path}"
    except Exception:
        pass
    return None


def upload_bytes_to_cloudinary(file_name: str, file_bytes: bytes, sub_folder: str = "mtcs") -> Dict[str, Any]:
    """Server-side signed upload to Cloudinary so API secrets never leak to browser JS."""
    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        return {"success": False, "error": "Cloudinary server credentials not configured."}

    clean = "".join(c if c.isalnum() or c in "._-" else "_" for c in file_name)
    target_folder = f"{CLOUDINARY_FOLDER}/{sub_folder}"
    timestamp = int(time.time())
    to_sign = f"folder={target_folder}&timestamp={timestamp}{CLOUDINARY_API_SECRET}"
    signature = hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

    endpoint = f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/raw/upload"
    data = {
        "api_key": CLOUDINARY_API_KEY,
        "timestamp": str(timestamp),
        "folder": target_folder,
        "signature": signature,
    }
    files = {"file": (clean, file_bytes)}
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(endpoint, data=data, files=files)
            body = resp.json()
            if resp.status_code < 400 and not body.get("error"):
                return {
                    "success": True,
                    "url": body.get("secure_url") or body.get("url"),
                    "public_id": body.get("public_id"),
                    "bytes": body.get("bytes"),
                }
            # Fallback to auto endpoint
            auto_ep = f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/auto/upload"
            resp2 = client.post(auto_ep, data=data, files=files)
            body2 = resp2.json()
            if resp2.status_code < 400 and not body2.get("error"):
                return {
                    "success": True,
                    "url": body2.get("secure_url") or body2.get("url"),
                    "public_id": body2.get("public_id"),
                    "bytes": body2.get("bytes"),
                }
            return {"success": False, "error": body.get("error", {}).get("message") or "Cloudinary upload failed"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
