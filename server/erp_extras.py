import json
import random
import re
import time
from typing import Any, Dict, List

from .auth import DEFAULT_ROLE_MODULES, hash_password, sanitize_user
from .database import db_read, db_transaction, now_iso, now_stamp, parse_json_col, today_date
from .erp_service import _format_order, _log_audit, _uid, create_sales_order, get_bootstrap_data, upsert_supplier


STANDARD_SUPPLIERS = [
    {"id": "SUPP-001", "supplier_code": "WMASS", "supplier_name": "WMASS FLANGES & FITTINGS GMBH", "country": "Germany", "make": "WMASS GERMANY", "supplier_type": "international_maker", "approved_status": "Approved", "contact_person": "Hans Becker", "contact_email": "sales@wmass.de"},
    {"id": "SUPP-002", "supplier_code": "BENKAN", "supplier_name": "BENKAN CORPORATION", "country": "Thailand", "make": "BENKAN THAILAND", "supplier_type": "international_maker", "approved_status": "Approved", "contact_person": "Somchai Prasert", "contact_email": "export@benkan.co.th"},
    {"id": "SUPP-003", "supplier_code": "MEGA", "supplier_name": "MEGA SPA FITTINGS & VALVES", "country": "Italy", "make": "MEGA ITALY", "supplier_type": "international_maker", "approved_status": "Approved", "contact_person": "Marco Rossi", "contact_email": "sales@mega-spa.it"},
    {"id": "SUPP-004", "supplier_code": "ULMA", "supplier_name": "ULMA PIPING S. COOP.", "country": "Spain", "make": "ULMA SPAIN", "supplier_type": "international_maker", "approved_status": "Approved", "contact_person": "Javier Lopez", "contact_email": "info@ulmapiping.com"},
    {"id": "SUPP-005", "supplier_code": "DELCORTE", "supplier_name": "DELCORTE SAS", "country": "France", "make": "DELCORTE FRANCE", "supplier_type": "international_maker", "approved_status": "Approved", "contact_person": "Pierre Dubois", "contact_email": "contact@delcorte.fr"},
    {"id": "SUPP-006", "supplier_code": "SRI", "supplier_name": "SRI FLANGES & FORGINGS PVT LTD", "country": "India", "make": "SRI FLANGES", "supplier_type": "international_maker", "approved_status": "Approved", "contact_person": "Rajesh Nair", "contact_email": "sales@sriflanges.com"},
    {"id": "SUPP-007", "supplier_code": "SHREE-LP", "supplier_name": "SHREE OILFIELD SUPPLY LLC", "country": "United Arab Emirates", "make": "LOCAL UAE STOCK", "supplier_type": "local_stockist", "approved_status": "Approved", "contact_person": "Sunil Sharma", "contact_email": "procurement@shreeoilfield.ae"},
    {"id": "SUPP-008", "supplier_code": "PROMAT-LP", "supplier_name": "PROMAT BD MIDDLE EAST FZE", "country": "United Arab Emirates", "make": "PROMAT STOCK", "supplier_type": "local_stockist", "approved_status": "Approved", "contact_person": "David Clark", "contact_email": "sales@promatme.ae"},
    {"id": "SUPP-009", "supplier_code": "ALJEBA-LP", "supplier_name": "AL JEBA OILFIELD TRADING LLC", "country": "United Arab Emirates", "make": "UAE PIPING", "supplier_type": "local_stockist", "approved_status": "Approved", "contact_person": "Ahmed Al-Kindi", "contact_email": "orders@aljeba.ae"},
    {"id": "SUPP-010", "supplier_code": "APEX-LP", "supplier_name": "APEX PIPING & TUBULARS FZE", "country": "United Arab Emirates", "make": "APEX STOCK", "supplier_type": "local_stockist", "approved_status": "Approved", "contact_person": "Khurram Khan", "contact_email": "info@apexpiping.ae"},
]

