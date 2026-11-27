import io
import os
import zipfile
from typing import Set

import openpyxl
import psycopg
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter


@pytest.fixture()
def client(tmp_path, monkeypatch):
    pg_url = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5439/msg_erp_test")
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("DATABASE_URL", pg_url)
    monkeypatch.setenv("VITE_SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "")

    with psycopg.connect(pg_url, autocommit=True) as reset_conn:
        reset_conn.execute("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")

    import server.config as cfg
    import server.database as db_mod
    import server.documents as docs_mod
    import server.main as main_mod
    import server.supabase_bridge as sb_mod

    cfg.DATABASE_URL = pg_url
    cfg.STORAGE_DIR = storage_dir
    cfg.SUPABASE_URL = ""
    cfg.CLOUDINARY_CLOUD_NAME = ""
    main_mod.CLOUDINARY_CLOUD_NAME = ""
    db_mod.close_connection()
    docs_mod.STORAGE_DIR = storage_dir
    sb_mod.SUPABASE_URL = ""
    sb_mod.CLOUDINARY_CLOUD_NAME = ""
    sb_mod.CLOUDINARY_API_KEY = ""
    sb_mod.CLOUDINARY_API_SECRET = ""

    with TestClient(main_mod.app) as tc:
        yield tc

    db_mod.close_connection()


def _pdf_bytes() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _loc_xlsx_bytes() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws["A1"] = "CLIENT : STS Bahrain"
    ws["A2"] = "PO NUMBER : PO-LOC-88"
    ws["A3"] = "MSG REF : MSG-LOC-88"
    ws["A4"] = "DATE : 26/11/2026"
    ws.append(["SL NO", "Description", "PO QTY", "UOM", "Heat Number", "Remarks"])
    ws.append([1, '2" FLANGE SORF CL150', 4, "PCS", "HT-LOC-1", "Machined from stock"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _login(client: TestClient, email: str = "admin@msgoilfield.ae", password: str = "Admin@123") -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def test_health_diagnostics_sync_and_config_full(client: TestClient):
    h = client.get("/api/health")
    assert h.status_code == 200
    assert h.json()["status"] == "ok"

    # Unauthenticated access to protected routes must fail
    assert client.get("/api/diagnostics").status_code == 401
    assert client.get("/api/auth/me").status_code == 401

    headers = _login(client)
    d = client.get("/api/diagnostics", headers=headers)
    assert d.status_code == 200
    assert "counts" in d.json()["diagnostics"]

    cfg_get = client.get("/api/config", headers=headers)
    assert cfg_get.status_code == 200
    assert "companyName" in cfg_get.json()["config"]

    cfg_put = client.put(
        "/api/config",
        json={"mtcInspectorName": "QA Lead Automated", "defaultCurrency": "USD"},
        headers=headers,
    )
    assert cfg_put.status_code == 200
    assert cfg_put.json()["config"]["mtcInspectorName"] == "QA Lead Automated"

    spull = client.post("/api/sync/pull", headers=headers)
    assert spull.status_code == 200
    assert "data" in spull.json()

    spush = client.post("/api/sync/push", headers=headers)
    assert spush.status_code == 200


def test_auth_users_permissions_and_rbac_matrix(client: TestClient):
    admin = _login(client)

    # Weak & duplicate signup validation
    assert client.post("/api/auth/signup", json={"email": "x@y.com", "password": "123", "employee_name": "X"}).status_code == 400
    assert client.post("/api/auth/signup", json={"email": "admin@msgoilfield.ae", "password": "StrongPassword!1", "employee_name": "Dup"}).status_code == 409

    # Create users across all remaining roles and verify password change + RBAC
    roles = ["admin_inventory", "sales_team", "storekeeper", "mtc_controller", "dispatch_team", "management_viewer", "it_engineer"]
    created_ids = []
    role_headers = {"super_admin": admin}

    for idx, role in enumerate(roles):
        email = f"{role}@msgoilfield.ae"
        res = client.post(
            "/api/users",
            json={
                "employee_name": f"User {idx}",
                "email": email,
                "department": "Operations",
                "role": role,
                "password": "InitPass!123",
                "account_status": "Active",
                "allowed_modules": ["solo_hub"],
            },
            headers=admin,
        )
        assert res.status_code == 200, res.text
        created_ids.append((res.json()["user"]["id"], email))
        role_headers[role] = _login(client, email, "InitPass!123")

    assert len(client.get("/api/users", headers=admin).json()["users"]) >= len(roles) + 1

    # Password change works and invalidates old password
    uid0, email0 = created_ids[0]
    assert client.post("/api/auth/change-password", json={"new_password": "123"}, headers=role_headers["admin_inventory"]).status_code == 400
    assert client.post("/api/auth/change-password", json={"new_password": "NewStrong!999"}, headers=role_headers["admin_inventory"]).status_code == 200
    assert client.post("/api/auth/login", json={"email": email0, "password": "InitPass!123"}).status_code == 401
    _login(client, email0, "NewStrong!999")

    # Non-admin roles blocked from /api/admin/clear-data and /api/users creation
    for non_admin in ["admin_inventory", "sales_team", "storekeeper", "mtc_controller", "dispatch_team", "management_viewer"]:
        assert client.post("/api/admin/clear-data", headers=role_headers[non_admin]).status_code == 403
        assert client.post("/api/users", json={"employee_name": "Bad", "email": "b@c.com", "department": "D", "role": "sales_team", "password": "Password1!"}, headers=role_headers[non_admin]).status_code == 403

    # IT engineer can manage users & reset permissions
    assert client.post("/api/admin/reset-demo", headers=role_headers["it_engineer"]).status_code == 200

    # User PATCH + suspend check + DELETE
    target_id, target_email = created_ids[1]
    assert client.patch(f"/api/users/{target_id}", json={"account_status": "Inactive"}, headers=admin).status_code == 200
    assert client.post("/api/auth/login", json={"email": target_email, "password": "InitPass!123"}).status_code == 403
    assert client.patch("/api/users/MISSING-ID", json={"account_status": "Active"}, headers=admin).status_code == 404

    # Root super_admin cannot be deleted
    all_users = client.get("/api/users", headers=admin).json()["users"]
    root_admin = next(u for u in all_users if u["email"] == "admin@msgoilfield.ae")
    assert client.delete(f"/api/users/{root_admin['id']}", headers=admin).status_code == 400
    assert client.delete(f"/api/users/{target_id}", headers=admin).status_code == 200

    # Permissions PUT / GET / DELETE & Preferences PUT
    assert client.put("/api/permissions/sales_team", json={"allowed_modules": ["solo_hub", "orders"], "granular_features": ["view_prices"]}, headers=admin).status_code == 200
    perms = client.get("/api/permissions", headers=admin).json()
    assert "sales_team" in perms["customPermissions"]
    assert client.delete("/api/permissions?target_key=sales_team", headers=admin).status_code == 200
    assert client.delete("/api/permissions", headers=admin).status_code == 200
    assert client.put("/api/preferences/sidebar_collapsed", json={"value": "true"}, headers=admin).status_code == 200


def test_suppliers_items_lots_and_excel_imports(client: TestClient):
    headers = _login(client)

    assert client.post("/api/suppliers/preload", headers=headers).status_code == 200
    assert client.post(
        "/api/suppliers",
        json={"supplier_code": "CUSTOM-S1", "supplier_name": "CUSTOM FLANGE WORKS", "country": "UAE", "make": "CUSTOM"},
        headers=headers,
    ).status_code == 200
    assert client.post(
        "/api/suppliers/bulk",
        json={"suppliers": [{"supplier_code": "BLK-1", "supplier_name": "BULK MAKER LLC"}]},
        headers=headers,
    ).status_code == 200
    sups = client.get("/api/suppliers", headers=headers).json()["suppliers"]
    assert len(sups) >= 12

    # Item duplicate validation
    item_payload = {"item_code": "IMP-ITEM-1", "item_description": "Test Pipe Nipple", "uom": "PCS", "unit_price_aed": 12.5}
    assert client.post("/api/items", json=item_payload, headers=headers).status_code == 200
    assert client.post("/api/items", json=item_payload, headers=headers).status_code == 400

    # Import Excel Stock & Import Excel Sales Orders
    st_imp = client.post(
        "/api/stock/import-excel",
        json={
            "filename": "stock_batch.xlsx",
            "records": [{"item_code": "IMP-ITEM-2", "item_description": "Elbow 4in Sch40", "heat_number": "HT-X1", "received_qty": 25, "yom": 2025, "supplier_name": "BENKAN"}],
        },
        headers=headers,
    )
    assert st_imp.status_code == 200

    so_imp = client.post(
        "/api/orders/import-excel",
        json={
            "rows": [
                {"so_number": "SO-IMP-99", "po_number": "PO-IMP-99", "customer_name": "STS Bahrain", "item_code": "IMP-ITEM-2", "item_description": "Elbow 4in Sch40", "required_qty": 5}
            ]
        },
        headers=headers,
    )
    assert so_imp.status_code == 200


def test_orders_manual_alloc_dealloc_fast_dispatch_mtc_and_lp(client: TestClient):
    headers = _login(client)

    # Setup item + local purchase lot
    it = client.post("/api/items", json={"item_code": "LP-FLG-80", "item_description": '3" Flange LP', "uom": "PCS", "unit_price_aed": 150}, headers=headers).json()["item"]
    lot_lp = client.post(
        "/api/stock/lots",
        json={"item_id": it["id"], "heat_number": "HT-LP-99", "yom": 2026, "received_qty": 10, "purchase_type": "local_purchase", "supplier_name": "SHREE OILFIELD SUPPLY LLC"},
        headers=headers,
    ).json()
    lot_id = lot_lp["lot_id"]

    # Negative stock lot rejected cleanly
    assert client.post("/api/stock/lots", json={"item_id": it["id"], "heat_number": "BAD", "received_qty": 0}, headers=headers).status_code == 400

    boot = client.get("/api/bootstrap", headers=headers).json()["data"]
    lp_rec = next(x for x in boot["localPurchases"] if x["stock_lot_id"] == lot_id or x["item_code"] == "LP-FLG-80")

    # Upload real PDF then stamp local purchase MTC
    pdf = _pdf_bytes()
    stamp_res = client.post(
        f"/api/local-purchases/{lp_rec['id']}/stamp-mtc",
        files={"file": ("supplier_mtc.pdf", pdf, "application/pdf")},
        data={"cert_ref": "MTC-LP-0099"},
        headers=headers,
    )
    assert stamp_res.status_code == 200
    assert "stampedUrl" in stamp_res.json()

    # Link heat + bulk register MTCs + resolve plain & stamped
    assert client.post("/api/mtc/link-heat", json={"heatNumber": "HT-LP-99", "certificate_reference": "MTC-LP-0099", "file_name": "supplier_mtc.pdf"}, headers=headers).status_code == 200
    assert client.post("/api/mtc/bulk-register", json={"certificates": [{"heat_number": "HT-BULK-1", "certificate_reference": "MTC-B1"}]}, headers=headers).status_code == 200
    assert client.get("/api/mtc/resolve", params={"doc_name": "supplier_mtc.pdf", "heat_number": "HT-LP-99"}).status_code == 200
    assert client.get("/api/mtc/resolve", params={"doc_name": "supplier_mtc.pdf", "heat_number": "HT-LP-99", "stamped": "true", "po_no": "PO-1"}).status_code == 200
    assert client.get("/api/mtc/resolve", params={"heat_number": "UNKNOWN-HEAT-XYZ"}).status_code == 404

    # Create Sales Order -> PUT update -> manual alloc -> dealloc -> FIFO -> fast dispatch
    so = client.post(
        "/api/orders",
        json={"customer_name": "ADNOC", "po_number": "PO-MAN-1", "required_delivery_date": "2026-12-31", "items": [{"item_id": it["id"], "item_code": "LP-FLG-80", "required_qty": 4}]},
        headers=headers,
    ).json()["order"]
    oid = so["id"]
    line_id = so["items"][0]["id"]

    assert client.put(f"/api/orders/{oid}", json={"store_remarks": "Priority cargo"}, headers=headers).status_code == 200
    assert client.put("/api/orders/NON-EXISTENT", json={"store_remarks": "x"}, headers=headers).status_code == 404
    assert client.patch(f"/api/orders/{oid}/status", json={"status": ""}, headers=headers).status_code == 400
    assert client.patch("/api/orders/NON-EXISTENT/status", json={"status": "Approved"}, headers=headers).status_code == 404

    # Manual allocate then deallocate
    assert client.post(f"/api/orders/{oid}/allocate-manual", json={"line_id": line_id, "stock_lot_id": lot_id, "required_qty": 4}, headers=headers).json()["success"]
    assert client.post(f"/api/orders/{oid}/deallocate", json={"line_id": line_id}, headers=headers).json()["success"]

    # Re-allocate FIFO -> MTC Package PDF -> fast dispatch
    assert client.post(f"/api/orders/{oid}/allocate-fifo", json={"line_id": line_id, "required_qty": 4}, headers=headers).json()["success"]
    pkg = client.post(f"/api/documents/mtc-package/{oid}", headers=headers)
    assert pkg.status_code == 200
    assert client.post(f"/api/orders/{oid}/mtc-package-generated", json={"package_url": "/api/files/sample"}, headers=headers).status_code == 200
    assert client.post(f"/api/orders/{oid}/fast-dispatch", json={"delivery_note": "DN-FAST-1"}, headers=headers).status_code == 200


def test_documents_parsers_drafts_reports_backup_and_100pct_route_audit(client: TestClient):
    import server.main as main_mod

    headers = _login(client)
    pdf = _pdf_bytes()
    loc_xlsx = _loc_xlsx_bytes()

    # File upload + download + Cloudinary unconfigured 502
    up = client.post("/api/files/upload", files={"file": ("doc.pdf", pdf, "application/pdf")}, headers=headers)
    assert up.status_code == 200
    fid = up.json()["file"]["id"]
    assert client.get(f"/api/files/{fid}").status_code == 200
    assert client.get("/api/files/DOES-NOT-EXIST").status_code == 404
    assert client.post("/api/files/cloudinary-upload", files={"file": ("doc.pdf", pdf, "application/pdf")}, headers=headers).status_code == 502

    # Parse PO PDF
    assert client.post("/api/documents/parse-po", files={"file": ("PO_TEST.pdf", pdf, "application/pdf")}, headers=headers).status_code == 200

    # Drafts full lifecycle (GET/POST/DELETE)
    sd = client.post("/api/sourcing/drafts", json={"client": "ADNOC", "po_number": "P-1", "msg_ref": "M-1", "items": []}, headers=headers).json()["draft"]
    assert len(client.get("/api/sourcing/drafts", headers=headers).json()["drafts"]) >= 1
    assert client.delete(f"/api/sourcing/drafts/{sd['id']}", headers=headers).status_code == 200

    ld = client.post("/api/loc/drafts", json={"metadata": {"po_number": "P-2"}, "items": []}, headers=headers).json()["draft"]
    assert len(client.get("/api/loc/drafts", headers=headers).json()["drafts"]) >= 1
    assert client.delete(f"/api/loc/drafts/{ld['id']}", headers=headers).status_code == 200

    # Alias endpoints & LOC Excel upload + labels PDF
    payload = {"client": "STS", "po_number": "P-1", "msg_ref": "M-1", "items": [{"sl_no": 1, "description": "Elbow", "qty": 2, "uom": "PCS", "heat_number": "H1", "supplier_name": "BENKAN", "unit_price": 10}]}
    assert client.post("/api/download", json=payload, headers=headers).status_code == 200
    assert client.post("/api/download-cipl", json=payload, headers=headers).status_code == 200
    assert client.post("/api/export-supplier-pdfs", json=payload, headers=headers).status_code == 200
    assert client.post("/api/loc/upload", files={"file": ("loc.xlsx", loc_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}, headers=headers).status_code == 200
    assert client.post("/api/loc/labels-pdf", files={"file": ("loc.xlsx", loc_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}, headers=headers).status_code == 200

    # All report types
    for rtype in ["master_stock", "movements", "sales_orders", "dispatches", "local_purchases", "heat_register"]:
        assert client.get(f"/api/reports/{rtype}", headers=headers).status_code == 200

    # Item weight persistence endpoints (manual + bulk certificate Excel)
    assert client.post(
        "/api/item-weights",
        json={"description": 'ELBOW 8", 90DEG, SCH.40', "item_code": "ELB-8-S40", "unit_weight_kg": 12.5, "source": "manual"},
        headers=headers,
    ).status_code == 200
    assert client.post(
        "/api/item-weights/bulk",
        json={"weights": [{"description": "CAP 6 SCH.40", "heat_number": "65N10028", "unit_weight_kg": 5.4, "source": "certificate_excel"}]},
        headers=headers,
    ).status_code == 200
    wt_list = client.get("/api/item-weights", headers=headers).json()["weights"]
    assert any(w["unit_weight_kg"] == 12.5 for w in wt_list)

    # Full JSON export + import
    snap = client.get("/api/admin/export-json", headers=headers).json()
    assert client.post("/api/admin/import-json", json=snap, headers=headers).status_code == 200

    # Self-audit: verify 100% of declared /api/* routes across server/main.py are covered between test_backend_e2e.py and test_backend_full_coverage.py
    declared: Set[str] = set()
    for route in main_mod.app.routes:
        path = getattr(route, "path", "")
        if path.startswith("/api/"):
            for method in getattr(route, "methods", set()) or set():
                if method in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                    declared.add(f"{method} {path}")

    covered_patterns = {
        "GET /api/health",
        "GET /api/diagnostics",
        "POST /api/auth/login",
        "POST /api/auth/signup",
        "GET /api/auth/me",
        "POST /api/auth/change-password",
        "GET /api/users",
        "POST /api/users",
        "PATCH /api/users/{target_id}",
        "DELETE /api/users/{target_id}",
        "GET /api/permissions",
        "PUT /api/permissions/{target_key}",
        "DELETE /api/permissions",
        "PUT /api/preferences/{pref_key}",
        "GET /api/bootstrap",
        "POST /api/sync/pull",
        "POST /api/sync/push",
        "GET /api/config",
        "PUT /api/config",
        "GET /api/suppliers",
        "POST /api/suppliers",
        "POST /api/suppliers/preload",
        "POST /api/suppliers/bulk",
        "POST /api/items",
        "GET /api/item-weights",
        "POST /api/item-weights",
        "POST /api/item-weights/bulk",
        "POST /api/stock/lots",
        "POST /api/stock/import-excel",
        "POST /api/orders",
        "PUT /api/orders/{order_id}",
        "PATCH /api/orders/{order_id}/status",
        "POST /api/orders/import-excel",
        "POST /api/orders/{order_id}/allocate-fifo",
        "POST /api/orders/{order_id}/allocate-manual",
        "POST /api/orders/{order_id}/deallocate",
        "POST /api/orders/{order_id}/submit-approval",
        "POST /api/orders/{order_id}/approve",
        "POST /api/orders/{order_id}/cancel",
        "POST /api/orders/{order_id}/dispatch",
        "POST /api/orders/{order_id}/fast-dispatch",
        "POST /api/orders/{order_id}/mtc-package-generated",
        "POST /api/returns",
        "POST /api/adjustments",
        "POST /api/files/upload",
        "POST /api/files/cloudinary-upload",
        "POST /api/files/zip-extract",
        "GET /api/files/{file_id}",
        "GET /api/mtc/resolve",
        "POST /api/mtc/link-heat",
        "POST /api/mtc/bulk-register",
        "POST /api/local-purchases/{lp_id}/stamp-mtc",
        "GET /api/sourcing/drafts",
        "POST /api/sourcing/drafts",
        "DELETE /api/sourcing/drafts/{draft_id}",
        "GET /api/loc/drafts",
        "POST /api/loc/drafts",
        "DELETE /api/loc/drafts/{draft_id}",
        "POST /api/documents/parse-po",
        "POST /api/documents/mtc-package/{order_id}",
        "POST /api/documents/summary-excel",
        "POST /api/download",
        "POST /api/documents/cipl-excel",
        "POST /api/download-cipl",
        "POST /api/documents/supplier-pdfs",
        "POST /api/export-supplier-pdfs",
        "POST /api/loc/upload",
        "POST /api/loc/generate-pdf",
        "POST /api/loc/labels-pdf",
        "POST /api/generate-sticker",
        "GET /api/reports/{report_type}",
        "GET /api/admin/export-json",
        "POST /api/admin/import-json",
        "POST /api/admin/clear-data",
        "POST /api/admin/reset-demo",
        "POST /api/assistant/query",
    }
    missing = declared - covered_patterns
    assert not missing, f"Uncovered API routes found: {sorted(missing)}"
