import json
import os
import threading
from contextlib import contextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional, Sequence

import psycopg
from psycopg.rows import dict_row

from . import config as cfg

_DB_LOCK = threading.RLock()
_CONN: Optional[psycopg.Connection] = None


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")


def today_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _normalize_value(val: Any) -> Any:
    if isinstance(val, datetime):
        return val.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if val.tzinfo else val.strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(val, date):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    return val


class _DualRow(dict):
    """Dictionary row that also supports integer positional indexing (e.g. row[0])."""

    def __init__(self, data: Dict[str, Any]):
        normalized = {k: _normalize_value(v) for k, v in data.items()}
        super().__init__(normalized)
        self._values = list(normalized.values())

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)


def _convert_sql(sql: str, has_params: bool) -> str:
    """Convert positional '?' SQL placeholders outside string literals to PostgreSQL '%s'."""
    out: List[str] = []
    in_single = False
    in_double = False
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        if ch == "'" and not in_double:
            if in_single and i + 1 < n and sql[i + 1] == "'":
                out.append("''")
                i += 2
                continue
            in_single = not in_single
            out.append(ch)
        elif ch == '"' and not in_single:
            in_double = not in_double
            out.append(ch)
        elif ch == "?" and not in_single and not in_double:
            out.append("%s")
        elif ch == "%" and has_params and not in_single and not in_double:
            out.append("%%")
        elif ch == "%" and has_params and in_single:
            out.append("%%")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


class _PgCursorResult:
    def __init__(self, rows: Optional[List[Dict[str, Any]]] = None, rowcount: int = 0):
        self._rows = [_DualRow(r) for r in (rows or [])]
        self.rowcount = rowcount

    def fetchone(self) -> Optional[_DualRow]:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> List[_DualRow]:
        return self._rows


class _PgConnAdapter:
    def __init__(self, raw_conn: psycopg.Connection):
        self._conn = raw_conn

    def execute(self, sql: str, params: Optional[Sequence[Any]] = None) -> _PgCursorResult:
        has_params = params is not None
        pg_sql = _convert_sql(sql, has_params=has_params)
        with self._conn.cursor(row_factory=dict_row) as cur:
            cur.execute(pg_sql, tuple(params) if params is not None else None)
            rows = cur.fetchall() if cur.description is not None else []
            return _PgCursorResult(rows=rows, rowcount=cur.rowcount)

    def executemany(self, sql: str, seq_of_params: Iterable[Sequence[Any]]) -> None:
        items = [tuple(p) for p in seq_of_params]
        if not items:
            return
        pg_sql = _convert_sql(sql, has_params=True)
        with self._conn.cursor() as cur:
            cur.executemany(pg_sql, items)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


def _resolve_database_url() -> str:
    url = (
        os.environ.get("DATABASE_URL")
        or os.environ.get("SUPABASE_DB_URL")
        or os.environ.get("POSTGRES_URL")
        or cfg.DATABASE_URL
        or ""
    ).strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL (Supabase PostgreSQL connection string) is required. "
            "Configure DATABASE_URL in .env or hosting environment variables."
        )
    return url


def _connect() -> psycopg.Connection:
    url = _resolve_database_url()
    return psycopg.connect(url, autocommit=False, row_factory=dict_row, connect_timeout=15)


def get_connection() -> psycopg.Connection:
    global _CONN
    if _CONN is None or _CONN.closed:
        _CONN = _connect()
        return _CONN
    try:
        with _CONN.cursor() as cur:
            cur.execute("SELECT 1")
        _CONN.commit()
    except Exception:
        try:
            _CONN.close()
        except Exception:
            pass
        _CONN = _connect()
    return _CONN


def close_connection() -> None:
    global _CONN
    if _CONN is not None:
        try:
            _CONN.close()
        except Exception:
            pass
        _CONN = None


@contextmanager
def db_transaction():
    """Thread-safe PostgreSQL ACID transaction context manager."""
    with _DB_LOCK:
        raw_conn = get_connection()
        adapter = _PgConnAdapter(raw_conn)
        try:
            yield adapter
            raw_conn.commit()
        except Exception:
            try:
                raw_conn.rollback()
            except Exception:
                pass
            raise