BASELINE_CUSTOMERS = [
    {"id": "CUST-STS", "customer_code": "STS-BAHRAIN", "customer_name": "Bahrain Special Technical Services (STS) Co. W.L.L", "address": "PO Box 2603, Manama, Kingdom of Bahrain", "contact_details": "+973 1783 2000 | procurement@sts-bh.com", "status": "Active", "created_at": "2026-03-01"},
    {"id": "CUST-VALORIS", "customer_code": "VALORIS", "customer_name": "Valoris Energy Services Company", "address": "Dammam Port Road, KSA", "contact_details": "+966 13 835 1200 | supply@valoris-energy.com", "status": "Active", "created_at": "2026-02-15"},
    {"id": "CUST-001", "customer_code": "ADNOC", "customer_name": "ADNOC Refining & Petrochemicals", "address": "Abu Dhabi, UAE", "contact_details": "+971 2 6020000", "status": "Active", "created_at": "2026-01-10"},
    {"id": "CUST-002", "customer_code": "PETROFAC", "customer_name": "Petrofac Emirates LLC", "address": "Al Markaziyah, Abu Dhabi", "contact_details": "+971 2 6265000", "status": "Active", "created_at": "2026-01-15"},
    {"id": "CUST-003", "customer_code": "DUBAL", "customer_name": "Emirates Global Aluminium (DUBAL)", "address": "Jebel Ali, Dubai", "contact_details": "+971 4 8846666", "status": "Active", "created_at": "2026-02-01"},
    {"id": "CUST-004", "customer_code": "NPCC", "customer_name": "National Petroleum Construction Co (NPCC)", "address": "Mussafah, Abu Dhabi", "contact_details": "+971 2 5549000", "status": "Active", "created_at": "2026-02-10"},
    {"id": "CUST-005", "customer_code": "MCDERMOTT", "customer_name": "McDermott Middle East Inc", "address": "JAFZA, Dubai", "contact_details": "+971 4 8835200", "status": "Active", "created_at": "2026-03-01"},
    {"id": "CUST-006", "customer_code": "LAMPRELL", "customer_name": "Lamprell Energy Ltd", "address": "Hamriyah Free Zone, Sharjah", "contact_details": "+971 6 5282323", "status": "Active", "created_at": "2026-03-12"},
    {"id": "CUST-007", "customer_code": "ARCHIRODON", "customer_name": "Archirodon Construction (Overseas) Co", "address": "Al Barsha, Dubai", "contact_details": "+971 4 4578000", "status": "Active", "created_at": "2026-03-20"},
    {"id": "CUST-008", "customer_code": "DODSAL", "customer_name": "Dodsal Engineering & Construction", "address": "Deira, Dubai", "contact_details": "+971 4 2824100", "status": "Active", "created_at": "2026-04-05"},
    {"id": "CUST-009", "customer_code": "TARGET", "customer_name": "Target Engineering Construction Co", "address": "Mussafah, Abu Dhabi", "contact_details": "+971 2 6714700", "status": "Active", "created_at": "2026-04-18"},
    {"id": "CUST-010", "customer_code": "SNCLAVALIN", "customer_name": "SNC-Lavalin Middle East", "address": "Al Reem Island, Abu Dhabi", "contact_details": "+971 2 4085000", "status": "Active", "created_at": "2026-05-01"},
]

