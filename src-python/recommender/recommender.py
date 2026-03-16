import math
from models import InventoryItem, InventoryCategory, ProjectComponent
from sqlalchemy.orm import Session

def get_category_uuid(db: Session, category_name: str):
    cat = db.query(InventoryCategory).filter(InventoryCategory.name.ilike(f"%{category_name}%")).first()
    return cat.uuid if cat else None

def safe_float(value, default=0.0):
    try:
        return float(value) if value is not None else default
    except (ValueError, TypeError):
        return default

def generate_recommendations(db: Session, ble_results: dict):
    """
    Core function to generate component recommendations based on BLE results and inventory.
    """
    data = ble_results.get("data", {})
    inverter_req = data.get("inverter", {})
    battery_req = data.get("battery_bank", {})
    panel_req = data.get("solar_panels", {})
    metadata = data.get("metadata", {})

    system_voltage = safe_float(inverter_req.get("output_voltage_v"))
    required_inverter_power = safe_float(inverter_req.get("recommended_rating"))
    total_daily_energy_wh = safe_float(metadata.get("total_daily_energy_wh", 0))

    recommendations = []
    selected_inverter = None
    selected_panel = None
    selected_battery = None

    # 1. Inverter Selection
    inverter_cat_uuid = get_category_uuid(db, "inverter")
    if inverter_cat_uuid:
        inverters = db.query(InventoryItem).filter(
            InventoryItem.category_uuid == inverter_cat_uuid,
            InventoryItem.quantity_on_hand > 0
        ).all()

        qualified_inverters = []
        for inv in inverters:
            specs = inv.technical_specs or {}
            # Keys from ble.py: inverter_rated_power, inverter_mppt_min_v, inverter_mppt_max_v
            inv_power = safe_float(specs.get("inverter_rated_power") or specs.get("power_rating_w"))
            # Check voltage compatibility
            inv_voltage = safe_float(specs.get("system_voltage_v") or specs.get("voltage") or specs.get("output_voltage_v"))

            if inv_voltage == system_voltage and inv_power >= required_inverter_power:
                qualified_inverters.append(inv)

        if qualified_inverters:
            # Select lowest qualifying power @ lowest price
            qualified_inverters.sort(key=lambda x: (
                safe_float(x.technical_specs.get("inverter_rated_power") or x.technical_specs.get("power_rating_w")),
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
    battery_cat_uuid = get_category_uuid(db, "battery")
    if battery_cat_uuid:
        batteries = db.query(InventoryItem).filter(
            InventoryItem.category_uuid == battery_cat_uuid,
            InventoryItem.quantity_on_hand > 0
        ).all()

        qualified_batteries = []
        for batt in batteries:
            specs = batt.technical_specs or {}
            batt_v = safe_float(specs.get("battery_rated_voltage") or specs.get("voltage"))
            if batt_v > 0:
                qualified_batteries.append(batt)

        if qualified_batteries:
            # Select battery with best capacity_per_unit_ah / price ratio
            def battery_ratio(b):
                specs = b.technical_specs or {}
                cap = safe_float(specs.get("battery_rated_capacity_ah") or specs.get("capacity_ah"), 1.0)
                price = b.sell_price if b.sell_price and b.sell_price > 0 else float('inf')
                return cap / price

            qualified_batteries.sort(key=battery_ratio, reverse=True)
            selected_battery = qualified_batteries[0]
            
            flags = []
            if selected_battery.sell_price is None:
                flags.append("sell price not set")
            
            # Recalculate quantity based on system voltage and energy needs
            batt_specs = selected_battery.technical_specs or {}
            batt_v = safe_float(batt_specs.get("battery_rated_voltage") or batt_specs.get("voltage"), 12.0)
            
            # Simple check: system_voltage / battery_v
            num_series = math.ceil(system_voltage / batt_v) if batt_v > 0 else 1
            if batt_v > 0 and (system_voltage % batt_v) != 0:
                flags.append(f"Partial Match: Battery voltage ({batt_v}V) is not a direct divisor of system voltage ({system_voltage}V)")
            
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
    panel_cat_uuid = get_category_uuid(db, "panel")
    if panel_cat_uuid:
        panels = db.query(InventoryItem).filter(
            InventoryItem.category_uuid == panel_cat_uuid,
            InventoryItem.quantity_on_hand > 0
        ).all()

        if panels:
            # Select panel with best power_rating_w / price ratio
            def panel_ratio(p):
                specs = p.technical_specs or {}
                pwr = safe_float(specs.get("panel_rated_power") or specs.get("power_rating_w"), 1.0)
                price = p.sell_price if p.sell_price and p.sell_price > 0 else float('inf')
                return pwr / price

            panels.sort(key=panel_ratio, reverse=True)
            selected_panel = panels[0]
            
            flags = []
            if selected_panel.sell_price is None:
                flags.append("sell price not set")

            # MPPT Re-calculation if inverter is selected
            qty = panel_req.get("quantity", 1)
            if selected_inverter:
                inv_specs = selected_inverter.technical_specs or {}
                v_mppt_min = safe_float(inv_specs.get("inverter_mppt_min_v"), 120.0)
                v_mppt_max = safe_float(inv_specs.get("inverter_mppt_max_v"), 450.0)
                
                pan_specs = selected_panel.technical_specs or {}
                v_mpp = safe_float(pan_specs.get("panel_mpp_voltage") or pan_specs.get("voltage"), 40.0)
                
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
