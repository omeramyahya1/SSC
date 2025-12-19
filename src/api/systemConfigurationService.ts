// src/api/systemConfigurationService.ts
import api from './client';

export interface SystemConfiguration {
  system_config_id: number;
  config_items: Record<string, any>; // For JSON fields
  total_wattage: number;
}

export type NewSystemConfigurationData = Omit<SystemConfiguration, 'system_config_id'>;

const resource = '/system_configurations';

export const systemConfigurationService = {
  /**
   * Fetches all system configurations from the backend.
   */
  getAll: async (): Promise<SystemConfiguration[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single system configuration by its ID.
   * @param id The ID of the system configuration to fetch.
   */
  getById: async (id: number): Promise<SystemConfiguration> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new system configuration.
   * @param newConfigData The data for the new system configuration.
   */
  create: async (newConfigData: NewSystemConfigurationData): Promise<SystemConfiguration> => {
    const { data } = await api.post(resource, newConfigData);
    return data;
  },

  /**
   * Updates an existing system configuration.
   * @param id The ID of the system configuration to update.
   * @param updatedData The new data for the system configuration.
   */
  update: async (id: number, updatedData: Partial<NewSystemConfigurationData>): Promise<SystemConfiguration> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes a system configuration by its ID.
   * @param id The ID of the system configuration to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};
