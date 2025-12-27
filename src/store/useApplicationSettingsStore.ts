// src/store/useApplicationSettingsStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface ApplicationSettings {
  id: number;
  language: "ar" | "en";
  last_saved_path: string;
  other_settings: Record<string, any>; // For JSON fields
  user_id: number;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
}

export type NewApplicationSettingsData = Omit<ApplicationSettings, 'id' | 'created_at' | 'updated_at' | 'is_dirty'>;

const resource = '/application_settingss';

// --- 2. Define Store ---

export interface ApplicationSettingsStore {
  settings: ApplicationSettings[];
  currentSetting: ApplicationSettings | null;
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  fetchSetting: (id: number) => Promise<void>;
  createSetting: (data: NewApplicationSettingsData) => Promise<ApplicationSettings | undefined>;
  updateSetting: (id: number, data: Partial<NewApplicationSettingsData>) => Promise<ApplicationSettings | undefined>;
  deleteSetting: (id: number) => Promise<void>;
  setCurrentSetting: (setting: ApplicationSettings | null) => void;
}

export const useApplicationSettingsStore = create<ApplicationSettingsStore>((set) => ({
  settings: [],
  currentSetting: null,
  isLoading: false,
  error: null,

  setCurrentSetting: (setting) => {
    set({ currentSetting: setting });
  },

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<ApplicationSettings[]>(resource);
      set({ settings: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch settings";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchSetting: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<ApplicationSettings>(`${resource}/${id}`);
      set({ currentSetting: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch setting ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createSetting: async (newSettingData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<ApplicationSettings>(resource, newSettingData);
      set((state) => ({ settings: [...state.settings, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create setting";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateSetting: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<ApplicationSettings>(`${resource}/${id}`, updatedData);
      set((state) => ({
        settings: state.settings.map((s) => (s.id === id ? data : s)),
        currentSetting: state.currentSetting?.id === id ? data : state.currentSetting,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update setting ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteSetting: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        settings: state.settings.filter((s) => s.id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete setting ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));