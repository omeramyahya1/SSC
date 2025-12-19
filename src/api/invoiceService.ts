// src/api/invoiceService.ts
import api from './client';

export interface Invoice {
  invoice_id: number;
  project_id: number;
  user_id: number;
  amount: number;
  status: "paid" | "pending" | "partial";
  issued_at: string;
  created_at: string;
  updated_at: string;
}

export type NewInvoiceData = Omit<Invoice, 'invoice_id' | 'created_at' | 'updated_at'>;

const resource = '/invoices';

export const invoiceService = {
  /**
   * Fetches all invoices from the backend.
   */
  getAll: async (): Promise<Invoice[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single invoice by its ID.
   * @param id The ID of the invoice to fetch.
   */
  getById: async (id: number): Promise<Invoice> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new invoice.
   * @param newInvoiceData The data for the new invoice.
   */
  create: async (newInvoiceData: NewInvoiceData): Promise<Invoice> => {
    const { data } = await api.post(resource, newInvoiceData);
    return data;
  },

  /**
   * Updates an existing invoice.
   * @param id The ID of the invoice to update.
   * @param updatedData The new data for the invoice.
   */
  update: async (id: number, updatedData: Partial<NewInvoiceData>): Promise<Invoice> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes an invoice by its ID.
   * @param id The ID of the invoice to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};
