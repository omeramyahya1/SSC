// src/store/useSubscriptionStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface Subscription {
  subscription_id: number;
  user_id: number;
  payment_id: number;
  date_created: string;
  expiration_date: string;
  grace_period_end: string;
  type: "monthly" | "annual" | "lifetime";
  status: "active" | "expired";
  license_code: string;
}

export type NewSubscriptionData = Omit<Subscription, 'subscription_id' | 'date_created'>;

const resource = '/subscriptions';

// --- 2. Define Store ---

export interface SubscriptionStore {
  subscriptions: Subscription[];
  currentSubscription: Subscription | null;
  isLoading: boolean;
  error: string | null;
  fetchSubscriptions: () => Promise<void>;
  fetchSubscription: (id: number) => Promise<void>;
  createSubscription: (data: NewSubscriptionData) => Promise<Subscription | undefined>;
  updateSubscription: (id: number, data: Partial<NewSubscriptionData>) => Promise<Subscription | undefined>;
  deleteSubscription: (id: number) => Promise<void>;
  setCurrentSubscription: (subscription: Subscription | null) => void;
}

export const useSubscriptionStore = create<SubscriptionStore>((set) => ({
  subscriptions: [],
  currentSubscription: null,
  isLoading: false,
  error: null,

  setCurrentSubscription: (subscription) => {
    set({ currentSubscription: subscription });
  },

  fetchSubscriptions: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Subscription[]>(resource);
      set({ subscriptions: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch subscriptions";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchSubscription: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Subscription>(`${resource}/${id}`);
      set({ currentSubscription: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch subscription ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createSubscription: async (newSubscriptionData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Subscription>(resource, newSubscriptionData);
      set((state) => ({ subscriptions: [...state.subscriptions, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create subscription";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateSubscription: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Subscription>(`${resource}/${id}`, updatedData);
      set((state) => ({
        subscriptions: state.subscriptions.map((s) => (s.subscription_id === id ? data : s)),
        currentSubscription: state.currentSubscription?.subscription_id === id ? data : state.currentSubscription,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update subscription ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteSubscription: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        subscriptions: state.subscriptions.filter((s) => s.subscription_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete subscription ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));