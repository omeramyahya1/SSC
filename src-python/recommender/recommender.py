import math
from models import InventoryItem, InventoryCategory, ProjectComponent
from sqlalchemy.orm import Session
from sqlalchemy import false

def get_category_uuid(db: Session, category_name: str, scope: dict | None = None):
    query = db.query(InventoryCategory).filter(InventoryCategory.name.ilike(f"%{category_name}%"))
    if scope:
        if scope.get("org_uuid"):
            query = query.filter(InventoryCategory.organization_uuid == scope["org_uuid"])
        elif scope.get("user_uuid"):
            query = query.filter(InventoryCategory.user_uuid == scope["user_uuid"])
        else:
            return None
    cat = query.first()
    return cat.uuid if cat else None

def safe_float(value, default=0.0):
    try:
        return float(value) if value is not None else default
    except (ValueError, TypeError):
        return default

def first_spec_value(specs: dict, keys: list, default=0.0):
    for k in keys:
        if k in specs and specs[k] is not None:
            return safe_float(specs[k], default)
    return default

def _apply_item_scope(query, scope: dict | None):
    if not scope:
        return query
    if scope.get("org_uuid"):
        query = query.filter(InventoryItem.organization_uuid == scope["org_uuid"])
        if scope.get("branch_uuid"):
            query = query.filter(InventoryItem.branch_uuid == scope["branch_uuid"])
        return query
    if scope.get("user_uuid"):
        return query.filter(InventoryItem.user_uuid == scope["user_uuid"])
    return query.filter(false())

