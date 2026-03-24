// src/store/usePaymentStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface Payment {
  uuid: string;
  payment_id: number;
  invoice_uuid: string;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
  amount: number;
  method: string;
  payment_reference?: string;
  // UI-only joined fields
  invoice_id?: number;
  project_name?: string;
}

export type NewPaymentData = Partial<Omit<Payment, 'uuid' | 'payment_id' | 'created_at' | 'updated_at' | 'is_dirty'>>;

const resource = '/finances/payments';

// --- 2. Define Store ---

export interface PaymentStore {
  payments: Payment[];
  currentPayment: Payment | null;
  isLoading: boolean;
  error: string | null;
  fetchPayments: (params?: { org_uuid?: string; branch_uuid?: string; invoice_uuid?: string }) => Promise<void>;
  fetchPayment: (uuid: string) => Promise<void>;
  createPayment: (data: NewPaymentData) => Promise<Payment | undefined>;
  updatePayment: (uuid: string, data: Partial<NewPaymentData>) => Promise<Payment | undefined>;
  deletePayment: (uuid: string) => Promise<void>;
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

  fetchPayments: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Payment[]>(resource, { params });
      set({ payments: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch payments";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchPayment: async (uuid) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Payment>(`${resource}/${uuid}`);
      set({ currentPayment: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch payment ${uuid}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createPayment: async (newPaymentData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Payment>(resource, newPaymentData);
      set((state) => ({ payments: [data, ...state.payments], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || "Failed to create payment";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updatePayment: async (uuid, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Payment>(`${resource}/${uuid}`, updatedData);
      set((state) => ({
        payments: state.payments.map((p) => (p.uuid === uuid ? data : p)),
        currentPayment: state.currentPayment?.uuid === uuid ? data : state.currentPayment,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update payment ${uuid}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deletePayment: async (uuid) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${uuid}`);
      set((state) => ({
        payments: state.payments.filter((p) => p.uuid !== uuid),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || `Failed to delete payment ${uuid}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      throw new Error(errorMsg);
    }
  },
}));