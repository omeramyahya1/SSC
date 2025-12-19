// src/api/syncLogService.ts
import api from './client';

export interface SyncLog {
  sync_id: number;
  sync_date: string;
  sync_type: "full" | "incremental";
  data_type: "projects" | "proposals" | "sales" | "settings";
  status: "success" | "failed";
  user_id: number;
}

export type NewSyncLogData = Omit<SyncLog, 'sync_id' | 'sync_date'>;

const resource = '/sync_logs';

export const syncLogService = {
  /**
   * Fetches all sync logs from the backend.
   */
  getAll: async (): Promise<SyncLog[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single sync log by its ID.
   * @param id The ID of the sync log to fetch.
   */
  getById: async (id: number): Promise<SyncLog> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new sync log.
   * @param newSyncLogData The data for the new sync log.
   */
  create: async (newSyncLogData: NewSyncLogData): Promise<SyncLog> => {
    const { data } = await api.post(resource, newSyncLogData);
    return data;
  },

  /**
   * Updates an existing sync log.
   * @param id The ID of the sync log to update.
   * @param updatedData The new data for the sync log.
   */
  update: async (id: number, updatedData: Partial<NewSyncLogData>): Promise<SyncLog> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes a sync log by its ID.
   * @param id The ID of the sync log to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};
