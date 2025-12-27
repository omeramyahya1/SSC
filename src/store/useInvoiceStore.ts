// src/store/useInvoiceStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface Invoice {
  invoice_id: number;
  project_id: number;
  user_id: number;
  amount: number;
  status: "paid" | "pending" | "partial";
  issued_at: string;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
}

export type NewInvoiceData = Omit<Invoice, 'invoice_id' | 'created_at' | 'updated_at' | 'is_dirty'>;

const resource = '/invoices';

// --- 2. Define Store ---

export interface InvoiceStore {
  invoices: Invoice[];
  currentInvoice: Invoice | null;
  isLoading: boolean;
  error: string | null;
  fetchInvoices: () => Promise<void>;
  fetchInvoice: (id: number) => Promise<void>;
  createInvoice: (data: NewInvoiceData) => Promise<Invoice | undefined>;
  updateInvoice: (id: number, data: Partial<NewInvoiceData>) => Promise<Invoice | undefined>;
  deleteInvoice: (id: number) => Promise<void>;
  setCurrentInvoice: (invoice: Invoice | null) => void;
}

export const useInvoiceStore = create<InvoiceStore>((set) => ({
  invoices: [],
  currentInvoice: null,
  isLoading: false,
  error: null,

  setCurrentInvoice: (invoice) => {
    set({ currentInvoice: invoice });
  },

  fetchInvoices: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Invoice[]>(resource);
      set({ invoices: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch invoices";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchInvoice: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Invoice>(`${resource}/${id}`);
      set({ currentInvoice: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch invoice ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createInvoice: async (newInvoiceData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Invoice>(resource, newInvoiceData);
      set((state) => ({ invoices: [...state.invoices, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create invoice";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateInvoice: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Invoice>(`${resource}/${id}`, updatedData);
      set((state) => ({
        invoices: state.invoices.map((i) => (i.invoice_id === id ? data : i)),
        currentInvoice: state.currentInvoice?.invoice_id === id ? data : state.currentInvoice,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update invoice ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteInvoice: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        invoices: state.invoices.filter((i) => i.invoice_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete invoice ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));