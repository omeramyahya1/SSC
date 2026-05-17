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

            # Requirement: Power must meet or exceed required power.
            # Voltage: Match only if both are specified and non-zero.
            voltage_match = True
            if dc_system_voltage > 0 and inv_voltage > 0:
                voltage_match = (inv_voltage == dc_system_voltage)

            if inv_power >= required_inverter_power and voltage_match:
                qualified_inverters.append(inv)

        if qualified_inverters:
            # Sort: Priority 1: Voltage Match, Priority 2: Closest Power, Priority 3: Price
            def inverter_sort_key(x):
                specs = x.technical_specs or {}
                pwr = first_spec_value(specs, ["inverter_rated_power", "power_rating_w"])
                volt = first_spec_value(specs, ["system_voltage_v", "dc_input_voltage", "input_voltage_v", "voltage"])
                price = x.sell_price if x.sell_price and x.sell_price > 0 else float('inf')
                
                v_match = 0 if (dc_system_voltage > 0 and volt == dc_system_voltage) or dc_system_voltage == 0 or volt == 0 else 1
                pwr_diff = abs(pwr - required_inverter_power)
                return (v_match, pwr_diff, price)

            qualified_inverters.sort(key=inverter_sort_key)
            selected_inverter = qualified_inverters[0]

            flags = []
            if selected_inverter.sell_price is None:
                flags.append("sell price not set")
            
            # Add flag if voltage was unspecified
            sel_specs = selected_inverter.technical_specs or {}
            sel_volt = first_spec_value(sel_specs, ["system_voltage_v", "dc_input_voltage", "input_voltage_v", "voltage"])
            if dc_system_voltage > 0 and sel_volt == 0:
                flags.append("Matched on power; inverter system voltage unspecified")

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
                "flags": ["No matching inverter found in inventory for power requirements"]
            })

    # 2. Battery Selection
    battery_qty = int(safe_float(battery_req.get("quantity"), 0.0))
    battery_cat_uuid = get_category_uuid(db, "batteries", scope)
    if battery_qty > 0 and battery_cat_uuid:
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
            battery_req.get("voltage_per_unit_v") or battery_req.get("voltage") or 0.0
        )

        qualified_batteries = []
        for batt in batteries:
            specs = batt.technical_specs or {}
            batt_cap = first_spec_value(specs, ["battery_rated_capacity_ah", "capacity_ah"])
            batt_v = first_spec_value(specs, ["battery_rated_voltage", "voltage"])

            # Requirement: Capacity must meet or exceed required capacity (if specified).
            # Voltage: Match only if both are specified and non-zero.
            voltage_match = True
            if required_unit_voltage > 0 and batt_v > 0:
                voltage_match = (batt_v == required_unit_voltage)

            if (required_unit_capacity_ah <= 0 or batt_cap >= required_unit_capacity_ah) and voltage_match:
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
            # Sort: Priority 1: Voltage Match, Priority 2: Closest Capacity, Priority 3: Price
            def battery_sort_key(b):
                specs = b.technical_specs or {}
                cap = first_spec_value(specs, ["battery_rated_capacity_ah", "capacity_ah"], 0.0)
                volt = first_spec_value(specs, ["battery_rated_voltage", "voltage"], 0.0)
                price = b.sell_price if b.sell_price and b.sell_price > 0 else float('inf')
                
                v_match = 0 if (required_unit_voltage > 0 and volt == required_unit_voltage) or required_unit_voltage == 0 or volt == 0 else 1
                cap_diff = abs(cap - required_unit_capacity_ah) if required_unit_capacity_ah > 0 else 0
                return (v_match, cap_diff, price)

            qualified_batteries.sort(key=battery_sort_key)
            selected_battery = qualified_batteries[0]

            if selected_battery.sell_price is None:
                flags.append("sell price not set")
            
            # Add flag if voltage was unspecified
            sel_specs = selected_battery.technical_specs or {}
            sel_volt = first_spec_value(sel_specs, ["battery_rated_voltage", "voltage"], 0.0)
            if required_unit_voltage > 0 and sel_volt == 0:
                flags.append("Matched on capacity; battery unit voltage unspecified")

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
            required_panel_mpp_v = safe_float(panel_req.get("mpp_voltage_v") or 0.0)

            def panel_specs(p):
                s = p.technical_specs or {}
                pwr = first_spec_value(s, ["panel_rated_power", "power_rating_w"], 0.0)
                mpp_v = first_spec_value(s, ["panel_mpp_voltage", "voltage"], 0.0)
                return pwr, mpp_v

            def panel_sort_key(p):
                pwr, mpp_v = panel_specs(p)
                price = p.sell_price if p.sell_price and p.sell_price > 0 else float('inf')
                
                # Priority 1: Meets Power Requirement
                meets_pwr = 0 if (required_panel_power <= 0 or pwr >= required_panel_power) else 1
                # Priority 2: Voltage Match (if specified)
                v_match = 0 if (required_panel_mpp_v > 0 and mpp_v == required_panel_mpp_v) or required_panel_mpp_v == 0 or mpp_v == 0 else 1
                # Priority 3: Price
                # Priority 4: Closest power (if power meets)
                pwr_diff = abs(pwr - required_panel_power) if required_panel_power > 0 else 0
                
                return (meets_pwr, v_match, price, pwr_diff)

            panels.sort(key=panel_sort_key)
            selected_panel = panels[0]

            flags = []
            sel_pwr, sel_mpp_v = panel_specs(selected_panel)
            
            if selected_panel.sell_price is None:
                flags.append("sell price not set")
            if required_panel_power > 0 and sel_pwr < required_panel_power:
                flags.append("Selected panel below required power rating")
            if required_panel_mpp_v > 0 and sel_mpp_v == 0:
                flags.append("Matched on power; panel mpp voltage unspecified")

            # MPPT Re-calculation if inverter is selected
            qty = panel_req.get("quantity", 1)
            if selected_inverter:
                inv_specs = selected_inverter.technical_specs or {}
                v_mppt_min = first_spec_value(inv_specs, ["inverter_mppt_min_v"], 120.0)
                v_mppt_max = first_spec_value(inv_specs, ["inverter_mppt_max_v"], 450.0)

                if sel_mpp_v > 0:
                    max_panels_in_string = math.floor(v_mppt_max / sel_mpp_v)
                    min_panels_in_string = math.ceil(v_mppt_min / sel_mpp_v)

                    if max_panels_in_string < 1:
                        flags.append("Mismatch: Panel voltage too high for inverter MPPT")
                    elif min_panels_in_string > max_panels_in_string:
                        flags.append("Mismatch: Impossible to satisfy MPPT range with this panel")
                else:
                    flags.append("Inverter MPPT check skipped: panel voltage unspecified")

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
