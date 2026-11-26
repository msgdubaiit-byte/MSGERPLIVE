import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from server.main import app  # noqa: E402, F401

if __name__ == "__main__":
    import uvicorn

    is_debug = os.environ.get("FLASK_DEBUG", "False").lower() in ("true", "1")
    uvicorn.run("server.main:app", host="127.0.0.1", port=8000, reload=is_debug)
