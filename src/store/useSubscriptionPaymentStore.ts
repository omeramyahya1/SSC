// src/store/useSubscriptionPaymentStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface SubscriptionPayment {
  payment_id: number;
  subscription_id: number;
  amount: number;
  payment_method: string;
  transaction_reference: string; // Base64 for LargeBinary
  status: "under_processing" | "approved" | "declined";
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
}

export type NewSubscriptionPaymentData = Omit<SubscriptionPayment, 'payment_id' | 'created_at' | 'updated_at' | 'is_dirty'>;

const resource = '/subscription_payments';

// --- 2. Define Store ---

export interface SubscriptionPaymentStore {
  subscriptionPayments: SubscriptionPayment[];
  currentSubscriptionPayment: SubscriptionPayment | null;
  isLoading: boolean;
  error: string | null;
  fetchSubscriptionPayments: () => Promise<void>;
  fetchSubscriptionPayment: (id: number) => Promise<void>;
  createSubscriptionPayment: (data: NewSubscriptionPaymentData) => Promise<SubscriptionPayment | undefined>;
  updateSubscriptionPayment: (id: number, data: Partial<NewSubscriptionPaymentData>) => Promise<SubscriptionPayment | undefined>;
  deleteSubscriptionPayment: (id: number) => Promise<void>;
  setCurrentSubscriptionPayment: (payment: SubscriptionPayment | null) => void;
}

export const useSubscriptionPaymentStore = create<SubscriptionPaymentStore>((set) => ({
  subscriptionPayments: [],
  currentSubscriptionPayment: null,
  isLoading: false,
  error: null,

  setCurrentSubscriptionPayment: (payment) => {
    set({ currentSubscriptionPayment: payment });
  },

  fetchSubscriptionPayments: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<SubscriptionPayment[]>(resource);
      set({ subscriptionPayments: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch subscription payments";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchSubscriptionPayment: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<SubscriptionPayment>(`${resource}/${id}`);
      set({ currentSubscriptionPayment: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch subscription payment ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createSubscriptionPayment: async (newPaymentData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<SubscriptionPayment>(resource, newPaymentData);
      set((state) => ({ subscriptionPayments: [...state.subscriptionPayments, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create subscription payment";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateSubscriptionPayment: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<SubscriptionPayment>(`${resource}/${id}`, updatedData);
      set((state) => ({
        subscriptionPayments: state.subscriptionPayments.map((p) => (p.payment_id === id ? data : p)),
        currentSubscriptionPayment: state.currentSubscriptionPayment?.payment_id === id ? data : state.currentSubscriptionPayment,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update subscription payment ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteSubscriptionPayment: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        subscriptionPayments: state.subscriptionPayments.filter((p) => p.payment_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete subscription payment ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));