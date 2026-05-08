#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SRC_PAGES = ROOT / "src"
EN_JSON = ROOT / "public" / "locales" / "en" / "translations.json"
AR_JSON = ROOT / "public" / "locales" / "ar" / "translations.json"


T_CALL_RE = re.compile(r"\bt\s*\(\s*(['\"`])([^'\"`]+)\1")


def flatten_keys(data: object, prefix: str = "") -> set[str]:
    keys: set[str] = set()
    if isinstance(data, dict):
        for k, v in data.items():
            if not isinstance(k, str):
                continue
            next_prefix = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                keys.update(flatten_keys(v, next_prefix))
            else:
                keys.add(next_prefix)
    else:
        if prefix:
            keys.add(prefix)
    return keys


def load_json_keys(path: Path) -> set[str]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return flatten_keys(data)


def extract_t_keys_from_file(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    keys: set[str] = set()
    for match in T_CALL_RE.finditer(text):
        quote = match.group(1)
        key = match.group(2)
        if quote == "`" and "${" in key:
            # Skip non-static template literals
            continue
        keys.add(key.strip())
    return keys


def extract_t_keys_from_dir(root: Path) -> set[str]:
    keys: set[str] = set()
    for path in root.rglob("*"):
        if path.suffix in {".ts", ".tsx", ".js", ".jsx"} and path.is_file():
            keys.update(extract_t_keys_from_file(path))
    return keys

def delete_nested_key(data: dict, key_path: str) -> bool:
    """
    Deletes a nested key from a dict using dot notation.
    Returns True if deletion happened.
    """
    parts = key_path.split(".")
    current = data
    stack = []

    # Traverse to parent
    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            return False
        stack.append((current, part))
        current = current[part]

    # Delete final key
    last = parts[-1]
    if last in current:
        del current[last]
    else:
        return False

    # Cleanup empty parents (bottom-up)
    for parent, part in reversed(stack):
        if not parent[part]:  # empty dict
            del parent[part]
        else:
            break

    return True


def delete_keys_from_file(path: Path, keys_to_delete: list[str], dry_run: bool = True) -> int:
    """
    Deletes keys from a JSON file. Returns number of deleted keys.
    """
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    deleted_count = 0

    for key in keys_to_delete:
        if delete_nested_key(data, key):
            deleted_count += 1

    if dry_run:
        print(f"[DRY RUN] {path.name}: {deleted_count} keys would be deleted.")
        return deleted_count

    # Write back
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"{path.name}: Deleted {deleted_count} keys.")
    return deleted_count

def main() -> int:
    if not EN_JSON.exists() or not AR_JSON.exists():
        print("Missing translations.json files.")
        if not EN_JSON.exists():
            print(f"- {EN_JSON}")
        if not AR_JSON.exists():
            print(f"- {AR_JSON}")
        return 1

    en_keys = load_json_keys(EN_JSON)
    ar_keys = load_json_keys(AR_JSON)
    json_union = en_keys | ar_keys

    t_keys = extract_t_keys_from_dir(SRC_PAGES)

    # Existing checks (code → JSON)
    missing_in_json = sorted(k for k in t_keys if k not in json_union)
    missing_in_en = sorted(k for k in t_keys if k not in en_keys)
    missing_in_ar = sorted(k for k in t_keys if k not in ar_keys)

    # ✅ NEW: JSON → code (unused keys)
    unused_in_code = sorted(k for k in json_union if k not in t_keys)
    unused_in_code_en = sorted(k for k in en_keys if k not in t_keys)
    unused_in_code_ar = sorted(k for k in ar_keys if k not in t_keys)

    print(f"t() keys found in src: {len(t_keys)}")
    print(f"EN translation keys: {len(en_keys)}")
    print(f"AR translation keys: {len(ar_keys)}")
    print()

    # -----------------------------
    # Missing (code → JSON)
    # -----------------------------
    print(f"Missing in either JSON (not in union): {len(missing_in_json)}")
    if missing_in_json:
        print("Keys missing from both JSON files:")
        for k in missing_in_json:
            if k != "finances.methods.":
                print(k)
    else:
        print("No keys missing from both JSON files.")

    print()
    print("Keys missing from EN JSON:")
    if missing_in_en:
        for k in missing_in_en:
            if k != "finances.methods.":
                print(k)
    else:
        print("(none)")

    print()
    print("Keys missing from AR JSON:")
    if missing_in_ar:
        for k in missing_in_ar:
            if k != "finances.methods.":
                print(k)
    else:
        print("(none)")

    # -----------------------------
    # ✅ NEW: Unused (JSON → code)
    # -----------------------------
    print()
    print(f"Keys present in JSON but NOT used in code: {len(unused_in_code)}")
    if unused_in_code:
        print("Unused translation keys (union):")
        for k in unused_in_code:
            print(k)
    else:
        print("(none)")

    print()
    print("Unused keys in EN JSON:")
    if unused_in_code_en:
        for k in unused_in_code_en:
            print(k)
    else:
        print("(none)")

    print()
    print("Unused keys in AR JSON:")
    if unused_in_code_ar:
        for k in unused_in_code_ar:
            print(k)
    else:
        print("(none)")

    # # -----------------------------------
    # # DELETE UNUSED KEYS (JSON → code)
    # # -----------------------------------

    # DRY_RUN = False  # ⚠️ set to False to actually delete

    # print()
    # print("Deleting unused translation keys...")

    # delete_keys_from_file(EN_JSON, unused_in_code, dry_run=DRY_RUN)
    # delete_keys_from_file(AR_JSON, unused_in_code, dry_run=DRY_RUN)

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
    # pass
