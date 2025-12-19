// src/api/authenticationService.ts
import api from './client';

export interface Authentication {
  auth_id: number;
  user_id: number;
  password_hash: string;
  password_salt: string;
  current_jwt?: string | null;
  jwt_issued_at: string;
  device_id?: string | null;
  is_logged_in: boolean;
  last_active: string;
  created_at: string;
  updated_at: string;
}

// Note: Direct creation/update of auth records might be handled differently
// in a real app (e.g., via user registration endpoints). This is for direct data management.
export type NewAuthenticationData = Omit<Authentication, 'auth_id' | 'created_at' | 'updated_at'>;

const resource = '/authentication';

export const authenticationService = {
  /**
   * Fetches all authentication records from the backend.
   */
  getAll: async (): Promise<Authentication[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single authentication record by its ID.
   * @param id The ID of the authentication record to fetch.
   */
  getById: async (id: number): Promise<Authentication> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new authentication record.
   * @param newAuthData The data for the new authentication record.
   */
  create: async (newAuthData: NewAuthenticationData): Promise<Authentication> => {
    const { data } = await api.post(resource, newAuthData);
    return data;
  },

  /**
   * Updates an existing authentication record.
   * @param id The ID of the authentication record to update.
   * @param updatedData The new data for the authentication record.
   */
  update: async (id: number, updatedData: Partial<NewAuthenticationData>): Promise<Authentication> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes an authentication record by its ID.
   * @param id The ID of the authentication record to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};
