// src/store/useSyncLogStore.ts
import { create } from 'zustand';
import api from '@/api/client';
import { registerStore, StoreKeys } from '@/api/storeRegistry';
import toast from 'react-hot-toast';
import i18next from 'i18next';

// --- 1. Define Types ---

export interface SyncLog {
  sync_id: number;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
  sync_type: "full" | "incremental";
  table_name: string;
  status: "success" | "failed";
  user_id: number;
}

export type NewSyncLogData = Omit<SyncLog, 'sync_id' | 'created_at' | 'updated_at' | 'is_dirty'>;

const resource = '/sync_logs';

// --- 2. Define Store ---

export interface SyncLogStore {
  syncLogs: SyncLog[];
  currentSyncLog: SyncLog | null;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  fetchSyncLogs: () => Promise<void>;
  fetchSyncLog: (id: number) => Promise<void>;
  createSyncLog: (data: NewSyncLogData) => Promise<SyncLog | undefined>;
  updateSyncLog: (id: number, data: Partial<NewSyncLogData>) => Promise<SyncLog | undefined>;
  deleteSyncLog: (id: number) => Promise<void>;
  setCurrentSyncLog: (log: SyncLog | null) => void;
  performSync: () => Promise<void>;
}

export const useSyncLogStore = create<SyncLogStore>((set, get) => ({
  syncLogs: [],
  currentSyncLog: null,
  isLoading: false,
  isSyncing: false,
  error: null,

  setCurrentSyncLog: (log) => {
    set({ currentSyncLog: log });
  },

  fetchSyncLogs: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<SyncLog[]>(resource);
      set({ syncLogs: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch sync logs";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchSyncLog: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<SyncLog>(`${resource}/${id}`);
      set({ currentSyncLog: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch sync log ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createSyncLog: async (newSyncLogData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<SyncLog>(resource, newSyncLogData);
      set((state) => ({ syncLogs: [...state.syncLogs, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create sync log";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateSyncLog: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<SyncLog>(`${resource}/${id}`, updatedData);
      set((state) => ({
        syncLogs: state.syncLogs.map((log) => (log.sync_id === id ? data : log)),
        currentSyncLog: state.currentSyncLog?.sync_id === id ? data : state.currentSyncLog,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update sync log ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteSyncLog: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        syncLogs: state.syncLogs.filter((log) => log.sync_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete sync log ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  performSync: async () => {
    if (get().isSyncing) return;

    if (!navigator.onLine) {
        toast.error(i18next.t('sync.offline_toast'));
        return;
    }

    set({ isSyncing: true });
    try {
        await api.post('/sync_logs/sync', {}, { timeout: 60000 });
        // Success: Don't show toast as per requirements
    } catch (e: any) {
        console.error("Sync process failed:", e);
        toast.error(i18next.t('sync.failed'));
    } finally {
        set({ isSyncing: false });
    }
  }
}));

registerStore(StoreKeys.SyncLog, () => {
  useSyncLogStore.getState().fetchSyncLogs();
});
