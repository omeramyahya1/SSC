# src-python/ble/ble.py
# BLE core class.
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import math
import pandas as pd
from models import ApplicationSettings

# --- Helper Functions ---

def get_geo_data(location: str="Khartoum"):
    """Load geo data from CSV and find the matching location."""
    try:
        # Construct the absolute path for the CSV file
        base_dir = os.path.dirname(os.path.abspath(__file__))
        csv_path = os.path.join(base_dir, 'dataset', 'geo_data.csv')
        geo_df = pd.read_csv(csv_path)

        # Search for the location (case-insensitive)
        city = location.split(',')[0]
        location_data = geo_df[geo_df['city'].str.lower() == city.strip().lower()]
        if not location_data.empty:
            return location_data.iloc[0]
        return None
    except FileNotFoundError:
        return None

def convert_units(value, conversion_type, voltage=None):
    """
    Dedicated function for unit conversions.
    """
    if conversion_type == 'kw_to_w':
        return value * 1000
    elif conversion_type == 'w_to_kw':
        return value / 1000
    elif conversion_type == 'ah_to_wh':
        if voltage is None:
            raise ValueError("Voltage must be provided for Ah to Wh conversion.")
        return value * voltage
    return value


class BLE:
    """
    Business Logic Engine for solar system calculations.
    """
    def __init__(self, project_data, geo_data, db_session, override_settings=None):
        self.project_data = project_data
        self.geo_data = geo_data
        self.db_session = db_session
        self.override_settings = override_settings or {}
        self.appliances = self.project_data.appliances


        # Input parameters from geo_data
        self.peak_sun_hours = self.geo_data['gti']
        self.pvout = self.geo_data['pvout']
        self.gti_opt = self.geo_data['gti']
        self.ambient_temp = self.geo_data['temp']
        self.opta = int(self.geo_data['opta'])



        # Sizing placeholders
        self.total_daily_energy_demand = "N/A"
        self.total_peak_power = "N/A"
        self.max_surge_power = "N/A"
        self.inverter_continuous_power = "N/A"
        self.inverter_surge_capability = "N/A"
        self.inverter_final_capacity = "N/A"
        self.battery_capacity_ah = "N/A"
        self.num_batteries_series = "N/A"
        self.num_batteries_parallel = "N/A"
        self.total_num_batteries = "N/A"
        self.solar_array_stc = "N/A"
        self.num_panels = "N/A"
        self.temp_derating_factor = "N/A"
        self.system_voltage = "N/A"

        # Optimizer placeholders
        self.num_inverters = "N/A"
        self.inverter_connection_type = "N/A"
        self.battery_connection_type = "N/A"
        self.panels_per_string = "N/A"
        self.num_parallel_strings = "N/A"
        self.solar_panel_connection_type = "N/A"

        # Settings with defaults
        self.settings = {}

    def _fetch_settings(self):
        """Fetch settings from the database, set defaults, and apply overrides."""
        user_uuid = self.project_data.user_uuid
        app_settings = self.db_session.query(ApplicationSettings).filter_by(user_uuid=user_uuid).first()

        if app_settings and app_settings.other_settings:
            self.settings = app_settings.other_settings

        # Sizing defaults
        self.settings.setdefault('inverter_efficiency', 0.95)
        self.settings.setdefault('safety_factor', 1.25)
        self.settings.setdefault('autonomy_days', 1)
        self.settings.setdefault('battery_dod', {'lithium': 0.9, 'liquid': 0.6, "dry": 0.6})
        self.settings.setdefault('battery_efficiency', 0.95)
        self.settings.setdefault('system_losses', 0.85)
        self.settings.setdefault('temp_coefficient_power', -0.004)
        self.settings.setdefault('noct', 45)
        self.settings.setdefault('stc_temp', 25)
        self.settings.setdefault('reference_irradiance', 800)
        self.settings.setdefault('calculate_temp_derating', True)

        # Component defaults for sizing & optimization
        self.settings.setdefault('battery_type', 'liquid')
        self.settings.setdefault('battery_rated_capacity_ah', 200)
        self.settings.setdefault('battery_rated_voltage', 12)
        self.settings.setdefault('battery_max_parallel', 8)
        self.settings.setdefault('panel_rated_power', 550)
        self.settings.setdefault('panel_mpp_voltage', 42.5)
        self.settings.setdefault('inverter_rated_power', 3000)
        self.settings.setdefault('inverter_mppt_min_v', 120)
        self.settings.setdefault('inverter_mppt_max_v', 450)

        # Apply overrides from the request
        if self.override_settings:
            # Handle nested 'battery_dod' dictionary separately if needed
            if 'battery_dod' in self.override_settings and isinstance(self.override_settings['battery_dod'], dict):
                self.settings['battery_dod'].update(self.override_settings.pop('battery_dod'))

            # Since the frontend sends the battery_dod for the selected type, not the whole dict
            elif 'battery_dod' in self.override_settings and 'battery_type' in self.settings:
                battery_type = self.settings['battery_type']
                try:
                    self.settings['battery_dod'][battery_type] = float(self.override_settings['battery_dod'])
                except (ValueError, TypeError):
                    pass # Keep as is if conversion fails
                del self.override_settings['battery_dod']

            self.settings.update(self.override_settings)

            # Ensure all numeric settings are floats/integers
            numeric_keys = [
                'inverter_efficiency', 'safety_factor', 'autonomy_days', 'battery_dod',
                'battery_efficiency', 'system_losses', 'temp_coefficient_power',
                'noct', 'stc_temp', 'reference_irradiance',
                'battery_rated_capacity_ah', 'battery_rated_voltage', 'battery_max_parallel',
                'panel_rated_power', 'panel_mpp_voltage', 'inverter_rated_power',
                'inverter_mppt_min_v', 'inverter_mppt_max_v'
            ]
            for key in numeric_keys:
                if key in self.settings and self.settings[key] is not None:
                    # Skip 'battery_dod' if it's a dict, as it's handled separately
                    if key == 'battery_dod' and isinstance(self.settings[key], dict):
                        continue
                    try:
                        self.settings[key] = float(self.settings[key])
                    except (ValueError, TypeError):
                        pass # Or log an error for debugging

    def _calculate_total_daily_energy_demand(self):
        if not self.appliances: self.total_daily_energy_demand = 0; return
        total_wh = sum((app.wattage) * (app.qty) * (app.use_hours_night) for app in self.appliances)
        self.total_daily_energy_demand = total_wh

    def _calculate_peak_power(self):
        if not self.appliances: self.total_peak_power = 0; return
        total_w = sum((app.wattage) * (app.qty) for app in self.appliances)
        self.total_peak_power = total_w

    def _calculate_max_surge_power(self):
        surge_values = (
            app.wattage * app.qty
            for app in self.appliances
            if hasattr(app, 'type') and app.type == "heavy"
            if hasattr(app, 'wattage') and app.wattage is not None
        )

        total_surge = sum(surge_values)

        if total_surge > 0:
            self.max_surge_power = total_surge
        else:
            self.max_surge_power = "N/A"

    def _calculate_inverter_requirements(self):
        if self.total_peak_power == "N/A" or self.total_peak_power == 0: return
        eta_inv = self.settings['inverter_efficiency']
        sf = self.settings['safety_factor']
        self.inverter_continuous_power = (self.total_peak_power / eta_inv) * sf
        self.inverter_surge_capability = self.total_peak_power
        self.inverter_final_capacity = math.ceil(self.inverter_continuous_power)

    def _calculate_battery_bank_sizing(self):
        if self.total_daily_energy_demand == "N/A" or self.total_daily_energy_demand == 0: return
        e_daily = self.total_daily_energy_demand
        n_autonomy = self.settings['autonomy_days']
        eta_batt = self.settings['battery_efficiency']
        eta_inv = self.settings['inverter_efficiency']

        if e_daily > 5000: self.system_voltage = 48
        elif e_daily <= 1500: self.system_voltage = 12
        else: self.system_voltage = 24

        dod = self.settings['battery_dod'].get(self.settings['battery_type'], 0.6)
        self.battery_capacity_ah = (e_daily * n_autonomy) / (self.system_voltage * dod * eta_batt * eta_inv)

        c_battery_rated = self.settings['battery_rated_capacity_ah']
        v_battery_rated = self.settings['battery_rated_voltage']
        if c_battery_rated > 0 and v_battery_rated > 0:
            self.num_batteries_parallel = math.ceil(self.battery_capacity_ah / c_battery_rated)
            self.num_batteries_series = math.ceil(self.system_voltage / v_battery_rated)
            self.total_num_batteries = self.num_batteries_parallel * self.num_batteries_series

    def _calculate_temp_derating_factor(self):
        if not self.settings['calculate_temp_derating']: self.temp_derating_factor = 1.0; return
        t_cell = self.ambient_temp + ((self.settings['noct'] - 20) / 800) * self.settings['reference_irradiance']
        self.temp_derating_factor = 1 + (self.settings['temp_coefficient_power'] * (t_cell - self.settings['stc_temp']))

    def _calculate_solar_array_sizing(self):
        if self.total_daily_energy_demand == "N/A" or self.total_daily_energy_demand == 0: return
        e_daily = self.total_daily_energy_demand
        eta_sys_losses = self.settings['system_losses']

        if self.pvout > 0:
            self.solar_array_stc = e_daily / (self.pvout * 1000 * eta_sys_losses)
        elif self.peak_sun_hours > 0:
            self._calculate_temp_derating_factor()
            f_temp = self.temp_derating_factor if self.temp_derating_factor != "N/A" else 1.0
            p_array_watts = e_daily / (self.peak_sun_hours * f_temp * eta_sys_losses)
            self.solar_array_stc = convert_units(p_array_watts, 'w_to_kw')
        else:
            self.solar_array_stc = "N/A"; return

        p_panel_rated = self.settings['panel_rated_power']
        if self.solar_array_stc != "N/A" and p_panel_rated > 0:
            self.num_panels = math.ceil(convert_units(self.solar_array_stc, 'kw_to_w') / p_panel_rated)

    def _system_optimizer(self):
        """Optimizes component connections."""
        # Inverter Optimization
        # for future use: check the inventory database and get the best components.
        p_inv_rated = self.settings['inverter_rated_power']
        load_req = self.total_peak_power * self.settings['safety_factor']
        if p_inv_rated > 0 and load_req > p_inv_rated:
            self.num_inverters = math.ceil(load_req / p_inv_rated)
            self.inverter_connection_type = "Parallel"
        else:
            self.num_inverters = 1
            self.inverter_connection_type = "N/A"

        # Battery Bank Optimization
        v_unit = self.settings['battery_rated_voltage']
        if self.system_voltage and v_unit > 0:
            n_series = self.system_voltage / v_unit
            if n_series.is_integer():
                self.num_batteries_series = int(n_series)
                if self.num_batteries_parallel == 1: self.battery_connection_type = "Series"
                elif self.num_batteries_parallel > 1: self.battery_connection_type = "Series/Parallel"
                if self.num_batteries_parallel > self.settings['battery_max_parallel']:
                    # Handle constraint violation, e.g., log a warning
                    pass
            else:
                self.battery_connection_type = "Mismatch: System and battery voltage incompatible"

        # Solar Panel Optimization
        v_mppt_min = self.settings['inverter_mppt_min_v']
        v_mppt_max = self.settings['inverter_mppt_max_v']
        v_mpp_panel = self.settings['panel_mpp_voltage']
        f_temp = self.temp_derating_factor if self.temp_derating_factor not in ["N/A", 1.0] else 1.0

        if all(isinstance(v, (int, float)) and v > 0 for v in [v_mppt_min, v_mppt_max, v_mpp_panel, self.num_panels]):
            v_op = v_mpp_panel * f_temp
            max_panels_in_string = math.floor(v_mppt_max / v_op)

            if max_panels_in_string > 0:
                self.panels_per_string = max_panels_in_string
                self.num_parallel_strings = math.ceil(self.num_panels / self.panels_per_string)
                if self.num_parallel_strings == 1: self.solar_panel_connection_type = "Series"
                else: self.solar_panel_connection_type = "Series/Parallel"
            else:
                self.solar_panel_connection_type = "Mismatch: Panel voltage too high for inverter MPPT"

    def _construct_response(self):
        # Safely get values from settings
        autonomy_days = self.settings.get('autonomy_days', "N/A")
        panel_power = self.settings.get('panel_rated_power', "N/A")
        inverter_eff = self.settings.get('inverter_efficiency', 0) * 100
        battery_type = self.settings.get('battery_type', "N/A")
        battery_ah = self.settings.get('battery_rated_capacity_ah', "N/A")
        battery_v = self.settings.get('battery_rated_voltage', "N/A")
        dod_percent = self.settings.get('battery_dod', {}).get(battery_type, 0) * 100
        tilt_angle = self.opta
        total_storage_kwh = "N/A"
        if isinstance(self.num_panels, (int, float)) and isinstance(panel_power, (int, float)):
            total_pv_capacity_kw = convert_units(self.num_panels * panel_power, 'w_to_kw')
        else:
                total_pv_capacity_kw = "N/A"
        if isinstance(self.battery_capacity_ah, (int, float)) and isinstance(self.system_voltage, (int, float)):
            total_storage_kwh = convert_units(self.battery_capacity_ah * self.system_voltage, 'w_to_kw')

        return {
            "status": "success",
            "data": {
                "metadata": {
                    "peak_sun_hours": self.peak_sun_hours,
                    "total_system_size_kw": self.solar_array_stc,
                    "peak_surge_power_w": self.max_surge_power,
                    "autonomy_days": autonomy_days,
                    "total_daily_energy_wh": self.total_daily_energy_demand,
                    "total_peak_power_w": self.total_peak_power,
                },
                "solar_panels": {
                    "brand": "N/A", "panel_type": "N/A", "mount_type": "N/A",
                    "power_rating_w": panel_power,
                    "quantity": self.num_panels,
                    "total_pv_capacity_kw": total_pv_capacity_kw,
                    "panels_per_string": self.panels_per_string,
                    "num_parallel_strings": self.num_parallel_strings,
                    "connection_type": self.solar_panel_connection_type,
                    "tilt_angle": tilt_angle
                },
                "inverter": {
                    "brand": "N/A", "type": "Hybrid", "phase_type": "Single Phase",
                    "power_rating_w": self.inverter_final_capacity,
                    "quantity": self.num_inverters,
                    "surge_rating_w": self.inverter_surge_capability,
                    "efficiency_percent": inverter_eff,
                    "output_voltage_v": self.system_voltage,
                    "connection_type": self.inverter_connection_type
                },
                "battery_bank": {
                    "brand": "N/A",
                    "battery_type": battery_type,
                    "capacity_per_unit_ah": battery_ah,
                    "voltage_per_unit_v": battery_v,
                    "quantity": self.total_num_batteries,
                    "num_in_series": self.num_batteries_series,
                    "num_in_parallel": self.num_batteries_parallel,
                    "total_storage_kwh": total_storage_kwh,
                    "depth_of_discharge_percent": dod_percent,
                    "system_voltage_v": self.system_voltage,
                    "connection_type": self.battery_connection_type
                }
            }
        }

    def run_calculations(self, optimize=True):
        """
        Run all calculations and return the final system configuration.
        """
        try:
            self._fetch_settings()
            self._calculate_total_daily_energy_demand()
            self._calculate_peak_power()
            self._calculate_max_surge_power()
            self._calculate_inverter_requirements()
            self._calculate_battery_bank_sizing()
            self._calculate_solar_array_sizing()

            if optimize:
                self._system_optimizer()

            return self._construct_response()
        except Exception as e:
            return {"status": "error", "message": str(e)}

