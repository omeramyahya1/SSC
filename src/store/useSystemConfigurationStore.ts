// src/store/useSystemConfigurationStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface SystemConfiguration {
  system_config_id: number;
  config_items: Record<string, any>; // For JSON fields
  total_wattage: number;
}

export type NewSystemConfigurationData = Omit<SystemConfiguration, 'system_config_id'>;

const resource = '/system_configurations';

// --- 2. Define Store ---

export interface SystemConfigurationStore {
  systemConfigurations: SystemConfiguration[];
  currentSystemConfiguration: SystemConfiguration | null;
  isLoading: boolean;
  error: string | null;
  fetchSystemConfigurations: () => Promise<void>;
  fetchSystemConfiguration: (id: number) => Promise<void>;
  createSystemConfiguration: (data: NewSystemConfigurationData) => Promise<SystemConfiguration | undefined>;
  updateSystemConfiguration: (id: number, data: Partial<NewSystemConfigurationData>) => Promise<SystemConfiguration | undefined>;
  deleteSystemConfiguration: (id: number) => Promise<void>;
  setCurrentSystemConfiguration: (config: SystemConfiguration | null) => void;
}

export const useSystemConfigurationStore = create<SystemConfigurationStore>((set) => ({
  systemConfigurations: [],
  currentSystemConfiguration: null,
  isLoading: false,
  error: null,

  setCurrentSystemConfiguration: (config) => {
    set({ currentSystemConfiguration: config });
  },

  fetchSystemConfigurations: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<SystemConfiguration[]>(resource);
      set({ systemConfigurations: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch system configurations";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchSystemConfiguration: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<SystemConfiguration>(`${resource}/${id}`);
      set({ currentSystemConfiguration: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch system configuration ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createSystemConfiguration: async (newConfigData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<SystemConfiguration>(resource, newConfigData);
      set((state) => ({ systemConfigurations: [...state.systemConfigurations, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create system configuration";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateSystemConfiguration: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<SystemConfiguration>(`${resource}/${id}`, updatedData);
      set((state) => ({
        systemConfigurations: state.systemConfigurations.map((c) => (c.system_config_id === id ? data : c)),
        currentSystemConfiguration: state.currentSystemConfiguration?.system_config_id === id ? data : state.currentSystemConfiguration,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update system configuration ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteSystemConfiguration: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        systemConfigurations: state.systemConfigurations.filter((c) => c.system_config_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete system configuration ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));