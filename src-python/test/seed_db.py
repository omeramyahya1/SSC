#!/usr/bin/env python3
"""
Seed the local SQLite DB with fake inventory categories and items.

Usage examples:
  python src-python/test/seed_db.py
  python src-python/test/seed_db.py --items-per-category 20 --seed 42
  python src-python/test/seed_db.py --clear --organization-uuid <uuid> --branch-uuid <uuid>
"""

import argparse
import os
import random
import sys
from typing import Dict, List

# Ensure src-python is on sys.path for imports when running from repo root.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_PYTHON_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
if SRC_PYTHON_DIR not in sys.path:
    sys.path.insert(0, SRC_PYTHON_DIR)

from faker import Faker

from db_setup import SessionLocal, create_db_and_tables
from models import InventoryCategory, InventoryItem


DEFAULT_CATEGORIES = [
    {
            "name": "Solar Panels",
            "spec_schema": {
                "panel_rated_power": "W",
                "panel_mpp_voltage": "V"
            }
        },
        {
            "name": "Inverters",
            "spec_schema": {
                "inverter_rated_power": "W",
                "system_voltage_v": "V",
                "inverter_mppt_min_v": "V",
                "inverter_mppt_max_v": "V",
                "output_voltage_v": "V"
            }
        },
        {
            "name": "Batteries",
            "spec_schema": {
                "battery_rated_capacity_ah": "Ah",
                "battery_rated_voltage": "V",
                "battery_max_parallel": "count",
                "dod": "%",
                "efficiency": "%",
                "battery_type": "type"
            }
        },
        {
            "name": "Accessories",
            "spec_schema": {}
        }
]


def _random_panel_specs() -> Dict[str, float]:
    power = random.choice([330, 370, 410, 450, 500, 550, 600])
    mpp_v = round(random.uniform(34.0, 49.5), 1)
    return {
        "panel_rated_power": power,
        "panel_mpp_voltage": mpp_v,
    }


def _random_inverter_specs() -> Dict[str, float]:
    rated = random.choice([1000, 2000, 3000, 5000, 8000, 10000])
    mppt_min = random.choice([80, 100, 120, 150])
    mppt_max = random.choice([450, 500, 550, 600])
    system_v = random.choice([12, 24, 48])
    output_v = random.choice([110, 220, 230])
    return {
        "inverter_rated_power": rated,
        "inverter_mppt_min_v": mppt_min,
        "inverter_mppt_max_v": mppt_max,
        "system_voltage_v": system_v,
        "output_voltage_v": output_v,
    }


def _random_battery_specs() -> Dict[str, float]:
    capacity = random.choice([100, 150, 200, 250, 300])
    voltage = random.choice([12, 24, 48])
    max_parallel = random.choice([2, 3, 4, 6, 8])
    return {
        "battery_rated_capacity_ah": capacity,
        "battery_rated_voltage": voltage,
        "battery_max_parallel": max_parallel,
        "dod": random.choice([70, 80, 90, 95]),
        "efficiency": random.choice([85, 90, 95, 98]),
        "battery_type": random.choice(["lithium", "liquid", "dry"]),
    }


def _random_accessory_specs() -> Dict[str, float]:
    return {}

def _fill_missing_specs(specs: Dict[str, float], schema: Dict[str, str]) -> Dict[str, float]:
    filled = dict(specs)
    for key, unit in (schema or {}).items():
        if key in filled:
            continue
        unit_lower = str(unit).strip().lower()
        if unit_lower == "w":
            filled[key] = random.choice([50, 100, 250, 500, 1000, 2000, 5000])
        elif unit_lower == "v":
            filled[key] = random.choice([12, 24, 48, 120, 240, 400, 600])
        elif unit_lower == "ah":
            filled[key] = random.choice([50, 100, 150, 200, 250, 300])
        elif unit_lower == "%":
            filled[key] = random.choice([70, 80, 85, 90, 95, 98])
        elif unit_lower == "count":
            filled[key] = random.choice([1, 2, 3, 4, 6, 8])
        elif unit_lower == "type":
            filled[key] = random.choice(["lithium", "liquid", "dry"])
        else:
            filled[key] = random.choice([1, 5, 10, 20])
    return filled


