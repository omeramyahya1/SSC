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
        if not location or not location.strip():
           location = "Khartoum"
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
        self.total_daily_energy_demand = 0.0
        self.total_peak_power = 0.0
        self.max_surge_power = 0.0
        self.inverter_continuous_power = 0.0
        self.inverter_surge_capability = 0.0
        self.inverter_final_capacity = 0.0
        self.battery_capacity_ah = 0.0
        self.num_batteries_series = 0
        self.num_batteries_parallel = 0
        self.total_num_batteries = 0
        self.solar_array_stc = 0.0
        self.num_panels = 0
        self.temp_derating_factor = 1.0
        self.system_voltage = 0

        # Optimizer placeholders
        self.num_inverters = 0
        self.inverter_connection_type = "N/A"
        self.battery_connection_type = "N/A"
        self.panels_per_string = 0
        self.num_parallel_strings = 0
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
        if not self.appliances:
            self.total_daily_energy_demand = 0
            return

        # Total Wh is still the sum of all appliances
        # But we explicitly note that if use_hours_night is 0, it contributes 0 to battery sizing
        total_wh = sum(
            (app.wattage or 0) * (app.qty or 0) * (app.use_hours_night or 0)
            for app in self.appliances
        )
        self.total_daily_energy_demand = total_wh

    def _calculate_peak_power(self):
        if not self.appliances: self.total_peak_power = 0; return
        total_w = sum((app.wattage or 0) * (app.qty or 0) for app in self.appliances)
        self.total_peak_power = total_w

    def _calculate_max_surge_power(self):
        surge_values = (
            (app.wattage or 0) * (app.qty or 0)
            for app in self.appliances
        )

        total_surge = sum(surge_values)
        self.max_surge_power = total_surge

    def _calculate_inverter_requirements(self):
        if self.total_peak_power == 0: return
        eta_inv = self.settings['inverter_efficiency']
        sf = self.settings['safety_factor']
        self.inverter_continuous_power = (self.total_peak_power / eta_inv) * sf
        self.inverter_surge_capability = self.total_peak_power
        self.inverter_final_capacity = math.ceil(self.inverter_continuous_power)

    def _calculate_battery_bank_sizing(self):
        # Establish system voltage based on peak power or daily energy
        # This is needed even for direct systems for inverter/string sizing
        if self.total_daily_energy_demand > 5000 or self.total_peak_power > 3000:
            self.system_voltage = 48
        elif self.total_daily_energy_demand <= 1500 and self.total_peak_power <= 1000:
            self.system_voltage = 12
        else:
            self.system_voltage = 24

        if self.total_daily_energy_demand == 0:
            self.total_num_batteries = 0
            self.num_batteries_series = 0
            self.num_batteries_parallel = 0
            self.battery_connection_type = "N/A"
            return

        e_daily = self.total_daily_energy_demand
        n_autonomy = self.settings['autonomy_days']
        eta_batt = self.settings['battery_efficiency']
        eta_inv = self.settings['inverter_efficiency']

        dod = self.settings['battery_dod'].get(self.settings['battery_type'], 0.6)
        self.battery_capacity_ah = (e_daily * n_autonomy) / (self.system_voltage * dod * eta_batt * eta_inv)

        c_battery_rated = self.settings['battery_rated_capacity_ah']
        v_battery_rated = self.settings['battery_rated_voltage']
        if c_battery_rated > 0 and v_battery_rated > 0:
            self.num_batteries_parallel = math.ceil(self.battery_capacity_ah / c_battery_rated)
            self.num_batteries_series = math.ceil(self.system_voltage / v_battery_rated)
            self.total_num_batteries = self.num_batteries_parallel * self.num_batteries_series
        else:
            self.battery_capacity_ah = 0.0

    def _calculate_temp_derating_factor(self):
        if not self.settings['calculate_temp_derating']: self.temp_derating_factor = 1.0; return
        t_cell = self.ambient_temp + ((self.settings['noct'] - 20) / 800) * self.settings['reference_irradiance']
        self.temp_derating_factor = 1 + (self.settings['temp_coefficient_power'] * (t_cell - self.settings['stc_temp']))

    def _calculate_solar_array_sizing(self):
        # If there are no batteries, we don't calculate based on Daily Energy Demand (Wh)
        # Instead, we size the array to meet the Peak Power (W) requirements directly.
        if self.total_num_batteries == 0:
            if self.total_peak_power == 0:
                self.num_panels = 0
                self.solar_panel_connection_type = "N/A"
                return

            # Sizing based on peak power with a safety factor
            # to ensure the system can actually run the load directly.
            eta_sys_losses = self.settings['system_losses']
            self._calculate_temp_derating_factor()
            f_temp = self.temp_derating_factor if self.temp_derating_factor != 0 else 1.0

            # Required PV watts considering losses and temperature
            required_pv_watts = (self.total_peak_power / (eta_sys_losses * f_temp)) * 1.2
            p_panel_rated = self.settings.get('panel_rated_power', 400)

            self.num_panels = math.ceil(required_pv_watts / p_panel_rated)
            self.solar_panel_connection_type = "Parallel" # Placeholder, optimizer will refine
            return

        if self.total_daily_energy_demand == 0: return
        e_daily = self.total_daily_energy_demand
        eta_sys_losses = self.settings['system_losses']

        if self.pvout > 0:
            self.solar_array_stc = e_daily / (self.pvout * 1000 * eta_sys_losses)
        elif self.peak_sun_hours > 0:
            self._calculate_temp_derating_factor()
            f_temp = self.temp_derating_factor if self.temp_derating_factor != 0 else 1.0
            p_array_watts = e_daily / (self.peak_sun_hours * f_temp * eta_sys_losses)
            self.solar_array_stc = convert_units(p_array_watts, 'w_to_kw')
        else:
            self.solar_array_stc = 0.0; return

        p_panel_rated = self.settings['panel_rated_power']
        if self.solar_array_stc != 0.0 and p_panel_rated > 0:
            self.num_panels = math.ceil(convert_units(self.solar_array_stc, 'kw_to_w') / p_panel_rated)

    def _system_optimizer(self):
        """Optimizes component connections."""
        # Run optimizer if there is a load, even if no batteries
        if self.total_peak_power == 0 and self.total_daily_energy_demand == 0:
            return

        # Inverter Optimization
        p_inv_rated = self.settings['inverter_rated_power']
        load_req = self.total_peak_power * self.settings['safety_factor']
        if p_inv_rated > 0 and load_req > p_inv_rated:
            self.num_inverters = math.ceil(load_req / p_inv_rated)
            self.inverter_connection_type = "Parallel"
        else:
            self.num_inverters = 1
            self.inverter_connection_type = "N/A"

        # Battery Bank Optimization (Only if batteries are present)
        if self.total_num_batteries > 0:
            v_unit = self.settings['battery_rated_voltage']
            if self.system_voltage and v_unit > 0:
                n_series = self.system_voltage / v_unit
                if n_series.is_integer():
                    self.num_batteries_series = int(n_series)
                    if self.num_batteries_parallel == 1: self.battery_connection_type = "Series"
                    elif self.num_batteries_parallel > 1: self.battery_connection_type = "Series/Parallel"
                else:
                    self.battery_connection_type = "Mismatch: System and battery voltage incompatible"
        else:
            self.battery_connection_type = "N/A"

        # Solar Panel Optimization
        v_mppt_min = self.settings['inverter_mppt_min_v']
        v_mppt_max = self.settings['inverter_mppt_max_v']
        v_mpp_panel = self.settings['panel_mpp_voltage']
        f_temp = self.temp_derating_factor if self.temp_derating_factor not in [0, 1.0] else 1.0

        if all(isinstance(v, (int, float)) and v > 0 for v in [v_mppt_min, v_mppt_max, v_mpp_panel, self.num_panels]):
            v_op = v_mpp_panel * f_temp
            max_panels_in_string = math.floor(v_mppt_max / v_op)

            if max_panels_in_string > 0:
                self.panels_per_string = min(max_panels_in_string, self.num_panels)
                self.num_parallel_strings = math.ceil(self.num_panels / self.panels_per_string)
                if self.num_parallel_strings == 1: self.solar_panel_connection_type = "Series"
                else: self.solar_panel_connection_type = "Series/Parallel"
            else:
                self.solar_panel_connection_type = "Mismatch: Panel voltage too high for inverter MPPT"

    def _construct_response(self):
        # Safely get values from settings
        autonomy_days = self.settings.get('autonomy_days', 0)
        panel_power = self.settings.get('panel_rated_power', 0)
        inverter_eff = self.settings.get('inverter_efficiency', 0) * 100
        battery_type = self.settings.get('battery_type', "N/A")
        battery_ah = self.settings.get('battery_rated_capacity_ah', 0)
        battery_v = self.settings.get('battery_rated_voltage', 0)
        dod_percent = self.settings.get('battery_dod', {}).get(battery_type, 0) * 100
        tilt_angle = self.opta

        total_pv_capacity_kw = 0.0
        if isinstance(self.num_panels, (int, float)) and isinstance(panel_power, (int, float)):
            total_pv_capacity_kw = round(convert_units(self.num_panels * panel_power, 'w_to_kw'), 2)

        total_storage_kwh = 0.0
        if isinstance(self.battery_capacity_ah, (int, float)) and isinstance(self.system_voltage, (int, float)):
            total_storage_kwh = round(convert_units(self.battery_capacity_ah * self.system_voltage, 'w_to_kw'), 2)

        return {
            "status": "success",
            "data": {
                "metadata": {
                    "peak_sun_hours": self.peak_sun_hours,
                    "total_system_size_kw": total_pv_capacity_kw,
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
                    "power_rating_w": self.settings.get("inverter_rated_power"),
                    "quantity": self.num_inverters,
                    "surge_rating_w": self.max_surge_power,
                    "recommended_rating": self.inverter_final_capacity,
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

