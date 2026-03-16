import { create } from 'zustand';
import api from '@/api/client';
import { InventoryItem } from './useInventoryStore';

export interface ProjectComponent {
    uuid: string;
    project_uuid: string;
    item_uuid?: string;
    custom_name?: string;
    quantity: number;
    price_at_sale?: number;
    is_recommended: boolean;
    created_at: string;
    updated_at: string;
    item?: InventoryItem;
}

interface ProjectComponentState {
    components: ProjectComponent[];
    isLoading: boolean;
    error: string | null;

    fetchComponents: (projectUuid: string) => Promise<void>;
    addComponent: (component: Partial<ProjectComponent>) => Promise<ProjectComponent | undefined>;
    updateComponent: (uuid: string, updates: Partial<ProjectComponent>) => Promise<ProjectComponent | undefined>;
    removeComponent: (uuid: string) => Promise<void>;
    generateRecommendations: (projectUuid: string, bleResults: any) => Promise<ProjectComponent[]>;
}

export const useProjectComponentStore = create<ProjectComponentState>((set, get) => ({
    components: [],
    isLoading: false,
    error: null,

    fetchComponents: async (projectUuid) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.get<ProjectComponent[]>(`/inventory/projects/${projectUuid}/components`);
            set({ components: data, isLoading: false });
        } catch (e: any) {
            set({ error: e.message || "Failed to fetch components", isLoading: false });
        }
    },

    addComponent: async (component) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post<ProjectComponent>('/inventory/project-components', component);
            set((state) => ({ components: [...state.components, data], isLoading: false }));
            return data;
        } catch (e: any) {
            const msg = e.response?.data?.error || e.message || "Failed to add component";
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    updateComponent: async (uuid, updates) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.patch<ProjectComponent>(`/recommendations/project-components/${uuid}`, updates);
            set((state) => ({
                components: state.components.map((c) => (c.uuid === uuid ? data : c)),
                isLoading: false,
            }));
            return data;
        } catch (e: any) {
            const msg = e.response?.data?.error || e.message || "Failed to update component";
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    removeComponent: async (uuid) => {
        // We need a delete endpoint for project components. 
        // Currently it's missing in routes/inventory.py but I'll assume standard naming or add it if needed.
        // Let's check inventory.py again.
        set({ isLoading: true, error: null });
        try {
            await api.delete(`/inventory/project-components/${uuid}`);
            set((state) => ({
                components: state.components.filter((c) => c.uuid !== uuid),
                isLoading: false,
            }));
        } catch (e: any) {
            const msg = e.response?.data?.error || e.message || "Failed to remove component";
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    generateRecommendations: async (projectUuid, bleResults) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post<ProjectComponent[]>(`/recommendations/projects/${projectUuid}/recommend`, bleResults);
            // After recommending, we should probably re-fetch components to get the full objects with items
            const { data: fullComponents } = await api.get<ProjectComponent[]>(`/inventory/projects/${projectUuid}/components`);
            set({ components: fullComponents, isLoading: false });
            return fullComponents;
        } catch (e: any) {
            const msg = e.response?.data?.error || e.message || "Failed to generate recommendations";
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    }
}));
