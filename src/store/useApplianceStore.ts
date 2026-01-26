// src/store/useApplianceStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface LibraryAppliance {
    name: string;
    wattage: number;
    surge_power: number;
    type: 'light' | 'standard' | 'heavy';
}

export interface ProjectAppliance {
    id: number; // A temporary client-side ID
    appliance_name: string;
    qty: number;
    wattage: number;
    use_hours_night: number;
    type: 'light' | 'standard' | 'heavy';
}

// --- 2. Define Store ---

export interface ApplianceStore {
    library: LibraryAppliance[];
    projectAppliances: ProjectAppliance[];
    isLoading: boolean;
    error: string | null;

    fetchApplianceLibrary: () => Promise<void>;
    setProjectAppliances: (appliances: ProjectAppliance[]) => void;
    addApplianceToProject: (appliance: LibraryAppliance) => void;
    updateProjectAppliance: (id: number, updates: Partial<Omit<ProjectAppliance, 'id'>>) => void;
    removeApplianceFromProject: (id: number) => void;
    saveAppliancesForProject: (projectId: number) => Promise<void>;
}

export const useApplianceStore = create<ApplianceStore>((set, get) => ({
    library: [],
    projectAppliances: [],
    isLoading: false,
    error: null,

    fetchApplianceLibrary: async () => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.get<LibraryAppliance[]>('/application_settings/appliances');
            set({ library: data, isLoading: false });
        } catch (e: any) {
            const errorMsg = e.message || "Failed to fetch appliance library";
            set({ error: errorMsg, isLoading: false });
            console.error(errorMsg, e);
        }
    },

    setProjectAppliances: (appliances) => {
        set({ projectAppliances: appliances });
    },

    addApplianceToProject: (appliance) => {
        const newAppliance: ProjectAppliance = {
            ...appliance,
            id: Date.now(), // simple unique temporary ID
            qty: 1,
            use_hours_night: 1,
        };
        set((state) => ({ projectAppliances: [...state.projectAppliances, newAppliance] }));
    },

    updateProjectAppliance: (id, updates) => {
        set((state) => ({
            projectAppliances: state.projectAppliances.map(a => 
                a.id === id ? { ...a, ...updates } : a
            ),
        }));
    },
    
    removeApplianceFromProject: (id) => {
        set((state) => ({
            projectAppliances: state.projectAppliances.filter(a => a.id !== id),
        }));
    },

    saveAppliancesForProject: async (projectId) => {
        set({ isLoading: true, error: null });
        const appliancesToSave = get().projectAppliances.map(({ id, ...rest }) => rest);
        
        try {
            await api.post('/appliances/batch', {
                project_id: projectId,
                appliances: appliancesToSave,
            });
            set({ isLoading: false });
        } catch (e: any) {
            const errorMsg = e.message || "Failed to save appliances";
            set({ error: errorMsg, isLoading: false });
            console.error(errorMsg, e);
            throw e;
        }
    }
}));
