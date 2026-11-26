from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import JWT_ALGORITHM, JWT_EXPIRE_HOURS, JWT_SECRET
from .database import db_read, db_transaction, now_iso, now_stamp, parse_json_col

bearer_scheme = HTTPBearer(auto_error=False)

DEFAULT_ROLE_MODULES: Dict[str, List[str]] = {
    "super_admin": [
        "solo_hub", "dashboard", "stock", "items", "traceability", "orders", "allocation", "sourcing",
        "loc", "stickers", "approvals", "mtc", "local_purchase", "dispatch", "movements",
        "returns", "reports", "excel", "users", "audit", "settings",
    ],
    "admin_inventory": [
        "solo_hub", "dashboard", "stock", "items", "traceability", "orders", "allocation", "sourcing",
        "loc", "stickers", "approvals", "mtc", "local_purchase", "movements", "returns", "reports", "excel", "settings",
    ],
    "sales_team": [
        "solo_hub", "dashboard", "orders", "sourcing", "stickers", "loc", "stock", "traceability",
    ],
    "storekeeper": [
        "solo_hub", "approvals", "stock", "traceability", "loc", "dispatch", "movements",
    ],
    "mtc_controller": [
        "solo_hub", "mtc", "traceability", "orders", "stock", "local_purchase",
    ],
    "dispatch_team": [
        "solo_hub", "dispatch", "orders", "stickers", "stock",
    ],
    "management_viewer": [
        "solo_hub", "dashboard", "reports", "stock", "orders", "audit",
    ],
    "it_engineer": [
        "it_console", "settings", "users", "audit", "excel",
    ],
}


def hash_password(plain: str) -> str:
    if plain.startswith("$2a$") or plain.startswith("$2b$") or plain.startswith("$2y$"):
        return plain
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, stored_hash: str) -> bool:
    if not plain or not stored_hash:
        return False
    if stored_hash.startswith("$2a$") or stored_hash.startswith("$2b$") or stored_hash.startswith("$2y$"):
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), stored_hash.encode("utf-8"))
        except Exception:
            return False
    return plain == stored_hash


def sanitize_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "employee_name": row["employee_name"],
        "email": row["email"],
        "department": row["department"],
        "role": row["role"],
        "account_status": row["account_status"],
        "allowed_modules": parse_json_col(row.get("allowed_modules_json") or row.get("allowed_modules"), []),
        "created_at": row.get("created_at", ""),
        "last_login": row.get("last_login"),
    }


def create_access_token(user: Dict[str, Any]) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRE_HOURS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session token expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token.")


def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Dict[str, Any]:
    token = None
    if creds and creds.credentials:
        token = creds.credentials
    elif request.query_params.get("token"):
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
        )

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    with db_read() as conn:
        row = conn.execute("SELECT * FROM user_profiles WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account no longer exists.")
        user = dict(row)
        if user.get("account_status") != "Active":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated or suspended.")
        return sanitize_user(user)


def get_optional_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[Dict[str, Any]]:
    try:
        return get_current_user(request, creds)
    except HTTPException:
        return None


def require_roles(*allowed_roles: str):
    def _checker(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user['role']}' is not authorized for this action.",
            )
        return user

    return _checker


def resolve_user_by_identifier(conn, identifier: str) -> Optional[Dict[str, Any]]:
    clean = identifier.strip().lower()
    row = conn.execute("SELECT * FROM user_profiles WHERE lower(email) = ?", (clean,)).fetchone()
    if row:
        return dict(row)

    # Support shorthand login identifiers (e.g. "admin", "it.engineer")
    if clean in ("it.engineer", "it.engineer@msgoilfield.ae", "it.engineer@msgoilfield.com"):
        row = conn.execute(
            "SELECT * FROM user_profiles WHERE lower(email) IN ('it.engineer@msgoilfield.ae','it.engineer@msgoilfield.com') OR role = 'it_engineer' LIMIT 1"
        ).fetchone()
    elif clean in ("admin", "admin@msgoilfield.ae", "info@msgoilfield.com"):
        row = conn.execute(
            "SELECT * FROM user_profiles WHERE lower(email) IN ('admin@msgoilfield.ae','info@msgoilfield.com') OR role = 'super_admin' LIMIT 1"
        ).fetchone()
    return dict(row) if row else None


def seed_default_users_if_empty() -> None:
    with db_transaction() as conn:
        cnt = conn.execute("SELECT COUNT(*) FROM user_profiles").fetchone()[0]
        if cnt > 0:
            return
        defaults = [
            (
                "USR-001",
                "Alex Turner (IT Systems Engineer)",
                "it.engineer@msgoilfield.ae",
                "IT Systems & Architecture",
                "it_engineer",
                "Active",
                hash_password("Admin@123"),
                "[]",
                "2026-01-01",
                now_stamp(),
            ),
            (
                "USR-002",
                "Zaid Al-Mansoor (Super Administrator)",
                "admin@msgoilfield.ae",
                "Executive Management",
                "super_admin",
                "Active",
                hash_password("Admin@123"),
                "[]",
                "2026-01-01",
                now_stamp(),
            ),
        ]
        conn.executemany(
            """
            INSERT INTO user_profiles
            (id, employee_name, email, department, role, account_status, password_hash, allowed_modules_json, created_at, last_login)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO NOTHING
            """,
            defaults,
        )


def is_it_data_masked(user: Optional[Dict[str, Any]], conn) -> bool:
    if not user or user.get("role") != "it_engineer":
        return False
    cfg = conn.execute("SELECT data_privacy_masking_for_it FROM system_config WHERE id='SYSTEM_CONFIG_MAIN'").fetchone()
    return bool(cfg["data_privacy_masking_for_it"]) if cfg else True


def mask_commercial_bootstrap_for_it(data: Dict[str, Any]) -> Dict[str, Any]:
    """Enforce IT Engineer privacy redaction server-side when enabled."""
    masked = dict(data)
    masked["orders"] = []
    masked["customers"] = []
    masked["dispatches"] = []
    masked["returns"] = []
    masked["approvals"] = []
    masked["localPurchases"] = []
    masked["sourcingDrafts"] = []
    masked["locDrafts"] = []
    masked["items"] = [
        {**it, "unit_price_aed": 0}
        for it in data.get("items", [])
    ]
    return masked
