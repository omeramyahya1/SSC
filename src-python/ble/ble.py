# src-python/ble/ble.py
# BLE core class.
import os
import pandas as pd


# --- Helper Functions ---
def get_geo_data(location: str="Khartoum"): 
        """Load geo data from CSV and find the matching location."""
        try:
            # Construct the absolute path for the CSV file
            base_dir = os.path.dirname(os.path.abspath(__file__))
            csv_path = os.path.join(base_dir, 'dataset', 'geo_data.csv')
            geo_df = pd.read_csv(csv_path)
            
            # Search for the location (case-insensitive)
            location_data = geo_df[geo_df['city'].str.lower() == location.lower()]
            return location_data.iloc[0]
        except FileNotFoundError:
            return None

class BLE:
    """
    Business Logic Engine for solar system calculations.
    """
    def __init__(self, project_data, geo_data):
        self.project_data = project_data
        self.geo_data = geo_data
        self.peak_sun_hours = self.geo_data['pvout']
        
        # Initialize placeholders for calculated values
        self.total_daily_wh = 0
        self.total_night_wh = 0
        self.total_wattage = 0
        self.solar_panel_config = {}
        self.inverter_config = {}
        self.battery_config = {}
        self.metadata = {}

    def _calculate_energy_consumption(self):
        """Calculate total energy consumption from appliances."""
        pass

    def _calculate_solar_panels(self):
        """Calculate the solar panel requirements."""
        pass

    def _calculate_inverter(self):
        """Calculate the inverter requirements."""
        pass

    def _calculate_battery_bank(self):
        """Calculate the battery bank requirements."""
        pass
        
    def _construct_response(self):
        """
        Construct the final JSON response.
        For now, it returns a hardcoded sample response.
        """
        return {
            "status": "success",
            "data": {
                "metadata": {
                    "peak_sun_hours": 5.8,
                    "total_system_size": 5.5,
                    "peak_surge_power": 7.2,
                    "backup_duration": 12.5,
                    "Notes": "xxx"
                },
                "solar_panels": {
                    "brand": "Jinko Solar",
                    "panel_type": "Monocrystalline PERC",
                    "power_rating": 550,
                    "quantity": 10,
                    "total_pv_capacity": 5.5,
                    "mount_type": "Roof Mount (Fixed Tilt), ",
                    "tilt_angle": 15
                },
                "inverter": {
                    "brand": "Victron Energy",
                    "type": "Hybrid",
                    "power_rating": 5.0,
                    "quantity": 1,
                    "surge_rating": 9.0,
                    "efficiency_percent": 96.0,
                    "phase_type": "Single Phase",
                    "output_voltage": 230
                },
                "battery_bank": {
                    "brand": "Pylontech",
                    "battery_type": "Lithium-Ion (LiFePO4)",
                    "capacity_per_unit": 100,
                    "voltage_per_unit": 48,
                    "quantity": 4,
                    "total_storage": 19.2,
                    "depth_of_discharge_percent": 80,
                    "connection_type": "Parallel",
                    "system_voltage": 48
                }
            }
        }


    def run_calculations(self):
        """
        Run all calculations and return the final system configuration.
        """
        self._calculate_energy_consumption()
        self._calculate_solar_panels()
        self._calculate_inverter()
        self._calculate_battery_bank()
        
        return self._construct_response()
    

