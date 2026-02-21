import { create } from 'zustand';
import api from '@/api/client';
import { QuickCalcConvertedData } from '@/pages/dashboard/CreateProjectModal';

// --- 1. Define Types ---
type BleCalculationResults = QuickCalcConvertedData['config'];
type BleSettingsPayload = QuickCalcConvertedData['bleSettings'];


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
