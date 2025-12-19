// src/api/applicationSettingsService.ts
import api from './client';

export interface ApplicationSettings {
  id: number;
  language: "ar" | "en";
  last_saved_path: string;
  other_settings: Record<string, any>; // For JSON fields
  user_id: number;
}

export type NewApplicationSettingsData = Omit<ApplicationSettings, 'id'>;

const resource = '/application_settings';

export const applicationSettingsService = {
  /**
   * Fetches all application settings from the backend.
   */
  getAll: async (): Promise<ApplicationSettings[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single application settings by its ID.
   * @param id The ID of the application settings to fetch.
   */
  getById: async (id: number): Promise<ApplicationSettings> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates new application settings.
   * @param newSettingsData The data for the new application settings.
   */
  create: async (newSettingsData: NewApplicationSettingsData): Promise<ApplicationSettings> => {
    const { data } = await api.post(resource, newSettingsData);
    return data;
  },

  /**
   * Updates existing application settings.
   * @param id The ID of the application settings to update.
   * @param updatedData The new data for the application settings.
   */
  update: async (id: number, updatedData: Partial<NewApplicationSettingsData>): Promise<ApplicationSettings> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes application settings by its ID.
   * @param id The ID of the application settings to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};