def generate_recommendations(db: Session, ble_results: dict, scope: dict | None = None):
    """
    Core function to generate component recommendations based on BLE results and inventory.
    """
    data = ble_results.get("data", {})
    inverter_req = data.get("inverter", {})
    battery_req = data.get("battery_bank", {})
    panel_req = data.get("solar_panels", {})
    metadata = data.get("metadata", {})

    # Target DC system voltage (e.g. 12, 24, 48)
    dc_system_voltage = safe_float(battery_req.get("system_voltage_v") or inverter_req.get("system_voltage_v"))
    required_inverter_power = safe_float(inverter_req.get("recommended_rating"))
    total_daily_energy_wh = safe_float(metadata.get("total_daily_energy_wh", 0))

    recommendations = []
    selected_inverter = None
    selected_panel = None
    selected_battery = None

    # 1. Inverter Selection
    inverter_cat_uuid = get_category_uuid(db, "inverter", scope)
    if inverter_cat_uuid:
        inverters = _apply_item_scope(db.query(InventoryItem), scope).filter(
            InventoryItem.category_uuid == inverter_cat_uuid,
            InventoryItem.quantity_on_hand > 0,
            InventoryItem.deleted_at.is_(None)
        ).all()

        qualified_inverters = []
        for inv in inverters:
            specs = inv.technical_specs or {}
            inv_power = first_spec_value(specs, ["inverter_rated_power", "power_rating_w"])
            inv_voltage = first_spec_value(specs, ["system_voltage_v", "dc_input_voltage", "input_voltage_v", "voltage"])

            # Check DC voltage compatibility and power
            if inv_voltage == dc_system_voltage and inv_power >= required_inverter_power:
                qualified_inverters.append(inv)

        if qualified_inverters:
            # Select lowest qualifying power @ lowest price
            qualified_inverters.sort(key=lambda x: (
                first_spec_value(x.technical_specs, ["inverter_rated_power", "power_rating_w"]),
                (x.sell_price if x.sell_price is not None else float('inf'))
            ))
            selected_inverter = qualified_inverters[0]

            flags = []
            if selected_inverter.sell_price is None:
                flags.append("sell price not set")

            recommendations.append({
                "item_uuid": selected_inverter.uuid,
                "name": selected_inverter.name,
                "quantity": inverter_req.get("quantity", 1),
                "unit_price": selected_inverter.sell_price,
                "category": "Inverter",
                "flags": flags
            })
        else:
            recommendations.append({
                "category": "Inverter",
                "flags": ["No matching inverter found in inventory for system voltage and power requirements"]
            })

    # 2. Battery Selection
    battery_cat_uuid = get_category_uuid(db, "batteries", scope)
    if battery_cat_uuid:
        batteries = _apply_item_scope(db.query(InventoryItem), scope).filter(
            InventoryItem.category_uuid == battery_cat_uuid,
            InventoryItem.quantity_on_hand > 0,
            InventoryItem.deleted_at == None
        ).all()

        # BLE suggests a specific battery unit capacity
        required_unit_capacity_ah = safe_float(
            battery_req.get("capacity_per_unit_ah") or battery_req.get("capacity_ah"),
            0.0
        )
        required_unit_voltage = safe_float(
            battery_req.get("voltage_per_unit_v") or battery_req.get("voltage") or 12.0
        )

        qualified_batteries = []
        for batt in batteries:
            specs = batt.technical_specs or {}
            batt_cap = first_spec_value(specs, ["battery_rated_capacity_ah", "capacity_ah"])
            batt_v = first_spec_value(specs, ["battery_rated_voltage", "voltage"])

            # Match voltage and at least the required capacity
            if batt_v == required_unit_voltage and (required_unit_capacity_ah <= 0 or batt_cap >= required_unit_capacity_ah):
                qualified_batteries.append(batt)

        flags = []
        if not qualified_batteries and batteries:
            # Fallback: ignore capacity if no battery meets it, but still try to match voltage
            qualified_batteries = [b for b in batteries if first_spec_value(b.technical_specs, ["battery_rated_voltage", "voltage"]) == required_unit_voltage]
            if not qualified_batteries:
                qualified_batteries = batteries
                flags.append("No batteries matching unit voltage found; selecting closest available")
            else:
                flags.append("No batteries meet required capacity; selecting closest voltage match")

        if qualified_batteries:
            # Sort: Voltage match first, then closest capacity, then price
            def battery_sort_key(b):
                specs = b.technical_specs or {}
                cap = first_spec_value(specs, ["battery_rated_capacity_ah", "capacity_ah"], 0.0)
                volt = first_spec_value(specs, ["battery_rated_voltage", "voltage"], 0.0)
                price = b.sell_price if b.sell_price and b.sell_price > 0 else float('inf')
                volt_match = 0 if volt == required_unit_voltage else 1
                cap_diff = abs(cap - required_unit_capacity_ah) if required_unit_capacity_ah > 0 else 0
                return (volt_match, cap_diff, price)

            qualified_batteries.sort(key=battery_sort_key)
            selected_battery = qualified_batteries[0]

            if selected_battery.sell_price is None:
                flags.append("sell price not set")

            qty = battery_req.get("quantity", 1)

            recommendations.append({
                "item_uuid": selected_battery.uuid,
                "name": selected_battery.name,
                "quantity": qty,
                "unit_price": selected_battery.sell_price,
                "category": "Battery",
                "flags": flags
            })
        else:
            recommendations.append({
                "category": "Battery",
                "flags": ["No batteries found in inventory"]
            })

    # 3. Panel Selection & MPPT Re-calculation
    panel_cat_uuid = get_category_uuid(db, "panel", scope)
    if panel_cat_uuid:
        panels = _apply_item_scope(db.query(InventoryItem), scope).filter(
            InventoryItem.category_uuid == panel_cat_uuid,
            InventoryItem.quantity_on_hand > 0,
            InventoryItem.deleted_at == None
        ).all()

        if panels:
            required_panel_power = safe_float(panel_req.get("power_rating_w"), 0.0)

            def panel_power(p):
                specs = p.technical_specs or {}
                return first_spec_value(specs, ["panel_rated_power", "power_rating_w"], 0.0)

            def panel_sort_key(p):
                pwr = panel_power(p)
                price = p.sell_price if p.sell_price and p.sell_price > 0 else float('inf')
                meets = pwr >= required_panel_power if required_panel_power > 0 else True
                return (0 if meets else 1, price, -pwr)

            panels.sort(key=panel_sort_key)
            selected_panel = panels[0]

            flags = []
            if selected_panel.sell_price is None:
                flags.append("sell price not set")
            if required_panel_power > 0 and panel_power(selected_panel) < required_panel_power:
                flags.append("Selected panel below required power rating")

            # MPPT Re-calculation if inverter is selected
            qty = panel_req.get("quantity", 1)
            if selected_inverter:
                inv_specs = selected_inverter.technical_specs or {}
                v_mppt_min = first_spec_value(inv_specs, ["inverter_mppt_min_v"], 120.0)
                v_mppt_max = first_spec_value(inv_specs, ["inverter_mppt_max_v"], 450.0)

                pan_specs = selected_panel.technical_specs or {}
                v_mpp = first_spec_value(pan_specs, ["panel_mpp_voltage", "voltage"], 40.0)

                if v_mpp > 0:
                    max_panels_in_string = math.floor(v_mppt_max / v_mpp)
                    min_panels_in_string = math.ceil(v_mppt_min / v_mpp)

                    if max_panels_in_string < 1:
                        flags.append("Mismatch: Panel voltage too high for inverter MPPT")
                    elif min_panels_in_string > max_panels_in_string:
                        flags.append("Mismatch: Impossible to satisfy MPPT range with this panel")

            recommendations.append({
                "item_uuid": selected_panel.uuid,
                "name": selected_panel.name,
                "quantity": qty,
                "unit_price": selected_panel.sell_price,
                "category": "Panel",
                "flags": flags
            })
        else:
            recommendations.append({
                "category": "Panel",
                "flags": ["No panels found in inventory"]
            })

    return recommendations
