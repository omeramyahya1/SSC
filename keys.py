#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SRC_PAGES = ROOT / "src" / "pages"
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

    missing_in_json = sorted(k for k in t_keys if k not in json_union)
    missing_in_en = sorted(k for k in t_keys if k not in en_keys)
    missing_in_ar = sorted(k for k in t_keys if k not in ar_keys)

    print(f"t() keys found in src/pages: {len(t_keys)}")
    print(f"EN translation keys: {len(en_keys)}")
    print(f"AR translation keys: {len(ar_keys)}")
    print(f"Missing in either JSON (not in union): {len(missing_in_json)}")
    print()

    if missing_in_json:
        print("Keys missing from both JSON files:")
        for k in missing_in_json:
            print(k)
    else:
        print("No keys missing from both JSON files.")

    print()
    print("Keys missing from EN JSON:")
    if missing_in_en:
        for k in missing_in_en:
            print(k)
    else:
        print("(none)")

    print()
    print("Keys missing from AR JSON:")
    if missing_in_ar:
        for k in missing_in_ar:
            print(k)
    else:
        print("(none)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
    # pass
