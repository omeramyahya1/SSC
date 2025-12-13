# Tests



from ble import get_geo_data, BLE

{
	"data": {
		"battery_bank": {
			"battery_type": "lithium",
			"brand": "N/A",
			"capacity_per_unit_ah": 100,
			"connection_type": "Series/Parallel",
			"depth_of_discharge_percent": 90.0,
			"num_in_parallel": 136,
			"num_in_series": 4,
			"quantity": 544,
			"system_voltage_v": 48,
			"total_storage_kwh": 649.1286999902651,
			"voltage_per_unit_v": 12
		},
		"inverter": {
			"brand": "N/A",
			"connection_type": "Parallel",
			"efficiency_percent": 95.0,
			"output_voltage_v": 48,
			"phase_type": "Single Phase",
			"power_rating_w": 36765,
			"quantity": 7,
			"surge_rating_w": 27941.0,
			"type": "Hybrid"
		},
		"metadata": {
			"autonomy_days": 1,
			"peak_sun_hours": 0,
			"peak_surge_power_w": "N/A",
			"total_daily_energy_wh": 527254.7865670928,
			"total_peak_power_w": 27941.0,
			"total_system_size_kw": "N/A"
		},
		"solar_panels": {
			"brand": "N/A",
			"connection_type": "N/A",
			"mount_type": "N/A",
			"num_parallel_strings": "N/A",
			"panel_type": "N/A",
			"panels_per_string": "N/A",
			"power_rating_w": 550,
			"quantity": "N/A",
			"tilt_angle": "N/A",
			"total_pv_capacity_kw": "N/A"
		}
	},
	"status": "success"
}