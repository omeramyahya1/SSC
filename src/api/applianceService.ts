// src/api/applianceService.ts
import api from './client';

export interface Appliance {
  appliance_id: number;
  project_id: number;
  appliance_name: string;
  type: string;
  qty: number;
  use_hours_night: number;
  wattage: number;
  energy_consumption: number;
}

export type NewApplianceData = Omit<Appliance, 'appliance_id'>;

const resource = '/appliances';

export const applianceService = {
  /**
   * Fetches all appliances from the backend.
   * Note: You might want to fetch appliances per project, e.g., by passing a project_id.
   * This is a generic implementation.
   */
  getAll: async (): Promise<Appliance[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single appliance by its ID.
   * @param id The ID of the appliance to fetch.
   */
  getById: async (id: number): Promise<Appliance> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new appliance.
   * @param newApplianceData The data for the new appliance.
   */
  create: async (newApplianceData: NewApplianceData): Promise<Appliance> => {
    const { data } = await api.post(resource, newApplianceData);
    return data;
  },

  /**
   * Updates an existing appliance.
   * @param id The ID of the appliance to update.
   * @param updatedData The new data for the appliance.
   */
  update: async (id: number, updatedData: Partial<NewApplianceData>): Promise<Appliance> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes an appliance by its ID.
   * @param id The ID of the appliance to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};
