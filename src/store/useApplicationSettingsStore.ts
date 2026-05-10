// src/store/useApplicationSettingsStore.ts
import { create } from 'zustand';
import api from '@/api/client';
import { registerStore, StoreKeys } from '@/api/storeRegistry';

// --- 1. Define Types ---

export interface ApplicationSettings {
  application_settings_id: number;
  uuid: string;
  language: "ar" | "en";
  last_saved_path: string;
  other_settings: Record<string, any>; // For JSON fields
  user_id: number;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
}

export type NewApplicationSettingsData = Omit<ApplicationSettings, 'application_settings_id' | 'uuid' | 'created_at' | 'updated_at' | 'is_dirty'>;

const resource = '/application_settings';

// --- 2. Define Store ---

export interface ApplicationSettingsStore {
  settings: ApplicationSettings[];
  currentSetting: ApplicationSettings | null;
  isLoading: boolean;
  needsTCUpdate: boolean;
  latestTC: any | null;
  error: string | null;
  fetchSettings: () => Promise<void>;
  fetchSetting: (id: string | number) => Promise<void>;
  createSetting: (data: NewApplicationSettingsData) => Promise<ApplicationSettings | undefined>;
  updateSetting: (id: string | number, data: Partial<NewApplicationSettingsData>) => Promise<ApplicationSettings | undefined>;
  deleteSetting: (id: string | number) => Promise<void>;
  setCurrentSetting: (setting: ApplicationSettings | null) => void;
  checkTCStatus: (userId: string) => Promise<void>;
  recordTCAgreement: (tcId: string) => Promise<void>;
}

export const useApplicationSettingsStore = create<ApplicationSettingsStore>((set, get) => ({
  settings: [],
  currentSetting: null,
  isLoading: false,
  needsTCUpdate: false,
  latestTC: null,
  error: null,

  setCurrentSetting: (setting) => {
    set({ currentSetting: setting });
  },

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<ApplicationSettings[]>(resource + '/');
      console.log("fetchSettings data", data);
      set({ settings: data, isLoading: false });
      if (data.length > 0) {
        set({ currentSetting: data[0] });
      }
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || "Failed to fetch settings";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  checkTCStatus: async (userId) => {
    if (!userId) return;
    try {
      console.log("checkTCStatus called for userId", userId);
      const { data } = await api.post('/users/check-tc-status', { user_id: userId });
      
      console.log("checkTCStatus result", data);
      const { needs_update, latest_tc_id, latest_tc_content } = data;
      
      // Double check against local settings in case sync is pending
      let currentSetting = get().currentSetting;
      if (!currentSetting && get().settings.length > 0) {
        currentSetting = get().settings[0];
        set({ currentSetting });
      }
      
      const localAgreedId = currentSetting?.other_settings?.agreed_tc_id;
      console.log("Local agreed ID:", localAgreedId, "Latest TC ID:", latest_tc_id);
      
      const finalNeedsUpdate = needs_update || (localAgreedId !== latest_tc_id);
      console.log("Final needs update:", finalNeedsUpdate);
      
      set({ 
        needsTCUpdate: finalNeedsUpdate, 
        latestTC: { id: latest_tc_id, content: latest_tc_content } 
      });
    } catch (e) {
      console.error("Failed to check TC status", e);
    }
  },

  recordTCAgreement: async (tcId) => {
    console.log("recordTCAgreement called with tcId", tcId);
    let setting = get().currentSetting;
    
    if (!setting && get().settings.length > 0) {
      setting = get().settings[0];
      set({ currentSetting: setting });
    }

    if (!setting) {
      console.warn("No currentSetting found in recordTCAgreement, attempting to fetch...");
      await get().fetchSettings();
      setting = get().currentSetting;
    }

    if (!setting) {
      throw new Error("Application settings not found. Cannot record agreement.");
    }

    try {
      const updatedOtherSettings = {
        ...setting.other_settings,
        agreed_tc_id: tcId,
        agreed_at: new Date().toISOString()
      };
      console.log("Updating local settings with", updatedOtherSettings);

      // 1. Update local DB (Python sync engine will handle the rest)
      // Use the UUID for the update to ensure it's found
      const updated = await get().updateSetting(setting.uuid, {
        other_settings: updatedOtherSettings
      });

      if (!updated) {
        throw new Error("Failed to update local application settings.");
      }

      console.log("Agreement recorded locally in SQLite");
      
      // 2. Record in cloud agreement table for legal audit
      await api.post('/users/record-tc-agreement', { tc_id: tcId });
      console.log("Agreement recorded in cloud Supabase table");
      
      set({ needsTCUpdate: false });
      
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || "Failed to record agreement";
      console.error("Failed to record TC agreement:", errorMsg, e);
      throw e;
    }
  },

  fetchSetting: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<ApplicationSettings>(`${resource}/${id}`);
      set({ currentSetting: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || `Failed to fetch setting ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      throw e;
    }
  },

  createSetting: async (newSettingData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<ApplicationSettings>(resource + '/', newSettingData);
      set((state) => ({ settings: [...state.settings, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || "Failed to create setting";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      throw e;
    }
  },

  updateSetting: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<ApplicationSettings>(`${resource}/${id}`, updatedData);
      set((state) => ({
        settings: state.settings.map((s) => (s.uuid === id || s.application_settings_id === id ? data : s)),
        currentSetting: (state.currentSetting?.uuid === id || state.currentSetting?.application_settings_id === id) ? data : state.currentSetting,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || `Failed to update setting ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      throw e;
    }
  },

  deleteSetting: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        settings: state.settings.filter((s) => s.uuid !== id && s.application_settings_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || `Failed to delete setting ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      throw e;
    }
  },
}));

registerStore(StoreKeys.ApplicationSettings, () => {
  useApplicationSettingsStore.getState().fetchSettings();
});