BASELINE_ITEMS = [
    {"id": "ITEM-001", "item_code": "WSO15150F316", "item_description": '1/2" Flange SORF CL150 SS316/SS316L', "material_grade": "SS316/316L", "specification": "ASTM A182 / ASME B16.5", "size": '1/2" #150', "uom": "PCS", "unit_price_aed": 22.0},
    {"id": "ITEM-002", "item_code": "WSO20150F316", "item_description": '3/4" Flange SORF CL150 SS316/SS316L', "material_grade": "SS316/316L", "specification": "ASTM A182 / ASME B16.5", "size": '3/4" #150', "uom": "PCS", "unit_price_aed": 32.0},
    {"id": "ITEM-003", "item_code": "WSO40150F316", "item_description": '1 1/2" Flange SORF CL150 SS316/SS316L', "material_grade": "SS316/316L", "specification": "ASTM A182 / ASME B16.5", "size": '1 1/2" #150', "uom": "PCS", "unit_price_aed": 70.0},
    {"id": "ITEM-004", "item_code": "WSO30150F316", "item_description": '1 1/4" Flange SORF CL150 SS316/SS316L', "material_grade": "SS316/316L", "specification": "ASTM A182 / ASME B16.5", "size": '1 1/4" #150', "uom": "PCS", "unit_price_aed": 70.0},
    {"id": "ITEM-005", "item_code": "EL9050S80WPBBENKAN-STOCK", "item_description": 'ELBOW 2", 90DEG, SCH.80, LR, BW, SMLS, ASTM A234 WPB', "material_grade": "ASTM A234 WPB", "specification": "ASME B16.9", "size": '2" Sch 80', "uom": "PCS", "unit_price_aed": 26.0},
    {"id": "ITEM-006", "item_code": "EL9080S40WPBBENKAN-STOCK", "item_description": 'ELBOW 3", 90DEG, SCH.40, LR, BW, SMLS, ASTM A234 WPB', "material_grade": "ASTM A234 WPB", "specification": "ASME B16.9", "size": '3" Sch 40', "uom": "PCS", "unit_price_aed": 48.0},
    {"id": "ITEM-007", "item_code": "WSO80150F316-LOC", "item_description": '3" Flange SORF CL150 SS316/SS316L (Item #8 - Local Purchase)', "material_grade": "SS316/316L", "specification": "ASTM A182 / ASME B16.5", "size": '3" #150', "uom": "PCS", "unit_price_aed": 155.0},
    {"id": "ITEM-008", "item_code": "WSO100150F316-LOC", "item_description": '4" Flange SORF CL150 SS316/SS316L (Item #9 - Local Purchase)', "material_grade": "SS316/316L", "specification": "ASTM A182 / ASME B16.5", "size": '4" #150', "uom": "PCS", "unit_price_aed": 195.0},
    {"id": "ITEM-009", "item_code": "WN15150S80RFA105SRI-STOCK", "item_description": 'FLANGE 1/2", 150#, SCH.80, WNRF, SA105N, ASME B16.5', "material_grade": "ASTM A105N", "specification": "ASME B16.5", "size": '1/2" #150', "uom": "PCS", "unit_price_aed": 15.0},
    {"id": "ITEM-010", "item_code": "WN150150S80RFA105GB-STOCK", "item_description": 'WNRF 6", 150#, SCH.80, ASTM A105N, ASME B16.5', "material_grade": "ASTM A105N", "specification": "ASME B16.5", "size": '6" #150', "uom": "PCS", "unit_price_aed": 180.0},
    {"id": "ITEM-011", "item_code": "CPL253KNPTA105GB-STOCK", "item_description": 'FULL COUPLING 1", 3000#, NPT, A105N, ASME B16.11', "material_grade": "ASTM A105N", "specification": "ASME B16.11", "size": '1" 3000#', "uom": "PCS", "unit_price_aed": 10.0},
    {"id": "ITEM-012", "item_code": "WSW20150S40F316", "item_description": '3/4" Flange SWRF CL150 Sch 40S SS316/SS316L', "material_grade": "SS316/316L", "specification": "ASTM A182 / ASME B16.5", "size": '3/4" Sch 40', "uom": "PCS", "unit_price_aed": 33.0},
]


