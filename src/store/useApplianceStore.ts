// src/store/useApplianceStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface Appliance {
  appliance_id: number;
  project_id: number;
  appliance_name: string;
  type: string;
  qty: number;
  use_hours_night: number;
  wattage: number;
  energy_consumption: number;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
}

export type NewApplianceData = Omit<Appliance, 'appliance_id' | 'created_at' | 'updated_at' | 'is_dirty'>;

const resource = '/appliances';

// --- 2. Define Store ---

export interface ApplianceStore {
  appliances: Appliance[];
  currentAppliance: Appliance | null;
  isLoading: boolean;
  error: string | null;
  fetchAppliances: () => Promise<void>;
  fetchAppliance: (id: number) => Promise<void>;
  createAppliance: (data: NewApplianceData) => Promise<Appliance | undefined>;
  updateAppliance: (id: number, data: Partial<NewApplianceData>) => Promise<Appliance | undefined>;
  deleteAppliance: (id: number) => Promise<void>;
  setCurrentAppliance: (appliance: Appliance | null) => void;
}

export const useApplianceStore = create<ApplianceStore>((set) => ({
  appliances: [],
  currentAppliance: null,
  isLoading: false,
  error: null,

  setCurrentAppliance: (appliance) => {
    set({ currentAppliance: appliance });
  },

  fetchAppliances: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Appliance[]>(resource);
      set({ appliances: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch appliances";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchAppliance: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Appliance>(`${resource}/${id}`);
      set({ currentAppliance: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch appliance ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createAppliance: async (newApplianceData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Appliance>(resource, newApplianceData);
      set((state) => ({ appliances: [...state.appliances, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create appliance";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateAppliance: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Appliance>(`${resource}/${id}`, updatedData);
      set((state) => ({
        appliances: state.appliances.map((a) => (a.appliance_id === id ? data : a)),
        currentAppliance: state.currentAppliance?.appliance_id === id ? data : state.currentAppliance,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update appliance ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteAppliance: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        appliances: state.appliances.filter((a) => a.appliance_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete appliance ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));