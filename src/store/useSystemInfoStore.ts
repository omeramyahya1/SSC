import { create } from "zustand";
import api from "@/api/client";

export interface SystemInfo {
  app_version: string;
  local_db_size_bytes: number;
  last_sync_utc: string | null;
}

interface SystemInfoStore {
  systemInfo: SystemInfo | null;
  isLoading: boolean;
  error: string | null;
  fetchSystemInfo: () => Promise<void>;
  clearSystemInfo: () => void;
}

const resource = "/system";

export const useSystemInfoStore = create<SystemInfoStore>((set) => ({
  systemInfo: null,
  isLoading: false,
  error: null,

  fetchSystemInfo: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<SystemInfo>(`${resource}/info`);
      set({ systemInfo: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || "Failed to fetch system info";
      set({ error: errorMsg, isLoading: false, systemInfo: null });
    }
  },

  clearSystemInfo: () => set({ systemInfo: null, error: null }),
}));

