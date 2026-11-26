import os
import tempfile
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

# Load .env from project root or server dir
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")


def _writable_dir(preferred: Path, fallback_name: str) -> Path:
    try:
        preferred.mkdir(parents=True, exist_ok=True)
        probe = preferred / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return preferred
    except Exception:
        fb = Path(tempfile.gettempdir()) / fallback_name
        fb.mkdir(parents=True, exist_ok=True)
        return fb


STORAGE_DIR = _writable_dir(BASE_DIR / "storage", "msg_erp_storage")
DATABASE_URL = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("SUPABASE_DB_URL")
    or os.environ.get("POSTGRES_URL")
    or ""
).strip()

PUBLIC_DIR = ROOT_DIR / "public"
PUBLIC_CERTS_DIR = PUBLIC_DIR / "certificates"
SERVER_ASSETS_DIR = BASE_DIR / "assets"
SERVER_STATIC_DIR = BASE_DIR / "static"

JWT_SECRET = os.environ.get(
    "JWT_SECRET",
    os.environ.get("SECRET_KEY", "msg_oilfield_erp_jwt_prod_key_2026_v2"),
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "24"))

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("VITE_SUPABASE_URL")
    or ""
).strip().rstrip("/")
SUPABASE_ANON_KEY = (
    os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("VITE_SUPABASE_ANON_KEY")
    or ""
).strip()
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

CLOUDINARY_CLOUD_NAME = (
    os.environ.get("CLOUDINARY_CLOUD_NAME")
    or os.environ.get("VITE_CLOUDINARY_CLOUD_NAME")
    or ""
).strip()
CLOUDINARY_API_KEY = (
    os.environ.get("CLOUDINARY_API_KEY")
    or os.environ.get("VITE_CLOUDINARY_API_KEY")
    or ""
).strip()
CLOUDINARY_API_SECRET = (
    os.environ.get("CLOUDINARY_API_SECRET")
    or os.environ.get("VITE_CLOUDINARY_API_SECRET")
    or ""
).strip()
CLOUDINARY_FOLDER = (
    os.environ.get("CLOUDINARY_FOLDER")
    or os.environ.get("VITE_CLOUDINARY_FOLDER")
    or "msg-oilfield-erp"
).strip()
