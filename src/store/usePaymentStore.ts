// src/store/usePaymentStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface Payment {
  payment_id: number;
  invoice_id: number;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
  amount: number;
  method: string;
}

export type NewPaymentData = Omit<Payment, 'payment_id' | 'created_at' | 'updated_at' | 'is_dirty'>;

const resource = '/payments';

// --- 2. Define Store ---

export interface PaymentStore {
  payments: Payment[];
  currentPayment: Payment | null;
  isLoading: boolean;
  error: string | null;
  fetchPayments: () => Promise<void>;
  fetchPayment: (id: number) => Promise<void>;
  createPayment: (data: NewPaymentData) => Promise<Payment | undefined>;
  updatePayment: (id: number, data: Partial<NewPaymentData>) => Promise<Payment | undefined>;
  deletePayment: (id: number) => Promise<void>;
  setCurrentPayment: (payment: Payment | null) => void;
}

export const usePaymentStore = create<PaymentStore>((set) => ({
  payments: [],
  currentPayment: null,
  isLoading: false,
  error: null,

  setCurrentPayment: (payment) => {
    set({ currentPayment: payment });
  },

  fetchPayments: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Payment[]>(resource);
      set({ payments: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch payments";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchPayment: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Payment>(`${resource}/${id}`);
      set({ currentPayment: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch payment ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createPayment: async (newPaymentData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Payment>(resource, newPaymentData);
      set((state) => ({ payments: [...state.payments, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create payment";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updatePayment: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Payment>(`${resource}/${id}`, updatedData);
      set((state) => ({
        payments: state.payments.map((p) => (p.payment_id === id ? data : p)),
        currentPayment: state.currentPayment?.payment_id === id ? data : state.currentPayment,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update payment ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deletePayment: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        payments: state.payments.filter((p) => p.payment_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete payment ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));