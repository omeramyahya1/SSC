// src/api/paymentService.ts
import api from './client';

export interface Payment {
  payment_id: number;
  invoice_id: number;
  date_created: string;
  last_edited_date: string;
  amount: number;
  method: string;
}

export type NewPaymentData = Omit<Payment, 'payment_id' | 'date_created' | 'last_edited_date'>;

const resource = '/payments';

export const paymentService = {
  /**
   * Fetches all payments from the backend.
   */
  getAll: async (): Promise<Payment[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single payment by its ID.
   * @param id The ID of the payment to fetch.
   */
  getById: async (id: number): Promise<Payment> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new payment.
   * @param newPaymentData The data for the new payment.
   */
  create: async (newPaymentData: NewPaymentData): Promise<Payment> => {
    const { data } = await api.post(resource, newPaymentData);
    return data;
  },

  /**
   * Updates an existing payment.
   * @param id The ID of the payment to update.
   * @param updatedData The new data for the payment.
   */
  update: async (id: number, updatedData: Partial<NewPaymentData>): Promise<Payment> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes a payment by its ID.
   * @param id The ID of the payment to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};
