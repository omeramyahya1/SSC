// src/api/customerService.ts
import api from './client';

export interface Customer {
  customer_id: number;
  full_name: string;
  date_created: string;
  updated_at: string;
  phone_number?: string | null;
  email?: string | null;
  org_id?: number | null;
  user_id?: number | null;
}

// The data required to create a new customer. We can omit the auto-generated fields.
export type NewCustomerData = Omit<Customer, 'customer_id' | 'date_created' | 'updated_at'>;

const resource = '/customers';

export const customerService = {
  /**
   * Fetches all customers from the backend.
   */
  getAll: async (): Promise<Customer[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single customer by their ID.
   * @param id The ID of the customer to fetch.
   */
  getById: async (id: number): Promise<Customer> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new customer.
   * @param newCustomerData The data for the new customer.
   */
  create: async (newCustomerData: NewCustomerData): Promise<Customer> => {
    const { data } = await api.post(resource, newCustomerData);
    return data;
  },

  /**
   * Updates an existing customer.
   * @param id The ID of the customer to update.
   * @param updatedData The new data for the customer.
   */
  update: async (id: number, updatedData: Partial<NewCustomerData>): Promise<Customer> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes a customer by their ID.
   * @param id The ID of the customer to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};
