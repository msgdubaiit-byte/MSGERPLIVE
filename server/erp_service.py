import json
import random
import re
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from .auth import DEFAULT_ROLE_MODULES, hash_password, is_it_data_masked, mask_commercial_bootstrap_for_it, sanitize_user
from .database import db_read, db_transaction, now_iso, now_stamp, parse_json_col, today_date


def _uid(prefix: str) -> str:
    return f"{prefix}-{int(time.time() * 1000)}-{random.randint(100, 999)}"


def _log_audit(conn, user_email: str, action: str, module: str, record_id: str, prev: Any = None, nxt: Any = None, reason: Optional[str] = None) -> None:
    conn.execute(
        """
        INSERT INTO audit_logs (id, user_id, user_email, action, module, record_id, previous_values, new_values, timestamp, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            _uid("AUD"),
            user_email,
            user_email,
            action,
            module,
            record_id,
            json.dumps(prev) if prev is not None else None,
            json.dumps(nxt) if nxt is not None else None,
            now_stamp(),
            reason,
        ),
    )


def _format_system_config(row: Optional[Any]) -> Dict[str, Any]:
    if not row:
        return {
            "companyName": "MSG OILFIELD EQUIPMENT TRADING LLC",
            "trnNumber": "100293847500003",
            "defaultCurrency": "AED",
            "companyAddress": "Industrial Area 2, Al Qusais, P.O. Box 92831, Dubai, United Arab Emirates",
            "contactEmail": "sales@msgoilfield.ae",
            "contactPhone": "+971 4 288 1234",
            "themePrimaryColor": "#0B2545",
            "mtcStampText": "CERTIFIED TRUE COPY OF ORIGINAL / MSG QA/QC APPROVED",
            "mtcStampColor": "#D32F2F",
            "mtcStampScale": 100,
            "mtcStampOffsetX": 0,
            "mtcStampOffsetY": 0,
            "mtcInspectorName": "QA/QC Lead Inspector",
            "inspectorDesignation": "Senior QA/QC Materials Inspector",
            "inspectorSignName": "MSG/QC-04",
            "customSealDataUrl": "",
            "customSignatureDataUrl": "",
            "sealShape": "rectangular",
            "sealBorderWidth": 2,
            "showMachinedTag": True,
            "defaultWeightSafetyBuffer": 15,
            "ciplInvoicePrefix": "CIPL-INV-",
            "qrStickerFormat": "thermal_4x6",
            "enableAuditLogging": True,
            "sessionTimeoutMinutes": 60,
            "dataPrivacyMaskingForIT": True,
        }
    r = dict(row)
    return {
        "companyName": r["company_name"],
        "trnNumber": r["trn_number"],
        "defaultCurrency": r["default_currency"],
        "companyAddress": r["company_address"],
        "contactEmail": r["contact_email"],
        "contactPhone": r["contact_phone"],
        "themePrimaryColor": r["theme_primary_color"],
        "mtcStampText": r["mtc_stamp_text"],
        "mtcStampColor": r["mtc_stamp_color"],
        "mtcStampScale": r["mtc_stamp_scale"],
        "mtcStampOffsetX": r["mtc_stamp_offset_x"],
        "mtcStampOffsetY": r["mtc_stamp_offset_y"],
        "mtcInspectorName": r["mtc_inspector_name"],
        "inspectorDesignation": r["inspector_designation"],
        "inspectorSignName": r["inspector_sign_name"],
        "customSealDataUrl": r["custom_seal_data_url"] or "",
        "customSignatureDataUrl": r["custom_signature_data_url"] or "",
        "sealShape": r["seal_shape"] or "rectangular",
        "sealBorderWidth": r["seal_border_width"],
        "showMachinedTag": bool(r["show_machined_tag"]),
        "defaultWeightSafetyBuffer": r["default_weight_safety_buffer"],
        "ciplInvoicePrefix": r["cipl_invoice_prefix"],
        "qrStickerFormat": r["qr_sticker_format"],
        "enableAuditLogging": bool(r["enable_audit_logging"]),
        "sessionTimeoutMinutes": r["session_timeout_minutes"],
        "dataPrivacyMaskingForIT": bool(r["data_privacy_masking_for_it"]),
    }


def _format_order(row: Any) -> Dict[str, Any]:
    r = dict(row)
    return {
        "id": r["id"],
        "so_number": r["so_number"],
        "po_number": r["po_number"],
        "msg_ref": r.get("msg_ref") or "",
        "bapco_transmittal": r.get("bapco_transmittal") or "",
        "customer_id": r["customer_id"],
        "customer_name": r["customer_name"],
        "order_date": r["order_date"],
        "required_delivery_date": r["required_delivery_date"],
        "status": r["status"],
        "order_type": r.get("order_type") or "regular",
        "purchase_type": r.get("purchase_type") or "regular",
        "created_by": r["created_by"],
        "approved_by": r.get("approved_by"),
        "cancellation_date": r.get("cancellation_date"),
        "cancellation_reason": r.get("cancellation_reason"),
        "store_remarks": r.get("store_remarks"),
        "mtc_package_generated": bool(r.get("mtc_package_generated")),
        "mtc_package_url": r.get("mtc_package_url"),
        "po_document_name": r.get("po_document_name"),
        "po_document_url": r.get("po_document_url"),
        "created_at": r.get("created_at") or "",
        "updated_at": r.get("updated_at") or "",
        "items": parse_json_col(r.get("items_json"), None) or parse_json_col(r.get("items"), []),
        "allocations": parse_json_col(r.get("allocations_json"), None) or parse_json_col(r.get("allocations"), []),
    }


def _reconcile_order_state(order: Dict[str, Any]) -> None:
    if order["status"] in ("Cancelled", "Dispatched"):
        return
    items = order.get("items", [])
    allocs = order.get("allocations", [])
    for it in items:
        line_allocs = [
            a for a in allocs
            if (a.get("sales_order_item_id") == it["id"] or a.get("so_item_id") == it["id"])
            and a.get("allocation_status") != "Released"
        ]
        total_alloc = sum(int(a.get("allocated_qty") or 0) for a in line_allocs)
        it["allocated_qty"] = total_alloc
        req = int(it.get("required_qty") or 0)
        disp = int(it.get("dispatched_qty") or 0)
        if disp >= req and req > 0:
            it["line_status"] = "Dispatched"
        elif total_alloc >= req and req > 0:
            it["line_status"] = "Allocated"
        else:
            it["line_status"] = "Pending"
    all_alloc = len(items) > 0 and all(int(it.get("allocated_qty") or 0) >= int(it.get("required_qty") or 0) for it in items)
    if all_alloc and order["status"] == "Draft":
        order["status"] = "Stock Allocated"
    elif not all_alloc and order["status"] == "Stock Allocated":
        order["status"] = "Draft"


def get_bootstrap_data(current_user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    with db_read() as conn:
        cfg_row = conn.execute("SELECT * FROM system_config WHERE id='SYSTEM_CONFIG_MAIN'").fetchone()
        suppliers = [dict(r) for r in conn.execute("SELECT * FROM suppliers ORDER BY id").fetchall()]
        customers = [dict(r) for r in conn.execute("SELECT * FROM customers ORDER BY id").fetchall()]
        items = [
            {**dict(r), "is_active": bool(r["is_active"])}
            for r in conn.execute("SELECT * FROM items ORDER BY item_code").fetchall()
        ]
        lots = [dict(r) for r in conn.execute("SELECT * FROM stock_lots ORDER BY created_at DESC").fetchall()]
        balances = [dict(r) for r in conn.execute("SELECT * FROM stock_balances").fetchall()]
        orders = [_format_order(r) for r in conn.execute("SELECT * FROM sales_orders ORDER BY created_at DESC").fetchall()]
        mtcs = [dict(r) for r in conn.execute("SELECT * FROM mtc_certificates ORDER BY created_at DESC").fetchall()]
        local_purchases = [
            {**dict(r), "supplier_mtc_uploaded": bool(r["supplier_mtc_uploaded"])}
            for r in conn.execute("SELECT * FROM local_purchases ORDER BY created_at DESC").fetchall()
        ]
        movements = [dict(r) for r in conn.execute("SELECT * FROM stock_movements ORDER BY id DESC").fetchall()]
        approvals = [dict(r) for r in conn.execute("SELECT * FROM approval_records ORDER BY created_at DESC").fetchall()]
        dispatches = [
            {
                **{k: v for k, v in dict(r).items() if k != "items_summary_json"},
                "items_summary": parse_json_col(r.get("items_summary_json"), None) or parse_json_col(r.get("items_summary"), []),
            }
            for r in conn.execute("SELECT * FROM dispatch_records ORDER BY created_at DESC").fetchall()
        ]
        returns = [dict(r) for r in conn.execute("SELECT * FROM stock_returns ORDER BY created_at DESC").fetchall()]
        adjustments = [dict(r) for r in conn.execute("SELECT * FROM stock_adjustments ORDER BY created_at DESC").fetchall()]
        audits = [dict(r) for r in conn.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1000").fetchall()]
        import_jobs = [dict(r) for r in conn.execute("SELECT * FROM excel_import_jobs ORDER BY id DESC").fetchall()]
        users = [sanitize_user(dict(r)) for r in conn.execute("SELECT * FROM user_profiles ORDER BY id").fetchall()]

        perm_rows = conn.execute("SELECT * FROM custom_permissions").fetchall()
        custom_permissions = {r["target_key"]: parse_json_col(r["allowed_modules_json"], []) for r in perm_rows if parse_json_col(r["allowed_modules_json"], [])}
        granular_permissions = {r["target_key"]: parse_json_col(r["granular_features_json"], []) for r in perm_rows if parse_json_col(r["granular_features_json"], [])}

        sourcing_drafts = [parse_json_col(r["payload_json"], {}) for r in conn.execute("SELECT payload_json FROM sourcing_drafts ORDER BY saved_at DESC").fetchall()]
        loc_drafts = [parse_json_col(r["payload_json"], {}) for r in conn.execute("SELECT payload_json FROM loc_drafts ORDER BY timestamp DESC").fetchall()]

        active_order_id = ""
        if current_user:
            pref = conn.execute(
                "SELECT pref_value FROM user_preferences WHERE user_id = ? AND pref_key = 'active_so_id'",
                (current_user["id"],),
            ).fetchone()
            if pref:
                active_order_id = pref["pref_value"]

        payload = {
            "systemConfig": _format_system_config(cfg_row),
            "suppliers": suppliers,
            "customers": customers,
            "items": items,
            "lots": lots,
            "balances": balances,
            "orders": orders,
            "mtcs": mtcs,
            "localPurchases": local_purchases,
            "movements": movements,
            "approvals": approvals,
            "dispatches": dispatches,
            "returns": returns,
            "adjustments": adjustments,
            "audits": audits,
            "importJobs": import_jobs,
            "users": users,
            "customPermissions": custom_permissions,
            "granularPermissions": granular_permissions,
            "sourcingDrafts": sourcing_drafts,
            "locDrafts": loc_drafts,
            "activeOrderId": active_order_id,
        }

        if is_it_data_masked(current_user, conn):
            return mask_commercial_bootstrap_for_it(payload)
        return payload


# ------------------------------------------------------------------
# SALES ORDERS & ALLOCATIONS (ACID TRANSACTIONS)
# ------------------------------------------------------------------

def create_sales_order(data: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        cust_id = data.get("customer_id") or "CUST-MANUAL"
        cust_name = (data.get("customer_name") or "").strip()
        if not cust_name and cust_id:
            crow = conn.execute("SELECT customer_name FROM customers WHERE id = ?", (cust_id,)).fetchone()
            if crow:
                cust_name = crow["customer_name"]
        if not cust_name:
            cust_name = "External Customer"

        # Auto-register new customer if unknown
        existing_cust = conn.execute(
            "SELECT id, customer_name FROM customers WHERE id = ? OR lower(customer_name) = ?",
            (cust_id, cust_name.lower()),
        ).fetchone()
        if existing_cust:
            cust_id = existing_cust["id"]
            cust_name = existing_cust["customer_name"]
        else:
            cust_id = f"CUST-{int(time.time() * 1000)}"
            code = re.sub(r"[^A-Z0-9]", "", cust_name.upper())[:12] or "CLIENT"
            cust_code = f"{code}-{random.randint(10, 9999)}"
            while conn.execute("SELECT 1 FROM customers WHERE customer_code = ?", (cust_code,)).fetchone():
                cust_code = f"{code}-{random.randint(100, 99999)}"
            conn.execute(
                """
                INSERT INTO customers (id, customer_code, customer_name, address, contact_details, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)
                """,
                (cust_id, cust_code, cust_name, "UAE / International", "", today_date(), now_iso()),
            )

        so_id = data.get("id") or _uid("SO")
        if conn.execute("SELECT 1 FROM sales_orders WHERE id = ?", (so_id,)).fetchone():
            so_id = _uid("SO")
        count = conn.execute("SELECT COUNT(*) FROM sales_orders").fetchone()[0]
        so_number = (data.get("so_number") or "").strip() or f"SO-2026-{str(1000 + count + 1)}"
        # Guarantee unique so_number
        while conn.execute("SELECT 1 FROM sales_orders WHERE so_number = ?", (so_number,)).fetchone():
            so_number = f"{so_number}-{random.randint(10, 99)}"

        po_number = (data.get("po_number") or "").strip() or f"PO-{random.randint(1000, 9999)}"
        order_type = data.get("order_type") or data.get("purchase_type") or "regular"
        raw_items = data.get("items") or []

        order_items: List[Dict[str, Any]] = []
        allocations: List[Dict[str, Any]] = []
        local_purchases_created: List[Dict[str, Any]] = []

        for idx, line in enumerate(raw_items):
            item_code = (line.get("item_code") or f"ITEM-{idx + 1}").strip().upper()
            item_desc = (line.get("item_description") or item_code).strip()
            req_qty = max(1, int(float(line.get("required_qty") or 1)))
            unit_price = float(line.get("unit_price") or 0)
            uom = (line.get("uom") or "PCS").strip()
            line_id = line.get("id") or _uid(f"SOI-{idx + 1}")

            # Ensure item exists in catalog
            item_row = conn.execute(
                "SELECT * FROM items WHERE id = ? OR upper(item_code) = ?",
                (line.get("item_id") or "", item_code),
            ).fetchone()
            item_id = item_row["id"] if item_row else ""
            if not item_id:
                item_id = _uid("ITM")
                conn.execute(
                    """
                    INSERT INTO items (id, item_code, item_description, material_grade, specification, size, uom, unit_price_aed, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, '', '', '', ?, ?, TRUE, ?, ?)
                    ON CONFLICT (item_code) DO NOTHING
                    """,
                    (item_id, item_code, item_desc, uom, unit_price, today_date(), now_iso()),
                )

            heat_no = (line.get("heat_number") or "").strip()
            is_local = bool(line.get("is_local")) or order_type == "local_purchase" or line.get("purchase_type") == "local_purchase"
            l_code = (line.get("l_code") or "").strip() or (f"L-{so_number}-{idx + 1}" if is_local else None)
            supplier_name = (line.get("supplier_name") or "").strip() or ("LOCAL UAE SUPPLIER" if is_local else "MSG Stock")

            # If local purchase line, create lot + balance + local_purchase record automatically
            allocated_qty = 0
            if is_local and l_code:
                lot_id = _uid("LOT")
                final_heat = heat_no or l_code
                conn.execute(
                    """
                    INSERT INTO stock_lots (id, item_id, item_code, item_description, heat_number, yom, original_qty, received_qty, purchase_type, supplier_name, l_code, stock_receipt_date, warehouse_location, mtc_ref, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local_purchase', ?, ?, ?, 'LOCAL-LP-BAY', ?, ?, ?)
                    """,
                    (lot_id, item_id, item_code, item_desc, final_heat, 2026, req_qty, req_qty, supplier_name, l_code, today_date(), line.get("certificate_number") or "", now_iso(), now_iso()),
                )
                conn.execute(
                    """
                    INSERT INTO stock_balances (id, stock_lot_id, physical_qty, reserved_qty, available_qty, dispatched_qty, updated_at)
                    VALUES (?, ?, ?, ?, 0, 0, ?)
                    """,
                    (_uid("BAL"), lot_id, req_qty, req_qty, now_iso()),
                )
                lp_id = _uid("LP")
                conn.execute(
                    """
                    INSERT INTO local_purchases (id, l_code, item_id, item_code, stock_lot_id, supplier_name, purchase_reference, purchase_date, received_qty, yom, supplier_mtc_uploaded, created_by, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 2026, FALSE, ?, ?, ?)
                    ON CONFLICT (l_code) DO NOTHING
                    """,
                    (lp_id, l_code, item_id, item_code, lot_id, supplier_name, f"{po_number} ({so_number})", today_date(), req_qty, user_email, now_iso(), now_iso()),
                )
                alloc_id = _uid("ALC")
                allocations.append({
                    "id": alloc_id,
                    "sales_order_item_id": line_id,
                    "sales_order_id": so_id,
                    "stock_lot_id": lot_id,
                    "heat_number": final_heat,
                    "allocated_qty": req_qty,
                    "item_code": item_code,
                    "so_item_id": line_id,
                    "released_qty": 0,
                    "dispatched_qty": 0,
                    "allocation_status": "Allocated",
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                })
                allocated_qty = req_qty
                local_purchases_created.append(l_code)

            order_items.append({
                "id": line_id,
                "sales_order_id": so_id,
                "item_id": item_id,
                "item_code": item_code,
                "item_description": item_desc,
                "heat_number": heat_no,
                "certificate_number": line.get("certificate_number") or "",
                "make": line.get("make") or "",
                "location": line.get("location") or "",
                "remarks": line.get("remarks") or "",
                "client_po_item_no": line.get("client_po_item_no") or str(idx + 1),
                "position": line.get("position") or (idx + 1),
                "supplier_name": supplier_name,
                "supplier_po_number": line.get("supplier_po_number") or "",
                "package_type": line.get("package_type") or "",
                "package_no": line.get("package_no") or "",
                "split_qty": line.get("split_qty") or "",
                "total_qty": line.get("total_qty") or req_qty,
                "group_id": line.get("group_id") or "",
                "required_qty": req_qty,
                "allocated_qty": allocated_qty,
                "dispatched_qty": 0,
                "uom": uom,
                "line_status": "Allocated" if allocated_qty >= req_qty else "Pending",
                "hs_code": line.get("hs_code") or "",
                "country_of_origin": line.get("country_of_origin") or "",
                "unit_price": unit_price,
                "purchase_type": "local_purchase" if is_local else "regular",
                "is_local": is_local,
                "l_code": l_code,
            })

        status = "Stock Allocated" if order_items and all(i["allocated_qty"] >= i["required_qty"] for i in order_items) else "Draft"
        order_date = data.get("order_date") or today_date()
        req_deliv = data.get("required_delivery_date") or today_date()

        conn.execute(
            """
            INSERT INTO sales_orders (
                id, so_number, po_number, msg_ref, bapco_transmittal, customer_id, customer_name,
                order_date, required_delivery_date, status, order_type, purchase_type,
                created_by, po_document_name, po_document_url, items_json, allocations_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                so_id, so_number, po_number, data.get("msg_ref") or "", data.get("bapco_transmittal") or "",
                cust_id, cust_name, order_date, req_deliv, status, order_type, order_type,
                user_email, data.get("po_document_name"), data.get("po_document_url"),
                json.dumps(order_items), json.dumps(allocations), now_iso(), now_iso(),
            ),
        )
        _log_audit(conn, user_email, "Create Sales Order", "Sales Orders", so_number, None, {"po_number": po_number, "lines": len(order_items), "l_codes": local_purchases_created})
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (so_id,)).fetchone()
        return {"success": True, "order": _format_order(row)}


