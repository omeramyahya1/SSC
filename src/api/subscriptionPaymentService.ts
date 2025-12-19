// src/api/subscriptionPaymentService.ts
import api from './client';

export interface SubscriptionPayment {
  payment_id: number;
  amount: number;
  payment_method: string;
  payment_date: string;
  transaction_reference: string; // Base64 for LargeBinary
  status: "under_processing" | "approved" | "declined";
  created_at: string;
  updated_at: string;
}

export type NewSubscriptionPaymentData = Omit<SubscriptionPayment, 'payment_id' | 'payment_date' | 'created_at' | 'updated_at'>;

const resource = '/subscription_payments';

export const subscriptionPaymentService = {
  /**
   * Fetches all subscription payments from the backend.
   */
  getAll: async (): Promise<SubscriptionPayment[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single subscription payment by its ID.
   * @param id The ID of the subscription payment to fetch.
   */
  getById: async (id: number): Promise<SubscriptionPayment> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new subscription payment.
   * @param newPaymentData The data for the new subscription payment.
   */
  create: async (newPaymentData: NewSubscriptionPaymentData): Promise<SubscriptionPayment> => {
    const { data } = await api.post(resource, newPaymentData);
    return data;
  },

  /**
   * Updates an existing subscription payment.
   * @param id The ID of the subscription payment to update.
   * @param updatedData The new data for the subscription payment.
   */
  update: async (id: number, updatedData: Partial<NewSubscriptionPaymentData>): Promise<SubscriptionPayment> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes a subscription payment by its ID.
   * @param id The ID of the subscription payment to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};