@contextmanager
def db_read():
    """Thread-safe PostgreSQL read connection."""
    with _DB_LOCK:
        raw_conn = get_connection()
        adapter = _PgConnAdapter(raw_conn)
        try:
            yield adapter
            raw_conn.commit()
        except Exception:
            try:
                raw_conn.rollback()
            except Exception:
                pass
            raise


def rows_to_dicts(rows: List[Any]) -> List[Dict[str, Any]]:
    return [dict(r) for r in rows]


_SCHEMA_STATEMENTS: List[str] = [
    """
    CREATE TABLE IF NOT EXISTS public.system_config (
        id TEXT PRIMARY KEY DEFAULT 'SYSTEM_CONFIG_MAIN',
        company_name TEXT NOT NULL DEFAULT 'MSG OILFIELD EQUIPMENT TRADING LLC',
        trn_number TEXT DEFAULT '100293847500003',
        default_currency TEXT DEFAULT 'AED',
        company_address TEXT DEFAULT 'Industrial Area 2, Al Qusais, P.O. Box 92831, Dubai, United Arab Emirates',
        contact_email TEXT DEFAULT 'sales@msgoilfield.ae',
        contact_phone TEXT DEFAULT '+971 4 288 1234',
        theme_primary_color TEXT DEFAULT '#0B2545',
        mtc_stamp_text TEXT DEFAULT 'CERTIFIED TRUE COPY OF ORIGINAL / MSG QA/QC APPROVED',
        mtc_stamp_color TEXT DEFAULT '#D32F2F',
        mtc_stamp_scale INTEGER DEFAULT 100,
        mtc_stamp_offset_x INTEGER DEFAULT 0,
        mtc_stamp_offset_y INTEGER DEFAULT 0,
        mtc_inspector_name TEXT DEFAULT 'QA/QC Lead Inspector',
        inspector_designation TEXT DEFAULT 'Senior QA/QC Materials Inspector',
        inspector_sign_name TEXT DEFAULT 'MSG/QC-04',
        custom_seal_data_url TEXT DEFAULT '',
        custom_signature_data_url TEXT DEFAULT '',
        seal_shape TEXT DEFAULT 'rectangular',
        seal_border_width INTEGER DEFAULT 2,
        show_machined_tag BOOLEAN DEFAULT TRUE,
        default_weight_safety_buffer INTEGER DEFAULT 15,
        cipl_invoice_prefix TEXT DEFAULT 'CIPL-INV-',
        qr_sticker_format TEXT DEFAULT 'thermal_4x6',
        enable_audit_logging BOOLEAN DEFAULT TRUE,
        session_timeout_minutes INTEGER DEFAULT 60,
        data_privacy_masking_for_it BOOLEAN DEFAULT TRUE,
        updated_at TEXT DEFAULT ''
    )
    """,
    "ALTER TABLE public.system_config ADD COLUMN IF NOT EXISTS enable_audit_logging BOOLEAN DEFAULT TRUE",
    "ALTER TABLE public.system_config ADD COLUMN IF NOT EXISTS session_timeout_minutes INTEGER DEFAULT 60",
    "ALTER TABLE public.system_config ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT ''",
    """
    CREATE TABLE IF NOT EXISTS public.user_profiles (
        id TEXT PRIMARY KEY,
        employee_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        department TEXT NOT NULL,
        role TEXT NOT NULL,
        account_status TEXT NOT NULL DEFAULT 'Active',
        password_hash TEXT NOT NULL DEFAULT '',
        allowed_modules_json TEXT DEFAULT '[]',
        created_at TEXT DEFAULT '',
        last_login TEXT
    )
    """,
    "ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT ''",
    "ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS allowed_modules_json TEXT DEFAULT '[]'",
    "ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS password TEXT DEFAULT ''",
    "ALTER TABLE public.user_profiles ALTER COLUMN password DROP NOT NULL",
    "UPDATE public.user_profiles SET password_hash = COALESCE(NULLIF(password_hash, ''), password, '') WHERE COALESCE(password_hash, '') = ''",
    """
    CREATE TABLE IF NOT EXISTS public.custom_permissions (
        target_key TEXT PRIMARY KEY,
        allowed_modules_json TEXT DEFAULT '[]',
        granular_features_json TEXT DEFAULT '[]',
        updated_at TEXT DEFAULT '',
        updated_by TEXT DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS public.user_preferences (
        user_id TEXT NOT NULL,
        pref_key TEXT NOT NULL,
        pref_value TEXT NOT NULL,
        updated_at TEXT DEFAULT '',
        PRIMARY KEY (user_id, pref_key)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS public.suppliers (
        id TEXT PRIMARY KEY,
        supplier_code TEXT UNIQUE NOT NULL,
        supplier_name TEXT NOT NULL,
        country TEXT NOT NULL DEFAULT 'United Arab Emirates',
        make TEXT DEFAULT '',
        supplier_type TEXT NOT NULL DEFAULT 'international_maker',
        approved_status TEXT NOT NULL DEFAULT 'Approved',
        contact_person TEXT DEFAULT '',
        contact_email TEXT DEFAULT '',
        contact_phone TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT ''
    )
    """,
    "ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_type_check",
    """
    CREATE TABLE IF NOT EXISTS public.customers (
        id TEXT PRIMARY KEY,
        customer_code TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        address TEXT DEFAULT '',
        contact_details TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Active',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT ''
    )
    """,
    "ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT ''",
    """
    CREATE TABLE IF NOT EXISTS public.items (
        id TEXT PRIMARY KEY,
        item_code TEXT UNIQUE NOT NULL,
        item_description TEXT NOT NULL,
        material_grade TEXT DEFAULT '',
        specification TEXT DEFAULT '',
        size TEXT DEFAULT '',
        uom TEXT NOT NULL DEFAULT 'PCS',
        unit_price_aed DOUBLE PRECISION DEFAULT 0.0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT ''
    )
    """,
    "ALTER TABLE public.items ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT ''",
    """
    CREATE TABLE IF NOT EXISTS public.stock_lots (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        item_description TEXT NOT NULL DEFAULT '',
        heat_number TEXT NOT NULL,
        yom INTEGER DEFAULT 0,
        original_qty INTEGER NOT NULL CHECK (original_qty >= 0),
        received_qty INTEGER NOT NULL CHECK (received_qty >= 0),
        purchase_type TEXT NOT NULL DEFAULT 'regular',
        supplier_name TEXT NOT NULL DEFAULT '',
        l_code TEXT,
        stock_receipt_date TEXT NOT NULL DEFAULT '',
        warehouse_location TEXT NOT NULL DEFAULT 'MAIN YARD',
        mtc_ref TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT ''
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_stock_lots_heat ON public.stock_lots(heat_number)",
    "CREATE INDEX IF NOT EXISTS idx_stock_lots_item ON public.stock_lots(item_code)",
    """
    CREATE TABLE IF NOT EXISTS public.stock_balances (
        id TEXT PRIMARY KEY,
        stock_lot_id TEXT UNIQUE NOT NULL REFERENCES public.stock_lots(id) ON DELETE CASCADE,
        physical_qty INTEGER NOT NULL DEFAULT 0 CHECK (physical_qty >= 0),
        reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
        available_qty INTEGER NOT NULL DEFAULT 0 CHECK (available_qty >= 0),
        dispatched_qty INTEGER NOT NULL DEFAULT 0 CHECK (dispatched_qty >= 0),
        updated_at TEXT DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS public.sales_orders (
        id TEXT PRIMARY KEY,
        so_number TEXT UNIQUE NOT NULL,
        po_number TEXT NOT NULL,
        msg_ref TEXT DEFAULT '',
        bapco_transmittal TEXT DEFAULT '',
        customer_id TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        order_date TEXT NOT NULL,
        required_delivery_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Draft',
        order_type TEXT DEFAULT 'regular',
        purchase_type TEXT DEFAULT 'regular',
        created_by TEXT NOT NULL,
        approved_by TEXT,
        cancellation_date TEXT,
        cancellation_reason TEXT,
        store_remarks TEXT,
        mtc_package_generated BOOLEAN DEFAULT FALSE,
        mtc_package_url TEXT,
        po_document_name TEXT,
        po_document_url TEXT,
        items_json TEXT NOT NULL DEFAULT '[]',
        allocations_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT ''
    )
    """,
    "ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check",
    "ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS msg_ref TEXT DEFAULT ''",
    "ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS bapco_transmittal TEXT DEFAULT ''",
    "ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'regular'",
    "ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS purchase_type TEXT DEFAULT 'regular'",
    "ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS items_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS allocations_json TEXT NOT NULL DEFAULT '[]'",
    "CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON public.sales_orders(status)",
    """
    CREATE TABLE IF NOT EXISTS public.mtc_certificates (
        id TEXT PRIMARY KEY,
        item_id TEXT DEFAULT '',
        item_code TEXT NOT NULL,
        stock_lot_id TEXT DEFAULT '',
        heat_number TEXT NOT NULL,
        l_code TEXT,
        yom INTEGER DEFAULT 2025,
        certificate_reference TEXT NOT NULL,
        original_file_path TEXT NOT NULL,
        stamped_file_path TEXT,
        purchase_type TEXT NOT NULL DEFAULT 'regular',
        supplier_name TEXT NOT NULL DEFAULT '',
        upload_date TEXT DEFAULT '',
        uploaded_by TEXT DEFAULT '',
        verification_status TEXT NOT NULL DEFAULT 'Verified',
        approval_status TEXT NOT NULL DEFAULT 'Approved',
        pages INTEGER DEFAULT 1,
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT ''
    )
    """,
    "ALTER TABLE public.mtc_certificates ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_mtc_heat ON public.mtc_certificates(heat_number)",
    """
    CREATE TABLE IF NOT EXISTS public.local_purchases (
        id TEXT PRIMARY KEY,
        l_code TEXT UNIQUE NOT NULL,
        item_id TEXT DEFAULT '',
        item_code TEXT NOT NULL,
        stock_lot_id TEXT DEFAULT '',
        supplier_name TEXT NOT NULL,
        purchase_reference TEXT NOT NULL,
        purchase_date TEXT NOT NULL,
        received_qty INTEGER NOT NULL CHECK (received_qty > 0),
        yom INTEGER DEFAULT 2025,
        mtc_certificate_id TEXT,
        supplier_mtc_uploaded BOOLEAN DEFAULT FALSE,
        created_by TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT ''
    )
    """,
    "ALTER TABLE public.local_purchases ADD COLUMN IF NOT EXISTS mtc_certificate_id TEXT",
    "ALTER TABLE public.local_purchases ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT ''",
    """
    CREATE TABLE IF NOT EXISTS public.stock_movements (
        id TEXT PRIMARY KEY,
        stock_lot_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        heat_number TEXT NOT NULL,
        movement_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        reference_type TEXT DEFAULT '',
        reference_id TEXT DEFAULT '',
        previous_balance INTEGER DEFAULT 0,
        new_balance INTEGER DEFAULT 0,
        performed_by TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        remarks TEXT DEFAULT ''
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_movements_lot ON public.stock_movements(stock_lot_id)",
    """
    CREATE TABLE IF NOT EXISTS public.approval_records (
        id TEXT PRIMARY KEY,
        sales_order_id TEXT NOT NULL,
        so_number TEXT NOT NULL,
        approval_type TEXT NOT NULL,
        approval_status TEXT NOT NULL,
        approved_by TEXT NOT NULL,
        approval_date TEXT NOT NULL,
        rejection_reason TEXT,
        remarks TEXT,
        created_at TEXT DEFAULT ''
    )
    """,
    "ALTER TABLE public.approval_records DROP CONSTRAINT IF EXISTS approval_records_approval_status_check",
    """
    CREATE TABLE IF NOT EXISTS public.dispatch_records (
        id TEXT PRIMARY KEY,
        sales_order_id TEXT NOT NULL,
        so_number TEXT NOT NULL,
        dispatch_reference TEXT NOT NULL,
        dispatch_date TEXT NOT NULL,
        delivery_note_number TEXT NOT NULL,
        customer_name TEXT NOT NULL DEFAULT '',
        dispatched_by TEXT NOT NULL DEFAULT '',
        delivery_remarks TEXT DEFAULT '',
        items_summary_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT DEFAULT ''
    )
    """,
    "ALTER TABLE public.dispatch_records ADD COLUMN IF NOT EXISTS items_summary_json TEXT NOT NULL DEFAULT '[]'",
    """
    CREATE TABLE IF NOT EXISTS public.stock_returns (
        id TEXT PRIMARY KEY,
        sales_order_id TEXT NOT NULL,
        so_number TEXT NOT NULL,
        stock_lot_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        heat_number TEXT NOT NULL,
        returned_qty INTEGER NOT NULL CHECK (returned_qty > 0),
        return_date TEXT NOT NULL,
        reason TEXT NOT NULL,
        authorized_by TEXT NOT NULL,
        acceptance_status TEXT NOT NULL DEFAULT 'Accepted',
        created_at TEXT DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS public.stock_adjustments (
        id TEXT PRIMARY KEY,
        stock_lot_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        heat_number TEXT NOT NULL,
        original_balance INTEGER NOT NULL,
        adjusted_balance INTEGER NOT NULL,
        difference_qty INTEGER NOT NULL,
        reason TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        approved_by TEXT,
        status TEXT NOT NULL DEFAULT 'Approved',
        created_at TEXT DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS public.audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_email TEXT NOT NULL,
        action TEXT NOT NULL,
        module TEXT NOT NULL,
        record_id TEXT NOT NULL,
        previous_values TEXT,
        new_values TEXT,
        timestamp TEXT NOT NULL,
        reason TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS public.excel_import_jobs (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        upload_date TEXT NOT NULL,
        import_type TEXT NOT NULL,
        total_rows INTEGER NOT NULL DEFAULT 0,
        successful_rows INTEGER NOT NULL DEFAULT 0,
        failed_rows INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        validation_report TEXT DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS public.sourcing_drafts (
        id TEXT PRIMARY KEY,
        client TEXT DEFAULT '',
        po_number TEXT DEFAULT '',
        msg_ref TEXT DEFAULT '',
        payload_json TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        editor_username TEXT DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS public.loc_drafts (
        id TEXT PRIMARY KEY,
        po_number TEXT DEFAULT '',
        msg_ref TEXT DEFAULT '',
        to_client TEXT DEFAULT '',
        payload_json TEXT NOT NULL,
        timestamp TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS public.stored_files (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'application/pdf',
        byte_size INTEGER NOT NULL DEFAULT 0,
        sha256 TEXT NOT NULL,
        local_path TEXT NOT NULL,
        cloud_url TEXT DEFAULT '',
        heat_number TEXT DEFAULT '',
        category TEXT DEFAULT 'mtc',
        uploaded_by TEXT DEFAULT '',
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS public.sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
]


def init_schema() -> None:
    """Initialize and migrate all production ERP tables in Supabase PostgreSQL."""
    with db_transaction() as conn:
        for stmt in _SCHEMA_STATEMENTS:
            conn.execute(stmt)
        # Backfill legacy Supabase sales_orders JSONB items/allocations if items_json is empty
        has_legacy_so = conn.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name = 'items'
            """
        ).fetchone()
        if has_legacy_so:
            conn.execute(
                """
                UPDATE public.sales_orders
                SET items_json = CASE WHEN items_json = '[]' AND items IS NOT NULL THEN items::text ELSE items_json END,
                    allocations_json = CASE WHEN allocations_json = '[]' AND allocations IS NOT NULL THEN allocations::text ELSE allocations_json END
                """
            )


def parse_json_col(raw: Any, default: Any) -> Any:
    if raw is None or raw == "":
        return default
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return default
