import { create } from 'zustand';
import api from '@/api/client';
// No longer need to import QuickCalcConvertedData here to avoid circular dependency

// --- 1. Define Types ---

export interface BleMetadata {
    peak_sun_hours: number;
    total_system_size_kw: number;
    peak_surge_power_w: number;
    autonomy_days: number;
    total_daily_energy_wh: number;
    total_peak_power_w: number;
    location?: string; // Add location for consistency
}

export interface BleSolarPanels {
    power_rating_w: number;
    quantity: number;
    panels_per_string: number;
    num_parallel_strings: number;
    connection_type: string;
    tilt_angle: number;
}

export interface BleInverter {
    power_rating_w: number;
    quantity: number;
    recommended_rating: number;
    efficiency_percent: number;
    surge_rating_w: number;
    output_voltage_v: number;
    connection_type: string;
}

export interface BleBatteryBank {
    battery_type: 'liquid' | 'lithium' | 'dry' | 'other';
    capacity_per_unit_ah: number;
    voltage_per_unit_v: number;
    quantity: number;
    num_in_series: number;
    num_in_parallel: number;
    total_storage_kwh: number;
    depth_of_discharge_percent: number;
    system_voltage_v: number;
    connection_type: string;
}

// This is the actual configuration data structure returned from the BLE calculation
export interface BleConfigData {
    metadata: BleMetadata;
    solar_panels: BleSolarPanels;
    inverter: BleInverter;
    battery_bank: BleBatteryBank;
}

// This is the full API response structure for a BLE calculation
export interface BleCalculationResults {
    status: 'success' | 'error';
    message?: string;
    data: BleConfigData; // The actual config is nested under 'data'
}

// This represents the settings payload sent to the BLE calculation endpoint
export interface BleSettingsPayload {
    inverter_efficiency: number;
    safety_factor: number;
    inverter_rated_power: number;
    inverter_mppt_min_v: number;
    inverter_mppt_max_v: number;
    autonomy_days: number;
    battery_dod: number;
    battery_efficiency: number;
    battery_type: 'liquid' | 'lithium' | 'dry' | 'other';
    battery_rated_capacity_ah: number;
    battery_rated_voltage: number;
    battery_max_parallel: number;
    panel_rated_power: number;
    panel_mpp_voltage: number;
    system_losses: number;
    temp_coefficient_power: number;
    noct: number;
    stc_temp: number;
    reference_irradiance: number;
    calculate_temp_derating: boolean;
    project_location_state: string;
    project_location_city: string;
}


// --- 2. Define Store ---

export interface BleStore {
    results: BleCalculationResults | null;
    isLoading: boolean;
    error: string | null;

    runCalculation: (projectId: number, settings?: BleSettingsPayload, appliances?: any[], projectLocation?: string) => Promise<void>;
    clearResults: () => void;
}

export const useBleStore = create<BleStore>((set) => ({
    results: null,
    isLoading: false,
    error: null,

    runCalculation: async (projectId: number, settings?: BleSettingsPayload, appliances?: any[], projectLocation?: string) => {
        set({ isLoading: true, error: null, results: null });
        try {
            // If it's a quick calculation (project ID is 0), include appliances and location in the payload.
            const payload = projectId === 0
                ? { settings, appliances, project_location: projectLocation }
                : { settings };

            const { data } = await api.post<BleCalculationResults>(`/ble/calculate/${projectId}`, payload);

            if (data.status === 'error') {
                throw new Error(data.message || 'BLE calculation failed.');
            }
            set({ results: data, isLoading: false });
        } catch (e: any) {
            const errorMsg = e.response?.data?.message || e.message || "Failed to run BLE calculation";
            set({ error: errorMsg, isLoading: false });
            console.error(errorMsg, e);
            throw e; // Re-throw to allow component to handle
        }
    },

    clearResults: () => {
        set({ results: null, error: null });
    },
}));
