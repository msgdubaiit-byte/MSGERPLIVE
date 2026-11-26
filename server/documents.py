import hashlib
import io
import json
import os
import re
import sys
import tempfile
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.pdfgen import canvas

from .config import BASE_DIR, PUBLIC_CERTS_DIR, PUBLIC_DIR, SERVER_ASSETS_DIR, STORAGE_DIR
from .database import db_read, db_transaction, now_iso
from .supabase_bridge import upload_bytes_to_cloudinary, upload_bytes_to_supabase_storage

# Ensure legacy server generators can resolve sibling imports
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from cipl_generator import generate_cipl_excel  # noqa: E402
from excel_generator import generate_summary_excel  # noqa: E402
from loc_excel_parser import parse_excel_summary as parse_loc_excel  # noqa: E402
from loc_labels_generator import build_loc_pdf as generate_loc_labels_pdf  # noqa: E402
from loc_letterhead_generator import generate_loc_pdf  # noqa: E402
from pdf_parser import extract_pdf_data  # noqa: E402
from sticker_label_generator import build_58mm_stickers_pdf, parse_summary_sheet_xlsx  # noqa: E402
from supplier_pdf_generator import generate_all_supplier_pdfs_zip  # noqa: E402


def _logo_path() -> Optional[str]:
    for cand in [
        PUBLIC_DIR / "logo.png",
        PUBLIC_DIR / "assets" / "logo.png",
        BASE_DIR / "static" / "logo.png",
    ]:
        if cand.exists():
            return str(cand)
    return None


def _signature_path() -> Optional[str]:
    for cand in [
        SERVER_ASSETS_DIR / "signature.png",
        PUBLIC_DIR / "assets" / "signature.png",
    ]:
        if cand.exists():
            return str(cand)
    return None


def detect_heat_from_filename(file_name: str) -> str:
    clean = re.sub(r"\.[^/.]+$", "", file_name).strip()
    clean = re.sub(r"^(?:MTC|HEAT|CERT|CERTIFICATE|EN10204|MILL|MILL_CERT|SUPPLIER_MTC)[\s_\-:]+", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"[\s_\-]+(?:3\.1|EN10204|SIGNED|STAMPED|APPROVED|FINAL|VERIFIED)$", "", clean, flags=re.IGNORECASE)
    return clean.strip()


def count_pdf_pages(file_bytes: bytes) -> int:
    try:
        return len(PdfReader(io.BytesIO(file_bytes)).pages)
    except Exception:
        return 1


