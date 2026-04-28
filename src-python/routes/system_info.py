from flask import Blueprint, jsonify
from pathlib import Path
import json
import os

from utils import get_db
import models
from typing import Optional


system_info_bp = Blueprint("system_info_bp", __name__, url_prefix="/system")


def _read_json_file(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _get_app_version() -> str:
    # Expected repo layout:
    # <root>/package.json
    # <root>/src-tauri/tauri.conf.json
    root = Path(__file__).resolve().parents[2]

    pkg_path = root / "package.json"
    pkg = _read_json_file(pkg_path)
    if pkg and isinstance(pkg, dict) and isinstance(pkg.get("version"), str):
        return pkg["version"]

    tauri_path = root / "src-tauri" / "tauri.conf.json"
    tauri_conf = _read_json_file(tauri_path)
    if tauri_conf and isinstance(tauri_conf, dict) and isinstance(tauri_conf.get("version"), str):
        return tauri_conf["version"]

    return "unknown"


def _get_local_db_size_bytes() -> int:
    try:
        return int(os.path.getsize(models.DB_FILE_PATH))
    except Exception:
        return 0


def _get_last_sync_utc(db) -> Optional[str]:
    last_sync = (
        db.query(models.SyncLog)
        .filter(models.SyncLog.status == "success")
        .order_by(models.SyncLog.created_at.desc())
        .first()
    )
    if not last_sync or not last_sync.created_at:
        return None
    return last_sync.created_at.isoformat()


@system_info_bp.route("/info", methods=["GET"])
def get_system_info():
    with get_db() as db:
        return (
            jsonify(
                {
                    "app_version": _get_app_version(),
                    "local_db_size_bytes": _get_local_db_size_bytes(),
                    "last_sync_utc": _get_last_sync_utc(db),
                }
            ),
            200,
        )
