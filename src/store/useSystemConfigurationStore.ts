// src/store/useSystemConfigurationStore.ts
import { create } from 'zustand';
import api from '@/api/client';
import { BleConfigData } from './useBleStore'; 
import { useProjectStore, Project } from './useProjectStore';

export interface SystemConfiguration {
    system_config_id: number;
    uuid: string;
    config_items: BleConfigData;
    total_wattage: number;
    created_at: string;
    updated_at: string;
    // Potentially add a project_uuid here if it's consistently linked
}

interface SystemConfigurationStore {
    systemConfiguration: SystemConfiguration | null;
    isLoading: boolean;
    error: string | null;

    saveSystemConfiguration: (projectUuid: string, bleResultsData: BleConfigData) => Promise<void>;
    fetchSystemConfiguration: (projectUuid: string) => Promise<void>;
    clearSystemConfiguration: () => void;
}

const resource = '/system_configurations';

export const useSystemConfigurationStore = create<SystemConfigurationStore>((set) => ({
    systemConfiguration: null,
    isLoading: false,
    error: null,

    saveSystemConfiguration: async (projectUuid, bleResultsData) => {
        set({ isLoading: true, error: null });
        try {
            const payload = {
                config_items: bleResultsData,
            };
            // The backend now returns the full updated Project object
            const { data: updatedProject } = await api.post<Project>(`${resource}/project/${projectUuid}`, payload);
            
            if (!updatedProject.system_config) {
                throw new Error("API did not return system_config in project update response");
            }
            
            // Extract the system_config from the returned project
            const systemConfigData = updatedProject.system_config;

            set({ systemConfiguration: systemConfigData, isLoading: false });
            
            // Update the project in the ProjectStore
            useProjectStore.getState().receiveProjectUpdate(updatedProject);

        } catch (e: any) {
            const errorMsg = e.response?.data?.message || e.message || "Failed to save system configuration";
            set({ error: errorMsg, isLoading: false });
            console.error(errorMsg, e);
            throw e;
        }
    },

    fetchSystemConfiguration: async (projectUuid) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.get<SystemConfiguration>(`${resource}/project/${projectUuid}`);
            set({ systemConfiguration: data, isLoading: false });
        } catch (e: any) {
            const is404 = e.response?.status === 404;
            const errorMsg = is404 ? null : (e.response?.data?.message || e.message || "Failed to fetch system configuration");
            
            if (!is404) {
                console.error("Failed to fetch system configuration:", e);
            }
            
            set({ 
                error: errorMsg, 
                systemConfiguration: null, 
                isLoading: false 
            });
        }
    },

    clearSystemConfiguration: () => {
        set({ systemConfiguration: null, error: null });
    }
}));