def _category_specs_by_name(name: str, schema: Dict[str, str]) -> Dict[str, float]:
    name_lower = name.strip().lower()
    if "panel" in name_lower:
        return _fill_missing_specs(_random_panel_specs(), schema)
    if "inverter" in name_lower:
        return _fill_missing_specs(_random_inverter_specs(), schema)
    if "batter" in name_lower:
        return _fill_missing_specs(_random_battery_specs(), schema)
    return _fill_missing_specs(_random_accessory_specs(), schema)


def _unique_sku(existing: set, prefix: str) -> str:
    while True:
        candidate = f"{prefix}-{random.randint(10000, 99999)}"
        if candidate not in existing:
            existing.add(candidate)
            return candidate


def seed_inventory(
    items_per_category: int,
    seed: int | None,
    organization_uuid: str | None,
    branch_uuid: str | None,
    clear: bool,
) -> None:
    if seed is not None:
        random.seed(seed)

    faker = Faker()
    if seed is not None:
        faker.seed_instance(seed)

    create_db_and_tables()

    with SessionLocal() as db:
        if clear:
            db.query(InventoryItem).delete(synchronize_session=False)
            db.query(InventoryCategory).delete(synchronize_session=False)
            db.commit()

        existing_categories = db.query(InventoryCategory).all()
        categories_by_name = {c.name: c for c in existing_categories}

        for cat in DEFAULT_CATEGORIES:
            if cat["name"] in categories_by_name:
                continue
            new_cat = InventoryCategory(
                name=cat["name"],
                spec_schema=cat["spec_schema"],
                organization_uuid=organization_uuid,
            )
            new_cat.is_dirty = True
            db.add(new_cat)

        db.commit()

        categories = db.query(InventoryCategory).all()
        if not categories:
            raise RuntimeError("No inventory categories found or created.")

        sku_set = {row.sku for row in db.query(InventoryItem.sku).all() if row.sku}

        brand_pool = [
            "Trina",
            "JA Solar",
            "Jinko",
            "Canadian Solar",
            "Growatt",
            "SMA",
            "Victron",
            "Huawei",
            "Pylontech",
            "BYD",
            "LG Chem",
            "Felicity",
            "Must",
        ]

        new_items: List[InventoryItem] = []
        for category in categories:
            for _ in range(items_per_category):
                prefix = category.name.split()[0].upper()[:3]
                sku = _unique_sku(sku_set, prefix)
                brand = random.choice(brand_pool)
                model = f"{faker.word().capitalize()}-{random.randint(100, 999)}"

                buy_price = round(random.uniform(50, 800), 2)
                margin = random.uniform(1.15, 1.45)
                sell_price = round(buy_price * margin, 2)

                item = InventoryItem(
                    organization_uuid=organization_uuid,
                    branch_uuid=branch_uuid,
                    name=f"{brand} {category.name} {model}",
                    sku=sku,
                    brand=brand,
                    model=model,
                    category_uuid=category.uuid,
                    technical_specs=_category_specs_by_name(
                        category.name,
                        category.spec_schema or {},
                    ),
                    quantity_on_hand=random.randint(0, 250),
                    low_stock_threshold=random.randint(5, 25),
                    buy_price=buy_price,
                    sell_price=sell_price,
                )
                item.is_dirty = True
                new_items.append(item)

        db.add_all(new_items)
        db.commit()

        print(f"Seeded {len(categories)} categories and {len(new_items)} items.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed fake inventory data.")
    parser.add_argument("--items-per-category", type=int, default=10)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--organization-uuid", type=str, default=None)
    parser.add_argument("--branch-uuid", type=str, default=None)
    parser.add_argument("--clear", action="store_true", help="Clear existing inventory data first.")
    args = parser.parse_args()

    seed_inventory(
        items_per_category=args.items_per_category,
        seed=args.seed,
        organization_uuid="1302fffd-6b17-4751-9edc-91012429eb66",
        branch_uuid="6d6f0c23-9145-492d-baa4-b1b91a86eb3d",
        clear=args.clear,
    )


if __name__ == "__main__":
    main()
