import io
import os
import tempfile
import zipfile
from pathlib import Path

import openpyxl
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter


@pytest.fixture()
def client(tmp_path, monkeypatch):
    pg_url = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5439/msg_erp_test")
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("DATABASE_URL", pg_url)
    # Prevent network calls to external Supabase REST/Cloudinary during isolated tests
    monkeypatch.setenv("VITE_SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_URL", "")

    import psycopg
    with psycopg.connect(pg_url, autocommit=True) as reset_conn:
        reset_conn.execute("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")

    import server.config as cfg
    import server.database as db_mod
    import server.documents as docs_mod
    import server.supabase_bridge as sb_mod

    cfg.DATABASE_URL = pg_url
    cfg.STORAGE_DIR = storage_dir
    cfg.SUPABASE_URL = ""
    db_mod.close_connection()
    docs_mod.STORAGE_DIR = storage_dir
    sb_mod.SUPABASE_URL = ""

    from server.main import app

    with TestClient(app) as tc:
        yield tc

    db_mod.close_connection()


def _make_sample_pdf_bytes(text: str = "MTC") -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _make_sample_summary_xlsx() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws["A1"] = "Client : STS Bahrain"
    ws["A2"] = "PO Number : PO-TEST-991"
    ws["A3"] = "MSG Ref : MSG-2026-001"
    ws.append(["SL NO", "CLIENT PO ITEM NO", "Description", "PO Qty", "UOM", "Heat Number", "Certificate Number", "MAKE", "Remarks"])
    ws.append([1, "10", 'ELBOW 90 DEG 2" SCH.80 ASTM A234 WPB', 5, "PCS", "HT-8890", "MTC-8890.pdf", "BENKAN", "LOCATION-1"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _login(client: TestClient, email: str = "admin@msgoilfield.ae", password: str = "Admin@123") -> dict:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_auth_security_and_rbac(client: TestClient):
    # Universal bypass Pass@123 must NOT work for admin@msgoilfield.ae
    bad = client.post("/api/auth/login", json={"email": "admin@msgoilfield.ae", "password": "Pass@123"})
    assert bad.status_code == 401

    # Valid login works and returns JWT without password
    headers = _login(client)
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "admin@msgoilfield.ae"
    assert "password_hash" not in me.json()["user"]

    # Signup new sales_team user and verify RBAC blocks admin-only config update
    su = client.post(
        "/api/auth/signup",
        json={
            "email": "sales.rep@msgoilfield.ae",
            "password": "StrongPassword!9",
            "employee_name": "Sales Rep",
            "department": "Sales",
            "role": "sales_team",
        },
    )
    assert su.status_code == 200
    sales_headers = {"Authorization": f"Bearer {su.json()['token']}"}
    forbidden = client.put("/api/config", json={"companyName": "Hacked"}, headers=sales_headers)
    assert forbidden.status_code == 403


def test_full_inventory_order_allocation_dispatch_return_lifecycle(client: TestClient):
    headers = _login(client)

    # 1. Create Item + Two Stock Lots for FIFO verification
    r_item = client.post(
        "/api/items",
        json={
            "item_code": "FLG-2-150-SS316",
            "item_description": '2" Flange SORF CL150 SS316/316L',
            "material_grade": "SS316L",
            "specification": "ASTM A182",
            "size": '2" #150',
            "uom": "PCS",
            "unit_price_aed": 85.0,
        },
        headers=headers,
    )
    assert r_item.status_code == 200
    item_id = r_item.json()["item"]["id"]

    r_lot1 = client.post(
        "/api/stock/lots",
        json={
            "item_id": item_id,
            "heat_number": "HEAT-A100",
            "yom": 2024,
            "received_qty": 10,
            "purchase_type": "regular",
            "supplier_name": "WMASS GERMANY",
            "warehouse_location": "LN-A1",
        },
        headers=headers,
    )
    assert r_lot1.status_code == 200
    lot1_id = r_lot1.json()["lot_id"]

    # 2. Create Sales Order & Allocate FIFO
    r_so = client.post(
        "/api/orders",
        json={
            "customer_name": "ADNOC Refining",
            "po_number": "PO-ADNOC-1001",
            "required_delivery_date": "2026-12-30",
            "items": [{"item_id": item_id, "item_code": "FLG-2-150-SS316", "required_qty": 6}],
        },
        headers=headers,
    )
    assert r_so.status_code == 200
    order = r_so.json()["order"]
    order_id = order["id"]
    line_id = order["items"][0]["id"]

    r_alloc = client.post(f"/api/orders/{order_id}/allocate-fifo", json={"line_id": line_id, "required_qty": 6}, headers=headers)
    assert r_alloc.status_code == 200
    assert r_alloc.json()["success"] is True

    # 3. Submit -> Storekeeper Approve -> Partial Dispatch (4 PCS) -> Return (1 PCS) -> Stock Adjustment
    assert client.post(f"/api/orders/{order_id}/submit-approval", headers=headers).json()["success"]
    assert client.post(
        f"/api/orders/{order_id}/approve",
        json={"approver_name": "Tariq Yard-1", "status": "Approved", "remarks": "Verified markings"},
        headers=headers,
    ).json()["success"]

    boot = client.get("/api/bootstrap", headers=headers).json()["data"]
    ord_refreshed = next(o for o in boot["orders"] if o["id"] == order_id)
    alloc_id = ord_refreshed["allocations"][0]["id"]

    r_disp = client.post(
        f"/api/orders/{order_id}/dispatch",
        json={"items": [{"allocation_id": alloc_id, "dispatch_qty": 4}], "delivery_note": "DN-9001", "dispatch_ref": "TRK-1"},
        headers=headers,
    )
    assert r_disp.status_code == 200
    assert "Partially Dispatched" in r_disp.json()["message"]

    # Cancel remaining 2 un-dispatched PCS -> must restore 2 PCS to available
    r_cancel = client.post(f"/api/orders/{order_id}/cancel", json={"reason": "Client reduced qty"}, headers=headers)
    assert r_cancel.status_code == 200
    assert "Released 2" in r_cancel.json()["message"]

    # Return 1 PCS from dispatched goods & adjust stock
    r_ret = client.post(
        "/api/returns",
        json={"sales_order_id": order_id, "stock_lot_id": lot1_id, "qty": 1, "reason": "Excess on site"},
        headers=headers,
    )
    assert r_ret.status_code == 200
    assert r_ret.json()["success"]

    r_adj = client.post(
        "/api/adjustments",
        json={"stock_lot_id": lot1_id, "new_physical_qty": 8, "reason": "Cycle count reconciliation"},
        headers=headers,
    )
    assert r_adj.status_code == 200
    assert r_adj.json()["success"]

    boot2 = client.get("/api/bootstrap", headers=headers).json()["data"]
    assert len(boot2["approvals"]) == 1
    assert len(boot2["dispatches"]) == 1
    assert len(boot2["returns"]) == 1
    assert len(boot2["adjustments"]) == 1
    assert len(boot2["audits"]) >= 5


def test_file_vault_zip_extract_documents_and_drafts(client: TestClient):
    headers = _login(client)
    pdf_bytes = _make_sample_pdf_bytes()

    # Upload real PDF file and download byte-for-byte
    up = client.post(
        "/api/files/upload",
        files={"file": ("MTC_HEAT-A100.pdf", pdf_bytes, "application/pdf")},
        data={"category": "mtc", "heat_number": "HEAT-A100"},
        headers=headers,
    )
    assert up.status_code == 200
    file_url = up.json()["file"]["url"]
    dl = client.get(file_url)
    assert dl.status_code == 200
    assert dl.content == pdf_bytes

    # ZIP extraction
    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w") as zf:
        zf.writestr("certs/HEAT_9911.pdf", pdf_bytes)
    zresp = client.post(
        "/api/files/zip-extract",
        files={"file": ("mtcs.zip", zbuf.getvalue(), "application/zip")},
        headers=headers,
    )
    assert zresp.status_code == 200
    assert zresp.json()["count"] == 1
    assert zresp.json()["certificates"][0]["heatNumber"] == "9911"

    # Sourcing & LOC drafts + Excel/PDF generators
    d1 = client.post("/api/sourcing/drafts", json={"client": "STS", "po_number": "PO-1", "msg_ref": "MSG-1", "items": []}, headers=headers)
    assert d1.status_code == 200
    assert len(client.get("/api/sourcing/drafts", headers=headers).json()["drafts"]) == 1

    l1 = client.post("/api/loc/drafts", json={"metadata": {"po_number": "PO-1", "to_client": "STS"}, "items": []}, headers=headers)
    assert l1.status_code == 200
    assert len(client.get("/api/loc/drafts", headers=headers).json()["drafts"]) == 1

    # Excel Summary, CIPL, Supplier PO ZIP, LOC PDF, Stickers PDF, Reports
    payload = {
        "client": "STS Bahrain",
        "po_number": "PO-101",
        "msg_ref": "MSG-101",
        "items": [{"sl_no": 1, "description": 'ELBOW 2" SCH.80 WPB', "qty": 5, "uom": "PCS", "heat_number": "HT-1", "certificate_number": "MTC-1", "make": "BENKAN", "remarks": "Machined from S.80", "supplier_name": "BENKAN CORP", "unit_price": 25}],
    }
    assert client.post("/api/documents/summary-excel", json=payload, headers=headers).status_code == 200
    assert client.post("/api/documents/cipl-excel", json=payload, headers=headers).status_code == 200
    assert client.post("/api/documents/supplier-pdfs", json=payload, headers=headers).status_code == 200
    assert client.post("/api/loc/generate-pdf", json={"metadata": {"to_client": "STS", "po_number": "PO-1", "msg_ref": "MSG-1", "date": "26/11/2026", "action_type": "machined"}, "items": [{"sl_no": 1, "description": "Elbow", "po_qty": 5, "uom": "PCS", "heat_number": "HT-1", "remarks": "Machined"}]}, headers=headers).status_code == 200

    xlsx_bytes = _make_sample_summary_xlsx()
    assert client.post("/api/generate-sticker", files={"file": ("summary.xlsx", xlsx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}, headers=headers).status_code == 200
    assert client.get("/api/reports/master_stock", headers=headers).status_code == 200

    # AI Assistant live DB query
    aresp = client.post("/api/assistant/query", json={"query": "vet stock health"}, headers=headers)
    assert aresp.status_code == 200
    assert aresp.json()["reply"]["type"] == "stock_audit"


def test_order_status_patch_and_admin_clear_reset_baseline(client: TestClient):
    headers = _login(client)

    # Create a quick SO and verify PATCH /api/orders/{id}/status persists
    so = client.post(
        "/api/orders",
        json={
            "po_number": "PO-STATUS-01",
            "customer_id": "CUST-STS",
            "customer_name": "Bahrain Special Technical Services (STS) Co. W.L.L",
            "order_date": "2026-11-26",
            "required_delivery_date": "2026-12-05",
            "items": [{"item_code": "WSO15150F316", "item_description": '1/2" Flange SORF CL150', "uom": "PCS", "required_qty": 2}],
        },
        headers=headers,
    )
    assert so.status_code == 200
    order_id = so.json()["order"]["id"]

    p = client.patch(f"/api/orders/{order_id}/status", json={"status": "Approved"}, headers=headers)
    assert p.status_code == 200
    assert p.json()["order"]["status"] == "Approved"

    # Clear operational data -> orders wiped
    clr = client.post("/api/admin/clear-data", headers=headers)
    assert clr.status_code == 200
    boot_after_clear = client.get("/api/bootstrap", headers=headers).json()["data"]
    assert len(boot_after_clear["orders"]) == 0

    # Reset to baseline demo dataset -> suppliers, customers, and baseline items restored; transactions clean
    rst = client.post("/api/admin/reset-demo", headers=headers)
    assert rst.status_code == 200
    assert rst.json()["success"]
    boot_after_reset = client.get("/api/bootstrap", headers=headers).json()["data"]
    assert len(boot_after_reset["orders"]) == 0
    assert len(boot_after_reset["suppliers"]) == 10
    assert len(boot_after_reset["customers"]) == 12
    assert len(boot_after_reset["items"]) == 12
