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


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object at the root.")
    return data


def load_json_keys(path: Path) -> set[str]:
    return flatten_keys(load_json(path))


def extract_t_keys_from_file(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    keys: set[str] = set()
    for match in T_CALL_RE.finditer(text):
        quote = match.group(1)
        key = match.group(2)
        if quote == "`" and "${" in key:
            continue
        keys.add(key.strip())
    return keys


def extract_t_keys_from_dir(root: Path) -> set[str]:
    keys: set[str] = set()
    for path in root.rglob("*"):
        if path.is_file() and path.suffix in {".ts", ".tsx", ".js", ".jsx"}:
            keys.update(extract_t_keys_from_file(path))
    return keys


def load_all_src_text(root: Path) -> str:
    parts: list[str] = []
    for path in root.rglob("*"):
        if path.is_file() and path.suffix in {".ts", ".tsx", ".js", ".jsx"}:
            parts.append(path.read_text(encoding="utf-8", errors="ignore"))
    return "\n".join(parts)


def delete_nested_or_flat_key(data: dict, key_path: str) -> bool:
    """
    Deletes a key from a dict.

    Supports:
    - Flat dotted keys: {"a.b": "x"}  -> delete "a.b"
    - Nested objects:   {"a": {"b": "x"}} -> delete via "a.b"

    Returns True if deletion happened.
    """
    # 1) Flat key (common in i18n)
    if key_path in data:
        del data[key_path]
        return True

    # 2) Nested dot-walk
    parts = key_path.split(".")
    if len(parts) < 2:
        return False

    current = data
    stack: list[tuple[dict, str]] = []

    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            return False
        stack.append((current, part))
        current = current[part]

    last = parts[-1]
    if last not in current:
        return False

    del current[last]

    # Cleanup empty parents
    for parent, part in reversed(stack):
        if isinstance(parent.get(part), dict) and not parent[part]:
            del parent[part]
        else:
            break

    return True


def delete_keys_from_file(path: Path, keys_to_delete: list[str], dry_run: bool = True) -> int:
    data = load_json(path)

    deleted_count = 0
    for key in keys_to_delete:
        if delete_nested_or_flat_key(data, key):
            deleted_count += 1

    if dry_run:
        print(f"[DRY RUN] {path.name}: {deleted_count} keys would be deleted.")
        return deleted_count

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

    # Find keys that are in JSON but not used by t("...") calls
    candidate_unused = sorted(k for k in json_union if k not in t_keys)

    print("Loading src/ text for plain-string searching...")
    all_src_text = load_all_src_text(SRC_PAGES)

    # If key appears anywhere in src/ as plain text, keep it (skip deletion)
    truly_unused = [k for k in candidate_unused if k not in all_src_text]

    # Delete only keys that exist in BOTH translation files (so we can remove from both)
    deletable = sorted(k for k in truly_unused if k in en_keys and k in ar_keys)

    print()
    print(f"t() keys found in src: {len(t_keys)}")
    print(f"EN translation keys: {len(en_keys)}")
    print(f"AR translation keys: {len(ar_keys)}")
    print()
    print(f"Keys in JSON but NOT found in src (t() or plain text): {len(truly_unused)}")
    print(f"Keys deletable (present in BOTH EN+AR): {len(deletable)}")

    if not truly_unused:
        print("No unused keys found.")
        return 0

    print()
    print("Unused keys (not in src even as text):")
    for k in truly_unused:
        print(k)

    if truly_unused and not deletable:
        print()
        print("None of these unused keys exist in BOTH EN and AR, so nothing will be removed from both files.")
        return 0

    print()
    print("Keys that will be removed from BOTH EN and AR:")
    for k in deletable:
        print(k)

    print()
    response = input("Remove these keys from both translations.json files? (y/N/true): ").strip().lower()
    if response not in ("y", "yes", "true"):
        print("Skipping deletion.")
        return 0

    print("Deleting unused translation keys...")
    delete_keys_from_file(EN_JSON, deletable, dry_run=False)
    delete_keys_from_file(AR_JSON, deletable, dry_run=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
