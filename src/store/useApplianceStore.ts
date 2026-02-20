// src/store/useApplianceStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface ProjectAppliance {
    appliance_id: number;
    appliance_name: string;
    qty: number;
    wattage: number;
    use_hours_night: number;
    type: 'light' | 'standard' | 'heavy';
    project_uuid?: string; // Make sure this is present
}

// --- 2. Define Store ---

export interface ApplianceStore {
    projectAppliances: ProjectAppliance[];
    isLoading: boolean;
    error: string | null;

    fetchAppliancesByProject: (project_uuid: string) => Promise<void>;
    setProjectAppliances: (appliances: ProjectAppliance[]) => void;
    addApplianceToProject: (appliance: Omit<ProjectAppliance, 'appliance_id'>, project_uuid: string) => Promise<void>;
    updateProjectAppliance: (appliance_id: number, updates: Partial<Omit<ProjectAppliance, 'appliance_id'>>) => Promise<void>;
    removeApplianceFromProject: (appliance_id: number) => Promise<void>;
}

export const useApplianceStore = create<ApplianceStore>((set, get) => ({
    projectAppliances: [],
    isLoading: false,
    error: null,

    fetchAppliancesByProject: async (project_uuid) => {
        set({ isLoading: true, error: null });
        try {
            const { data: appliances } = await api.get<ProjectAppliance[]>(`/appliances/project/${project_uuid}`);
            set({ projectAppliances: appliances, isLoading: false });
        } catch (e: any) {
            const errorMsg = e.message || "Failed to fetch appliances";
            set({ error: errorMsg, isLoading: false });
            console.error(errorMsg, e);
            throw e;
        }
    },

    setProjectAppliances: (appliances) => {
        set({ projectAppliances: appliances });
    },

    addApplianceToProject: async (appliance, project_uuid) => {
        set({ isLoading: true, error: null });
        try {
            const payload = { ...appliance, project_uuid };
            const { data: newAppliance } = await api.post<ProjectAppliance>('/appliances', payload);
            set((state) => ({ 
                projectAppliances: [...state.projectAppliances, newAppliance],
                isLoading: false 
            }));
        } catch (e: any) {
            const errorMsg = e.message || "Failed to add appliance";
            set({ error: errorMsg, isLoading: false });
            console.error(errorMsg, e);
            throw e;
        }
    },

    updateProjectAppliance: async (appliance_id, updates) => {
        const originalAppliances = get().projectAppliances;

        // Optimistic update
        const updatedAppliances = originalAppliances.map(a => 
            a.appliance_id === appliance_id ? { ...a, ...updates } : a
        );
        set({ projectAppliances: updatedAppliances });
        
        try {
            await api.put(`/appliances/${appliance_id}`, updates);
        } catch (e: any) {
            const errorMsg = e.message || "Failed to update appliance";
            set({ error: errorMsg, projectAppliances: originalAppliances }); // Revert on failure
            console.error(errorMsg, e);
            throw e;
        }
    },
    
    removeApplianceFromProject: async (appliance_id) => {
        const originalAppliances = get().projectAppliances;
        
        // Optimistic update
        const filteredAppliances = originalAppliances.filter(a => a.appliance_id !== appliance_id);
        set({ projectAppliances: filteredAppliances }); 

        try {
            await api.delete(`/appliances/${appliance_id}`);
        } catch (e: any) {
            const errorMsg = e.message || "Failed to remove appliance";
            set({ error: errorMsg, projectAppliances: originalAppliances }); // Revert on failure
            console.error(errorMsg, e);
            throw e;
        }
    },
}));