def import_sales_orders_excel(rows: List[Dict[str, Any]], user_email: str) -> Dict[str, Any]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        so_key = (r.get("so_number") or r.get("po_number") or "SO-IMPORT").strip()
        grouped.setdefault(so_key, []).append(r)

    created_orders = []
    for key, lines in grouped.items():
        first = lines[0]
        res = create_sales_order(
            {
                "so_number": first.get("so_number") or key,
                "po_number": first.get("po_number") or key,
                "customer_name": first.get("customer_name") or "Imported Client",
                "required_delivery_date": first.get("delivery_date") or today_date(),
                "items": [
                    {
                        "item_code": l.get("item_code") or f"ITEM-{i+1}",
                        "item_description": l.get("item_description") or l.get("description") or "",
                        "required_qty": l.get("required_qty") or l.get("qty") or 1,
                        "uom": l.get("uom") or "PCS",
                        "heat_number": l.get("heat_number") or "",
                        "unit_price": l.get("unit_price") or 0,
                    }
                    for i, l in enumerate(lines)
                ],
            },
            user_email,
        )
        if res.get("success"):
            created_orders.append(res["order"]["so_number"])

    with db_transaction() as conn:
        conn.execute(
            """
            INSERT INTO excel_import_jobs (id, filename, uploaded_by, upload_date, import_type, total_rows, successful_rows, failed_rows, status, validation_report)
            VALUES (?, 'SalesOrdersImport.xlsx', ?, ?, 'Sales Orders', ?, ?, 0, 'Completed', ?)
            """,
            (_uid("IMP"), user_email, now_stamp(), len(rows), len(rows), f"Created {len(created_orders)} Sales Orders."),
        )
    return {"success": True, "message": f"Imported {len(created_orders)} Sales Orders ({len(rows)} lines).", "orders": created_orders}


def preload_standard_suppliers(user_email: str) -> Dict[str, Any]:
    count = 0
    for sup in STANDARD_SUPPLIERS:
        upsert_supplier(sup, user_email)
        count += 1
    return {"success": True, "count": count, "message": f"Verified/loaded {count} standard approved oilfield suppliers."}


def import_suppliers_bulk(suppliers_list: List[Dict[str, Any]], user_email: str) -> Dict[str, Any]:
    count = 0
    for s in suppliers_list:
        if s.get("supplier_name"):
            upsert_supplier(s, user_email)
            count += 1
    return {"success": True, "count": count, "message": f"Imported {count} suppliers."}


def mark_mtc_package_generated(order_id: str, package_url: str, user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            return {"success": False, "message": "Order not found."}
        conn.execute(
            "UPDATE sales_orders SET mtc_package_generated=TRUE, mtc_package_url=?, status=CASE WHEN status='Approved' THEN 'MTC Generated' ELSE status END, updated_at=? WHERE id=?",
            (package_url, now_iso(), order_id),
        )
        _log_audit(conn, user_email, "Generate MTC Package", "MTC Management", row["so_number"], None, {"package_url": package_url})
    return {"success": True}


def get_system_diagnostics() -> Dict[str, Any]:
    with db_read() as conn:
        counts = {
            "items": conn.execute("SELECT COUNT(*) FROM items").fetchone()[0],
            "lots": conn.execute("SELECT COUNT(*) FROM stock_lots").fetchone()[0],
            "orders": conn.execute("SELECT COUNT(*) FROM sales_orders").fetchone()[0],
            "mtcs": conn.execute("SELECT COUNT(*) FROM mtc_certificates").fetchone()[0],
            "movements": conn.execute("SELECT COUNT(*) FROM stock_movements").fetchone()[0],
            "suppliers": conn.execute("SELECT COUNT(*) FROM suppliers").fetchone()[0],
            "customers": conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0],
            "users": conn.execute("SELECT COUNT(*) FROM user_profiles").fetchone()[0],
            "audits": conn.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0],
            "storedFiles": conn.execute("SELECT COUNT(*) FROM stored_files").fetchone()[0],
        }
    return {
        "engine": "FastAPI + Supabase PostgreSQL",
        "counts": counts,
        "timestamp": now_iso(),
    }


def export_full_database_json(current_user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "exportedAt": now_iso(),
        "exportedBy": current_user.get("email"),
        "version": "2.0",
        "data": get_bootstrap_data(current_user),
    }