def store_uploaded_file(
    file_name: str,
    file_bytes: bytes,
    category: str = "mtc",
    heat_number: str = "",
    uploaded_by: str = "system",
    content_type: str = "application/pdf",
    mirror_cloud: bool = True,
) -> Dict[str, Any]:
    """Persist authentic raw file bytes on disk + optional Supabase Storage / Cloudinary."""
    file_id = f"FILE-{uuid.uuid4().hex[:12].upper()}"
    sha256 = hashlib.sha256(file_bytes).hexdigest()
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", file_name) or f"{file_id}.bin"
    cat_dir = STORAGE_DIR / category
    cat_dir.mkdir(parents=True, exist_ok=True)
    disk_path = cat_dir / f"{file_id}_{safe_name}"
    disk_path.write_bytes(file_bytes)

    cloud_url = ""
    if mirror_cloud:
        cloud_res = upload_bytes_to_cloudinary(safe_name, file_bytes, sub_folder="mtcs" if category == "mtc" else "general")
        if cloud_res.get("success") and cloud_res.get("url"):
            cloud_url = cloud_res["url"]
        else:
            sb_url = upload_bytes_to_supabase_storage(safe_name, file_bytes, folder=category, content_type=content_type)
            if sb_url:
                cloud_url = sb_url

    with db_transaction() as conn:
        conn.execute(
            """
            INSERT INTO stored_files (id, file_name, content_type, byte_size, sha256, local_path, cloud_url, heat_number, category, uploaded_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (file_id, file_name, content_type, len(file_bytes), sha256, str(disk_path), cloud_url, heat_number, category, uploaded_by, now_iso()),
        )

    return {
        "id": file_id,
        "fileName": file_name,
        "sizeBytes": len(file_bytes),
        "sha256": sha256,
        "url": f"/api/files/{file_id}",
        "cloudUrl": cloud_url,
        "pages": count_pdf_pages(file_bytes) if content_type == "application/pdf" else 1,
    }


def extract_and_store_zip(zip_bytes: bytes, uploaded_by: str, candidate_heats: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Extract all PDFs from an uploaded ZIP archive, auto-detect heat numbers, and persist bytes."""
    extracted: List[Dict[str, Any]] = []
    with db_read() as conn:
        lots = [dict(r) for r in conn.execute("SELECT id, item_code, item_description, heat_number, purchase_type, supplier_name, l_code FROM stock_lots").fetchall()]

    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            rel = info.filename.replace("\\", "/")
            if "__MACOSX" in rel or ".DS_Store" in rel or not rel.lower().endswith(".pdf"):
                continue
            raw_bytes = zf.read(info.filename)
            if not raw_bytes:
                continue
            segments = rel.split("/")
            fname = segments[-1]
            heat = detect_heat_from_filename(fname)
            if (not heat or len(heat) < 2) and len(segments) > 1:
                for seg in reversed(segments[:-1]):
                    fh = detect_heat_from_filename(seg)
                    if fh and len(fh) >= 3:
                        heat = fh
                        break

            # Try matching heat against lot records or candidate heats inside PDF text
            if not heat or heat.lower() in ("cert", "mtc", "scan", "document"):
                try:
                    reader = PdfReader(io.BytesIO(raw_bytes))
                    txt = "\n".join(p.extract_text() or "" for p in reader.pages[:2]).upper()
                    for cand in (candidate_heats or []) + [l["heat_number"] for l in lots if l.get("heat_number")]:
                        if cand and len(cand) >= 3 and cand.upper() in txt:
                            heat = cand
                            break
                except Exception:
                    pass

            stored = store_uploaded_file(fname, raw_bytes, category="mtc", heat_number=heat, uploaded_by=uploaded_by, mirror_cloud=False)
            matched_lot = next((l for l in lots if l["heat_number"] and (l["heat_number"].upper() == heat.upper() or l["heat_number"].upper() in fname.upper())), None)
            extracted.append({
                "id": stored["id"],
                "fileName": fname,
                "folderPath": "/".join(segments[:-1]),
                "fileSizeKB": max(1, round(len(raw_bytes) / 1024)),
                "heatNumber": heat or (matched_lot["heat_number"] if matched_lot else ""),
                "matchedLotId": matched_lot["id"] if matched_lot else None,
                "matchedItemDescription": matched_lot["item_description"] if matched_lot else None,
                "matchStatus": "matched" if matched_lot else "unmatched",
                "fileUrl": stored["url"],
                "pages": stored["pages"],
                "supplierName": matched_lot["supplier_name"] if matched_lot else None,
                "purchaseType": matched_lot["purchase_type"] if matched_lot else "regular",
                "lCode": matched_lot["l_code"] if matched_lot else None,
            })
    return extracted


def _read_stored_or_cloud(row: Any) -> Optional[Tuple[bytes, str]]:
    if not row:
        return None
    if row["local_path"] and os.path.exists(row["local_path"]):
        return Path(row["local_path"]).read_bytes(), row["file_name"]
    if row.get("cloud_url"):
        try:
            import httpx as _httpx
            r = _httpx.get(row["cloud_url"], timeout=20.0, follow_redirects=True)
            if r.status_code == 200:
                return r.content, row["file_name"]
        except Exception:
            pass
    return None


def resolve_mtc_bytes(doc_ref: str = "", heat_number: str = "") -> Optional[Tuple[bytes, str]]:
    """Resolve real PDF bytes from stored_files (disk or cloud URL) or public/certificates/."""
    with db_read() as conn:
        # 1. Exact file_id in /api/files/<id>
        m = re.search(r"/api/files/(FILE-[A-Z0-9]+)", doc_ref or "")
        if m:
            row = conn.execute("SELECT file_name, local_path, cloud_url FROM stored_files WHERE id = ?", (m.group(1),)).fetchone()
            found = _read_stored_or_cloud(row)
            if found:
                return found

        # 2. Match stored_files by file_name or heat_number
        if doc_ref:
            row = conn.execute(
                "SELECT file_name, local_path, cloud_url FROM stored_files WHERE lower(file_name) = lower(?) ORDER BY created_at DESC LIMIT 1",
                (os.path.basename(doc_ref),),
            ).fetchone()
            found = _read_stored_or_cloud(row)
            if found:
                return found

        if heat_number:
            row = conn.execute(
                "SELECT file_name, local_path, cloud_url FROM stored_files WHERE upper(heat_number) = upper(?) ORDER BY created_at DESC LIMIT 1",
                (heat_number.strip(),),
            ).fetchone()
            found = _read_stored_or_cloud(row)
            if found:
                return found

    # 3. Search public/certificates/ manifest and PDFs
    if PUBLIC_CERTS_DIR.exists():
        manifest_path = PUBLIC_CERTS_DIR / "manifest.json"
        clean_heat = re.sub(r"[^A-Za-z0-9]", "", heat_number or "").upper()
        clean_ref = os.path.basename(doc_ref or "").lower()
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                for entry in manifest:
                    fn = entry.get("fileName", "")
                    mh = re.sub(r"[^A-Za-z0-9]", "", entry.get("heatNumber", "")).upper()
                    if (clean_ref and clean_ref != "sample-mtc.pdf" and clean_ref in fn.lower()) or (
                        clean_heat and len(clean_heat) >= 3 and (mh == clean_heat or clean_heat in re.sub(r"[^A-Za-z0-9]", "", fn).upper())
                    ):
                        pdf_path = PUBLIC_CERTS_DIR / fn
                        if pdf_path.exists():
                            return pdf_path.read_bytes(), fn
            except Exception:
                pass
    return None


def stamp_mtc_pdf_bytes(raw_pdf: bytes, stamp_opts: Dict[str, Any], sys_cfg: Dict[str, Any]) -> bytes:
    """Apply MSG Oilfield QA/QC dynamic stamp overlay onto a supplier MTC PDF using pypdf + reportlab."""
    reader = PdfReader(io.BytesIO(raw_pdf))
    writer = PdfWriter()

    po_no = str(stamp_opts.get("poNo") or "N/A")
    item_no = str(stamp_opts.get("itemNo") or "Item #1")
    qty = str(stamp_opts.get("qty") or "1")
    sign = str(stamp_opts.get("sign") or sys_cfg.get("inspectorSignName") or "MSG/QC-04")
    date_str = str(stamp_opts.get("dateStr") or now_iso()[:10])
    stamp_color_hex = sys_cfg.get("mtcStampColor") or "#D32F2F"
    try:
        stamp_color = colors.HexColor(stamp_color_hex)
    except Exception:
        stamp_color = colors.HexColor("#D32F2F")

    scale = max(0.5, min(1.5, float(sys_cfg.get("mtcStampScale") or 100) / 100.0))
    off_x = float(sys_cfg.get("mtcStampOffsetX") or 0)
    off_y = float(sys_cfg.get("mtcStampOffsetY") or 0)

    for idx, page in enumerate(reader.pages):
        pw = float(page.mediabox.width)
        ph = float(page.mediabox.height)
        packet = io.BytesIO()
        c = canvas.Canvas(packet, pagesize=(pw, ph))

        bw = 185 * scale
        bh = 68 * scale
        x = max(16.0, pw - bw - 28 + off_x)
        y = max(18.0, 26 + off_y)

        c.saveState()
        c.setStrokeColor(stamp_color)
        c.setLineWidth(float(sys_cfg.get("sealBorderWidth") or 2))
        c.setFillColorRGB(1, 1, 1, alpha=0.88)
        c.rect(x, y, bw, bh, stroke=1, fill=1)
        c.setFillColor(stamp_color)
        c.setFont("Helvetica-Bold", 7.2 * scale)
        c.drawString(x + 6 * scale, y + bh - 12 * scale, "MSG OILFIELD EQUIPMENT TRADING LLC")
        c.setFont("Helvetica", 6.5 * scale)
        c.drawString(x + 6 * scale, y + bh - 24 * scale, f"PO: {po_no[:24]}  |  Item: {item_no[:14]}")
        c.drawString(x + 6 * scale, y + bh - 35 * scale, f"Qty: {qty}  |  Date: {date_str}")
        c.drawString(x + 6 * scale, y + bh - 46 * scale, f"QA/QC Sign: {sign} (Pg {idx + 1}/{len(reader.pages)})")
        c.setFont("Helvetica-Bold", 5.5 * scale)
        c.drawString(x + 6 * scale, y + 6 * scale, (sys_cfg.get("mtcStampText") or "CERTIFIED TRUE COPY")[:42])
        c.restoreState()
        c.save()

        packet.seek(0)
        overlay_page = PdfReader(packet).pages[0]
        page.merge_page(overlay_page)
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def merge_order_mtc_package(order: Dict[str, Any], sys_cfg: Dict[str, Any], apply_stamp: bool = True) -> bytes:
    """Merge all authentic certificates for an order with an official cover sheet."""
    writer = PdfWriter()

    # Cover Page
    pkt = io.BytesIO()
    c = canvas.Canvas(pkt, pagesize=(595, 842))
    c.setFillColor(colors.HexColor("#0B2545"))
    c.rect(0, 740, 595, 102, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(36, 800, sys_cfg.get("companyName") or "MSG OILFIELD EQUIPMENT TRADING LLC")
    c.setFont("Helvetica", 10)
    c.drawString(36, 780, f"EN 10204 3.1 MATERIAL TEST CERTIFICATE PACKAGE")
    c.drawString(36, 760, f"Sales Order: {order.get('so_number')}  |  Client PO: {order.get('po_number')}  |  Client: {order.get('customer_name')}")

    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(36, 710, "INCLUDED HEAT TRACEABLE LINE ITEMS")
    y = 685
    c.setFont("Helvetica", 9)
    for idx, it in enumerate(order.get("items", []), start=1):
        if y < 60:
            c.showPage()
            y = 790
        line = f"{idx}. {it.get('item_code')} | Qty: {it.get('required_qty')} {it.get('uom','PCS')} | Heat: {it.get('heat_number') or 'N/A'} | MTC: {it.get('certificate_number') or 'Vault'}"
        c.drawString(36, y, line[:105])
        y -= 16
    c.save()
    pkt.seek(0)
    writer.add_page(PdfReader(pkt).pages[0])

    seen_hashes = set()
    for idx, it in enumerate(order.get("items", []), start=1):
        resolved = resolve_mtc_bytes(it.get("certificate_number") or "", it.get("heat_number") or "")
        if not resolved:
            continue
        raw_bytes, _fname = resolved
        h = hashlib.sha256(raw_bytes).hexdigest()
        if h in seen_hashes:
            continue
        seen_hashes.add(h)
        pdf_bytes = stamp_mtc_pdf_bytes(
            raw_bytes,
            {
                "poNo": order.get("po_number"),
                "itemNo": f"Item #{it.get('client_po_item_no') or idx}",
                "qty": it.get("required_qty"),
            },
            sys_cfg,
        ) if apply_stamp else raw_bytes
        try:
            for p in PdfReader(io.BytesIO(pdf_bytes)).pages:
                writer.add_page(p)
        except Exception:
            continue

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def generate_report_excel(report_type: str) -> Tuple[bytes, str]:
    """Generate clean .xlsx reports directly from live Supabase PostgreSQL backend tables."""
    wb = openpyxl.Workbook()
    ws = wb.active
    header_fill = PatternFill(start_color="0B2545", end_color="0B2545", fill_type="solid")
    header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")

    with db_read() as conn:
        if report_type == "master_stock":
            ws.title = "Master Stock"
            headers = ["Item Code", "Description", "Heat Number", "YOM", "Location", "Purchase Type", "L-Code", "Supplier", "Physical Qty", "Reserved Qty", "Available Qty", "Dispatched Qty", "MTC Ref"]
            rows = conn.execute(
                """
                SELECT l.item_code, l.item_description, l.heat_number, l.yom, l.warehouse_location,
                       l.purchase_type, l.l_code, l.supplier_name, b.physical_qty, b.reserved_qty,
                       b.available_qty, b.dispatched_qty, l.mtc_ref
                FROM stock_lots l LEFT JOIN stock_balances b ON b.stock_lot_id = l.id
                ORDER BY l.item_code
                """
            ).fetchall()
            filename = "MSG_Master_Stock_Report.xlsx"
        elif report_type == "movements":
            ws.title = "Stock Movements"
            headers = ["ID", "Timestamp", "Movement Type", "Item Code", "Heat Number", "Qty", "Ref Type", "Ref ID", "Prev Bal", "New Bal", "Performed By", "Remarks"]
            rows = conn.execute(
                "SELECT id, timestamp, movement_type, item_code, heat_number, quantity, reference_type, reference_id, previous_balance, new_balance, performed_by, remarks FROM stock_movements ORDER BY id DESC"
            ).fetchall()
            filename = "MSG_Stock_Movements_Ledger.xlsx"
        elif report_type == "sales_orders":
            ws.title = "Sales Orders"
            headers = ["SO Number", "PO Number", "Customer Name", "Order Date", "Delivery Date", "Status", "Order Type", "Created By", "Approved By", "Line Count"]
            raw = conn.execute("SELECT * FROM sales_orders ORDER BY created_at DESC").fetchall()
            rows = [
                (r["so_number"], r["po_number"], r["customer_name"], r["order_date"], r["required_delivery_date"], r["status"], r["order_type"], r["created_by"], r["approved_by"] or "", len(json.loads(r.get("items_json") or "[]") if isinstance(r.get("items_json"), str) else (r.get("items") or [])))
                for r in raw
            ]
            filename = "MSG_Sales_Orders_Report.xlsx"
        elif report_type == "dispatches":
            ws.title = "Dispatches"
            headers = ["Dispatch ID", "SO Number", "Delivery Note", "Dispatch Ref", "Customer", "Dispatch Date", "Dispatched By", "Remarks"]
            rows = conn.execute(
                "SELECT id, so_number, delivery_note_number, dispatch_reference, customer_name, dispatch_date, dispatched_by, delivery_remarks FROM dispatch_records ORDER BY created_at DESC"
            ).fetchall()
            filename = "MSG_Dispatches_Register.xlsx"
        elif report_type == "local_purchases":
            ws.title = "Local Purchases"
            headers = ["L-Code", "Item Code", "Supplier", "Purchase Ref", "Purchase Date", "Qty", "YOM", "MTC Uploaded", "Created By"]
            rows = conn.execute(
                "SELECT l_code, item_code, supplier_name, purchase_reference, purchase_date, received_qty, yom, supplier_mtc_uploaded, created_by FROM local_purchases ORDER BY created_at DESC"
            ).fetchall()
            filename = "MSG_Local_Purchases_Register.xlsx"
        else:
            ws.title = "Heat Register"
            headers = ["Heat Number", "Item Code", "Supplier", "Location", "YOM", "Physical", "Available", "MTC Ref"]
            rows = conn.execute(
                """
                SELECT l.heat_number, l.item_code, l.supplier_name, l.warehouse_location, l.yom,
                       b.physical_qty, b.available_qty, l.mtc_ref
                FROM stock_lots l LEFT JOIN stock_balances b ON b.stock_lot_id = l.id
                ORDER BY l.heat_number
                """
            ).fetchall()
            filename = "MSG_Heat_Traceability_Register.xlsx"

    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        c = ws.cell(row=1, column=col_idx)
        c.fill = header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center")
    for r in rows:
        ws.append([("" if v is None else v) for v in tuple(r)])
    for col in ws.columns:
        max_len = max((len(str(cell.value or "")) for cell in col), default=10)
        ws.column_dimensions[col[0].column_letter].width = min(55, max(12, max_len + 3))

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue(), filename


def parse_po_pdf_bytes(pdf_bytes: bytes, file_name: str) -> Dict[str, Any]:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name
    try:
        return extract_pdf_data(tmp_path)
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass
