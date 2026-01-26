// src/store/useBleStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface BleCalculationResults {
    status: string;
    message?: string;
    data?: {
        metadata: {
            peak_sun_hours: number;
            total_system_size_kw: number;
            peak_surge_power_w: number;
            autonomy_days: number;
            total_daily_energy_wh: number;
            total_peak_power_w: number;
        };
        solar_panels: {
            brand: string;
            panel_type: string;
            mount_type: string;
            power_rating_w: number;
            quantity: number;
            total_pv_capacity_kw: number;
            panels_per_string: number;
            num_parallel_strings: number;
            connection_type: string;
            tilt_angle: number;
        };
        inverter: {
            brand: string;
            type: string;
            phase_type: string;
            power_rating_w: number;
            quantity: number;
            surge_rating_w: number;
            efficiency_percent: number;
            output_voltage_v: number;
            connection_type: string;
        };
        battery_bank: {
            brand: string;
            battery_type: string;
            capacity_per_unit_ah: number;
            voltage_per_unit_v: number;
            quantity: number;
            num_in_series: number;
            num_in_parallel: number;
            total_storage_kwh: number;
            depth_of_discharge_percent: number;
            system_voltage_v: number;
            connection_type: string;
        };
    };
}

// --- 2. Define Store ---

export interface BleStore {
    results: BleCalculationResults | null;
    isLoading: boolean;
    error: string | null;

    runCalculation: (projectId: number) => Promise<void>;
    clearResults: () => void;
}

export const useBleStore = create<BleStore>((set) => ({
    results: null,
    isLoading: false,
    error: null,

    runCalculation: async (projectId: number) => {
        set({ isLoading: true, error: null, results: null });
        try {
            const { data } = await api.get<BleCalculationResults>(`/ble/calculate/${projectId}`);
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