def import_full_database_json(payload: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    data = payload.get("data") or payload
    with db_transaction() as conn:
        for sup in data.get("suppliers", []):
            conn.execute(
                """
                INSERT INTO suppliers (id, supplier_code, supplier_name, country, make, supplier_type, approved_status, contact_person, contact_email, contact_phone, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    supplier_code=EXCLUDED.supplier_code, supplier_name=EXCLUDED.supplier_name, country=EXCLUDED.country,
                    make=EXCLUDED.make, supplier_type=EXCLUDED.supplier_type, approved_status=EXCLUDED.approved_status,
                    contact_person=EXCLUDED.contact_person, contact_email=EXCLUDED.contact_email, contact_phone=EXCLUDED.contact_phone,
                    updated_at=EXCLUDED.updated_at
                """,
                (sup["id"], sup.get("supplier_code", sup["id"]), sup["supplier_name"], sup.get("country", "UAE"), sup.get("make", ""), sup.get("supplier_type", "international_maker"), sup.get("approved_status", "Approved"), sup.get("contact_person", ""), sup.get("contact_email", ""), sup.get("contact_phone", ""), sup.get("created_at", now_iso()), now_iso()),
            )
        for cust in data.get("customers", []):
            conn.execute(
                """
                INSERT INTO customers (id, customer_code, customer_name, address, contact_details, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    customer_code=EXCLUDED.customer_code, customer_name=EXCLUDED.customer_name, address=EXCLUDED.address,
                    contact_details=EXCLUDED.contact_details, status=EXCLUDED.status, updated_at=EXCLUDED.updated_at
                """,
                (cust["id"], cust.get("customer_code", cust["id"]), cust["customer_name"], cust.get("address", ""), cust.get("contact_details", ""), cust.get("status", "Active"), cust.get("created_at", now_iso()), now_iso()),
            )
        for it in data.get("items", []):
            conn.execute(
                """
                INSERT INTO items (id, item_code, item_description, material_grade, specification, size, uom, unit_price_aed, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    item_code=EXCLUDED.item_code, item_description=EXCLUDED.item_description, material_grade=EXCLUDED.material_grade,
                    specification=EXCLUDED.specification, size=EXCLUDED.size, uom=EXCLUDED.uom, unit_price_aed=EXCLUDED.unit_price_aed,
                    is_active=EXCLUDED.is_active, updated_at=EXCLUDED.updated_at
                """,
                (it["id"], it["item_code"], it["item_description"], it.get("material_grade", ""), it.get("specification", ""), it.get("size", ""), it.get("uom", "PCS"), float(it.get("unit_price_aed") or 0), bool(it.get("is_active", True)), it.get("created_at", now_iso()), now_iso()),
            )
        for lot in data.get("lots", []):
            conn.execute(
                """
                INSERT INTO stock_lots (id, item_id, item_code, item_description, heat_number, yom, original_qty, received_qty, purchase_type, supplier_name, l_code, stock_receipt_date, warehouse_location, mtc_ref, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    item_id=EXCLUDED.item_id, item_code=EXCLUDED.item_code, item_description=EXCLUDED.item_description,
                    heat_number=EXCLUDED.heat_number, yom=EXCLUDED.yom, original_qty=EXCLUDED.original_qty, received_qty=EXCLUDED.received_qty,
                    purchase_type=EXCLUDED.purchase_type, supplier_name=EXCLUDED.supplier_name, l_code=EXCLUDED.l_code,
                    stock_receipt_date=EXCLUDED.stock_receipt_date, warehouse_location=EXCLUDED.warehouse_location, mtc_ref=EXCLUDED.mtc_ref,
                    updated_at=EXCLUDED.updated_at
                """,
                (lot["id"], lot["item_id"], lot["item_code"], lot["item_description"], lot["heat_number"], int(lot.get("yom") or 0), int(lot.get("original_qty") or 0), int(lot.get("received_qty") or 0), lot.get("purchase_type", "regular"), lot.get("supplier_name", ""), lot.get("l_code"), lot.get("stock_receipt_date", today_date()), lot.get("warehouse_location", "MAIN"), lot.get("mtc_ref", ""), lot.get("created_at", now_iso()), now_iso()),
            )
        for bal in data.get("balances", []):
            conn.execute(
                """
                INSERT INTO stock_balances (id, stock_lot_id, physical_qty, reserved_qty, available_qty, dispatched_qty, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    stock_lot_id=EXCLUDED.stock_lot_id, physical_qty=EXCLUDED.physical_qty, reserved_qty=EXCLUDED.reserved_qty,
                    available_qty=EXCLUDED.available_qty, dispatched_qty=EXCLUDED.dispatched_qty, updated_at=EXCLUDED.updated_at
                """,
                (bal["id"], bal["stock_lot_id"], int(bal.get("physical_qty") or 0), int(bal.get("reserved_qty") or 0), int(bal.get("available_qty") or 0), int(bal.get("dispatched_qty") or 0), now_iso()),
            )
        for o in data.get("orders", []):
            conn.execute(
                """
                INSERT INTO sales_orders (id, so_number, po_number, msg_ref, bapco_transmittal, customer_id, customer_name, order_date, required_delivery_date, status, order_type, purchase_type, created_by, approved_by, cancellation_date, cancellation_reason, store_remarks, mtc_package_generated, mtc_package_url, po_document_name, po_document_url, items_json, allocations_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    so_number=EXCLUDED.so_number, po_number=EXCLUDED.po_number, msg_ref=EXCLUDED.msg_ref,
                    bapco_transmittal=EXCLUDED.bapco_transmittal, customer_id=EXCLUDED.customer_id, customer_name=EXCLUDED.customer_name,
                    order_date=EXCLUDED.order_date, required_delivery_date=EXCLUDED.required_delivery_date, status=EXCLUDED.status,
                    order_type=EXCLUDED.order_type, purchase_type=EXCLUDED.purchase_type, approved_by=EXCLUDED.approved_by,
                    cancellation_date=EXCLUDED.cancellation_date, cancellation_reason=EXCLUDED.cancellation_reason,
                    store_remarks=EXCLUDED.store_remarks, mtc_package_generated=EXCLUDED.mtc_package_generated,
                    mtc_package_url=EXCLUDED.mtc_package_url, po_document_name=EXCLUDED.po_document_name,
                    po_document_url=EXCLUDED.po_document_url, items_json=EXCLUDED.items_json,
                    allocations_json=EXCLUDED.allocations_json, updated_at=EXCLUDED.updated_at
                """,
                (o["id"], o["so_number"], o["po_number"], o.get("msg_ref", ""), o.get("bapco_transmittal", ""), o["customer_id"], o["customer_name"], o["order_date"], o["required_delivery_date"], o["status"], o.get("order_type", "regular"), o.get("purchase_type", "regular"), o["created_by"], o.get("approved_by"), o.get("cancellation_date"), o.get("cancellation_reason"), o.get("store_remarks"), bool(o.get("mtc_package_generated")), o.get("mtc_package_url"), o.get("po_document_name"), o.get("po_document_url"), json.dumps(o.get("items", [])), json.dumps(o.get("allocations", [])), o.get("created_at", now_iso()), now_iso()),
            )
        _log_audit(conn, user_email, "Restore Full Database JSON", "IT Config", "BACKUP_RESTORE", None, {"orders": len(data.get("orders", [])), "lots": len(data.get("lots", []))})
    return {"success": True, "message": "Database snapshot restored cleanly."}


def clear_all_operational_data(user_email: str) -> Dict[str, Any]:
    with db_transaction() as conn:
        for tbl in ["stock_balances", "stock_lots", "sales_orders", "mtc_certificates", "local_purchases", "stock_movements", "approval_records", "dispatch_records", "stock_returns", "stock_adjustments", "excel_import_jobs", "sourcing_drafts", "loc_drafts"]:
            conn.execute(f"DELETE FROM {tbl}")
        _log_audit(conn, user_email, "Clear Operational Data", "System Admin", "ALL_OPERATIONAL", None, None, "Authorized clear")
    return {"success": True, "message": "All operational stock, order, and certificate records cleared."}


def reset_demo_operational_data(user_email: str) -> Dict[str, Any]:
    """Reset operational tables and restore official MSG Oilfield baseline suppliers, customers, and items."""
    with db_transaction() as conn:
        for tbl in ["stock_balances", "stock_lots", "sales_orders", "mtc_certificates", "local_purchases", "stock_movements", "approval_records", "dispatch_records", "stock_returns", "stock_adjustments", "excel_import_jobs", "sourcing_drafts", "loc_drafts", "suppliers", "customers", "items"]:
            conn.execute(f"DELETE FROM {tbl}")
        ts = now_iso()
        for sup in STANDARD_SUPPLIERS:
            conn.execute(
                "INSERT INTO suppliers (id, supplier_code, supplier_name, country, make, supplier_type, approved_status, contact_person, contact_email, contact_phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (sup["id"], sup["supplier_code"], sup["supplier_name"], sup["country"], sup["make"], sup["supplier_type"], sup["approved_status"], sup.get("contact_person", ""), sup.get("contact_email", ""), sup.get("contact_phone", ""), "2026-01-01", ts),
            )
        for cust in BASELINE_CUSTOMERS:
            conn.execute(
                "INSERT INTO customers (id, customer_code, customer_name, address, contact_details, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (cust["id"], cust["customer_code"], cust["customer_name"], cust["address"], cust["contact_details"], cust["status"], cust["created_at"], ts),
            )
        for it in BASELINE_ITEMS:
            conn.execute(
                "INSERT INTO items (id, item_code, item_description, material_grade, specification, size, uom, unit_price_aed, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, '2026-01-01', ?)",
                (it["id"], it["item_code"], it["item_description"], it["material_grade"], it["specification"], it["size"], it["uom"], it["unit_price_aed"], ts),
            )
        _log_audit(conn, user_email, "Reset to Demo Baseline", "System Admin", "BASELINE_RESET", None, {"suppliers": len(STANDARD_SUPPLIERS), "customers": len(BASELINE_CUSTOMERS), "items": len(BASELINE_ITEMS)})
    return {
        "success": True,
        "message": "Official MSG Oilfield baseline dataset restored cleanly.",
        "counts": {
            "suppliers": len(STANDARD_SUPPLIERS),
            "customers": len(BASELINE_CUSTOMERS),
            "items": len(BASELINE_ITEMS),
        },
    }


def save_sourcing_draft(draft: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    draft_id = draft.get("id") or _uid("DRF")
    draft["id"] = draft_id
    draft["saved_at"] = now_iso()
    draft["editor_username"] = user_email
    with db_transaction() as conn:
        conn.execute(
            """
            INSERT INTO sourcing_drafts (id, client, po_number, msg_ref, payload_json, saved_at, editor_username)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                client=EXCLUDED.client, po_number=EXCLUDED.po_number, msg_ref=EXCLUDED.msg_ref,
                payload_json=EXCLUDED.payload_json, saved_at=EXCLUDED.saved_at, editor_username=EXCLUDED.editor_username
            """,
            (draft_id, draft.get("client", ""), draft.get("po_number", ""), draft.get("msg_ref", ""), json.dumps(draft), draft["saved_at"], user_email),
        )
    return draft


def save_loc_draft(draft: Dict[str, Any]) -> Dict[str, Any]:
    draft_id = draft.get("id") or _uid("LOC")
    draft["id"] = draft_id
    draft["timestamp"] = now_iso()
    meta = draft.get("metadata") or {}
    with db_transaction() as conn:
        conn.execute(
            """
            INSERT INTO loc_drafts (id, po_number, msg_ref, to_client, payload_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                po_number=EXCLUDED.po_number, msg_ref=EXCLUDED.msg_ref, to_client=EXCLUDED.to_client,
                payload_json=EXCLUDED.payload_json, timestamp=EXCLUDED.timestamp
            """,
            (draft_id, meta.get("po_number", ""), meta.get("msg_ref", ""), meta.get("to_client", ""), json.dumps(draft), draft["timestamp"]),
        )
    return draft