def update_sales_order(updated: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        order_id = updated.get("id")
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            return {"success": False, "message": "Sales Order not found."}
        current = _format_order(row)
        new_items = updated.get("items") if updated.get("items") is not None else current["items"]
        new_allocs = updated.get("allocations") if updated.get("allocations") is not None else current["allocations"]

        current["items"] = new_items
        current["allocations"] = new_allocs
        for field in ("po_number", "customer_name", "msg_ref", "bapco_transmittal", "required_delivery_date", "status", "store_remarks", "po_document_name", "po_document_url"):
            if field in updated and updated[field] is not None:
                current[field] = updated[field]
        _reconcile_order_state(current)

        conn.execute(
            """
            UPDATE sales_orders SET
                po_number=?, customer_name=?, msg_ref=?, bapco_transmittal=?,
                required_delivery_date=?, status=?, store_remarks=?,
                po_document_name=?, po_document_url=?,
                items_json=?, allocations_json=?, updated_at=?
            WHERE id=?
            """,
            (
                current["po_number"], current["customer_name"], current["msg_ref"], current["bapco_transmittal"],
                current["required_delivery_date"], current["status"], current.get("store_remarks"),
                current.get("po_document_name"), current.get("po_document_url"),
                json.dumps(current["items"]), json.dumps(current["allocations"]), now_iso(), order_id,
            ),
        )
        _log_audit(conn, user_email, "Update Sales Order", "Sales Orders", current["so_number"], None, {"items": len(current["items"])})
        return {"success": True, "order": current}


def allocate_fifo(order_id: str, line_id: str, required_qty: int, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            return {"success": False, "message": "Order not found"}
        order = _format_order(row)
        order_item = next((i for i in order["items"] if i["id"] == line_id or i.get("item_id") == line_id), None)
        if not order_item:
            return {"success": False, "message": "Order line not found"}

        item_code = (order_item.get("item_code") or "").strip().upper()
        item_id = order_item.get("item_id") or ""

        lots = conn.execute(
            """
            SELECT l.*, b.id AS bal_id, b.physical_qty, b.reserved_qty, b.available_qty, b.dispatched_qty
            FROM stock_lots l
            JOIN stock_balances b ON b.stock_lot_id = l.id
            WHERE (l.item_id = ? OR upper(trim(l.item_code)) = ?) AND b.available_qty > 0
            ORDER BY l.stock_receipt_date ASC, COALESCE(l.yom, 2024) ASC, l.id ASC
            """,
            (item_id, item_code),
        ).fetchall()

        total_avail = sum(r["available_qty"] for r in lots)
        if total_avail < required_qty:
            return {
                "success": False,
                "message": f"Insufficient stock for {order_item.get('item_code')}. Required: {required_qty} PCS, Total Available: {total_avail} PCS.",
            }

        remaining = required_qty
        allocated_lots: List[Dict[str, Any]] = []
        for lot in lots:
            if remaining <= 0:
                break
            take = min(remaining, int(lot["available_qty"]))
            prev_avail = int(lot["available_qty"])
            new_avail = prev_avail - take
            new_res = int(lot["reserved_qty"]) + take

            conn.execute(
                "UPDATE stock_balances SET reserved_qty = ?, available_qty = ?, updated_at = ? WHERE id = ?",
                (new_res, new_avail, now_iso(), lot["bal_id"]),
            )
            order["allocations"].append({
                "id": _uid("ALC"),
                "sales_order_item_id": order_item["id"],
                "sales_order_id": order["id"],
                "stock_lot_id": lot["id"],
                "heat_number": lot["heat_number"],
                "allocated_qty": take,
                "released_qty": 0,
                "dispatched_qty": 0,
                "allocation_status": "Allocated",
                "created_at": now_iso(),
                "updated_at": now_iso(),
            })
            conn.execute(
                """
                INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
                VALUES (?, ?, ?, ?, 'Reservation', ?, 'SalesOrder', ?, ?, ?, ?, ?, ?)
                """,
                (
                    _uid("MOV"), lot["id"], order_item["item_code"], lot["heat_number"], take,
                    order["so_number"], prev_avail, new_avail, user_email, now_stamp(),
                    f"FIFO Allocated {take} PCS to {order['so_number']}",
                ),
            )
            allocated_lots.append({"heat_number": lot["heat_number"], "qty": take, "yom": lot["yom"], "lot_id": lot["id"]})
            remaining -= take

        order_item["allocated_qty"] = int(order_item.get("allocated_qty") or 0) + required_qty
        if allocated_lots:
            order_item["heat_number"] = allocated_lots[0]["heat_number"]
        _reconcile_order_state(order)

        conn.execute(
            "UPDATE sales_orders SET status=?, items_json=?, allocations_json=?, updated_at=? WHERE id=?",
            (order["status"], json.dumps(order["items"]), json.dumps(order["allocations"]), now_iso(), order_id),
        )
        _log_audit(conn, user_email, "FIFO Heat Allocation", "Sales Orders", order["so_number"], None, {"item": order_item["item_code"], "allocated": allocated_lots})
        return {"success": True, "message": f"Successfully FIFO allocated {required_qty} PCS across {len(allocated_lots)} lot(s).", "allocatedLots": allocated_lots}


def allocate_manual(order_id: str, line_id: str, stock_lot_id: str, required_qty: int, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            return {"success": False, "message": "Order not found"}
        order = _format_order(row)
        order_item = next((i for i in order["items"] if i["id"] == line_id or i.get("item_id") == line_id), None)
        if not order_item:
            return {"success": False, "message": "Order line not found"}

        lot = conn.execute(
            """
            SELECT l.*, b.id AS bal_id, b.reserved_qty, b.available_qty
            FROM stock_lots l JOIN stock_balances b ON b.stock_lot_id = l.id
            WHERE l.id = ?
            """,
            (stock_lot_id,),
        ).fetchone()
        if not lot:
            return {"success": False, "message": "Stock lot not found"}
        avail = int(lot["available_qty"])
        if avail < required_qty:
            return {"success": False, "message": f"Insufficient available stock in Heat {lot['heat_number']}. Available: {avail}, Requested: {required_qty}."}

        new_avail = avail - required_qty
        new_res = int(lot["reserved_qty"]) + required_qty
        conn.execute("UPDATE stock_balances SET reserved_qty=?, available_qty=?, updated_at=? WHERE id=?", (new_res, new_avail, now_iso(), lot["bal_id"]))

        order["allocations"].append({
            "id": _uid("ALC"),
            "sales_order_item_id": order_item["id"],
            "sales_order_id": order["id"],
            "stock_lot_id": lot["id"],
            "heat_number": lot["heat_number"],
            "allocated_qty": required_qty,
            "released_qty": 0,
            "dispatched_qty": 0,
            "allocation_status": "Allocated",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
        conn.execute(
            """
            INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
            VALUES (?, ?, ?, ?, 'Reservation', ?, 'SalesOrder', ?, ?, ?, ?, ?, ?)
            """,
            (_uid("MOV"), lot["id"], order_item["item_code"], lot["heat_number"], required_qty, order["so_number"], avail, new_avail, user_email, now_stamp(), f"Manual Heat Allocation for {order['so_number']} (Heat {lot['heat_number']})"),
        )
        order_item["allocated_qty"] = int(order_item.get("allocated_qty") or 0) + required_qty
        order_item["heat_number"] = lot["heat_number"]
        _reconcile_order_state(order)

        conn.execute(
            "UPDATE sales_orders SET status=?, items_json=?, allocations_json=?, updated_at=? WHERE id=?",
            (order["status"], json.dumps(order["items"]), json.dumps(order["allocations"]), now_iso(), order_id),
        )
        _log_audit(conn, user_email, "Manual Heat Allocation", "Sales Orders", order["so_number"], None, {"heat_number": lot["heat_number"], "qty": required_qty})
        return {"success": True, "message": f"Allocated {required_qty} PCS from Heat {lot['heat_number']} (YOM {lot['yom']})."}


def deallocate_line(order_id: str, line_id: str, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            return {"success": False, "message": "Order not found"}
        order = _format_order(row)
        order_item = next((i for i in order["items"] if i["id"] == line_id or i.get("item_id") == line_id), None)
        if not order_item:
            return {"success": False, "message": "Line not found"}

        released_total = 0
        for alloc in order["allocations"]:
            if (alloc.get("sales_order_item_id") == order_item["id"] or alloc.get("so_item_id") == order_item["id"]) and alloc.get("allocation_status") == "Allocated":
                qty_to_rel = int(alloc.get("allocated_qty") or 0) - int(alloc.get("dispatched_qty") or 0)
                if qty_to_rel > 0:
                    bal = conn.execute("SELECT * FROM stock_balances WHERE stock_lot_id = ?", (alloc["stock_lot_id"],)).fetchone()
                    if bal:
                        prev_av = int(bal["available_qty"])
                        new_av = prev_av + qty_to_rel
                        new_res = max(0, int(bal["reserved_qty"]) - qty_to_rel)
                        conn.execute("UPDATE stock_balances SET reserved_qty=?, available_qty=?, updated_at=? WHERE id=?", (new_res, new_av, now_iso(), bal["id"]))
                        conn.execute(
                            """
                            INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
                            VALUES (?, ?, ?, ?, 'Reservation Release', ?, 'SalesOrder', ?, ?, ?, ?, ?, ?)
                            """,
                            (_uid("MOV"), alloc["stock_lot_id"], order_item["item_code"], alloc["heat_number"], qty_to_rel, order["so_number"], prev_av, new_av, user_email, now_stamp(), f"Deallocated {qty_to_rel} PCS from {order['so_number']}"),
                        )
                    alloc["released_qty"] = qty_to_rel
                    alloc["allocation_status"] = "Released"
                    alloc["updated_at"] = now_iso()
                    released_total += qty_to_rel

        order_item["allocated_qty"] = 0
        order_item["line_status"] = "Pending"
        _reconcile_order_state(order)
        conn.execute(
            "UPDATE sales_orders SET status=?, items_json=?, allocations_json=?, updated_at=? WHERE id=?",
            (order["status"], json.dumps(order["items"]), json.dumps(order["allocations"]), now_iso(), order_id),
        )
        _log_audit(conn, user_email, "Line Deallocation", "Sales Orders", order["so_number"], None, {"line": order_item["item_code"], "released": released_total})
        return {"success": True, "message": f"Released {released_total} PCS back to available stock."}


def submit_for_approval(order_id: str, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            return {"success": False, "message": "Order not found"}
        order = _format_order(row)
        if not order["allocations"]:
            return {"success": False, "message": "Cannot submit order with zero allocated stock."}
        conn.execute("UPDATE sales_orders SET status='Pending Storekeeper Approval', updated_at=? WHERE id=?", (now_iso(), order_id))
        _log_audit(conn, user_email, "Submit for Storekeeper Approval", "Sales Orders", order["so_number"], {"status": order["status"]}, {"status": "Pending Storekeeper Approval"})
        return {"success": True, "message": f"Order {order['so_number']} submitted to Storekeeper for physical verification."}


def storekeeper_approve(order_id: str, approver_name: str, status: str, remarks: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            return {"success": False, "message": "Order not found"}
        order = _format_order(row)

        if status == "Approved":
            order["status"] = "Approved"
            order["approved_by"] = approver_name
            order["store_remarks"] = remarks
            for it in order["items"]:
                if it.get("line_status") == "Allocated":
                    it["line_status"] = "Approved"
        elif status == "Correction Requested":
            order["status"] = "Stock Allocated"
            order["store_remarks"] = f"CORRECTION REQUESTED: {remarks}"
        elif status == "Rejected":
            order["status"] = "Cancelled"
            order["store_remarks"] = f"REJECTED BY STOREKEEPER: {remarks}"
            for alloc in order["allocations"]:
                if alloc.get("allocation_status") == "Allocated":
                    rem = int(alloc.get("allocated_qty") or 0) - int(alloc.get("dispatched_qty") or 0)
                    if rem > 0:
                        bal = conn.execute("SELECT * FROM stock_balances WHERE stock_lot_id = ?", (alloc["stock_lot_id"],)).fetchone()
                        if bal:
                            prev_av = int(bal["available_qty"])
                            new_av = prev_av + rem
                            new_res = max(0, int(bal["reserved_qty"]) - rem)
                            conn.execute("UPDATE stock_balances SET reserved_qty=?, available_qty=?, updated_at=? WHERE id=?", (new_res, new_av, now_iso(), bal["id"]))
                            conn.execute(
                                """
                                INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
                                VALUES (?, ?, ?, ?, 'Reservation Release', ?, 'StorekeeperRejection', ?, ?, ?, ?, ?, ?)
                                """,
                                (_uid("MOV"), alloc["stock_lot_id"], alloc.get("item_code") or "STOCK", alloc["heat_number"], rem, order["so_number"], prev_av, new_av, approver_name, now_stamp(), f"Released upon rejection: {remarks}"),
                            )
                    alloc["allocation_status"] = "Released"
                    alloc["released_qty"] = int(alloc.get("allocated_qty") or 0)

        conn.execute(
            """
            INSERT INTO approval_records (id, sales_order_id, so_number, approval_type, approval_status, approved_by, approval_date, rejection_reason, remarks, created_at)
            VALUES (?, ?, ?, 'Storekeeper Physical Verification', ?, ?, ?, ?, ?, ?)
            """,
            (_uid("APR"), order["id"], order["so_number"], status, approver_name, now_stamp(), remarks if status != "Approved" else None, remarks, now_iso()),
        )
        conn.execute(
            "UPDATE sales_orders SET status=?, approved_by=?, store_remarks=?, items_json=?, allocations_json=?, updated_at=? WHERE id=?",
            (order["status"], order.get("approved_by"), order.get("store_remarks"), json.dumps(order["items"]), json.dumps(order["allocations"]), now_iso(), order_id),
        )
        _log_audit(conn, approver_name, f"Storekeeper {status}", "Storekeeper Approvals", order["so_number"], None, {"status": order["status"]}, remarks)
        return {"success": True, "message": f"Sales Order {order['so_number']} updated to {order['status']}."}


def cancel_sales_order(order_id: str, reason: str, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            return {"success": False, "message": "Order not found"}
        order = _format_order(row)
        if order["status"] == "Cancelled":
            return {"success": False, "message": "Order is already cancelled."}
        if order["status"] == "Dispatched":
            return {"success": False, "message": "Cannot cancel a fully dispatched order. Use Customer Return workflow."}

        total_released = 0
        total_already_dispatched = 0
        for alloc in order["allocations"]:
            if alloc.get("allocation_status") in ("Allocated", "Released"):
                dispatched_qty = int(alloc.get("dispatched_qty") or 0)
                total_already_dispatched += dispatched_qty
                un_dispatched = int(alloc.get("allocated_qty") or 0) - dispatched_qty
                if un_dispatched > 0 and alloc.get("allocation_status") == "Allocated":
                    bal = conn.execute("SELECT * FROM stock_balances WHERE stock_lot_id = ?", (alloc["stock_lot_id"],)).fetchone()
                    if bal:
                        prev_av = int(bal["available_qty"])
                        new_av = prev_av + un_dispatched
                        new_res = max(0, int(bal["reserved_qty"]) - un_dispatched)
                        conn.execute("UPDATE stock_balances SET reserved_qty=?, available_qty=?, updated_at=? WHERE id=?", (new_res, new_av, now_iso(), bal["id"]))
                        lot = conn.execute("SELECT item_code FROM stock_lots WHERE id = ?", (alloc["stock_lot_id"],)).fetchone()
                        conn.execute(
                            """
                            INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
                            VALUES (?, ?, ?, ?, 'Reservation Release', ?, 'SalesOrderCancellation', ?, ?, ?, ?, ?, ?)
                            """,
                            (_uid("MOV"), alloc["stock_lot_id"], lot["item_code"] if lot else "STOCK", alloc["heat_number"], un_dispatched, order["so_number"], prev_av, new_av, user_email, now_stamp(), f"Order Cancelled ({reason}). Restored {un_dispatched} PCS."),
                        )
                    alloc["released_qty"] = un_dispatched
                    alloc["allocation_status"] = "Released"
                    alloc["updated_at"] = now_iso()
                    total_released += un_dispatched

        for it in order["items"]:
            it["line_status"] = "Cancelled"
        order["status"] = "Cancelled"
        order["cancellation_date"] = now_stamp()
        order["cancellation_reason"] = reason

        conn.execute(
            "UPDATE sales_orders SET status='Cancelled', cancellation_date=?, cancellation_reason=?, items_json=?, allocations_json=?, updated_at=? WHERE id=?",
            (order["cancellation_date"], reason, json.dumps(order["items"]), json.dumps(order["allocations"]), now_iso(), order_id),
        )
        _log_audit(conn, user_email, "Cancel Sales Order", "Sales Orders", order["so_number"], None, {"released": total_released, "already_dispatched": total_already_dispatched}, reason)
        return {
            "success": True,
            "message": f"Order {order['so_number']} cancelled. Released {total_released} un-dispatched PCS back to available stock.",
        }


def confirm_dispatch(order_id: str, dispatch_items: List[Dict[str, Any]], delivery_note: str, dispatch_ref: str, user_email: str, remarks: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            return {"success": False, "message": "Order not found"}
        order = _format_order(row)
        if order["status"] not in ("Approved", "MTC Generated", "Partially Dispatched"):
            return {"success": False, "message": "Order must be Approved by Storekeeper before dispatch."}

        summary: List[Dict[str, Any]] = []
        total_dispatched_now = 0
        for d_item in dispatch_items:
            qty = int(d_item.get("dispatch_qty") or 0)
            if qty <= 0:
                continue
            alloc = next((a for a in order["allocations"] if a["id"] == d_item.get("allocation_id")), None)
            if not alloc:
                continue
            max_rem = int(alloc.get("allocated_qty") or 0) - int(alloc.get("dispatched_qty") or 0)
            actual = min(qty, max_rem)
            if actual <= 0:
                continue

            bal = conn.execute("SELECT * FROM stock_balances WHERE stock_lot_id = ?", (alloc["stock_lot_id"],)).fetchone()
            lot = conn.execute("SELECT item_code FROM stock_lots WHERE id = ?", (alloc["stock_lot_id"],)).fetchone()
            if bal:
                prev_phys = int(bal["physical_qty"])
                new_phys = max(0, prev_phys - actual)
                new_res = max(0, int(bal["reserved_qty"]) - actual)
                new_disp = int(bal["dispatched_qty"]) + actual
                new_avail = max(0, new_phys - new_res)
                conn.execute(
                    "UPDATE stock_balances SET physical_qty=?, reserved_qty=?, available_qty=?, dispatched_qty=?, updated_at=? WHERE id=?",
                    (new_phys, new_res, new_avail, new_disp, now_iso(), bal["id"]),
                )
                conn.execute(
                    """
                    INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
                    VALUES (?, ?, ?, ?, 'Dispatch', ?, 'DeliveryNote', ?, ?, ?, ?, ?, ?)
                    """,
                    (_uid("MOV"), alloc["stock_lot_id"], lot["item_code"] if lot else "STOCK", alloc["heat_number"], actual, delivery_note, prev_phys, new_phys, user_email, now_stamp(), f"Dispatched {actual} PCS for {order['so_number']} ({delivery_note})"),
                )

            alloc["dispatched_qty"] = int(alloc.get("dispatched_qty") or 0) + actual
            if alloc["dispatched_qty"] >= int(alloc.get("allocated_qty") or 0):
                alloc["allocation_status"] = "Dispatched"
            alloc["updated_at"] = now_iso()

            for oi in order["items"]:
                if oi["id"] == alloc.get("sales_order_item_id") or oi["id"] == alloc.get("so_item_id"):
                    oi["dispatched_qty"] = int(oi.get("dispatched_qty") or 0) + actual
                    if oi["dispatched_qty"] >= int(oi.get("required_qty") or 0):
                        oi["line_status"] = "Dispatched"

            summary.append({"item_code": lot["item_code"] if lot else "ITEM", "heat_number": alloc["heat_number"], "quantity": actual})
            total_dispatched_now += actual

        if total_dispatched_now == 0:
            return {"success": False, "message": "No valid quantities to dispatch."}

        all_disp = all(int(i.get("dispatched_qty") or 0) >= int(i.get("required_qty") or 0) for i in order["items"])
        order["status"] = "Dispatched" if all_disp else "Partially Dispatched"

        conn.execute(
            """
            INSERT INTO dispatch_records (id, sales_order_id, so_number, dispatch_reference, dispatch_date, delivery_note_number, customer_name, dispatched_by, delivery_remarks, items_summary_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (_uid("DSP"), order["id"], order["so_number"], dispatch_ref or delivery_note, today_date(), delivery_note, order["customer_name"], user_email, remarks, json.dumps(summary), now_iso()),
        )
        conn.execute(
            "UPDATE sales_orders SET status=?, items_json=?, allocations_json=?, updated_at=? WHERE id=?",
            (order["status"], json.dumps(order["items"]), json.dumps(order["allocations"]), now_iso(), order_id),
        )
        _log_audit(conn, user_email, "Confirm Dispatch", "Dispatch", delivery_note, None, {"so_number": order["so_number"], "dispatched": total_dispatched_now})
        return {"success": True, "message": f"Dispatched {total_dispatched_now} PCS under Delivery Note {delivery_note}. Order status: {order['status']}."}


def fast_dispatch_order(order_id: str, delivery_note: str, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            return {"success": False, "message": "Order not found"}
        order = _format_order(row)
        if order["status"] == "Dispatched":
            return {"success": False, "message": "Order has already been dispatched."}

        dn = (delivery_note or "").strip() or f"DN-FAST-{int(time.time()) % 100000}"
        total_pcs = 0
        summary: List[Dict[str, Any]] = []

        if order["allocations"]:
            for alloc in order["allocations"]:
                rem = int(alloc.get("allocated_qty") or 0) - int(alloc.get("dispatched_qty") or 0)
                if rem <= 0:
                    continue
                bal = conn.execute("SELECT * FROM stock_balances WHERE stock_lot_id = ?", (alloc["stock_lot_id"],)).fetchone()
                lot = conn.execute("SELECT item_code FROM stock_lots WHERE id = ?", (alloc["stock_lot_id"],)).fetchone()
                if bal:
                    prev_phys = int(bal["physical_qty"])
                    new_phys = max(0, prev_phys - rem)
                    new_res = max(0, int(bal["reserved_qty"]) - rem)
                    new_avail = max(0, new_phys - new_res)
                    conn.execute(
                        "UPDATE stock_balances SET physical_qty=?, reserved_qty=?, available_qty=?, dispatched_qty=dispatched_qty+?, updated_at=? WHERE id=?",
                        (new_phys, new_res, new_avail, rem, now_iso(), bal["id"]),
                    )
                    conn.execute(
                        """
                        INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
                        VALUES (?, ?, ?, ?, 'Dispatch', ?, 'DeliveryNote', ?, ?, ?, ?, ?, ?)
                        """,
                        (_uid("MOV"), alloc["stock_lot_id"], lot["item_code"] if lot else "STOCK", alloc["heat_number"], rem, dn, prev_phys, new_phys, user_email, now_stamp(), f"Fast-Track Dispatch: {rem} PCS ({dn})"),
                    )
                alloc["dispatched_qty"] = int(alloc.get("allocated_qty") or 0)
                alloc["allocation_status"] = "Dispatched"
                total_pcs += rem
                summary.append({"item_code": lot["item_code"] if lot else "ITEM", "heat_number": alloc["heat_number"], "quantity": rem})
            for it in order["items"]:
                it["dispatched_qty"] = it["required_qty"]
                it["line_status"] = "Dispatched"
        else:
            for it in order["items"]:
                qty = int(it.get("required_qty") or 0) - int(it.get("dispatched_qty") or 0)
                if qty <= 0:
                    continue
                lot = conn.execute(
                    "SELECT * FROM stock_lots WHERE (heat_number != '' AND upper(heat_number) = upper(?)) OR upper(item_code) = upper(?) LIMIT 1",
                    (it.get("heat_number") or "", it.get("item_code") or ""),
                ).fetchone()
                if lot:
                    bal = conn.execute("SELECT * FROM stock_balances WHERE stock_lot_id = ?", (lot["id"],)).fetchone()
                    if bal:
                        prev_phys = int(bal["physical_qty"])
                        new_phys = max(0, prev_phys - qty)
                        new_avail = max(0, new_phys - int(bal["reserved_qty"]))
                        conn.execute(
                            "UPDATE stock_balances SET physical_qty=?, available_qty=?, dispatched_qty=dispatched_qty+?, updated_at=? WHERE id=?",
                            (new_phys, new_avail, qty, now_iso(), bal["id"]),
                        )
                        conn.execute(
                            """
                            INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
                            VALUES (?, ?, ?, ?, 'Dispatch', ?, 'DeliveryNote', ?, ?, ?, ?, ?, ?)
                            """,
                            (_uid("MOV"), lot["id"], lot["item_code"], lot["heat_number"], qty, dn, prev_phys, new_phys, user_email, now_stamp(), f"Fast-Track Direct Dispatch: {qty} PCS ({dn})"),
                        )
                it["dispatched_qty"] = it["required_qty"]
                it["line_status"] = "Dispatched"
                total_pcs += qty
                summary.append({"item_code": it["item_code"], "heat_number": it.get("heat_number") or "STOCK", "quantity": qty})

        conn.execute(
            """
            INSERT INTO dispatch_records (id, sales_order_id, so_number, dispatch_reference, dispatch_date, delivery_note_number, customer_name, dispatched_by, delivery_remarks, items_summary_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Fast physical stock reduction executed successfully.', ?, ?)
            """,
            (_uid("DSP"), order["id"], order["so_number"], dn, today_date(), dn, order["customer_name"], user_email, json.dumps(summary), now_iso()),
        )
        conn.execute(
            "UPDATE sales_orders SET status='Dispatched', items_json=?, allocations_json=?, updated_at=? WHERE id=?",
            (json.dumps(order["items"]), json.dumps(order["allocations"]), now_iso(), order_id),
        )
        _log_audit(conn, user_email, "Fast Physical Stock Reduction & Dispatch", "Dispatch", order["so_number"], None, {"deliveryNote": dn, "totalDispatchedPcs": total_pcs})
        return {"success": True, "message": f"Physical stock reduced by {total_pcs} PCS! Order {order['so_number']} dispatched under {dn}.", "dispatchedCount": total_pcs}


def record_material_return(order_id: str, stock_lot_id: str, qty: int, reason: str, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        lot = conn.execute("SELECT * FROM stock_lots WHERE id = ?", (stock_lot_id,)).fetchone()
        bal = conn.execute("SELECT * FROM stock_balances WHERE stock_lot_id = ?", (stock_lot_id,)).fetchone()
        if not lot or not bal:
            return {"success": False, "message": "Stock lot not found"}

        order = conn.execute("SELECT id, so_number FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        so_num = order["so_number"] if order else (order_id or "RETURN")
        prev_phys = int(bal["physical_qty"])
        new_phys = prev_phys + qty
        new_avail = int(bal["available_qty"]) + qty
        new_disp = max(0, int(bal["dispatched_qty"]) - qty)
        conn.execute(
            "UPDATE stock_balances SET physical_qty=?, available_qty=?, dispatched_qty=?, updated_at=? WHERE id=?",
            (new_phys, new_avail, new_disp, now_iso(), bal["id"]),
        )
        ret_id = _uid("RET")
        conn.execute(
            """
            INSERT INTO stock_returns (id, sales_order_id, so_number, stock_lot_id, item_code, heat_number, returned_qty, return_date, reason, authorized_by, acceptance_status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Accepted', ?)
            """,
            (ret_id, order_id, so_num, stock_lot_id, lot["item_code"], lot["heat_number"], qty, today_date(), reason, user_email, now_iso()),
        )
        conn.execute(
            """
            INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
            VALUES (?, ?, ?, ?, 'Approved Customer Return', ?, 'CustomerReturn', ?, ?, ?, ?, ?, ?)
            """,
            (_uid("MOV"), stock_lot_id, lot["item_code"], lot["heat_number"], qty, so_num, prev_phys, new_phys, user_email, now_stamp(), f"Customer Return accepted: {reason}"),
        )
        _log_audit(conn, user_email, "Material Return Accepted", "Returns", ret_id, {"physical_qty": prev_phys}, {"physical_qty": new_phys}, reason)
        return {"success": True, "message": f"Return of {qty} PCS for Heat {lot['heat_number']} accepted and restored to stock."}


def adjust_stock(stock_lot_id: str, new_physical_qty: int, reason: str, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        lot = conn.execute("SELECT * FROM stock_lots WHERE id = ?", (stock_lot_id,)).fetchone()
        bal = conn.execute("SELECT * FROM stock_balances WHERE stock_lot_id = ?", (stock_lot_id,)).fetchone()
        if not lot or not bal:
            return {"success": False, "message": "Lot not found"}
        if new_physical_qty < int(bal["reserved_qty"]):
            return {"success": False, "message": f"Cannot adjust physical qty below reserved qty ({bal['reserved_qty']} PCS)."}

        orig = int(bal["physical_qty"])
        diff = new_physical_qty - orig
        new_avail = new_physical_qty - int(bal["reserved_qty"])
        conn.execute("UPDATE stock_balances SET physical_qty=?, available_qty=?, updated_at=? WHERE id=?", (new_physical_qty, new_avail, now_iso(), bal["id"]))

        adj_id = _uid("ADJ")
        conn.execute(
            """
            INSERT INTO stock_adjustments (id, stock_lot_id, item_code, heat_number, original_balance, adjusted_balance, difference_qty, reason, requested_by, approved_by, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?)
            """,
            (adj_id, stock_lot_id, lot["item_code"], lot["heat_number"], orig, new_physical_qty, diff, reason, user_email, user_email, now_iso()),
        )
        conn.execute(
            """
            INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
            VALUES (?, ?, ?, ?, 'Stock Adjustment', ?, 'ManualAdjustment', ?, ?, ?, ?, ?, ?)
            """,
            (_uid("MOV"), stock_lot_id, lot["item_code"], lot["heat_number"], diff, adj_id, orig, new_physical_qty, user_email, now_stamp(), f"Manual Stock Adjustment ({'+' if diff >= 0 else ''}{diff} PCS): {reason}"),
        )
        _log_audit(conn, user_email, "Manual Stock Adjustment", "Adjustments", adj_id, {"physical_qty": orig}, {"physical_qty": new_physical_qty}, reason)
        return {"success": True, "message": f"Adjusted stock for Heat {lot['heat_number']} from {orig} to {new_physical_qty} PCS."}


# ------------------------------------------------------------------
# ITEMS, STOCK LOTS, EXCEL IMPORT, MTC & LOCAL PURCHASES
# ------------------------------------------------------------------

def add_item(item: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        code = (item.get("item_code") or "").strip().upper()
        if not code:
            return {"success": False, "message": "Item code is required."}
        if conn.execute("SELECT 1 FROM items WHERE upper(item_code) = ?", (code,)).fetchone():
            return {"success": False, "message": f"Item code {code} already exists."}
        item_id = _uid("ITM")
        conn.execute(
            """
            INSERT INTO items (id, item_code, item_description, material_grade, specification, size, uom, unit_price_aed, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (item_id, code, item.get("item_description") or "", item.get("material_grade") or "", item.get("specification") or "", item.get("size") or "", item.get("uom") or "PCS", float(item.get("unit_price_aed") or 0), bool(item.get("is_active", True)), today_date(), now_iso()),
        )
        _log_audit(conn, user_email, "Create Item Specification", "Item Master", code, None, item)
        row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
        return {"success": True, "item": {**dict(row), "is_active": bool(row["is_active"])}}


def add_stock_lot(lot_data: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        item = conn.execute("SELECT * FROM items WHERE id = ?", (lot_data.get("item_id"),)).fetchone()
        if not item:
            return {"success": False, "message": "Item not found in catalog."}

        qty = int(lot_data.get("received_qty") or 0)
        if qty <= 0:
            return {"success": False, "message": "Received quantity must be greater than zero."}
        heat = (lot_data.get("heat_number") or "").strip()
        loc = (lot_data.get("warehouse_location") or "MAIN YARD").strip()
        ptype = lot_data.get("purchase_type") or "regular"
        supplier = (lot_data.get("supplier_name") or "").strip()
        yom = int(lot_data.get("yom") or 2025)
        l_code = lot_data.get("l_code")
        if ptype == "local_purchase" and not l_code:
            l_code = f"L-{item['item_code']}-{random.randint(10, 99)}"

        lot_id = _uid("LOT")
        conn.execute(
            """
            INSERT INTO stock_lots (id, item_id, item_code, item_description, heat_number, yom, original_qty, received_qty, purchase_type, supplier_name, l_code, stock_receipt_date, warehouse_location, mtc_ref, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (lot_id, item["id"], item["item_code"], item["item_description"], heat, yom, qty, qty, ptype, supplier, l_code, today_date(), loc, lot_data.get("mtc_ref") or "", now_iso(), now_iso()),
        )
        conn.execute(
            """
            INSERT INTO stock_balances (id, stock_lot_id, physical_qty, reserved_qty, available_qty, dispatched_qty, updated_at)
            VALUES (?, ?, ?, 0, ?, 0, ?)
            """,
            (_uid("BAL"), lot_id, qty, qty, now_iso()),
        )
        conn.execute(
            """
            INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
            VALUES (?, ?, ?, ?, 'Stock Receipt', ?, ?, ?, 0, ?, ?, ?, ?)
            """,
            (_uid("MOV"), lot_id, item["item_code"], heat, qty, "LocalPurchase" if ptype == "local_purchase" else "StockReceipt", l_code or lot_id, qty, user_email, now_stamp(), f"Received {qty} PCS from {supplier} at {loc}"),
        )
        if ptype == "local_purchase" and l_code:
            conn.execute(
                """
                INSERT INTO local_purchases (id, l_code, item_id, item_code, stock_lot_id, supplier_name, purchase_reference, purchase_date, received_qty, yom, supplier_mtc_uploaded, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?, ?, ?)
                ON CONFLICT (l_code) DO NOTHING
                """,
                (_uid("LP"), l_code, item["id"], item["item_code"], lot_id, supplier, f"PO-LOCAL-{random.randint(100,999)}", today_date(), qty, yom, user_email, now_iso(), now_iso()),
            )
        _log_audit(conn, user_email, "Add Stock Lot", "Master Stock", lot_id, None, {"item_code": item["item_code"], "heat": heat, "qty": qty})
        return {"success": True, "lot_id": lot_id}


def import_excel_stock(records: List[Dict[str, Any]], filename: str, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        imported_count = 0
        for r in records:
            code = str(r.get("item_code") or "").strip().upper()
            if not code:
                continue
            item = conn.execute("SELECT * FROM items WHERE upper(item_code) = ?", (code,)).fetchone()
            if not item:
                item_id = _uid("ITM")
                conn.execute(
                    """
                    INSERT INTO items (id, item_code, item_description, material_grade, specification, size, uom, unit_price_aed, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)
                    """,
                    (item_id, code, r.get("item_description") or code, r.get("material_grade") or "Carbon/Stainless Steel", r.get("specification") or "ASME / ASTM", r.get("size") or "Standard", r.get("uom") or "PCS", float(r.get("unit_price_aed") or 0), today_date(), now_iso()),
                )
            else:
                item_id = item["id"]

            qty = max(0, int(float(r.get("received_qty") or 0)))
            heat = str(r.get("heat_number") or "STOCK-HEAT").strip()
            loc = str(r.get("warehouse_location") or "LN-MAIN").strip()
            ptype = "local_purchase" if r.get("purchase_type") == "local_purchase" else "regular"
            mtc_ref = r.get("selected_mtc_ref") or r.get("mtc_ref") or ""
            lot_id = _uid("LOT")
            conn.execute(
                """
                INSERT INTO stock_lots (id, item_id, item_code, item_description, heat_number, yom, original_qty, received_qty, purchase_type, supplier_name, l_code, stock_receipt_date, warehouse_location, mtc_ref, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (lot_id, item_id, code, r.get("item_description") or code, heat, int(r.get("yom") or 2025), qty, qty, ptype, r.get("supplier_name") or "MSG Stock", r.get("l_code"), today_date(), loc, mtc_ref, now_iso(), now_iso()),
            )
            conn.execute(
                "INSERT INTO stock_balances (id, stock_lot_id, physical_qty, reserved_qty, available_qty, dispatched_qty, updated_at) VALUES (?, ?, ?, 0, ?, 0, ?)",
                (_uid("BAL"), lot_id, qty, qty, now_iso()),
            )
            conn.execute(
                """
                INSERT INTO stock_movements (id, stock_lot_id, item_code, heat_number, movement_type, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, timestamp, remarks)
                VALUES (?, ?, ?, ?, 'Opening Stock', ?, 'ExcelImport', ?, 0, ?, ?, ?, ?)
                """,
                (_uid("MOV"), lot_id, code, heat, qty, filename, qty, user_email, now_stamp(), f"Imported from {filename}"),
            )
            if mtc_ref:
                conn.execute(
                    """
                    INSERT INTO mtc_certificates (id, item_id, item_code, stock_lot_id, heat_number, yom, certificate_reference, original_file_path, purchase_type, supplier_name, upload_date, uploaded_by, verification_status, approval_status, pages, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Verified', 'Approved', 2, ?, ?)
                    """,
                    (_uid("MTC"), item_id, code, lot_id, heat, int(r.get("yom") or 2025), mtc_ref, r.get("file_url") or mtc_ref, ptype, r.get("supplier_name") or "MSG Stock", today_date(), user_email, now_iso(), now_iso()),
                )
            imported_count += 1

        job_id = _uid("IMP")
        conn.execute(
            """
            INSERT INTO excel_import_jobs (id, filename, uploaded_by, upload_date, import_type, total_rows, successful_rows, failed_rows, status, validation_report)
            VALUES (?, ?, ?, ?, 'Master Stock', ?, ?, 0, 'Completed', ?)
            """,
            (job_id, filename, user_email, now_stamp(), len(records), imported_count, f"Successfully imported {imported_count} stock lots from Zoho Books sheet."),
        )
        _log_audit(conn, user_email, "Excel Stock Import", "Excel Studio", job_id, None, {"filename": filename, "imported": imported_count})
        return {"success": True, "importedCount": imported_count, "jobId": job_id}


def upload_mtc_for_heat(heat_number: str, file_data: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        clean_heat = heat_number.strip().upper()
        matching_lots = conn.execute("SELECT * FROM stock_lots WHERE upper(trim(heat_number)) = ?", (clean_heat,)).fetchall()
        file_name = file_data.get("fileName") or f"MTC_{heat_number}.pdf"
        file_url = file_data.get("fileUrl") or file_name
        item_code = file_data.get("itemCode") or (matching_lots[0]["item_code"] if matching_lots else "STOCK")
        supplier = file_data.get("supplierName") or (matching_lots[0]["supplier_name"] if matching_lots else "Verified Mill / Supplier")
        pages = int(file_data.get("pages") or 2)

        existing = conn.execute("SELECT * FROM mtc_certificates WHERE upper(trim(heat_number)) = ? LIMIT 1", (clean_heat,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE mtc_certificates SET certificate_reference=?, original_file_path=?, supplier_name=?, upload_date=?, uploaded_by=?, verification_status='Verified', approval_status='Approved', pages=?, updated_at=?
                WHERE id=?
                """,
                (file_name, file_url, supplier, today_date(), user_email, pages, now_iso(), existing["id"]),
            )
            mtc_id = existing["id"]
        else:
            mtc_id = _uid("MTC")
            conn.execute(
                """
                INSERT INTO mtc_certificates (id, item_id, item_code, stock_lot_id, heat_number, yom, certificate_reference, original_file_path, purchase_type, supplier_name, upload_date, uploaded_by, verification_status, approval_status, pages, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Verified', 'Approved', ?, ?, ?)
                """,
                (
                    mtc_id,
                    matching_lots[0]["item_id"] if matching_lots else "",
                    item_code,
                    matching_lots[0]["id"] if matching_lots else "",
                    heat_number.strip(),
                    matching_lots[0]["yom"] if matching_lots else 2025,
                    file_name,
                    file_url,
                    matching_lots[0]["purchase_type"] if matching_lots else "regular",
                    supplier,
                    today_date(),
                    user_email,
                    pages,
                    now_iso(),
                    now_iso(),
                ),
            )

        conn.execute("UPDATE stock_lots SET mtc_ref=?, updated_at=? WHERE upper(trim(heat_number))=?", (file_name, now_iso(), clean_heat))

        # Update matching sales order lines
        orders = conn.execute("SELECT * FROM sales_orders").fetchall()
        affected_orders = 0
        for o_row in orders:
            ord_obj = _format_order(o_row)
            changed = False
            for it in ord_obj["items"]:
                if (it.get("heat_number") or "").strip().upper() == clean_heat:
                    it["certificate_number"] = file_name
                    changed = True
            if changed:
                conn.execute("UPDATE sales_orders SET items_json=?, updated_at=? WHERE id=?", (json.dumps(ord_obj["items"]), now_iso(), ord_obj["id"]))
                affected_orders += 1

        _log_audit(conn, user_email, "Upload & Link MTC Certificate", "MTC Management", mtc_id, None, {"heat": heat_number, "fileName": file_name, "affectedOrders": affected_orders})
        return {"success": True, "mtcId": mtc_id, "affectedLots": len(matching_lots), "affectedOrders": affected_orders}


def bulk_upload_certificates(cert_files: List[Dict[str, Any]], user_email: str) -> Dict[str, Any]:
    matched_count = 0
    new_count = 0
    with db_transaction() as conn:
        lots = conn.execute("SELECT * FROM stock_lots").fetchall()
        for cert in cert_files:
            heat = (cert.get("heatNumber") or "").strip()
            file_name = cert.get("fileName") or "cert.pdf"
            file_url = cert.get("fileUrl") or file_name
            matched_lot = next((l for l in lots if l["heat_number"].strip().upper() == heat.upper()), None)
            if matched_lot:
                matched_count += 1
                conn.execute("UPDATE stock_lots SET mtc_ref=?, updated_at=? WHERE id=?", (file_name, now_iso(), matched_lot["id"]))
            existing = conn.execute(
                "SELECT id FROM mtc_certificates WHERE lower(certificate_reference) = ? OR (heat_number != '' AND upper(heat_number) = ?)",
                (file_name.lower(), heat.upper()),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE mtc_certificates SET original_file_path=?, certificate_reference=?, verification_status='Verified', approval_status='Approved', updated_at=? WHERE id=?",
                    (file_url, file_name, now_iso(), existing["id"]),
                )
            else:
                new_count += 1
                conn.execute(
                    """
                    INSERT INTO mtc_certificates (id, item_id, item_code, stock_lot_id, heat_number, l_code, yom, certificate_reference, original_file_path, purchase_type, supplier_name, upload_date, uploaded_by, verification_status, approval_status, pages, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 2025, ?, ?, ?, ?, ?, ?, 'Verified', 'Approved', ?, ?, ?)
                    """,
                    (
                        _uid("MTC"),
                        matched_lot["item_id"] if matched_lot else "",
                        cert.get("itemCode") or (matched_lot["item_code"] if matched_lot else "STOCK"),
                        matched_lot["id"] if matched_lot else "",
                        heat or "UNASSIGNED",
                        cert.get("lCode"),
                        file_name,
                        file_url,
                        cert.get("purchaseType") or (matched_lot["purchase_type"] if matched_lot else "regular"),
                        cert.get("supplierName") or (matched_lot["supplier_name"] if matched_lot else "Supplier (ZIP)"),
                        today_date(),
                        user_email,
                        int(cert.get("pages") or 2),
                        now_iso(),
                        now_iso(),
                    ),
                )
        _log_audit(conn, user_email, "Bulk MTC ZIP Upload", "MTC Management", "BULK", None, {"total": len(cert_files), "matched": matched_count, "new": new_count})
    return {"success": True, "matchedCount": matched_count, "newCount": new_count}


def upload_and_stamp_supplier_mtc(lp_id: str, cert_ref: str, stamped_url: str, original_url: str, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        lp = conn.execute("SELECT * FROM local_purchases WHERE id = ?", (lp_id,)).fetchone()
        if not lp:
            return {"success": False, "message": "Local Purchase record not found."}
        mtc_id = _uid("MTC")
        conn.execute(
            """
            INSERT INTO mtc_certificates (id, item_id, item_code, stock_lot_id, heat_number, l_code, yom, certificate_reference, original_file_path, stamped_file_path, purchase_type, supplier_name, upload_date, uploaded_by, verification_status, approval_status, pages, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_purchase', ?, ?, ?, 'Verified', 'Approved', 2, ?, ?)
            """,
            (mtc_id, lp["item_id"], lp["item_code"], lp["stock_lot_id"], lp["l_code"], lp["l_code"], lp["yom"], cert_ref, original_url or stamped_url, stamped_url, lp["supplier_name"], today_date(), user_email, now_iso(), now_iso()),
        )
        conn.execute(
            "UPDATE local_purchases SET supplier_mtc_uploaded=TRUE, mtc_certificate_id=?, updated_at=? WHERE id=?",
            (mtc_id, now_iso(), lp_id),
        )
        if lp["stock_lot_id"]:
            conn.execute("UPDATE stock_lots SET mtc_ref=?, updated_at=? WHERE id=?", (cert_ref, now_iso(), lp["stock_lot_id"]))
        _log_audit(conn, user_email, "Upload & Stamp Supplier MTC", "Local Purchases", lp["l_code"], None, {"cert_ref": cert_ref, "stamped_url": stamped_url})
        return {"success": True, "mtcId": mtc_id}


# ------------------------------------------------------------------
# SYSTEM CONFIG, SUPPLIERS, DRAFTS, PERMISSIONS & ASSISTANT
# ------------------------------------------------------------------

def update_system_config(updates: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM system_config WHERE id='SYSTEM_CONFIG_MAIN'").fetchone()
        current = _format_system_config(row)
        merged = {**current, **updates}
        conn.execute(
            """
            INSERT INTO system_config (
                id, company_name, trn_number, default_currency, company_address,
                contact_email, contact_phone, theme_primary_color, mtc_stamp_text,
                mtc_stamp_color, mtc_stamp_scale, mtc_stamp_offset_x, mtc_stamp_offset_y,
                mtc_inspector_name, inspector_designation, inspector_sign_name,
                custom_seal_data_url, custom_signature_data_url, seal_shape,
                seal_border_width, show_machined_tag, default_weight_safety_buffer,
                cipl_invoice_prefix, qr_sticker_format, enable_audit_logging,
                session_timeout_minutes, data_privacy_masking_for_it, updated_at
            ) VALUES ('SYSTEM_CONFIG_MAIN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                custom_seal_data_url=excluded.custom_seal_data_url,
                custom_signature_data_url=excluded.custom_signature_data_url,
                seal_shape=excluded.seal_shape,
                seal_border_width=excluded.seal_border_width,
                show_machined_tag=excluded.show_machined_tag,
                default_weight_safety_buffer=excluded.default_weight_safety_buffer,
                cipl_invoice_prefix=excluded.cipl_invoice_prefix,
                qr_sticker_format=excluded.qr_sticker_format,
                enable_audit_logging=excluded.enable_audit_logging,
                session_timeout_minutes=excluded.session_timeout_minutes,
                data_privacy_masking_for_it=excluded.data_privacy_masking_for_it,
                updated_at=excluded.updated_at
            """,
            (
                merged["companyName"], merged["trnNumber"], merged["defaultCurrency"], merged["companyAddress"],
                merged["contactEmail"], merged["contactPhone"], merged["themePrimaryColor"], merged["mtcStampText"],
                merged["mtcStampColor"], int(merged["mtcStampScale"]), int(merged["mtcStampOffsetX"]), int(merged["mtcStampOffsetY"]),
                merged["mtcInspectorName"], merged["inspectorDesignation"], merged["inspectorSignName"],
                merged.get("customSealDataUrl") or "", merged.get("customSignatureDataUrl") or "", merged["sealShape"],
                int(merged["sealBorderWidth"]), bool(merged["showMachinedTag"]), int(merged["defaultWeightSafetyBuffer"]),
                merged["ciplInvoicePrefix"], merged["qrStickerFormat"], bool(merged.get("enableAuditLogging", True)),
                int(merged.get("sessionTimeoutMinutes", 60)), bool(merged.get("dataPrivacyMaskingForIT", True)), now_iso(),
            ),
        )
        _log_audit(conn, user_email, "Update System Configuration", "IT Config", "SYSTEM_CONFIG_MAIN", None, updates)
        return merged


def upsert_supplier(supplier: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        sup_id = supplier.get("id") or _uid("SUPP")
        code = (supplier.get("supplier_code") or supplier.get("supplier_name") or sup_id).upper().replace(" ", "_")[:24]
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
                sup_id, code, supplier.get("supplier_name") or "", supplier.get("country") or "United Arab Emirates",
                supplier.get("make") or "", supplier.get("supplier_type") or "international_maker",
                supplier.get("approved_status") or "Approved", supplier.get("contact_person") or "",
                supplier.get("contact_email") or "", supplier.get("contact_phone") or "",
                supplier.get("created_at") or today_date(), now_iso(),
            ),
        )
        _log_audit(conn, user_email, "Upsert Supplier", "Suppliers", sup_id, None, supplier)
        return dict(conn.execute("SELECT * FROM suppliers WHERE id = ?", (sup_id,)).fetchone())


def run_assistant_query(query: str) -> Dict[str, Any]:
    """Server-side live database AI & compliance vetting engine."""
    q = query.strip()
    ql = q.lower()
    with db_read() as conn:
        lots = [dict(r) for r in conn.execute(
            "SELECT l.*, b.physical_qty, b.reserved_qty, b.available_qty, b.dispatched_qty FROM stock_lots l LEFT JOIN stock_balances b ON b.stock_lot_id = l.id"
        ).fetchall()]
        mtcs = [dict(r) for r in conn.execute("SELECT * FROM mtc_certificates").fetchall()]
        orders = [_format_order(r) for r in conn.execute("SELECT * FROM sales_orders ORDER BY created_at DESC").fetchall()]

    mtc_heats = {(m.get("heat_number") or "").strip().upper() for m in mtcs}
    mtc_refs = {(m.get("certificate_reference") or "").strip().lower() for m in mtcs}

    # 1. Stock Audit / Health / Missing MTCs
    if "audit" in ql or "missing mtc" in ql or "health" in ql:
        missing = [l for l in lots if (l.get("heat_number") or "").strip().upper() not in mtc_heats and not l.get("mtc_ref")]
        unlocated = [l for l in lots if not l.get("warehouse_location") or l.get("warehouse_location") == "MAIN YARD"]
        return {
            "id": _uid("BOT"),
            "sender": "assistant",
            "timestamp": now_stamp(),
            "type": "stock_audit",
            "text": f"**Live Warehouse Stock Audit**: {len(lots)} stock lots ({sum(l.get('physical_qty') or 0 for l in lots)} PCS physical). Certified: {len(lots) - len(missing)} | Missing MTC: {len(missing)} | Unlocated: {len(unlocated)}.",
            "data": {
                "totalLots": len(lots),
                "totalPhysicalQty": sum(l.get("physical_qty") or 0 for l in lots),
                "totalAvailableQty": sum(l.get("available_qty") or 0 for l in lots),
                "totalReservedQty": sum(l.get("reserved_qty") or 0 for l in lots),
                "certifiedLotsCount": len(lots) - len(missing),
                "missingMtcCount": len(missing),
                "unlocatedLotsCount": len(unlocated),
                "missingMtcLots": [
                    {"heatNumber": l["heat_number"], "itemCode": l["item_code"], "qty": l.get("physical_qty") or 0, "location": l.get("warehouse_location") or ""}
                    for l in missing[:20]
                ],
            },
            "suggestions": ["📊 Download Master Stock Excel", "📋 Vet Latest Sales Orders"],
        }

    # 2. Specific Heat Vetting
    heat_match = re.search(r"(?:heat|vet)\s*[:#]?\s*([A-Za-z0-9\-_]+)", q, re.IGNORECASE)
    if heat_match:
        token = heat_match.group(1).strip().upper()
        matched = [l for l in lots if token in (l.get("heat_number") or "").upper()]
        if matched:
            primary = matched[0]
            has_mtc = (primary["heat_number"].strip().upper() in mtc_heats) or bool(primary.get("mtc_ref"))
            issues = []
            if not has_mtc:
                issues.append({"severity": "error", "category": "mtc", "message": "No linked MTC certificate found in vault."})
            else:
                issues.append({"severity": "success", "category": "mtc", "message": "Authentic EN 10204 3.1 MTC verified."})
            return {
                "id": _uid("BOT"),
                "sender": "assistant",
                "timestamp": now_stamp(),
                "type": "heat_vetting",
                "text": f"Heat **{primary['heat_number']}** ({primary['item_code']}): {sum(m.get('available_qty') or 0 for m in matched)} PCS available at {primary.get('warehouse_location')}.",
                "data": {
                    "heatNumber": primary["heat_number"],
                    "itemCode": primary["item_code"],
                    "description": primary["item_description"],
                    "physicalQty": sum(m.get("physical_qty") or 0 for m in matched),
                    "availableQty": sum(m.get("available_qty") or 0 for m in matched),
                    "reservedQty": sum(m.get("reserved_qty") or 0 for m in matched),
                    "location": primary.get("warehouse_location") or "",
                    "yom": primary.get("yom") or 0,
                    "supplier": primary.get("supplier_name") or "",
                    "purchaseType": primary.get("purchase_type") or "regular",
                    "hasMTC": has_mtc,
                    "mtcReference": primary.get("mtc_ref") or "",
                    "mtcStatus": "Verified" if has_mtc else "Missing MTC",
                    "isCompliant": has_mtc,
                    "overallScore": "PASSED" if has_mtc else "FAILED",
                    "issues": issues,
                    "allocatedOrders": [o["so_number"] for o in orders if any(a.get("heat_number") == primary["heat_number"] for a in o.get("allocations", []))],
                },
            }

    # 3. Order Vetting / Latest Orders
    if "order" in ql or "so-" in ql:
        target = next((o for o in orders if o["so_number"].lower() in ql or o["po_number"].lower() in ql), orders[0] if orders else None)
        if target:
            items = target.get("items", [])
            fully_alloc = sum(1 for it in items if (it.get("allocated_qty") or 0) >= (it.get("required_qty") or 0))
            cert_count = sum(1 for it in items if (it.get("heat_number") or "").upper() in mtc_heats or (it.get("certificate_number") or "").lower() in mtc_refs)
            return {
                "id": _uid("BOT"),
                "sender": "assistant",
                "timestamp": now_stamp(),
                "type": "order_vetting",
                "text": f"Sales Order **{target['so_number']}** ({target['customer_name']}) — Status: **{target['status']}**. {fully_alloc}/{len(items)} lines allocated, {cert_count}/{len(items)} certified.",
                "data": {
                    "orderId": target["id"],
                    "soNumber": target["so_number"],
                    "customerName": target["customer_name"],
                    "clientPo": target["po_number"],
                    "orderDate": target["order_date"],
                    "status": target["status"],
                    "totalItems": len(items),
                    "fullyAllocatedCount": fully_alloc,
                    "certifiedItemsCount": cert_count,
                    "overallScore": "READY_TO_DISPATCH" if fully_alloc == len(items) and cert_count == len(items) else "ACTION_REQUIRED",
                    "issues": [],
                    "items": [
                        {
                            "itemCode": it.get("item_code") or "",
                            "description": it.get("item_description") or "",
                            "orderedQty": it.get("required_qty") or 0,
                            "allocatedQty": it.get("allocated_qty") or 0,
                            "heats": [it["heat_number"]] if it.get("heat_number") else [],
                            "hasMtc": (it.get("heat_number") or "").upper() in mtc_heats,
                        }
                        for it in items
                    ],
                },
            }

    # 4. General search across stock lots
    matches = [l for l in lots if ql in (l.get("item_code") or "").lower() or ql in (l.get("item_description") or "").lower() or ql in (l.get("heat_number") or "").lower()][:12]
    if matches:
        return {
            "id": _uid("BOT"),
            "sender": "assistant",
            "timestamp": now_stamp(),
            "type": "stock_search",
            "text": f"Found **{len(matches)}** matching stock lots for `{query}`.",
            "data": matches,
        }

    return {
        "id": _uid("BOT"),
        "sender": "assistant",
        "timestamp": now_stamp(),
        "type": "general",
        "text": f"Live ERP contains **{len(lots)}** stock lots, **{len(orders)}** sales orders, and **{len(mtcs)}** MTC certificates. Ask me to vet a Heat#, inspect an Order, or run a Stock Audit.",
        "suggestions": ["🛡️ Vet Stock Health", "⚠️ Missing MTCs", "📋 Vet Latest Sales Orders"],
    }
